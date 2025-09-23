
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from decimal import Decimal
import base64
import io
from utils import FamilySituation, IRPFScale, calculate_base_imposable_irpf, apply_base_limits, round_euro, compute_reduction_by_work
from variables import IRPF_SCALE_CATALUNYA, IRPF_SCALE_ESTATAL, SS_BASE_MIN_BY_GROUP, SS_BASE_MAX_MONTHLY, SS_BASE_MAX_DAILY, DEFAULT_SS_RATES, GASTOS_DEDUCIDOS
import viz_utils
import matplotlib.pyplot as plt

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SalaryRequest(BaseModel):
    gross: float
    region: str
    n_pagues: int
    pagues_prorratejades: bool
    retribucio_en_especie_ann: float
    grup_cotitzacio: str
    contract_type: str
    other_deductions: float
    age: int
    disability_percent_self: int
    disability_self_help: bool
    children_ages: str
    children_disabilities: str
    ascendents_ages: str
    disability_relatives_perc: str
    disability_relatives_help: str

class IncrementRequest(BaseModel):
    previous_gross: float
    new_gross: float
    n_pagues: int
    pagues_prorratejades: bool
    retribucio_en_especie_ann: float
    grup_cotitzacio: str
    contract_type: str
    other_deductions: float
    age: int

def fig_to_base64(fig):
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches='tight')
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    plt.close(fig)
    return img_base64

def perform_calculation(gross, n_pagues, pagues_prorratejades, retribucio_en_especie_ann, grup_cotitzacio, contract_type, other_deductions, fam, region):
    # fam: FamilySituation, region: str
    irpf_scale = IRPFScale.combined_scale(IRPF_SCALE_CATALUNYA, IRPF_SCALE_ESTATAL)  # TODO: region-specific
    ss_base_min = SS_BASE_MIN_BY_GROUP[grup_cotitzacio]
    ss_base_max = SS_BASE_MAX_MONTHLY
    gross_including_benefits = gross + retribucio_en_especie_ann
    monthly_base = gross_including_benefits / 12
    is_daily = grup_cotitzacio in ["Base diaria; Adulta", "Menor d'edat"]
    base_ss_adjusted = apply_base_limits(
        monthly_base,
        ss_base_min,
        ss_base_max if not is_daily else SS_BASE_MAX_DAILY,
        is_daily=is_daily,
        days_in_month=30
    )
    ss_contingencies_comunes_monthly = base_ss_adjusted * DEFAULT_SS_RATES["contingencies_common_worker"]
    t_des_monthly = base_ss_adjusted * (DEFAULT_SS_RATES["unemployment_worker_indefinite"] if contract_type == "indefinite" else DEFAULT_SS_RATES["unemployment_worker_temporary"])
    ss_training_monthly = base_ss_adjusted * DEFAULT_SS_RATES["training_worker"]
    ss_mei_monthly = base_ss_adjusted * DEFAULT_SS_RATES["mei_worker"]
    cotitzacions_mensuals = ss_contingencies_comunes_monthly + t_des_monthly + ss_training_monthly + ss_mei_monthly
    cotitzacions_anuals = cotitzacions_mensuals * 12

    otros_gastos_generales = GASTOS_DEDUCIDOS["otros_gastos_generales"]
    minimo_pf = fam.minimo_personal_familiar()

    base_imponible_trabajo = gross_including_benefits - cotitzacions_anuals - otros_gastos_generales - other_deductions
    print(base_imponible_trabajo)
    reduction_by_work = compute_reduction_by_work(base_imponible_trabajo)
    print(reduction_by_work,minimo_pf)
    base_imposable = base_imponible_trabajo - reduction_by_work - minimo_pf
    if base_imposable < 0:
        base_imposable = Decimal("0")

    irpf_anual = irpf_scale.tax_on_base(base_imposable)

    irpf_per_paga = irpf_anual / Decimal(n_pagues)
    gross_per_paga = gross_including_benefits / Decimal(n_pagues)
    net_per_paga = gross_per_paga - cotitzacions_mensuals - irpf_per_paga
    net_monthly_equivalent = (net_per_paga * Decimal(n_pagues)) / Decimal(12)
    return {
        "otros_gastos_generales": otros_gastos_generales,
        "reduction_by_work": reduction_by_work,
        "fam": fam,
        "gross_including_benefits": gross_including_benefits,
        "n_pagues": n_pagues,
        "pagues_prorratejades": pagues_prorratejades,
        "retribucio_en_especie_ann": retribucio_en_especie_ann,
        "grup_cotitzacio": grup_cotitzacio,
        "contract_type": contract_type,
        "other_deductions": other_deductions,
        "ss_contingencies_comunes_monthly": ss_contingencies_comunes_monthly,
        "t_des_monthly": t_des_monthly,
        "ss_training_monthly": ss_training_monthly,
        "ss_mei_monthly": ss_mei_monthly,
        "cotitzacions_mensuals": cotitzacions_mensuals,
        "cotitzacions_anuals": cotitzacions_anuals,
        "base_imposable": base_imposable,
        "irpf_anual": irpf_anual,
        "irpf_per_paga": irpf_per_paga,
        "gross_per_paga": gross_per_paga,
        "net_per_paga": net_per_paga,
        "net_monthly_equivalent": net_monthly_equivalent,
    }

