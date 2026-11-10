
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from decimal import Decimal
import base64
import io
from utils import FamilySituation, IRPFScale, apply_base_limits, round_euro
from variables import IRPF_SCALE_CATALUNYA, IRPF_SCALE_ESTATAL, SS_BASE_MIN_BY_GROUP, SS_BASE_MAX_MONTHLY, DEFAULT_SS_RATES
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

class FamilyMember(BaseModel):
    age: int
    disability: int = 0       # 0 / 33-64 / 65+ (% representatiu del tram)
    needs_help: bool = False  # necessita ajuda de tercers o mobilitat reduïda

class Profile(BaseModel):
    """Dades comunes a la calculadora i a l'increment (mateixes entrades, mateix motor)."""
    region: str = "Catalunya"
    n_pagues: int
    pagues_prorratejades: bool = True
    retribucio_en_especie_ann: float = 0
    grup_cotitzacio: str
    contract_type: str
    other_deductions: float = 0
    age: int = 30
    disability_percent_self: int = 0
    disability_self_help: bool = False
    children: List[FamilyMember] = []
    ascendants: List[FamilyMember] = []

    def family(self) -> FamilySituation:
        return FamilySituation(
            age=self.age,
            disability_percent_self=self.disability_percent_self,
            disability_self_help=self.disability_self_help,
            children=[(m.age, m.disability, m.needs_help) for m in self.children],
            ascendants=[(m.age, m.disability, m.needs_help) for m in self.ascendants],
        )

    def calculate(self, gross: float):
        return perform_calculation(
            Decimal(str(gross)), self.n_pagues, self.pagues_prorratejades, Decimal(str(self.retribucio_en_especie_ann)),
            self.grup_cotitzacio, self.contract_type, Decimal(str(self.other_deductions)), self.family(), self.region)

class SalaryRequest(Profile):
    gross: float

class IncrementRequest(Profile):
    previous_gross: float
    new_gross: float
    # Nom antic (abans només s'enviava la discapacitat pròpia)
    disability_self: Optional[int] = None

    def family(self) -> FamilySituation:
        if self.disability_self is not None and not self.disability_percent_self:
            self.disability_percent_self = self.disability_self
        return super().family()


def walkthrough(calc) -> dict:
    """Passos de l'algorisme oficial, en float, per al desglossament del frontend."""
    out = {}
    for k, v in calc["trace"].items():
        out[k] = float(v) if isinstance(v, Decimal) else v
    out["SS"] = float(calc["total_ss_anual"])
    out["OTHER_DEDUCTIONS"] = float(calc["other_deductions"])
    out["ESCALA"] = [[float(lo), None if hi is None else float(hi), float(rate)] for lo, hi, rate in calc["escala"].brackets]
    out["MARGINAL"] = float(calc["marginal_irpf_percent"])
    return out

def fig_to_base64(fig):
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", facecolor="white", dpi=150)
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    plt.close(fig)
    return img_base64

