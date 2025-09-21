# All constants and variables for IRPF and SS calculations
from decimal import Decimal

# Seguretat Social 2025
SS_BASE_MAX_MONTHLY = Decimal("4909.50")
SS_BASE_MAX_DAILY = Decimal("163.65")
SS_BASE_MIN_BY_GROUP = {
    "Sou mensual; Adulta; Enginyeres i llicenciades universitàries": Decimal("1929.00"),
    "Sou mensual; Adulta; Enginyeres tècniques, perites i ajudants titulades": Decimal("1599.60"),
    "Sou mensual; Adulta; Caps administratives i de taller": Decimal("1391.70"),
    "Sou mensual; Adulta; altres": Decimal("1381.20"),
    "Base diaria; Adulta": Decimal("46.04"),
    "Menor d'edat": Decimal("46.04"),
}
DEFAULT_SS_RATES = {
    "contingencies_common_worker": Decimal("0.0470"),
    "unemployment_worker_indefinite": Decimal("0.0155"),
    "unemployment_worker_temporary": Decimal("0.0160"),
    "training_worker": Decimal("0.0010"),
    "mei_worker": Decimal("0.0013"),
}

# IRPF scales
IRPF_SCALE_ESTATAL = [
    (0, 12450, Decimal("0.095")),
    (12450, 20200, Decimal("0.12")),
    (20200, 35200, Decimal("0.15")),
    (35200, 60000, Decimal("0.185")),
    (60000, 300000, Decimal("0.225")),
    (300000, None, Decimal("0.245"))
]
IRPF_SCALE_CATALUNYA = [
    (0, 12450, Decimal("0.12")),
    (12450, 17707.20, Decimal("0.12")),
    (17707.20, 21000, Decimal("0.14")),
    (21000, 33007.20, Decimal("0.15")),
    (33007.20, 53407.20, Decimal("0.188")),
    (53407.20, 90000, Decimal("0.215")),
    (90000, None, Decimal("0.235"))
]

# Mínim contribuent general
MINIMO_CONTRIBUYENTE = Decimal("5550.00")
AGE_ADJUSTMENTS = [
    (65, Decimal("1150")),
    (75, Decimal("2550")),
]
CHILDREN_UNDER_25_ADJUSTMENT = [
    (1, Decimal("2400")),
    (2, Decimal("2700")),
    (3, Decimal("4000")),
    (4, Decimal("4500")),
]
CHILDREN_UNDER_3_EXTRA = Decimal("2800")
ASCENDENTS_ADJUSTMENT = [
    (65, Decimal("1150")),
    (75, Decimal("2550")),
]
DISABILITY_SELF_ADJUSTMENTS = [
    (33, Decimal("3000")),
    (65, Decimal("9000")),
]
DISABILITY_SELF_HELP_EXTRA = Decimal("3000")
DISABILITY_RELATIVES_ADJUSTMENTS = [
    (33, Decimal("3000")),
    (65, Decimal("9000")),
]
DISABILITY_RELATIVES_HELP_EXTRA = Decimal("3000")