@app.post("/api/calculate")
async def calculate_salary(data: SalaryRequest):
    gross = Decimal(str(data.gross))
    n_pagues = data.n_pagues
    pagues_prorratejades = data.pagues_prorratejades
    retribucio_en_especie_ann = Decimal(str(data.retribucio_en_especie_ann))
    grup_cotitzacio = data.grup_cotitzacio
    contract_type = data.contract_type
    other_deductions = Decimal(str(data.other_deductions))
    age = data.age
    region = data.region
    disability_percent_self = data.disability_percent_self
    disability_self_help = data.disability_self_help
    def parse_int_list(s):
        return [int(x.strip()) for x in s.split(',') if x.strip() != ''] if s else []
    def parse_bool_list(s):
        return [x.strip().lower() in ("true","1","yes") for x in s.split(',') if x.strip() != ''] if s else []
    children_ages = parse_int_list(data.children_ages)
    children_disabilities = parse_int_list(data.children_disabilities)
    ascendents_ages = parse_int_list(data.ascendents_ages)
    disability_relatives_perc = parse_int_list(data.disability_relatives_perc)
    disability_relatives_help = parse_bool_list(data.disability_relatives_help)
    while len(disability_relatives_help) < len(disability_relatives_perc):
        disability_relatives_help.append(False)
    disability_relatives = list(zip(disability_relatives_perc, disability_relatives_help))
    fam = FamilySituation(
        age=age,
        children_ages=children_ages,
        children_disabilities=children_disabilities,
        ascendents_ages=ascendents_ages,
        disability_percent_self=disability_percent_self,
        disability_self_help=disability_self_help,
        disability_relatives=disability_relatives
    )
    calc = perform_calculation(
        gross, n_pagues, pagues_prorratejades, retribucio_en_especie_ann, grup_cotitzacio, contract_type, other_deductions, fam, region
    )

    # Step 2: Add the bar chart plot (plot_salary_blocks)
    figs = []
    # Pie chart
    fig1 = viz_utils.plot_net_pay_and_taxes(
        calc["gross_including_benefits"], calc["net_per_paga"], calc["n_pagues"], calc["cotitzacions_anuals"], calc["irpf_anual"],
        calc["ss_contingencies_comunes_monthly"] * Decimal(calc["n_pagues"]), calc["t_des_monthly"] * Decimal(calc["n_pagues"]),
        calc["ss_training_monthly"] * Decimal(calc["n_pagues"]), calc["ss_mei_monthly"] * Decimal(calc["n_pagues"]), return_fig=True)
    figs.append(fig_to_base64(fig1))
    # Bar chart
    fig2 = viz_utils.plot_salary_blocks(
        calc["gross_including_benefits"], calc["n_pagues"], calc["pagues_prorratejades"], calc["retribucio_en_especie_ann"], calc["grup_cotitzacio"],
        calc["contract_type"], calc["fam"], "catalunya", calc["other_deductions"], perform_calculation, return_fig=True)
    figs.append(fig_to_base64(fig2))

    return {
        "sou_net_per_paga": float(round_euro(calc["net_per_paga"])),
        "sou_net_mensual_equivalent": float(round_euro(calc["net_monthly_equivalent"])),
        "irpf_anual": float(round_euro(calc["irpf_anual"])),
        "cotitzacions_anuals": float(round_euro(calc["cotitzacions_anuals"])),
        "plots": figs
    }


@app.post("/api/increment")
async def calculate_increment(data: IncrementRequest):
    # Use default FamilySituation and region for increment calculation
    fam = FamilySituation(age=data.age)
    region = "Catalunya"
    prev = perform_calculation(
        Decimal(str(data.previous_gross)), data.n_pagues, data.pagues_prorratejades, Decimal(str(data.retribucio_en_especie_ann)),
        data.grup_cotitzacio, data.contract_type, Decimal(str(data.other_deductions)), fam, region)
    new = perform_calculation(
        Decimal(str(data.new_gross)), data.n_pagues, data.pagues_prorratejades, Decimal(str(data.retribucio_en_especie_ann)),
        data.grup_cotitzacio, data.contract_type, Decimal(str(data.other_deductions)), fam, region)
    increment_annual_net = new["net_per_paga"] * Decimal(data.n_pagues) - prev["net_per_paga"] * Decimal(data.n_pagues)
    increment_monthly_net = new["net_monthly_equivalent"] - prev["net_monthly_equivalent"]
    # Pie chart for the difference
    fig = viz_utils.plot_increment_difference_pie(prev, new, return_fig=True)
    pie_base64 = fig_to_base64(fig)
    return {
        "increment_annual_net": float(round_euro(increment_annual_net)),
        "increment_monthly_net": float(round_euro(increment_monthly_net)),
        "increment_pie": pie_base64
    }
