/*
 * Model of the official AEAT withholding algorithm
 * "Algoritmo de cálculo del tipo de retención IRPF – Ejercicio 2026 (a partir de 10 sept.)"
 *
 * Every variable is a node. `deps` = variables it is computed from (edges).
 * `topic` groups niche branches so they can be toggled on/off while we decide
 * what stays in the final diagram. `p` = page in the PDF.
 */
window.IRPF = (function () {

  const stages = [
    { id: 'in',     n: 0,  title: 'Datos de entrada',            sub: 'What the payer knows about you (modelo 145 + payroll)' },
    { id: 'desc',   n: 1,  title: 'Descendientes',               sub: 'Children: age, how they are counted (whole / half)' },
    { id: 'asc',    n: 2,  title: 'Ascendientes',                sub: 'Parents/grandparents ≥65 or disabled living with you' },
    { id: 'gastos', n: 3,  title: 'Gastos deducibles',           sub: 'Social security + flat 2.000 € “otros gastos”' },
    { id: 'rend',   n: 4,  title: 'Rendimiento neto',            sub: 'Net income and the art. 20 low-income reduction' },
    { id: 'red',    n: 5,  title: 'Base de retención',           sub: 'Personal reductions → the base the scale is applied to' },
    { id: 'min',    n: 6,  title: 'Mínimo personal y familiar',  sub: 'The tax-free amount for you and your family' },
    { id: 'exento', n: 7,  title: 'Límite excluyente',           sub: 'Table 1: below this salary there is no withholding' },
    { id: 'cuota',  n: 8,  title: 'Cuota de retención',          sub: 'Scale(base) − Scale(mínimo), capped at 43 %' },
    { id: 'tipo',   n: 9,  title: 'Tipo de retención',           sub: 'Cuota / salary, truncated, with contract floors' },
    { id: 'reg',    n: 10, title: 'Regularización',              sub: 'Mid-year recalculation when circumstances change' },
  ];

  // Scope decided with the user (2026-11-10):
  //   kept     = >5 % of people, or niche but explicitly kept
  //   excluded = niche, left out of the final diagram (still in the model, toggleable)
  const topics = {
    core:        { label: 'Core (everyone)',                          default: true,  locked: true },
    children:    { label: 'Children',                                  default: true },
    age:         { label: 'Age ≥ 65 / ≥ 75',                           default: true },
    situper:     { label: 'Pensioner / unemployed',                    default: true },
    temporal:    { label: 'Contract < 1 year (2 % floor)',             default: true },
    ascendants:  { label: 'Ascendants (parents ≥ 65)',                 default: true },
    disability:  { label: 'Disability (you or family)',                default: true },
    mobility:    { label: 'Reduced mobility / assistance',             default: true },
    adoption:    { label: 'Adoption / foster year',                    default: true },
    divorce:     { label: 'Spousal pension & child support (anualidades)', default: true },
    housing:     { label: 'Pre-2013 mortgage deduction (−2 %)',        default: false, excluded: true },
    irregular:   { label: 'Irregular income reductions (art. 18)',     default: false, excluded: true },
    geomobility: { label: 'Geographic mobility (+2.000 €)',            default: false, excluded: true },
    especial:    { label: '“Especial” contract (15 % floor)',          default: false, excluded: true },
    ceuta:       { label: 'Ceuta / Melilla / La Palma (−60 %)',        default: false, excluded: true },
    regularization: { label: 'Mid-year regularization',                default: false, excluded: true },
  };

  // kind: input | const | calc | decision | output
  const N = (id, o) => Object.assign({ id, name: id, deps: [], topic: 'core', kind: 'calc' }, o);

  const nodes = [
    // ───────────────────────── INPUTS ─────────────────────────
    N('RETRIB',      { stage: 'in', kind: 'input', label: 'Gross annual pay', desc: 'Retribuciones totales anuales (dinerarias y en especie), íntegro.', p: 40 }),
    N('COTIZACIONES',{ stage: 'in', kind: 'input', label: 'Social security', desc: 'Cotizaciones a la Seguridad Social, mutualidades… (art. 19.2 a-c).', p: 40 }),
    N('ANYOPER',     { name: 'AÑOPER', stage: 'in', kind: 'input', label: 'Your birth year', p: 39 }),
    N('SITUFAM',     { stage: 'in', kind: 'input', label: 'Family situation', desc: '1 = single parent with kids · 2 = spouse earning ≤ 1.500 € · 3 = everyone else (default).', p: 39 }),
    N('SITUPER',     { stage: 'in', kind: 'input', label: 'Employment status', desc: 'Activo · Pensionista · Desempleado · Otra situación.', p: 39 }),
    N('CONTRATO',    { stage: 'in', kind: 'input', label: 'Contract type', desc: 'General · Inferior a un año (temporary, artists) · Especial (special dependent relations) · Manuales (peonadas).', p: 39 }),
    N('ANYODES',     { name: 'AÑODES[i]', stage: 'in', kind: 'input', topic: 'children', label: 'Children birth years', desc: 'Up to 16 descendants, sorted by birth year (oldest first).', p: 40 }),
    N('PORENTERO',   { name: 'POR ENTERO[i]', stage: 'in', kind: 'input', topic: 'children', label: 'Child counted whole?', desc: 'S if only you claim the child; N if shared with the other parent (counts ½).', p: 40 }),
    N('ANYOADOP',    { name: 'AÑOADOP[i]', stage: 'in', kind: 'input', topic: 'adoption', label: 'Adoption/foster year', p: 40 }),
    N('DISCADES',    { name: 'DISCADES[i]', stage: 'in', kind: 'input', topic: 'disability', label: 'Child disability', desc: 'Sin / 33–65 % / ≥ 65 %.', p: 40 }),
    N('MOVILDES',    { name: 'MOVILDES[i]', stage: 'in', kind: 'input', topic: 'mobility', label: 'Child reduced mobility', p: 40 }),
    N('ANYOAS',      { name: 'AÑOAS[j]', stage: 'in', kind: 'input', topic: 'ascendants', label: 'Ascendant birth years', desc: 'Up to 6 ascendants living with you ≥ ½ year.', p: 40 }),
    N('CONVIVENCIA', { name: 'CONVIVENCIA[j]', stage: 'in', kind: 'input', topic: 'ascendants', label: 'People sharing the ascendant', desc: 'Number of descendants the ascendant lives with — the minimum is split between them.', p: 40 }),
    N('DISCAS',      { name: 'DISCAS[j]', stage: 'in', kind: 'input', topic: 'disability', label: 'Ascendant disability', p: 40 }),
    N('MOVILAS',     { name: 'MOVILAS[j]', stage: 'in', kind: 'input', topic: 'mobility', label: 'Ascendant reduced mobility', p: 40 }),
    N('DISCAPER',    { stage: 'in', kind: 'input', topic: 'disability', label: 'Your disability', desc: 'Sin / 33–65 % / ≥ 65 %.', p: 39 }),
    N('MOVILPER',    { stage: 'in', kind: 'input', topic: 'mobility', label: 'Your reduced mobility', p: 39 }),
    N('MOVIL',       { stage: 'in', kind: 'input', topic: 'geomobility', label: 'Moved for a new job', desc: 'Unemployed who accepted a job requiring a change of residence.', p: 39 }),
    N('IRREGULAR1',  { stage: 'in', kind: 'input', topic: 'irregular', label: 'Art. 18.2 reductions', desc: 'Income generated over > 2 years (30 % reduction, max 90.000 €).', p: 40 }),
    N('IRREGULAR2',  { stage: 'in', kind: 'input', topic: 'irregular', label: 'Art. 18.3 / DT 11ª-12ª reductions', p: 40 }),
    N('CONYUGE',     { stage: 'in', kind: 'input', topic: 'divorce', label: 'Spousal pension paid', desc: 'Pensión compensatoria fixed by a court.', p: 41 }),
    N('ANUALIDADES', { stage: 'in', kind: 'input', topic: 'divorce', label: 'Child support paid', desc: 'Anualidades por alimentos a favor de hijos (court-ordered).', p: 41 }),
    N('PRESVIV',     { stage: 'in', kind: 'input', topic: 'housing', label: 'Paying pre-2013 home loan', desc: 'Has right to the transitional home-purchase deduction and earns < 33.007,20 €.', p: 41 }),
    N('RESICEME',    { stage: 'in', kind: 'input', topic: 'ceuta', label: 'Resident in Ceuta/Melilla/La Palma', p: 39 }),
    N('RENCEME',     { stage: 'in', kind: 'input', topic: 'ceuta', label: 'Income earned there', p: 41 }),

    // ───────────────────────── DESCENDIENTES ─────────────────────────
    N('EDADES',  { name: 'EDADES[i]', stage: 'desc', topic: 'children', label: 'Child age', f: 'EDADES = 2026 − AÑODES', deps: ['ANYODES'], p: 9 }),
    N('ENTERO',  { name: 'ENTERO[i]', stage: 'desc', topic: 'children', label: 'Child weight', f: 'ENTERO = POR ENTERO ? 1 : 0,5', deps: ['PORENTERO'], p: 9 }),
    N('NUMDES',  { stage: 'desc', topic: 'children', label: 'Number of children', f: 'NUMDES = count(AÑODES > 0)', note: 'Counted as a plain integer — the ½ weight does NOT apply here.', deps: ['ANYODES'], p: 9 }),
    N('NUMDES3365', { stage: 'desc', topic: 'disability', label: '# children 33–65 %', f: 'count(DISCADES = DE33A65)', deps: ['DISCADES'], p: 13 }),
    N('NUMDES65',   { stage: 'desc', topic: 'disability', label: '# children ≥ 65 %', f: 'count(DISCADES = DESDE65)', deps: ['DISCADES'], p: 15 }),
    N('NUMDESMOV',  { stage: 'desc', topic: 'mobility', label: '# children reduced mobility', f: 'count(MOVILDES = S)', deps: ['MOVILDES'], p: 14 }),

    // ───────────────────────── ASCENDIENTES ─────────────────────────
    N('EDADAS',   { name: 'EDADAS[j]', stage: 'asc', topic: 'ascendants', label: 'Ascendant age', f: 'EDADAS = 2026 − AÑOAS', deps: ['ANYOAS'], p: 16 }),
    N('NUMAS',    { stage: 'asc', topic: 'ascendants', label: 'Number of ascendants', f: 'count(AÑOAS > 0)', deps: ['ANYOAS'], p: 16 }),
    N('NUMAS65A', { stage: 'asc', topic: 'ascendants', label: '# ascendants 65–74 (or disabled)', f: 'count(65 ≤ EDADAS ≤ 74  or  disabled)', deps: ['EDADAS', 'DISCAS', 'NUMAS'], p: 16 }),
    N('NUMAS75A', { stage: 'asc', topic: 'ascendants', label: '# ascendants ≥ 75', f: 'count(EDADAS > 74)', deps: ['EDADAS', 'NUMAS'], p: 16 }),
    N('NUMAS3365',{ stage: 'asc', topic: 'disability', label: '# ascendants 33–65 %', f: 'count(DISCAS = DE33A65)', deps: ['DISCAS'], p: 18 }),
    N('NUMAS65',  { stage: 'asc', topic: 'disability', label: '# ascendants ≥ 65 %', f: 'count(DISCAS = DESDE65)', deps: ['DISCAS'], p: 20 }),
    N('NUMASMOV', { stage: 'asc', topic: 'mobility', label: '# ascendants reduced mobility', f: 'count(MOVILAS = S)', deps: ['MOVILAS'], p: 19 }),

    // ───────────────────────── GASTOS ─────────────────────────
    N('GASTOSGEN',     { stage: 'gastos', kind: 'const', label: 'General flat expense', f: 'GASTOSGEN = 2.000', p: 21 }),
    N('INCREGASMOVIL', { stage: 'gastos', topic: 'geomobility', label: 'Mobility increase', f: 'MOVIL = S ? 2.000 : 0', deps: ['MOVIL'], p: 21 }),
    N('INCREGASDISTRA',{ stage: 'gastos', topic: 'disability', label: 'Disabled active worker increase',
        f: 'if SITUPER = ACTIVO:\n  ≥65 % or (33–65 % + mobility) → 7.750\n  33–65 % → 3.500\nelse 0', deps: ['SITUPER', 'DISCAPER', 'MOVILPER'], p: 21 }),
    N('OTROSGASTOS',   { stage: 'gastos', label: 'Other expenses (art. 19.2.f)',
        f: 'OTROSGASTOS = GASTOSGEN + INCREGASMOVIL + INCREGASDISTRA\ncapped to [0, RETRIB − COTIZACIONES]', deps: ['GASTOSGEN', 'INCREGASMOVIL', 'INCREGASDISTRA', 'RETRIB', 'COTIZACIONES'], p: 21 }),
    N('GASTOS',        { stage: 'gastos', label: 'Total deductible expenses', f: 'GASTOS = COTIZACIONES + OTROSGASTOS', note: 'Reported as output only — not used further.', deps: ['COTIZACIONES', 'OTROSGASTOS'], p: 21 }),

    // ───────────────────────── RENDIMIENTO ─────────────────────────
    N('RNT',     { stage: 'rend', label: 'Net work income', f: 'RNT = max(0, RETRIB − IRREGULAR1 − IRREGULAR2 − COTIZACIONES)', deps: ['RETRIB', 'IRREGULAR1', 'IRREGULAR2', 'COTIZACIONES'], p: 21 }),
    N('RED20',   { stage: 'rend', label: 'Art. 20 reduction', f: 'RNT ≤ 14.852        → 7.302\nRNT ≤ 17.673,52     → 7.302 − 1,75·(RNT − 14.852)\nRNT < 19.747,50     → 2.364,34 − 1,14·(RNT − 17.673,52)\nelse                → 0\nrounded to cents', deps: ['RNT'], p: 22 }),
    N('RNTREDU', { stage: 'rend', label: 'Reduced net income', f: 'RNTREDU = max(0, RNT − OTROSGASTOS − RED20)', deps: ['RNT', 'OTROSGASTOS', 'RED20'], p: 22 }),

    // ───────────────────────── REDUCCIONES / BASE ─────────────────────────
    N('PENSION', { stage: 'red', topic: 'situper', label: 'Pensioner reduction', f: 'SITUPER = PENSIONISTA ? 600 : 0', deps: ['SITUPER'], p: 22 }),
    N('DESEM',   { stage: 'red', topic: 'situper', label: 'Unemployed reduction', f: 'SITUPER = DESEMPLEADO ? 1.200 : 0', deps: ['SITUPER'], p: 22 }),
    N('HIJOS',   { stage: 'red', topic: 'children', label: '> 2 children reduction', f: 'NUMDES > 2 ? 600 : 0', deps: ['NUMDES'], p: 22 }),
    N('REDU',    { stage: 'red', label: 'Sum of reductions', f: 'REDU = PENSION + HIJOS + DESEM + CONYUGE', deps: ['PENSION', 'HIJOS', 'DESEM', 'CONYUGE'], p: 28 }),
    N('BASE',    { stage: 'red', kind: 'output', label: 'Withholding base', f: 'BASE = max(0, RNTREDU − REDU)', deps: ['RNTREDU', 'REDU'], p: 28 }),

    // ───────────────────────── MÍNIMO ─────────────────────────
    N('MINPER',   { stage: 'min', kind: 'const', label: 'Personal minimum', f: 'MINPER = 5.550', p: 23 }),
    N('PER65',    { name: '65PER', stage: 'min', topic: 'age', label: 'You ≥ 65', f: '2026 − AÑOPER > 64 ? 1.150 : 0', deps: ['ANYOPER'], p: 23 }),
    N('PER75',    { name: '75PER', stage: 'min', topic: 'age', label: 'You ≥ 75', f: '2026 − AÑOPER > 74 ? 1.400 : 0', deps: ['ANYOPER'], p: 23 }),
    N('MINCON',   { stage: 'min', label: 'Taxpayer minimum', f: 'MINCON = MINPER + 65PER + 75PER', deps: ['MINPER', 'PER65', 'PER75'], p: 23 }),
    N('MINDESG',  { stage: 'min', topic: 'children', label: 'Children minimum', f: 'Σ by birth order × ENTERO[i]\n1st 2.400 · 2nd 2.700 · 3rd 4.000 · 4th+ 4.500', note: 'Literal pseudocode counts every listed descendant (validation #13 rejects ≥ 25 without disability).', deps: ['ANYODES', 'ENTERO'], p: 23 }),
    N('MINDES3',  { stage: 'min', topic: 'children', label: 'Under-3 supplement', f: 'Σ 2.800 × ENTERO[i]  for each child\nborn > 2023  (or adopted > 2023)', deps: ['ANYODES', 'ANYOADOP', 'ENTERO'], p: 24 }),
    N('MINDES',   { stage: 'min', topic: 'children', label: 'Descendants minimum', f: 'MINDES = MINDESG + MINDES3', deps: ['MINDESG', 'MINDES3'], p: 24 }),
    N('AS65',     { name: '65AS', stage: 'min', topic: 'ascendants', label: 'Ascendant ≥ 65 / disabled', f: 'Σ 1.150 / CONVIVENCIA[j]', deps: ['NUMAS65A', 'NUMAS75A', 'CONVIVENCIA'], p: 24 }),
    N('AS75',     { name: '75AS', stage: 'min', topic: 'ascendants', label: 'Ascendant ≥ 75 extra', f: 'Σ 1.400 / CONVIVENCIA[j]', deps: ['NUMAS75A', 'CONVIVENCIA'], p: 25 }),
    N('MINAS',    { stage: 'min', topic: 'ascendants', label: 'Ascendants minimum', f: 'MINAS = 65AS + 75AS', deps: ['AS65', 'AS75'], p: 25 }),
    N('DISPER',   { stage: 'min', topic: 'disability', label: 'Your disability', f: '≥ 65 % → 9.000 · 33–65 % → 3.000', deps: ['DISCAPER'], p: 25 }),
    N('ASISPER',  { stage: 'min', topic: 'mobility', label: 'Your assistance', f: '≥ 65 % or (33–65 % + mobility) → 3.000', deps: ['DISCAPER', 'MOVILPER'], p: 25 }),
    N('MINDISC',  { stage: 'min', topic: 'disability', label: 'Taxpayer disability min.', f: 'MINDISC = DISPER + ASISPER', deps: ['DISPER', 'ASISPER'], p: 25 }),
    N('DISDES',   { stage: 'min', topic: 'disability', label: 'Children disability', f: 'Σ (9.000 | 3.000) × ENTERO[i]', deps: ['DISCADES', 'ENTERO', 'NUMDES3365', 'NUMDES65'], p: 26 }),
    N('DISAS',    { stage: 'min', topic: 'disability', label: 'Ascendants disability', f: 'Σ (9.000 | 3.000) / CONVIVENCIA[j]', deps: ['DISCAS', 'CONVIVENCIA', 'NUMAS3365', 'NUMAS65'], p: 26 }),
    N('ASISDES',  { stage: 'min', topic: 'mobility', label: 'Children assistance', f: 'Σ 3.000 × ENTERO[i]  if ≥65 % or (33–65 % + mobility)', deps: ['DISCADES', 'MOVILDES', 'ENTERO', 'NUMDESMOV', 'NUMDES65'], p: 27 }),
    N('ASISAS',   { stage: 'min', topic: 'mobility', label: 'Ascendants assistance', f: 'Σ 3.000 / CONVIVENCIA[j]  if ≥65 % or (33–65 % + mobility)', deps: ['DISCAS', 'MOVILAS', 'CONVIVENCIA', 'NUMASMOV', 'NUMAS65'], p: 27 }),
    N('MDISDEAS', { stage: 'min', topic: 'disability', label: 'Family disability min.', f: 'DISDES + DISAS + ASISDES + ASISAS', deps: ['DISDES', 'DISAS', 'ASISDES', 'ASISAS'], p: 27 }),
    N('MINDIS',   { stage: 'min', topic: 'disability', label: 'Disability minimum', f: 'MINDIS = MINDISC + MDISDEAS', deps: ['MINDISC', 'MDISDEAS'], p: 27 }),
    N('MINPERFA', { stage: 'min', kind: 'output', label: 'Personal & family minimum', f: 'MINPERFA = MINCON + MINDES + MINAS + MINDIS', deps: ['MINCON', 'MINDES', 'MINAS', 'MINDIS'], p: 27 }),

    // ───────────────────────── EXENCIÓN ─────────────────────────
    N('TABLA1',  { stage: 'exento', kind: 'const', label: 'Table 1 – exclusion limits',
        f: '            0 kids   1 kid    2+ kids\nSit. 1        —     17.644   18.694\nSit. 2     17.197   18.130   19.262\nSit. 3     15.876   16.342   16.867', deps: ['SITUFAM', 'NUMDES'], p: 28 }),
    N('EXENTOS', { stage: 'exento', kind: 'decision', label: 'Exempt from withholding?', f: 'RETRIB ≤ TABLA1(SITUFAM, NUMDES) + PENSION + DESEM\n→ CUOTA = 0, TIPO = 0, jump to “1”', deps: ['RETRIB', 'TABLA1', 'PENSION', 'DESEM'], p: 28 }),

    // ───────────────────────── CUOTA ─────────────────────────
    N('ESCALA',  { stage: 'cuota', kind: 'const', label: 'Table 2 – withholding scale',
        f: 'base from    cuota       rate\n      0         0,00    19 %\n 12.450     2.365,50    24 %\n 20.200     4.225,50    30 %\n 35.200     8.725,50    37 %\n 60.000    17.901,50    45 %\n300.000   125.901,50    47 %', p: 29 }),
    N('CUOTA1',  { stage: 'cuota', label: 'Scale on base', f: 'no anualidades: ESCALA(BASE)\nwith anualidades < BASE:\n  ESCALA(BASE − ANUALIDADES) + ESCALA(ANUALIDADES)', deps: ['BASE', 'ESCALA', 'ANUALIDADES'], p: 30 }),
    N('CUOTA2',  { stage: 'cuota', label: 'Scale on minimum', f: 'ESCALA(MINPERFA)\n(+1.980 to MINPERFA if anualidades apply)', deps: ['MINPERFA', 'ESCALA', 'ANUALIDADES'], p: 30 }),
    N('LIMITE',  { stage: 'cuota', label: '43 % cap', f: 'if RETRIB ≤ 35.200:\n  LIMITE = 0,43 × (RETRIB − TABLA1 − PENSION − DESEM)', deps: ['RETRIB', 'TABLA1', 'PENSION', 'DESEM'], p: 30 }),
    N('CUOTA',   { stage: 'cuota', kind: 'output', label: 'Withholding quota', f: 'CUOTA = max(0, CUOTA1 − CUOTA2)\nCUOTA = min(CUOTA, LIMITE)\n(0 if EXENTOS)', deps: ['CUOTA1', 'CUOTA2', 'LIMITE', 'EXENTOS'], p: 30 }),

    // ───────────────────────── TIPO ─────────────────────────
    N('CEUMELI', { stage: 'tipo', topic: 'ceuta', kind: 'decision', label: 'Ceuta/Melilla regime', f: 'CEUMELI = RESICEME and RENCEME', deps: ['RESICEME', 'RENCEME'], p: 31 }),
    N('MINOPAGO',{ stage: 'tipo', topic: 'housing', label: 'Home-loan reduction', f: 'RETRIB < 33.007,20 and PRESVIV ?\n  TRUNCAR(2 % × RETRIB) : 0   (max 660,14)', deps: ['RETRIB', 'PRESVIV'], p: 31 }),
    N('DIFPOS',  { name: 'DIFERENCIA POSITIVA', stage: 'tipo', label: 'Quota after adjustments', f: 'max(0, CUOTA × (CEUMELI ? 0,40 : 1) − MINOPAGO)', deps: ['CUOTA', 'CEUMELI', 'MINOPAGO'], p: 31 }),
    N('TIPORAW', { name: 'TIPO (bruto)', stage: 'tipo', label: 'Raw rate', f: 'TIPO = TRUNCAR(DIFPOS / RETRIB × 100)   (2 decimals, truncated)', deps: ['DIFPOS', 'RETRIB'], p: 32 }),
    N('TIPO',    { stage: 'tipo', kind: 'output', label: 'Withholding rate %', f: 'Floors by contract:\n  ESPECIAL      → ≥ 15 %  (6 % Ceuta)\n  INFERIORAÑO   → ≥ 2 %   (0,8 % Ceuta)\n  GENERAL       → no floor', deps: ['TIPORAW', 'CONTRATO', 'CEUMELI'], p: 32 }),
    N('IMPORTE', { stage: 'tipo', kind: 'output', label: 'Annual withholding €', f: 'IMPORTE = REDONDEAR(RETRIB × TIPO / 100)', deps: ['RETRIB', 'TIPO'], p: 32 }),

    // ───────────────────────── REGULARIZACIÓN ─────────────────────────
    N('REGINPUTS', { name: 'PERCIBIDO · RETENIDO · RETRIBA · IMPORTEA · BASEA · MINPERFAA · TIPOA', stage: 'reg', kind: 'input', topic: 'regularization', label: 'Figures before the change', desc: 'Pay & withholding already done this year, and the previous calculation.', p: 41 }),
    N('CAUSAS',  { name: 'CAUSA1…11', stage: 'reg', kind: 'input', topic: 'regularization', label: 'Reason for regularization',
        f: '1 base changes · 2 mínimo changes · 3 spousal pension · 4 child support\n5 sit. 2→3 · 6/7/8 Ceuta-Melilla changes\n9/10 home-loan reduction on/off · 11 other', p: 33 }),
    N('IMPORTEREG', { stage: 'reg', topic: 'regularization', label: 'Annual quota (regularized)', f: 'CUOTA, or a pro-rata mix of CUOTA and 0,40·CUOTA\nwhen Ceuta/Melilla status changed mid-year', deps: ['CUOTA', 'REGINPUTS', 'CAUSAS', 'CEUMELI'], p: 33 }),
    N('MINOPAGOREG', { name: 'MINOPAGO (reg.)', stage: 'reg', topic: 'regularization', label: 'Home-loan reduction (reg.)', f: 'Recomputed from MINOPAGOA ± 2 % of pay difference,\ndepending on cause 1-8 / 9 / 10 / 11', deps: ['REGINPUTS', 'CAUSAS', 'PRESVIV', 'RETRIB'], p: 34 }),
    N('TIPOREG', { stage: 'reg', topic: 'regularization', kind: 'output', label: 'New rate for rest of year', f: 'TRUNCAR((IMPORTEREG − RETENIDO − MINOPAGO) / (RETRIB − PERCIBIDO) × 100)\nmax 47 % (19 % Ceuta) · contract floors', deps: ['IMPORTEREG', 'MINOPAGOREG', 'REGINPUTS', 'CONTRATO'], p: 34 }),
    N('LIM875',  { stage: 'reg', topic: 'regularization', kind: 'decision', label: 'Art. 87.5 limits (causes 1-4)', f: 'If (BASE − MINPERFA) did not grow → TIPOREG ≤ TIPOA\nElse increase of IMPORTE ≤ increase of (BASE − MINPERFA)', deps: ['TIPOREG', 'BASE', 'MINPERFA', 'REGINPUTS', 'CAUSAS'], p: 36 }),
    N('IMPORTEREGF', { name: 'IMPORTE (reg.)', stage: 'reg', topic: 'regularization', kind: 'output', label: 'Annual withholding (reg.)', f: 'IMPORTE = (RETRIB − PERCIBIDO) × TIPOREG / 100 + RETENIDO', deps: ['LIM875', 'TIPOREG', 'REGINPUTS'], p: 35 }),
  ];

  // Control flow (for the flowchart view). type: start|step|decision|end
  const flow = [
    { id: 'f0',  type: 'start',    text: 'Start', next: ['f1'] },
    { id: 'f1',  type: 'step',     text: 'Validate inputs (81 rules)', stage: 'in', next: ['f2'] },
    { id: 'f2',  type: 'step',     text: 'Count descendants & ascendants', stage: 'desc', next: ['f3'] },
    { id: 'f3',  type: 'step',     text: 'OTROSGASTOS = 2.000 (+ mobility, + disability)', stage: 'gastos', next: ['f4'] },
    { id: 'f4',  type: 'step',     text: 'RNT = RETRIB − COTIZACIONES', stage: 'rend', next: ['f5'] },
    { id: 'f5',  type: 'decision', text: 'RNT ≤ 19.747,50?', stage: 'rend', next: [['f5a', 'yes'], ['f6', 'no']] },
    { id: 'f5a', type: 'step',     text: 'RED20 = art. 20 reduction (≤ 7.302)', stage: 'rend', next: ['f6'] },
    { id: 'f6',  type: 'step',     text: 'RNTREDU = RNT − OTROSGASTOS − RED20', stage: 'rend', next: ['f7'] },
    { id: 'f7',  type: 'step',     text: 'BASE = RNTREDU − (PENSION + HIJOS + DESEM + CONYUGE)', stage: 'red', next: ['f8'] },
    { id: 'f8',  type: 'step',     text: 'MINPERFA = MINCON + MINDES + MINAS + MINDIS', stage: 'min', next: ['f9'] },
    { id: 'f9',  type: 'decision', text: 'RETRIB ≤ Table 1 limit?', stage: 'exento', next: [['f9a', 'yes'], ['f10', 'no']] },
    { id: 'f9a', type: 'step',     text: 'CUOTA = 0 · TIPO = 0', stage: 'exento', next: ['f14'] },
    { id: 'f10', type: 'step',     text: 'CUOTA1 = ESCALA(BASE) · CUOTA2 = ESCALA(MINPERFA)', stage: 'cuota', next: ['f11'] },
    { id: 'f11', type: 'step',     text: 'CUOTA = max(0, CUOTA1 − CUOTA2)', stage: 'cuota', next: ['f12'] },
    { id: 'f12', type: 'decision', text: 'RETRIB ≤ 35.200 and CUOTA > 43 % limit?', stage: 'cuota', next: [['f12a', 'yes'], ['f14', 'no']] },
    { id: 'f12a',type: 'step',     text: 'CUOTA = LIMITE', stage: 'cuota', next: ['f14'] },
    { id: 'f14', type: 'step',     text: '① DIFPOS = CUOTA (×0,40 Ceuta) − MINOPAGO', stage: 'tipo', next: ['f15'] },
    { id: 'f15', type: 'step',     text: 'TIPO = TRUNCAR(DIFPOS / RETRIB × 100)', stage: 'tipo', next: ['f16'] },
    { id: 'f16', type: 'decision', text: 'Contract type?', stage: 'tipo', next: [['f16a', 'especial'], ['f16b', '< 1 año'], ['f17', 'general']] },
    { id: 'f16a',type: 'step',     text: 'TIPO ≥ 15 %', stage: 'tipo', next: ['f17'] },
    { id: 'f16b',type: 'step',     text: 'TIPO ≥ 2 %', stage: 'tipo', next: ['f17'] },
    { id: 'f17', type: 'step',     text: 'IMPORTE = RETRIB × TIPO / 100', stage: 'tipo', next: ['f18'] },
    { id: 'f18', type: 'decision', text: 'Regularization?', stage: 'reg', next: [['f19', 'yes'], ['fend', 'no']] },
    { id: 'f19', type: 'step',     text: 'TIPOREG = (IMPORTEREG − RETENIDO) / (RETRIB − PERCIBIDO)', stage: 'reg', next: ['f20'] },
    { id: 'f20', type: 'decision', text: 'Cause 1-4?', stage: 'reg', next: [['f21', 'yes'], ['fend', 'no']] },
    { id: 'f21', type: 'step',     text: 'Apply art. 87.5 limits', stage: 'reg', next: ['fend'] },
    { id: 'fend',type: 'end',      text: 'TIPO % & IMPORTE €', next: [] },
  ];

  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  return { stages, topics, nodes, byId, flow };
})();
