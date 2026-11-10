/*
 * Executable version of the AEAT 2026 algorithm (without regularization).
 * Returns a value for every node id in data.js so the diagrams can annotate it.
 */
window.IRPFcalc = (function () {
  const Y = 2026;
  const r2 = x => Math.round((x + 1e-9) * 100) / 100;          // REDONDEAR1
  const t2 = x => Math.trunc(x * 100 + 1e-9) / 100;             // TRUNCAR

  const SCALE = [[0, 0, 0.19], [12450, 2365.5, 0.24], [20200, 4225.5, 0.30], [35200, 8725.5, 0.37], [60000, 17901.5, 0.45], [300000, 125901.5, 0.47]];
  function escala(b) {
    if (b <= 0) return 0;
    let row = SCALE[0];
    for (const s of SCALE) if (b > s[0]) row = s;
    return row[1] + (b - row[0]) * row[2];
  }
  const T1 = { 1: [null, 17644, 18694], 2: [17197, 18130, 19262], 3: [15876, 16342, 16867] };

  const DEFAULT = {
    RETRIB: 30000, COTIZACIONES: 1905, ANYOPER: 1990, SITUFAM: 3, SITUPER: 'ACTIVO', CONTRATO: 'GENERAL',
    DISCAPER: 'NO', MOVILPER: false, MOVIL: false, IRREGULAR1: 0, IRREGULAR2: 0, CONYUGE: 0, ANUALIDADES: 0,
    PRESVIV: false, RESICEME: false, RENCEME: false,
    children: [], ascendants: [],
  };

  function run(input) {
    const p = Object.assign({}, DEFAULT, input);
    const v = {};
    Object.assign(v, {
      RETRIB: p.RETRIB, COTIZACIONES: p.COTIZACIONES, ANYOPER: p.ANYOPER, SITUFAM: p.SITUFAM, SITUPER: p.SITUPER,
      CONTRATO: p.CONTRATO, DISCAPER: p.DISCAPER, MOVILPER: p.MOVILPER, MOVIL: p.MOVIL, IRREGULAR1: p.IRREGULAR1,
      IRREGULAR2: p.IRREGULAR2, CONYUGE: p.CONYUGE, ANUALIDADES: p.ANUALIDADES, PRESVIV: p.PRESVIV,
      RESICEME: p.RESICEME, RENCEME: p.RENCEME,
    });

    // descendants (sorted by birth year, oldest first)
    const kids = [...p.children].sort((a, b) => a.year - b.year);
    v.ANYODES = kids.map(k => k.year).join(', ') || '—';
    v.PORENTERO = kids.map(k => k.entero ? 'S' : 'N').join(', ') || '—';
    v.EDADES = kids.map(k => Y - k.year).join(', ') || '—';
    v.ENTERO = kids.map(k => k.entero ? 1 : 0.5).join(', ') || '—';
    v.NUMDES = kids.length;
    v.NUMDES3365 = kids.filter(k => k.disc === '33').length;
    v.NUMDES65 = kids.filter(k => k.disc === '65').length;
    v.NUMDESMOV = kids.filter(k => k.movil).length;

    const asc = p.ascendants;
    v.ANYOAS = asc.map(a => a.year).join(', ') || '—';
    v.CONVIVENCIA = asc.map(a => a.conv).join(', ') || '—';
    v.EDADAS = asc.map(a => Y - a.year).join(', ') || '—';
    v.NUMAS = asc.length;
    v.NUMAS75A = asc.filter(a => Y - a.year > 74).length;
    v.NUMAS65A = asc.filter(a => Y - a.year <= 74 && (Y - a.year > 64 || a.disc !== 'NO')).length;
    v.NUMAS3365 = asc.filter(a => a.disc === '33').length;
    v.NUMAS65 = asc.filter(a => a.disc === '65').length;
    v.NUMASMOV = asc.filter(a => a.movil).length;

    // gastos
    v.GASTOSGEN = 2000;
    v.INCREGASMOVIL = p.MOVIL ? 2000 : 0;
    v.INCREGASDISTRA = p.SITUPER !== 'ACTIVO' ? 0 : (p.DISCAPER === '65' || (p.DISCAPER === '33' && p.MOVILPER)) ? 7750 : p.DISCAPER === '33' ? 3500 : 0;
    let og = v.GASTOSGEN + v.INCREGASMOVIL + v.INCREGASDISTRA;
    const net = p.RETRIB - p.COTIZACIONES;
    if (net < 0) og = 0; else if (og > net) og = net;
    v.OTROSGASTOS = og;
    v.GASTOS = p.COTIZACIONES + og;

    // rendimiento
    v.RNT = Math.max(0, p.RETRIB - p.IRREGULAR1 - p.IRREGULAR2 - p.COTIZACIONES);
    const R = v.RNT;
    v.RED20 = r2(R <= 14852 ? 7302 : R <= 17673.52 ? 7302 - 1.75 * (R - 14852) : R < 19747.5 ? 2364.34 - 1.14 * (R - 17673.52) : 0);
    v.RNTREDU = Math.max(0, v.RNT - v.OTROSGASTOS - v.RED20);

    v.PENSION = p.SITUPER === 'PENSIONISTA' ? 600 : 0;
    v.DESEM = p.SITUPER === 'DESEMPLEADO' ? 1200 : 0;
    v.HIJOS = v.NUMDES > 2 ? 600 : 0;
    v.REDU = v.PENSION + v.HIJOS + v.DESEM + p.CONYUGE;
    v.BASE = v.RNTREDU > v.REDU ? v.RNTREDU - v.REDU : 0;

    // mínimo
    v.MINPER = 5550;
    v.PER65 = Y - p.ANYOPER > 64 ? 1150 : 0;
    v.PER75 = Y - p.ANYOPER > 74 ? 1400 : 0;
    v.MINCON = v.MINPER + v.PER65 + v.PER75;
    const W = [2400, 2700, 4000, 4500];
    v.MINDESG = r2(kids.reduce((s, k, i) => s + W[Math.min(i, 3)] * (k.entero ? 1 : 0.5), 0));
    v.MINDES3 = r2(kids.reduce((s, k) => s + ((k.year > Y - 3 || (k.adopt && k.adopt >= k.year && k.adopt > Y - 3)) ? 2800 * (k.entero ? 1 : 0.5) : 0), 0));
    v.MINDES = v.MINDESG + v.MINDES3;
    v.AS65 = r2(asc.filter(a => Y - a.year > 64 || a.disc !== 'NO').reduce((s, a) => s + 1150 / a.conv, 0));
    v.AS75 = r2(asc.filter(a => Y - a.year > 74).reduce((s, a) => s + 1400 / a.conv, 0));
    v.MINAS = v.AS65 + v.AS75;
    v.DISPER = p.DISCAPER === '65' ? 9000 : p.DISCAPER === '33' ? 3000 : 0;
    v.ASISPER = (p.DISCAPER === '65' || (p.DISCAPER === '33' && p.MOVILPER)) ? 3000 : 0;
    v.MINDISC = v.DISPER + v.ASISPER;
    const dv = d => d === '65' ? 9000 : d === '33' ? 3000 : 0;
    const asis = (d, m) => (d === '65' || (d === '33' && m)) ? 3000 : 0;
    v.DISDES = r2(kids.reduce((s, k) => s + dv(k.disc) * (k.entero ? 1 : 0.5), 0));
    v.DISAS = r2(asc.reduce((s, a) => s + dv(a.disc) / a.conv, 0));
    v.ASISDES = r2(kids.reduce((s, k) => s + asis(k.disc, k.movil) * (k.entero ? 1 : 0.5), 0));
    v.ASISAS = r2(asc.reduce((s, a) => s + asis(a.disc, a.movil) / a.conv, 0));
    v.MDISDEAS = v.DISDES + v.DISAS + v.ASISDES + v.ASISAS;
    v.MINDIS = v.MINDISC + v.MDISDEAS;
    v.MINPERFA = v.MINCON + v.MINDES + v.MINAS + v.MINDIS;

    // exención
    const col = Math.min(v.NUMDES, 2);
    const lim = T1[p.SITUFAM][col];
    v.TABLA1 = lim == null ? 'n/a' : lim;
    v.EXENTOS = lim != null && p.RETRIB <= lim + v.PENSION + v.DESEM;

    // cuota
    v.ESCALA = '6 brackets';
    const anu = p.ANUALIDADES > 0 && v.BASE - p.ANUALIDADES > 0;
    v.CUOTA1 = anu ? escala(v.BASE - p.ANUALIDADES) + escala(p.ANUALIDADES) : escala(v.BASE);
    v.CUOTA2 = anu ? escala(v.MINPERFA + 1980) : escala(v.MINPERFA);
    let cuota = v.CUOTA1 > v.CUOTA2 ? v.CUOTA1 - v.CUOTA2 : 0;
    v.LIMITE = (p.RETRIB <= 35200 && lim != null) ? (p.RETRIB - (lim + v.PENSION + v.DESEM)) * 0.43 : '—';
    if (typeof v.LIMITE === 'number' && cuota > v.LIMITE) cuota = v.LIMITE;
    if (v.EXENTOS) cuota = 0;
    v.CUOTA = cuota;

    // tipo
    v.CEUMELI = p.RESICEME && p.RENCEME;
    v.MINOPAGO = (p.RETRIB < 33007.2 && p.PRESVIV) ? t2(0.02 * p.RETRIB) : 0;
    v.DIFPOS = Math.max(0, (v.CEUMELI ? cuota * 0.4 : cuota) - v.MINOPAGO);
    v.TIPORAW = t2(v.DIFPOS / p.RETRIB * 100);
    let tipo = v.TIPORAW;
    if (v.CEUMELI) {
      if (p.CONTRATO === 'ESPECIAL' && tipo < 6) tipo = 6;
      else if (p.CONTRATO === 'INFERIORANYO' && tipo < 0.8) tipo = 0.8;
    } else {
      if (p.CONTRATO === 'ESPECIAL' && tipo < 15) tipo = 15;
      else if (p.CONTRATO === 'INFERIORANYO' && tipo < 2) tipo = 2;
    }
    v.TIPO = tipo;
    v.IMPORTE = r2(p.RETRIB * tipo / 100);
    return v;
  }

  return { run, escala, DEFAULT, SCALE, T1 };
})();
