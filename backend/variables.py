from decimal import Decimal

# Seguretat Social 2026 (Orden PJC/297/2026)
SS_BASE_MAX_MONTHLY = Decimal("5101.20")
SS_BASE_MIN_BY_GROUP = {
    "Grup 1 – Enginyers/Llicenciats/Alta direcció": Decimal("1989.30"),
    "Grup 2 – Enginyers tècnics/Tècnics titulats":  Decimal("1649.70"),
    "Grup 3 – Caps administratius i de taller":     Decimal("1435.20"),
    "Grup 4 – Ajudants no titulats":                Decimal("1424.40"),
    "Grup 5 – Oficials administratius":             Decimal("1424.40"),
    "Grup 6 – Subalterns":                          Decimal("1424.40"),
    "Grup 7 – Auxiliars administratius":            Decimal("1424.40"),
    "Grups 8-11 – Oficials, especialistes i peons": Decimal("1424.40"),
}
DEFAULT_SS_RATES = {
    "contingencies_common_worker": Decimal("0.0470"),
    "unemployment_worker_indefinite": Decimal("0.0155"),
    "unemployment_worker_temporary": Decimal("0.0160"),
    "training_worker": Decimal("0.0010"),
    "mei_worker": Decimal("0.0015"),
}

# IRPF 2026 — escala estatal (art. 63 LIRPF)
IRPF_SCALE_ESTATAL = [
    (0, 12450, Decimal("0.095")),
    (12450, 20200, Decimal("0.12")),
    (20200, 35200, Decimal("0.15")),
    (35200, 60000, Decimal("0.185")),
    (60000, 300000, Decimal("0.225")),
    (300000, None, Decimal("0.245"))
]
# Escala autonòmica de Catalunya, vigent des de l'1-1-2025 (art. 611-1 Codi tributari
# de Catalunya, redacció del Decret llei 5/2025). Mínim personal autonòmic = 5.550 € (art. 611-2).
IRPF_SCALE_CATALUNYA = [
    (0, 12500, Decimal("0.095")),
    (12500, 22000, Decimal("0.125")),
    (22000, 33000, Decimal("0.16")),
    (33000, 53000, Decimal("0.19")),
    (53000, 90000, Decimal("0.215")),
    (90000, 120000, Decimal("0.235")),
    (120000, 175000, Decimal("0.245")),
    (175000, None, Decimal("0.255")),
]

# Deducció per obtenció de rendiments del treball (DA 61a LIRPF, RDL 5/2026): fa que
# qui cobra el SMI 2026 (17.094 €) no pagui IRPF. Es resta de la quota líquida total.
DEDUCCIO_SMI = {
    "smi": Decimal("17094.00"),
    "import": Decimal("590.89"),
    "coef": Decimal("0.2"),
    "limit": Decimal("20048.45"),
}


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

# Offset sobre mínimo personal-familiar en cálculos con anualidades (art. 85 RIRPF)
ANUALIDADES_MINPERFA_EXTRA = Decimal("1980.00")

# Tipos mínimos de retención según tipo de contrato (art. 86.2 RIRPF) — en porcentaje (%)
RETENCION_MIN_CONTRATO_ESPECIAL = Decimal("15.00")
RETENCION_MIN_CONTRATO_INFERIOR_ANO = Decimal("2.00")

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

# Taula 1 – Límits excloents de l'obligació de retenir (art. 81 RIRPF, RD 142/2024).
# Situació familiar 3 (general) per nombre de descendents: 0, 1, 2 o més.
EXCLUSION_LIMITS_SITUACION3 = [Decimal("15876.00"), Decimal("16342.00"), Decimal("16867.00")]

# Reducció per més de dos descendents (base per calcular el tipus de retenció)
REDUCTION_MORE_THAN_TWO_CHILDREN = Decimal("600.00")
