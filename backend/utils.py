# All utility functions and classes for IRPF and SS calculations
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP, getcontext
from typing import List, Tuple, Optional, Dict
from variables import *

# Increase precision
getcontext().prec = 28


# Redondeo oficial (redondear al segundo decimal, 0.005 se redondea a 0.01)
def redondear1(x: Decimal) -> Decimal:
    return (x + Decimal("0.00001")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

# Truncado oficial (truncar al segundo decimal)
def truncar(x: Decimal) -> Decimal:
    return Decimal(int(x * 100)) / Decimal("100")

def round_euro(x: Decimal) -> Decimal:
    return redondear1(x)

@dataclass
class FamilySituation:
    age: int = 30
    children_ages: List[int] = field(default_factory=list)
    children_disabilities: List[int] = field(default_factory=list)
    ascendents_ages: List[int] = field(default_factory=list)
    disability_percent_self: int = 0
    disability_self_help: bool = False
    disability_relatives: List[Tuple[int, bool]] = field(default_factory=list)

    def minimo_personal_familiar(self) -> Decimal:
        # Mínimo del contribuyente
        minimo = MINIMO_CONTRIBUYENTE
        if self.age >= 65:
            minimo += MINIMO_65
        if self.age >= 75:
            minimo += MINIMO_75

        # Mínimo por descendientes < 25 años o con discapacidad
        mindesg = Decimal("0.00")
        mindes3 = Decimal("0.00")
        for i, child_age in enumerate(self.children_ages):
            if child_age < 25:
                order = i + 1
                if order <= len(CHILDREN_UNDER_25_ADJUSTMENT):
                    mindesg += CHILDREN_UNDER_25_ADJUSTMENT[order - 1][1]
                else:
                    mindesg += CHILDREN_UNDER_25_ADJUSTMENT[-1][1]
                if child_age < 3:
                    mindes3 += CHILDREN_UNDER_3_EXTRA
        mindesg = redondear1(mindesg)
        mindes3 = redondear1(mindes3)
        mindes = mindesg + mindes3

        # Mínimo por ascendientes >= 65 años o con discapacidad
        minas = Decimal("0.00")
        for asc_age in self.ascendents_ages:
            if asc_age >= 75:
                minas += ASCENDENTS_ADJUSTMENT[1][1]
            elif asc_age >= 65:
                minas += ASCENDENTS_ADJUSTMENT[0][1]
        minas = redondear1(minas)

        # Mínimo por discapacidad del contribuyente
        mindisc = Decimal("0.00")
        if self.disability_percent_self >= 65:
            mindisc += DISABILITY_SELF_ADJUSTMENTS[1][1]
        elif self.disability_percent_self >= 33:
            mindisc += DISABILITY_SELF_ADJUSTMENTS[0][1]
        if self.disability_self_help:
            mindisc += DISABILITY_SELF_HELP_EXTRA

        # Mínimo por discapacidad de descendientes y ascendientes
        disdes = Decimal("0.00")
        for perc in self.children_disabilities:
            if perc >= 65:
                disdes += DISABILITY_RELATIVES_ADJUSTMENTS[1][1]
            elif perc >= 33:
                disdes += DISABILITY_RELATIVES_ADJUSTMENTS[0][1]
        disas = Decimal("0.00")
        for perc in self.disability_relatives:
            if perc[0] >= 65:
                disas += DISABILITY_RELATIVES_ADJUSTMENTS[1][1]
            elif perc[0] >= 33:
                disas += DISABILITY_RELATIVES_ADJUSTMENTS[0][1]
            if perc[1]:
                disas += DISABILITY_RELATIVES_HELP_EXTRA
        mindis = mindisc + disdes + disas

        # Suma total de mínimos
        mincon = minimo
        minperfa = mincon + mindes + minas + mindis
        return redondear1(minperfa)
def calcular_gastos_deducibles(retrib, cotizaciones, movilidad_geografica, discapacidad_trabajador_activo, discapacidad_trabajador_activo_grave, situper):
    gastosgen = GASTOS_DEDUCIDOS["otros_gastos_generales"]
    incregasmovil = GASTOS_DEDUCIDOS["movilidad_geografica"] if movilidad_geografica else Decimal("0.00")
    if situper == "ACTIVO":
        if discapacidad_trabajador_activo_grave:
            incregasdistra = GASTOS_DEDUCIDOS["discapacidad_trabajador_activo_grave"]
        elif discapacidad_trabajador_activo:
            incregasdistra = GASTOS_DEDUCIDOS["discapacidad_trabajador_activo"]
        else:
            incregasdistra = Decimal("0.00")
    else:
        incregasdistra = Decimal("0.00")
    otrosgastos = gastosgen + incregasmovil + incregasdistra
    if retrib - cotizaciones < 0:
        otrosgastos = Decimal("0.00")
    if otrosgastos > retrib - cotizaciones:
        otrosgastos = retrib - cotizaciones
    return otrosgastos
def calcular_tipo_retencion(cuota, retrib, presviv, minopago, ceumeli, contrato, limite_min=Decimal("0.00"), limite_max=Decimal("47.00")):
    # Minoración por vivienda
    if presviv and retrib < MINORACION_VIVIENDA_BASE:
        minopago = truncar(retrib * MINORACION_VIVIENDA_PORCENTAJE)
        if minopago > MINORACION_VIVIENDA_MAX:
            minopago = MINORACION_VIVIENDA_MAX
    else:
        minopago = Decimal("0.00")
    # Tratamiento Ceuta/Melilla/La Palma
    if ceumeli:
        diferencia_positiva = cuota * Decimal("0.40") - minopago
    else:
        diferencia_positiva = cuota - minopago
    if diferencia_positiva < 0:
        diferencia_positiva = Decimal("0.00")
    tipo = truncar((diferencia_positiva / retrib) * Decimal("100")) if retrib > 0 else Decimal("0.00")
    # Límites mínimos y máximos
    if ceumeli:
        if contrato == "ESPECIAL" and tipo < Decimal("6.00"):
            tipo = Decimal("6.00")
        elif contrato == "INFERIORAÑO" and tipo < Decimal("0.80"):
            tipo = Decimal("0.80")
    else:
        if contrato == "ESPECIAL" and tipo < Decimal("15.00"):
            tipo = Decimal("15.00")
        elif contrato == "INFERIORAÑO" and tipo < Decimal("2.00"):
            tipo = Decimal("2.00")
    if tipo > limite_max:
        tipo = limite_max
    return tipo

def calcular_cuota_retencion(base, minperfa, anualidades=Decimal("0.00"), escala=None):
    # Usar la escala combinada estatal+autonómica por defecto
    if escala is None:
        escala = IRPFScale.combined_scale(IRPF_SCALE_CATALUNYA, IRPF_SCALE_ESTATAL)
    def escala_retencion(valor):
        return escala.tax_on_base(valor)
    # Anualidades
    if anualidades > 0 and (base - anualidades) > 0:
        base1 = base - anualidades
        base2 = anualidades
        cuota1_1 = escala_retencion(base1)
        cuota1_2 = escala_retencion(base2)
        cuota1 = cuota1_1 + cuota1_2
    else:
        cuota1 = escala_retencion(base)
    # Cuota2
    if anualidades > 0 and (base - anualidades) > 0:
        cuota2 = escala_retencion(minperfa + Decimal("1980.00"))
    else:
        cuota2 = escala_retencion(minperfa)
    # Cálculo final
    cuota = cuota1 - cuota2 if cuota1 > cuota2 else Decimal("0.00")
    return cuota


def calcular_minoracion_vivienda(retrib, presviv, minopago):
    if presviv and retrib < MINORACION_VIVIENDA_BASE:
        minopago = truncar(retrib * MINORACION_VIVIENDA_PORCENTAJE)
        if minopago > MINORACION_VIVIENDA_MAX:
            minopago = MINORACION_VIVIENDA_MAX
    else:
        minopago = Decimal("0.00")
    return minopago
def calcular_regularizacion(params):
    # Esta función debe implementar la lógica de regularización y causas según el documento oficial
    # params: dict con todas las variables necesarias
    # Ejemplo de estructura mínima, debe completarse según necesidades reales
    regularizacion = params.get("regularizacion", False)
    causas = params.get("causas", {})
    ceumeli = params.get("ceumeli", False)
    retrib = params.get("retrib", Decimal("0.00"))
    percibido = params.get("percibido", Decimal("0.00"))
    cuota = params.get("cuota", Decimal("0.00"))
    # ... otros parámetros
    # Implementar aquí la lógica de cálculo de regularización
    # (ver documento para todos los casos y fórmulas)
    # Devolver los valores calculados
    return {
        "importereg": Decimal("0.00"),
        "tiporeg": Decimal("0.00"),
        "importe": Decimal("0.00"),
    }

@dataclass
class IRPFScale:
    brackets: List[Tuple[Decimal, Optional[Decimal], Decimal]] = field(default_factory=list)

    def tax_on_base(self, base: Decimal) -> Decimal:
        tax = Decimal("0")
        for low, high, rate in self.brackets:
            low = Decimal(low)
            high = Decimal(high) if high is not None else None
            if base <= low:
                break
            upper = base if (high is None or base < high) else high
            taxable = upper - low
            if taxable <= 0:
                continue
            tax += taxable * rate
        return tax

    @classmethod
    def combined_scale(cls, regional_scale, state_scale):
        breakpoints = set()
        for low, high, _ in regional_scale + state_scale:
            breakpoints.add(low)
            if high is not None:
                breakpoints.add(high)
        breakpoints = sorted(breakpoints)
        combined_brackets = []
        for i in range(len(breakpoints) - 1):
            low = Decimal(breakpoints[i])
            high = Decimal(breakpoints[i+1])
            r_rate = next((rate for l, h, rate in regional_scale if l <= low < (h if h is not None else Decimal("1e18"))), Decimal(0))
            s_rate = next((rate for l, h, rate in state_scale if l <= low < (h if h is not None else Decimal("1e18"))), Decimal(0))
            combined_brackets.append((low, high, r_rate + s_rate))
        last_r_rate = next((rate for l, h, rate in regional_scale if l <= breakpoints[-1] < (h if h is not None else Decimal("1e18"))), Decimal(0))
        last_s_rate = next((rate for l, h, rate in state_scale if l <= breakpoints[-1] < (h if h is not None else Decimal("1e18"))), Decimal(0))
        combined_brackets.append((Decimal(breakpoints[-1]), None, last_r_rate + last_s_rate))
        return cls(combined_brackets)

def apply_base_limits(base: Decimal, base_min: Decimal, base_max: Decimal, is_daily: bool = False, days_in_month: int = 30) -> Decimal:
    if is_daily:
        base_diari = base / Decimal(days_in_month)
        base_diari_ajustat = max(base_min, min(base_diari, base_max))
        return base_diari_ajustat * Decimal(days_in_month)
    else:
        return max(base_min, min(base, base_max))

def calculate_base_imposable_irpf(annual_gross: Decimal, annual_employee_ss: Decimal, family: FamilySituation, other_deductions: Decimal = Decimal("0")) -> Decimal:
    minimo_pf = family.minimo_personal_familiar()
    base = annual_gross - annual_employee_ss - minimo_pf - other_deductions
    if base < 0:
        base = Decimal("0")
    return base


def compute_reduction_by_work(rendimiento_neto: Decimal) -> Decimal:
    """
    Compute the 'reducción por obtención de rendimientos del trabajo' per Cuadro 2.
    """
    rn = rendimiento_neto
    if rn <= REDUCTION_WORK["upper1"]:
        return REDUCTION_WORK["amount1"]
    if rn <= REDUCTION_WORK["upper2"]:
        val = REDUCTION_WORK["amount1"] - (REDUCTION_WORK["coef2"] * (rn - REDUCTION_WORK["upper1"]))
        return val.quantize(Decimal("0.01"))
    if rn <= REDUCTION_WORK["upper3"]:
        val = REDUCTION_WORK["base3"] - (REDUCTION_WORK["coef3"] * (rn - REDUCTION_WORK["upper2"]))
        return val.quantize(Decimal("0.01"))
    return Decimal("0.00")
