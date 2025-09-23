# All utility functions and classes for IRPF and SS calculations
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP, getcontext
from typing import List, Tuple, Optional, Dict
from variables import *

# Increase precision
getcontext().prec = 28

def round_euro(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

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
        minimo = MINIMO_CONTRIBUYENTE
        for age_limit, inc in AGE_ADJUSTMENTS:
            if self.age > age_limit:
                minimo += inc
        for i, child_age in enumerate(self.children_ages):
            if child_age < 25:
                order = i + 1
                if order <= len(CHILDREN_UNDER_25_ADJUSTMENT):
                    minimo += CHILDREN_UNDER_25_ADJUSTMENT[order - 1][1]
                else:
                    minimo += CHILDREN_UNDER_25_ADJUSTMENT[-1][1]
                if child_age < 3:
                    minimo += CHILDREN_UNDER_3_EXTRA
        for asc_age in self.ascendents_ages:
            for age_limit, inc in ASCENDENTS_ADJUSTMENT:
                if asc_age > age_limit:
                    minimo += inc
        for perc_limit, inc in DISABILITY_SELF_ADJUSTMENTS:
            if self.disability_percent_self >= perc_limit:
                minimo = max(minimo, MINIMO_CONTRIBUYENTE + inc)
        if self.disability_self_help:
            minimo += DISABILITY_SELF_HELP_EXTRA
        for perc, needs_help in self.disability_relatives:
            for perc_limit, inc in DISABILITY_RELATIVES_ADJUSTMENTS:
                if perc >= perc_limit:
                    minimo += inc
            if needs_help:
                minimo += DISABILITY_RELATIVES_HELP_EXTRA
        return minimo

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


# Helper moved from variables.py
def compute_reduction_by_work(rendimiento_neto: Decimal) -> Decimal:
    """
    Compute the 'reducción por obtención de rendimientos del trabajo' per Cuadro 2.
    """
    rn = rendimiento_neto
    if rn <= REDUCTION_WORK["upper1"]:
        return REDUCTION_WORK["amount1"]
    if rn <= REDUCTION_WORK["upper2"]:
        val = REDUCTION_WORK["amount1"] - (REDUCTION_WORK["coef2"] * (rn - REDUCTION_WORK["upper1"]))
        return max(Decimal("0.00"), val.quantize(Decimal("0.01")))
    if rn <= REDUCTION_WORK["upper3"]:
        val = REDUCTION_WORK["base3"] - (REDUCTION_WORK["coef3"] * (rn - REDUCTION_WORK["upper2"]))
        return max(Decimal("0.00"), val.quantize(Decimal("0.01")))
    return Decimal("0.00")
