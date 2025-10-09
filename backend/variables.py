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

# IRPF 2025 (Escala estatal y autonómica)
IRPF_SCALE_ESTATAL = [
    (0, 12450, Decimal("0.095")),
    (12450, 20200, Decimal("0.12")),
    (20200, 35200, Decimal("0.15")),
    (35200, 60000, Decimal("0.185")),
    (60000, 300000, Decimal("0.225")),
    (300000, None, Decimal("0.245"))
]

# IRPF_SCALE_CATALUNYA = [
#     (0, 12450, Decimal("0.095")),
#     (12450, 20200, Decimal("0.12")),
#     (20200, 35200, Decimal("0.15")),
#     (35200, 60000, Decimal("0.185")),
#     (60000, 300000, Decimal("0.225")),
#     (300000, None, Decimal("0.245"))
# ]
IRPF_SCALE_CATALUNYA = [
    (0, 12450, Decimal("0.095")),
    (12450, 17707.20, Decimal("0.12")),
    (17707.20, 21000, Decimal("0.14")),
    (21000, 33007.20, Decimal("0.15")),
    (33007.20, 53407.20, Decimal("0.188")),
    (53407.20, 90000, Decimal("0.215")),
    (90000, 120000, Decimal("0.235")),
    (120000, 175000, Decimal("0.245")),
    (175000, None, Decimal("0.255")),
]



# Mínim contribuent general
MINIMO_CONTRIBUYENTE = Decimal("5550.00")
MINIMO_65 = Decimal("1150.00")
MINIMO_75 = Decimal("1400.00")

CHILDREN_UNDER_25_ADJUSTMENT = [
    (1, Decimal("2400.00")),
    (2, Decimal("2700.00")),
    (3, Decimal("4000.00")),
    (4, Decimal("4500.00")),
]
CHILDREN_UNDER_3_EXTRA = Decimal("2800.00")

ASCENDENTS_ADJUSTMENT = [
    (65, Decimal("1150.00")),
    (75, Decimal("1400.00")),
]

# Discapacidad
DISABILITY_SELF_ADJUSTMENTS = [
    (33, Decimal("3000.00")),
    (65, Decimal("9000.00")),
]
DISABILITY_SELF_HELP_EXTRA = Decimal("3000.00")
DISABILITY_RELATIVES_ADJUSTMENTS = [
    (33, Decimal("3000.00")),
    (65, Decimal("9000.00")),
]
DISABILITY_RELATIVES_HELP_EXTRA = Decimal("3000.00")

# Reducción por rendimientos del trabajo (art. 20 LIRPF, RD-Ley 4/2024)
REDUCTION_WORK = {
    "upper1": Decimal("14852.00"),
    "amount1": Decimal("7302.00"),
    "upper2": Decimal("17673.52"),
    "coef2": Decimal("1.75"),
    "upper3": Decimal("19747.50"),
    "base3": Decimal("2364.34"),
    "coef3": Decimal("1.14"),
}

# Gastos deducibles
GASTOS_DEDUCIDOS = {
    "otros_gastos_generales": Decimal("2000.00"),
    "movilidad_geografica": Decimal("2000.00"),
    "discapacidad_trabajador_activo": Decimal("3500.00"),
    "discapacidad_trabajador_activo_grave": Decimal("7750.00"),
}

# Límites excluyentes de retención (art. 81 RIRPF)
EXCLUSION_LIMITS = {
    "SITUACION1": {1: Decimal("17644.00"), 2: Decimal("18694.00")},
    "SITUACION2": {0: Decimal("17197.00"), 1: Decimal("18130.00"), 2: Decimal("19262.00")},
    "SITUACION3": {0: Decimal("15876.00"), 1: Decimal("16342.00"), 2: Decimal("16867.00")},
}

# Tipos fijos / mínimos aplicables
TIPOS_FIJOS = {
    "premios_literarios_artisticos": Decimal("0.15"),
    "cursos_conferencias": Decimal("0.15"),
    "obras_derechos_explotacion_general": Decimal("0.15"),
    "derechos_autor_general": Decimal("0.15"),
    "administradores_general": Decimal("0.35"),
    "contratos_menor_1_ano_artistas_minimum": Decimal("0.02"),
    "atrasos": Decimal("0.15"),
}

# Límite máximo de retención para bajos ingresos (art. 85.3)
MAX_WITHHOLDING_PERCENT_FOR_LIMITED = Decimal("0.43")
MAX_WITHHOLDING_LIMIT_BASE = Decimal("35200.00")

# Minoración por pagos de préstamos para vivienda habitual
MINORACION_VIVIENDA_PORCENTAJE = Decimal("0.02")
MINORACION_VIVIENDA_MAX = Decimal("660.14")
MINORACION_VIVIENDA_BASE = Decimal("33007.20")

# Indicadores y flags
IS_PENSIONIST = False
IS_UNEMPLOYED = False
IS_WORKER_ACTIVE = True
RESIDES_CEUTA_MELILLA_OR_LA_PALMA = False
HAS_MORTGAGE_PRE_2013 = False
NUM_DESCENDIENTES_APLICABLES = 0
NUM_ASCENDIENTES_APLICABLES = 0
HAS_DISABILITY = False
DISABILITY_PERCENT = 0
NEEDS_HELP_THIRD_PARTY = False
