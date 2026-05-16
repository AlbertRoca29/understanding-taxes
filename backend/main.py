
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from decimal import Decimal
import base64
import io
from utils import FamilySituation, IRPFScale, calculate_base_imposable_irpf, apply_base_limits, round_euro, compute_reduction_by_work
from variables import IRPF_SCALE_CATALUNYA, IRPF_SCALE_ESTATAL, SS_BASE_MIN_BY_GROUP, SS_BASE_MAX_MONTHLY, DEFAULT_SS_RATES, REDUCTION_WORK
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

from utils import calcular_gastos_deducibles, calcular_cuota_retencion, redondear1, truncar, calcular_marginal_irpf, IRPFScale

def perform_calculation(gross, n_pagues, pagues_prorratejades, retribucio_en_especie_ann, grup_cotitzacio, contract_type, other_deductions, fam, region):
    # ── Stage 1: SS base mensual ──────────────────────────────────────────────
    gross_including_benefits = gross + retribucio_en_especie_ann
    base_ss_mensual = apply_base_limits(
        gross_including_benefits / 12,
        SS_BASE_MIN_BY_GROUP[grup_cotitzacio],
        SS_BASE_MAX_MONTHLY,
    )

    # ── Stage 2: Cotitzacions SS mensuals ────────────────────────────────────
    ss_atur_rate = (
        DEFAULT_SS_RATES["unemployment_worker_indefinite"]
        if contract_type == "indefinite"
        else DEFAULT_SS_RATES["unemployment_worker_temporary"]
    )
    ss_contingencies_comunes_mensual = base_ss_mensual * DEFAULT_SS_RATES["contingencies_common_worker"]
    ss_atur_mensual                  = base_ss_mensual * ss_atur_rate
    ss_formacio_mensual              = base_ss_mensual * DEFAULT_SS_RATES["training_worker"]
    ss_mei_mensual                   = base_ss_mensual * DEFAULT_SS_RATES["mei_worker"]
    total_ss_mensual = (
        ss_contingencies_comunes_mensual + ss_atur_mensual + ss_formacio_mensual + ss_mei_mensual
    )
    total_ss_anual = total_ss_mensual * 12

    # ── Stage 3: Rendiment net del treball ───────────────────────────────────
    rendiment_brut_treball = gross_including_benefits
    gastos_deducibles = calcular_gastos_deducibles(
        rendiment_brut_treball,
        total_ss_anual,
        False,
        fam.disability_percent_self >= 33 and fam.disability_percent_self < 65,
        fam.disability_percent_self >= 65,
        "ACTIVO",
    )
    rendiment_net_treball = rendiment_brut_treball - total_ss_anual - gastos_deducibles - other_deductions

    # ── Stage 4: Reducció per rendiments del treball (art. 20 LIRPF) ─────────
    reduccio_rendiments_treball = compute_reduction_by_work(rendiment_net_treball)

    # ── Stage 5: Base imposable ───────────────────────────────────────────────
    base_imponible = max(rendiment_net_treball - reduccio_rendiments_treball, Decimal("0"))

    # ── Stage 6: Escala IRPF + quota ─────────────────────────────────────────
    if region == "Catalunya":
        escala_irpf = IRPFScale.combined_scale(IRPF_SCALE_CATALUNYA, IRPF_SCALE_ESTATAL)
    else:  # Mitjana espanyola: state scale counts twice (no regional deviation)
        escala_irpf = IRPFScale.combined_scale(IRPF_SCALE_ESTATAL, IRPF_SCALE_ESTATAL)
    minim_personal_familiar = fam.minimo_personal_familiar()
    cuota_irpf_anual = redondear1(calcular_cuota_retencion(base_imponible, minim_personal_familiar, escala=escala_irpf))

    # ── Stage 7: Tipo de retención (%) ───────────────────────────────────────
    tipo_retencio = (
        truncar((cuota_irpf_anual / gross_including_benefits) * Decimal("100"))
        if gross_including_benefits > 0
        else Decimal("0.00")
    )

    # ── Stage 8: Marginal IRPF rate ──────────────────────────────────────────
    # Chain rule: d(cuota)/d(gross) = bracket_rate × d(base_imponible)/d(gross)
    r_bracket = escala_irpf.rate_at(base_imponible)
    ss_total_rate = (
        DEFAULT_SS_RATES["contingencies_common_worker"]
        + ss_atur_rate
        + DEFAULT_SS_RATES["training_worker"]
        + DEFAULT_SS_RATES["mei_worker"]
    )
    ss_is_capped = (gross_including_benefits / 12 >= SS_BASE_MAX_MONTHLY)
    d_rnt_d_gross = Decimal("1.00") if ss_is_capped else (Decimal("1.00") - ss_total_rate)
    # derivative of reduction-by-work w.r.t. rendiment_net_treball
    rn = rendiment_net_treball
    if rn <= REDUCTION_WORK["upper1"]:
        r_red = Decimal("0.00")
    elif rn <= REDUCTION_WORK["upper2"]:
        r_red = -REDUCTION_WORK["coef2"]
    elif rn <= REDUCTION_WORK["upper3"]:
        r_red = -REDUCTION_WORK["coef3"]
    else:
        r_red = Decimal("0.00")
    d_base_d_gross = d_rnt_d_gross * (Decimal("1.00") - r_red)
    marginal_irpf = r_bracket * d_base_d_gross if cuota_irpf_anual > Decimal("0.00") else Decimal("0.00")
    marginal_irpf_percent = truncar(marginal_irpf * Decimal("100"))

    # ── Stage 9: Per paga ────────────────────────────────────────────────────
    # SS is distributed proportionally across n_pagues so net_monthly_equivalent
    # stays invariant of n_pagues (same annual money, just split differently).
    gross_per_paga = gross_including_benefits / Decimal(n_pagues)
    ss_per_paga    = total_ss_anual / Decimal(n_pagues)
    irpf_per_paga  = cuota_irpf_anual / Decimal(n_pagues)
    net_per_paga   = gross_per_paga - ss_per_paga - irpf_per_paga
    net_monthly_equivalent = (gross_including_benefits - total_ss_anual - cuota_irpf_anual) / Decimal(12)

    return {
        # ── SS breakdown ─────────────────────────────────────────────────────
        "base_ss_mensual":                  base_ss_mensual,
        "ss_contingencies_comunes_mensual": ss_contingencies_comunes_mensual,
        "ss_atur_mensual":                  ss_atur_mensual,
        "ss_formacio_mensual":              ss_formacio_mensual,
        "ss_mei_mensual":                   ss_mei_mensual,
        "total_ss_mensual":                 total_ss_mensual,
        "total_ss_anual":                   total_ss_anual,
        # ── IRPF chain ───────────────────────────────────────────────────────
        "rendiment_brut_treball":      rendiment_brut_treball,
        "gastos_deducibles":           gastos_deducibles,
        "rendiment_net_treball":       rendiment_net_treball,
        "reduccio_rendiments_treball": reduccio_rendiments_treball,
        "base_imponible":              base_imponible,
        "minim_personal_familiar":     minim_personal_familiar,
        "cuota_irpf_anual":            cuota_irpf_anual,
        "tipo_retencio":               tipo_retencio,
        # ── Marginal ─────────────────────────────────────────────────────────
        "marginal_irpf_rate":    marginal_irpf,
        "marginal_irpf_percent": marginal_irpf_percent,
        # ── Per paga ─────────────────────────────────────────────────────────
        "gross_per_paga":         redondear1(gross_per_paga),
        "ss_per_paga":            redondear1(ss_per_paga),
        "irpf_per_paga":          redondear1(irpf_per_paga),
        "net_per_paga":           redondear1(net_per_paga),
        "net_monthly_equivalent": redondear1(net_monthly_equivalent),
        # ── Pass-through for viz_utils (legacy keys kept for compatibility) ──
        "gross_including_benefits":  gross_including_benefits,
        "n_pagues":                  n_pagues,
        "pagues_prorratejades":      pagues_prorratejades,
        "retribucio_en_especie_ann": retribucio_en_especie_ann,
        "grup_cotitzacio":           grup_cotitzacio,
        "contract_type":             contract_type,
        "other_deductions":          other_deductions,
        "fam":                       fam,
        # legacy names used by viz_utils
        "cotitzacions_mensuals":               total_ss_mensual,
        "cotitzacions_anuals":                 total_ss_anual,
        "irpf_anual":                          cuota_irpf_anual,
        "ss_contingencies_comunes_monthly":    ss_contingencies_comunes_mensual,
        "t_des_monthly":                       ss_atur_mensual,
        "ss_training_monthly":                 ss_formacio_mensual,
        "ss_mei_monthly":                      ss_mei_mensual,
        "otros_gastos_generales":              gastos_deducibles,
        "reduction_by_work":                   reduccio_rendiments_treball,
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
        # ── SS breakdown ────────────────────────────────────────────────────
        "base_ss_mensual":                  float(round_euro(calc["base_ss_mensual"])),
        "ss_contingencies_comunes_mensual": float(round_euro(calc["ss_contingencies_comunes_mensual"])),
        "ss_atur_mensual":                  float(round_euro(calc["ss_atur_mensual"])),
        "ss_formacio_mensual":              float(round_euro(calc["ss_formacio_mensual"])),
        "ss_mei_mensual":                   float(round_euro(calc["ss_mei_mensual"])),
        "total_ss_mensual":                 float(round_euro(calc["total_ss_mensual"])),
        "total_ss_anual":                   float(round_euro(calc["total_ss_anual"])),
        # ── IRPF chain ──────────────────────────────────────────────────────
        "rendiment_brut_treball":      float(round_euro(calc["rendiment_brut_treball"])),
        "gastos_deducibles":           float(round_euro(calc["gastos_deducibles"])),
        "rendiment_net_treball":       float(round_euro(calc["rendiment_net_treball"])),
        "reduccio_rendiments_treball": float(round_euro(calc["reduccio_rendiments_treball"])),
        "base_imponible":              float(round_euro(calc["base_imponible"])),
        "minim_personal_familiar":     float(round_euro(calc["minim_personal_familiar"])),
        "cuota_irpf_anual":            float(round_euro(calc["cuota_irpf_anual"])),
        "tipo_retencio":               float(calc["tipo_retencio"]),
        # ── Marginal ────────────────────────────────────────────────────────
        "marginal_irpf_rate":    float(calc["marginal_irpf_rate"]),
        "marginal_irpf_percent": float(calc["marginal_irpf_percent"]),
        # ── Per paga ────────────────────────────────────────────────────────
        "gross_per_paga":             float(round_euro(calc["gross_per_paga"])),
        "ss_per_paga":                float(round_euro(calc["ss_per_paga"])),
        "irpf_per_paga":              float(round_euro(calc["irpf_per_paga"])),
        "sou_net_per_paga":           float(round_euro(calc["net_per_paga"])),
        "sou_net_mensual_equivalent": float(round_euro(calc["net_monthly_equivalent"])),
        # legacy aliases kept for backward compatibility
        "irpf_anual":         float(round_euro(calc["cuota_irpf_anual"])),
        "cotitzacions_anuals": float(round_euro(calc["total_ss_anual"])),
        # ── Charts ──────────────────────────────────────────────────────────
        "plots": figs,
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
