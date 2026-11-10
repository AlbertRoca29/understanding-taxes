
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from decimal import Decimal
from utils import FamilySituation, IRPFScale, apply_base_limits, round_euro
from variables import IRPF_SCALE_CATALUNYA, IRPF_SCALE_ESTATAL, SS_BASE_MIN_BY_GROUP, SS_BASE_MAX_MONTHLY, DEFAULT_SS_RATES

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
    # Paga extra respecte d'un mes normal (bruts). Molts convenis paguen només el
    # salari base a les extres, sense complements: llavors és < 1.
    extra_ratio: float = 1.0

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
            self.grup_cotitzacio, self.contract_type, Decimal(str(self.other_deductions)), self.family(), self.region,
            Decimal(str(min(max(self.extra_ratio, 0.1), 1.5))))

class SalaryRequest(Profile):
    gross: float
    with_curve: bool = True  # els càlculs auxiliars del frontend no necessiten la corba

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

from utils import calcular_retencion, redondear1, truncar, IRPFScale

def perform_calculation(gross, n_pagues, pagues_prorratejades, retribucio_en_especie_ann, grup_cotitzacio, contract_type, other_deductions, fam, region, extra_ratio=Decimal("1")):
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

    # Repartiment com a la nòmina real (en diners, sense l'espècie):
    #  · la SS es cotitza 12 cops l'any sobre una base que ja inclou la prorrata de
    #    les extres, així que les pagues extra no porten SS;
    #  · l'IRPF es reté al mateix tipus a cada paga (també sobre l'espècie mensual);
    #  · cada extra val `extra_ratio` mesos normals (1 = igual; < 1 = només salari base).
    tipus = cuota_irpf_anual / gross_including_benefits if gross_including_benefits > 0 else Decimal("0")
    n_extres = max(0, n_pagues - 12)
    if n_extres:
        mes = gross / (Decimal(12) + Decimal(n_extres) * extra_ratio)
        extra = mes * extra_ratio
        esp_mes = retribucio_en_especie_ann / Decimal(12)
        net_paga_ordinaria = mes - total_ss_anual / Decimal(12) - tipus * (mes + esp_mes)
        net_paga_extra     = extra - tipus * extra
    else:
        mes = gross / Decimal(n_pagues)
        esp_mes = retribucio_en_especie_ann / Decimal(n_pagues)
        net_paga_ordinaria = mes - total_ss_anual / Decimal(n_pagues) - tipus * (mes + esp_mes)
        net_paga_extra     = None

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
        "net_paga_ordinaria":     redondear1(net_paga_ordinaria),
        "net_paga_extra":         None if net_paga_extra is None else redondear1(net_paga_extra),
        # ── Pass-through (legacy keys kept for compatibility) ──
        "gross_including_benefits":  gross_including_benefits,
        "n_pagues":                  n_pagues,
        "pagues_prorratejades":      pagues_prorratejades,
        "retribucio_en_especie_ann": retribucio_en_especie_ann,
        "grup_cotitzacio":           grup_cotitzacio,
        "contract_type":             contract_type,
        "other_deductions":          other_deductions,
        "fam":                       fam,
        # legacy names
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

class NetToGrossRequest(Profile):
    # Net d'una paga ordinària (el que arriba la majoria de mesos)
    net_per_paga: float


def find_gross_for_net(profile: Profile, target_net: Decimal) -> Decimal:
    """Brut anual (sense espècie) que dona `target_net` net a la paga ordinària.

    El net creix amb el brut (fora de petits salts als límits d'exempció), així que
    una bisecció al cèntim troba el brut mínim que arriba al net demanat."""
    net = lambda g: profile.calculate(g)["net_paga_ordinaria"]
    lo, hi = Decimal("0"), max(Decimal("1000"), target_net * profile.n_pagues * 2)
    while net(hi) < target_net:
        lo, hi = hi, hi * 2
    while hi - lo > Decimal("0.01"):
        mid = ((lo + hi) / 2).quantize(Decimal("0.01"))
        if mid in (lo, hi):
            break
        if net(mid) >= target_net:
            hi = mid
        else:
            lo = mid
    return hi


def salary_curve(data: Profile, gross) -> list:
    """Punts [brut, net, SS, IRPF, marginal %] per dibuixar la corba al frontend."""
    top = max(Decimal("40000"), Decimal(str(gross)) * Decimal("2"))
    step = (top - Decimal("6000")) / 47
    out = []
    for i in range(48):
        g = (Decimal("6000") + step * i).quantize(Decimal("1"))
        c = data.calculate(g)
        out.append([float(g), float(round_euro(g - c["total_ss_anual"] - c["cuota_irpf_anual"])),
                    float(round_euro(c["total_ss_anual"])), float(round_euro(c["cuota_irpf_anual"])),
                    float(c["marginal_irpf_percent"])])
    return out


def salary_response(data: Profile, gross, curve: bool = True) -> dict:
    calc = data.calculate(gross)

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
        "net_paga_ordinaria":         float(round_euro(calc["net_paga_ordinaria"])),
        "net_paga_extra":             None if calc["net_paga_extra"] is None else float(round_euro(calc["net_paga_extra"])),
        "n_pagues":                   calc["n_pagues"],
        # legacy aliases kept for backward compatibility
        "irpf_anual":         float(round_euro(calc["cuota_irpf_anual"])),
        "cotitzacions_anuals": float(round_euro(calc["total_ss_anual"])),
        # ── Pas a pas (algorisme oficial) ───────────────────────────────────
        "walkthrough": walkthrough(calc),
        # ── Corba per al gràfic (brut → net) ────────────────────────────────
        "curve": salary_curve(data, gross) if curve else None,
    }


@app.post("/api/calculate")
async def calculate_salary(data: SalaryRequest):
    return salary_response(data, data.gross, curve=data.with_curve)


@app.post("/api/net-to-gross")
async def calculate_net_to_gross(data: NetToGrossRequest):
    gross = find_gross_for_net(data, Decimal(str(data.net_per_paga)))
    return {"gross": float(gross), **salary_response(data, gross)}


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
    return {
        "increment_annual_net":  float(round_euro(increment_annual_net)),
        "increment_monthly_net": float(round_euro(increment_monthly_net)),
        "increment_annual_brut": float(round_euro(increment_annual_brut)),
        "increment_annual_ss":   float(round_euro(increment_annual_ss)),
        "increment_annual_irpf": float(round_euro(increment_annual_irpf)),
        # ── Resultat complet de cada sou (mateixes xifres que la calculadora) ──
        "previous": {"tipo_retencio": float(prev["tipo_retencio"]), "irpf_anual": float(round_euro(prev["cuota_irpf_anual"])),
                     "sou_net_per_paga": float(round_euro(prev["net_per_paga"])), "walkthrough": walkthrough(prev)},
        "new": {"tipo_retencio": float(new["tipo_retencio"]), "irpf_anual": float(round_euro(new["cuota_irpf_anual"])),
                "sou_net_per_paga": float(round_euro(new["net_per_paga"])), "walkthrough": walkthrough(new)},
    }