from utils import calcular_retencion, redondear1, truncar, IRPFScale

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
    ss_total_rate = (
        DEFAULT_SS_RATES["contingencies_common_worker"] + ss_atur_rate
        + DEFAULT_SS_RATES["training_worker"] + DEFAULT_SS_RATES["mei_worker"]
    )

    def ss_anual(retrib):
        base = apply_base_limits(retrib / 12, SS_BASE_MIN_BY_GROUP[grup_cotitzacio], SS_BASE_MAX_MONTHLY)
        return base * ss_total_rate * 12

    # ── Stages 3-7: algorisme oficial de retencions AEAT 2026 ──────────────────
    # Les "altres deduccions" són despeses de l'art. 19.2 (quotes sindicals,
    # col·legis professionals…), que l'algorisme suma a COTIZACIONES.
    if region == "Catalunya":
        escala_irpf = IRPFScale.combined_scale(IRPF_SCALE_CATALUNYA, IRPF_SCALE_ESTATAL)
    else:  # Mitjana espanyola: state scale counts twice (= escala de retencions oficial)
        escala_irpf = IRPFScale.combined_scale(IRPF_SCALE_ESTATAL, IRPF_SCALE_ESTATAL)

    def retencio(retrib):
        return calcular_retencion(retrib, ss_anual(retrib) + other_deductions, fam, contract_type, escala_irpf)

    trace = retencio(gross_including_benefits)
    rendiment_brut_treball      = gross_including_benefits
    gastos_deducibles           = trace["OTROSGASTOS"]
    rendiment_net_treball       = trace["RNT"]
    reduccio_rendiments_treball = trace["RED20"]
    base_imponible              = trace["BASE"]
    minim_personal_familiar     = trace["MINPERFA"]
    tipo_retencio               = trace["TIPO"]
    # Import anual que es reté de veritat: RETRIB × TIPO (tipus ja truncat)
    cuota_irpf_anual            = trace["IMPORTE"]

    # ── Stage 8: Marginal IRPF rate ──────────────────────────────────────────
    # La quota és lineal a trossos: la derivada amb un pas d'1 € és exacta fora dels
    # punts d'inflexió i ja inclou SS, reducció art. 20, límit del 43 % i exempció.
    if trace["FLOOR_APPLIED"]:
        marginal_irpf = tipo_retencio / Decimal("100")
    else:
        marginal_irpf = retencio(gross_including_benefits + 1)["CUOTA"] - trace["CUOTA"]
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
        "trace":                       trace,
        "escala":                      escala_irpf,
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
    calc = data.calculate(data.gross)

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
        # x = brut incloent espècie, així que no se li torna a sumar l'espècie
        calc["gross_including_benefits"], calc["n_pagues"], calc["pagues_prorratejades"], Decimal("0"), calc["grup_cotitzacio"],
        calc["contract_type"], calc["fam"], data.region, calc["other_deductions"], perform_calculation, return_fig=True)
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
        # ── Pas a pas (algorisme oficial) ───────────────────────────────────
        "walkthrough": walkthrough(calc),
        # ── Charts ──────────────────────────────────────────────────────────
        "plots": figs,
    }


@app.post("/api/increment")
async def calculate_increment(data: IncrementRequest):
    prev = data.calculate(data.previous_gross)
    new = data.calculate(data.new_gross)
    n = Decimal(data.n_pagues)
    increment_annual_net  = (new["net_per_paga"]       - prev["net_per_paga"])       * n
    increment_monthly_net =  new["net_monthly_equivalent"] - prev["net_monthly_equivalent"]
    increment_annual_ss   = (new["cotitzacions_anuals"] - prev["cotitzacions_anuals"])
    increment_annual_irpf = (new["cuota_irpf_anual"]   - prev["cuota_irpf_anual"])
    increment_annual_brut = (new["gross_including_benefits"] - prev["gross_including_benefits"])
    # Pie chart for the difference
    fig = viz_utils.plot_increment_difference_pie(prev, new, return_fig=True)
    pie_base64 = fig_to_base64(fig)
    return {
        "increment_annual_net":  float(round_euro(increment_annual_net)),
        "increment_monthly_net": float(round_euro(increment_monthly_net)),
        "increment_annual_brut": float(round_euro(increment_annual_brut)),
        "increment_annual_ss":   float(round_euro(increment_annual_ss)),
        "increment_annual_irpf": float(round_euro(increment_annual_irpf)),
        "increment_pie": pie_base64,
        # ── Resultat complet de cada sou (mateixes xifres que la calculadora) ──
        "previous": {"tipo_retencio": float(prev["tipo_retencio"]), "irpf_anual": float(round_euro(prev["cuota_irpf_anual"])),
                     "sou_net_per_paga": float(round_euro(prev["net_per_paga"])), "walkthrough": walkthrough(prev)},
        "new": {"tipo_retencio": float(new["tipo_retencio"]), "irpf_anual": float(round_euro(new["cuota_irpf_anual"])),
                "sou_net_per_paga": float(round_euro(new["net_per_paga"])), "walkthrough": walkthrough(new)},
    }
