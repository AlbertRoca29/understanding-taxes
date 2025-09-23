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

# IRPF 2025
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
    (65, Decimal("1150")),  # > 65 = 1.150
    (75, Decimal("2550")),  # > 75 = 1.400 (>75 = 1.150 + 1.400)
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


# Recucció de treball (Cuadro 2, RDL 4/2024 & R.D.142/2024)
# Implements the stepwise reduction rules from the official help PDF (applicable 2025).
# Use compute_reduction(rendimiento_neto) to get the reduction amount.

REDUCTION_WORK = {
    "upper1": Decimal("14852.00"),
    "amount1": Decimal("7302.00"),
    "upper2": Decimal("17673.52"),

    "coef2": Decimal("1.75"),
    "upper3": Decimal("19747.49"),

    "base3": Decimal("2364.34"),
    "coef3": Decimal("1.14"),
}

# art. 19.2
GASTOS_DEDUCIDOS = {
    "otros_gastos_generales": Decimal("2000.00"),
    "movilidad_geografica": Decimal("2000.00"),  # condicional (2 anys)
    "discapacidad_trabajador_activo": Decimal("3500.00"),
    "discapacidad_trabajador_activo_grave": Decimal("7750.00"),
}

# TODO
DETRACTIONS_RIGHTS_PASSIVE = Decimal("0.00")
DEDUCIBLE_MUTUALIDADES_FUNCIONARIOS = Decimal("0.00")
COTIZACIONES_OTRAS = Decimal("0.00")


# Prestacions en forma de capital (planes de pensions, assegurances col·lectives)
PRESTACIONES_CAPITAL_RED_PERCENT = Decimal("0.30")

# ADDED: Exclusion of obligation to withhold (Cuadro 1 - art.81.1)
EXCLUSION_LIMITS = {
    "soltero_o_monoparental": {
        0: None,  # when 0 children and 'soltero' there's no exclusion (--- in table)
        1: Decimal("17644"),
        2: Decimal("18694"),
    },
    "conyuge_sin_rentas_1500": {
        0: Decimal("17197"),
        1: Decimal("18130"),
        2: Decimal("19262"),
    },
    "otras_situaciones": {
        0: Decimal("15876"),
        1: Decimal("16342"),
        2: Decimal("16867"),
    },
}

# Tipos fijos / mínimos aplicables (Cuadro 6)
TIPOS_FIJOS = {
    "premios_literarios_artisticos": Decimal("0.15"),
    "cursos_conferencias": Decimal("0.15"),
    "obras_derechos_explotacion_general": Decimal("0.15"),
    "derechos_autor_general": Decimal("0.15"),
    "administradores_general": Decimal("0.35"),
    "contratos_menor_1_ano_artistas_minimum": Decimal("0.02"),
    "atrasos": Decimal("0.15"),
}

# Maximum withholding for low earners (art.85.3): 43% cap for <= 35.200
MAX_WITHHOLDING_PERCENT_FOR_LIMITED = Decimal("0.43")
MAX_WITHHOLDING_LIMIT_BASE = Decimal("35200.00")

# Pension compensations to spouse (amount to be provided from judicial decision)
PENSION_COMPENSATION_JUDICIAL = Decimal("0.00")

# Més indicadors
IS_PENSIONIST = False
IS_UNEMPLOYED = False
IS_WORKER_ACTIVE = True
RESIDES_CEUTA_MELILLA_OR_LA_PALMA = False
HAS_MORTGAGE_PRE_2013 = False  # for historical housing deduction / minoracion 2%
NUM_DESCENDIENTES_APLICABLES = 0
NUM_ASCENDIENTES_APLICABLES = 0
HAS_DISABILITY = False
DISABILITY_PERCENT = 0
NEEDS_HELP_THIRD_PARTY = False
