// Calculadora: una sola pàgina amb resultats en directe.
//  · Mode "brut": sou brut anual → net.   · Mode "net": net que vols al mes → brut necessari.
//  · "Compara amb un altre sou" substitueix l'antiga pàgina d'increment.
//  · L'estat viu a l'URL (?a=30000&p=14…), així es pot compartir i sobreviu als canvis d'idioma.
(function () {
    const $ = id => document.getElementById(id);
    const q0 = new URLSearchParams(location.search);
    const num = (v, d = NaN) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

    const S = {
        mode: q0.get('m') === 'net' ? 'net' : 'gross',
        pagues: Math.min(16, Math.max(1, num(q0.get('p'), 12) | 0)),
        unit: 'paga',
        compare: q0.has('c'),
        payslip: 'normal',
        // Paga extra = % d'un mes normal. Per defecte suposem que només inclou el salari base.
        extraPct: Math.min(100, Math.max(50, num(q0.get('x'), 85))),
    };
    const EXTRA_OPTS = [100, 95, 90, 85, 80, 75, 70, 60, 50];
    const slicesOf = (r, n = S.pagues) => salarySlices(r, n, last.esp, S.extraPct / 100);
    // El que hi haurà a la nòmina: mateixes pagues, amb la retenció en lloc de l'impost real
    const slipOf = (r, n = S.pagues) => payslipSlices(r, n, last.esp, S.extraPct / 100);
    let last = null;      // { r, rc, gross } de l'últim càlcul bo
    let seq = 0, timer = null;

    const MODES = {
        gross: { min: 10000, max: 150000,
            label: () => tr('Sou brut anual', 'Sueldo bruto anual', 'Annual gross salary'),
            hint: () => tr('El que diu el contracte, abans d\'impostos.', 'Lo que dice el contrato, antes de impuestos.', 'What your contract says, before tax.'),
            placeholder: '30.000' },
        net: { min: 700, max: 8000,
            label: () => tr('Net que vols cobrar cada mes', 'Neto que quieres cobrar cada mes', 'Net pay you want each month'),
            hint: () => tr('Sense comptar les pagues extra.', 'Sin contar las pagas extra.', 'Not counting extra payments.'),
            placeholder: '1.800' },
    };
    // Barra lliscant quadràtica: més precisió als sous baixos, on hi ha més gent.
    const RSTEPS = 1000;
    const toAmount = (m, t) => {
        const v = m.min + (m.max - m.min) * (t / RSTEPS) ** 2;
        const step = S.mode === 'net' ? (v < 3000 ? 10 : 50) : (v < 30000 ? 500 : 1000);
        return Math.round(v / step) * step;
    };
    const toPos = (m, v) => Math.sqrt(Math.min(1, Math.max(0, (v - m.min) / (m.max - m.min)))) * RSTEPS;

    // ── Formulari ────────────────────────────────────────────────────────────
    $('formIntro').innerHTML = `
        <h1>${tr('Calculadora de sou net', 'Calculadora de sueldo neto', 'Net salary calculator')}</h1>
        <p class="page-subtitle">${tr('Del salari brut al sou que arriba al teu compte, i al revés.', 'Del salario bruto al sueldo que llega a tu cuenta, y al revés.', 'From gross pay to what reaches your account, and back.')}</p>`;
    $('amountBlock').innerHTML = `
        <div class="mode-switch" role="group" aria-label="${tr('Què saps?', '¿Qué sabes?', 'What do you know?')}">
            <button type="button" data-mode="gross">${tr('Sé el brut', 'Sé el bruto', 'I know my gross')}</button>
            <button type="button" data-mode="net">${tr('Sé el net que vull', 'Sé el neto que quiero', 'I know the net I want')}</button>
        </div>
        <div class="hero-input">
            <label for="amount" id="amountLabel"></label>
            <div class="input-affix big">
                <input type="text" inputmode="decimal" data-money autocomplete="off" id="amount">
            </div>
            <input type="range" id="amountRange" class="range" aria-labelledby="amountLabel" min="0" max="${RSTEPS}" step="1">
            <div class="field-hint" id="amountHint"></div>
        </div>
        <div class="form-row sec sec-pagues">
            <span class="field-label">${tr('Nombre de pagues', 'Número de pagas', 'Payments per year')}</span>
            <div class="pagues-row">
                <div class="mode-switch" id="paguesSwitch" role="group">
                    <button type="button" data-pg="12">12</button><button type="button" data-pg="14">14</button><button type="button" data-pg="other">${tr('Altre', 'Otro', 'Other')}</button>
                </div>
                <select id="paguesOther" aria-label="${tr('Nombre de pagues', 'Número de pagas', 'Payments per year')}" hidden>${Array.from({ length: 16 }, (_, i) => i + 1).map(n => `<option value="${n}">${n}</option>`).join('')}</select>
            </div>
            <label class="extra-pct" id="extraPctRow" hidden>${tr('Cada paga extra és', 'Cada paga extra es', 'Each extra payment is')}
                <select id="extraPct">${EXTRA_OPTS.map(v => `<option value="${v}">${v === 100 ? tr('un mes sencer', 'un mes entero', 'a full month') : `${v} % ${tr("d'un mes", 'de un mes', 'of a month')}`}</option>`).join('')}</select>
                ${gloss('extraPct', 'ⓘ')}</label>
        </div>
        <div class="compare-box">
            <button type="button" class="add-btn" id="compareToggle"></button>
            <div class="form-row" id="compareFields" hidden>
                <label for="compareGross">${tr('Un altre sou brut anual', 'Otro sueldo bruto anual', 'Another annual gross salary')}</label>
                <div class="input-affix">
                    <input type="text" inputmode="decimal" data-money autocomplete="off" id="compareGross" placeholder="${tr('Ex', 'Ej', 'E.g.')}: 33.000">
                </div>
            </div>
        </div>`;

    const amountIn = $('amount'), range = $('amountRange');
    if (q0.has('a')) amountIn.value = moneyToText(num(q0.get('a')));
    if (q0.has('c')) $('compareGross').value = moneyToText(num(q0.get('c')));

    function applyMode() {
        const m = MODES[S.mode];
        document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
        $('amountLabel').textContent = m.label();
        $('amountHint').textContent = m.hint();
        amountIn.placeholder = `${tr('Ex', 'Ej', 'E.g.')}: ${m.placeholder}`;
        delete amountIn.dataset.placeholderEur;
        refreshMoneyUnitUi();
        syncRange();
    }
    function syncRange() {
        const v = readMoney('amount');
        const m = MODES[S.mode];
        range.value = toPos(m, Number.isFinite(v) ? v : (S.mode === 'net' ? 1500 : 25000));
        range.classList.toggle('empty', !Number.isFinite(v));
    }
    function syncPagues() {
        const other = S.pagues !== 12 && S.pagues !== 14;
        $('paguesSwitch').querySelectorAll('[data-pg]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pg === (other ? 'other' : String(S.pagues)))));
        $('paguesOther').hidden = !other;
        $('paguesOther').value = S.pagues;
        $('extraPctRow').hidden = S.pagues <= 12;
        $('extraPct').value = S.extraPct;
    }
    function setPagues(n) {
        S.pagues = n;
        if (S.unit === 'paga' && n <= 12) S.unit = 'mes';
        if (n > 12 && S.unit === 'mes') S.unit = 'paga';
        syncPagues();
        if (S.mode === 'net') schedule(0); else { render(); updateUrl(); }
    }
    function setCompare(on) {
        S.compare = on;
        $('compareFields').hidden = !on;
        $('compareToggle').textContent = on
            ? tr('− Treure la comparació', '− Quitar la comparación', '− Remove comparison')
            : tr('+ Compara amb un altre sou', '+ Compara con otro sueldo', '+ Compare with another salary');
        if (on && !Number.isFinite(readMoney('compareGross')) && last) writeMoney('compareGross', Math.round(last.gross * 1.1 / 500) * 500);
    }

    document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
        if (b.dataset.mode === S.mode) return;
        // Continuïtat: el resultat d'un mode és l'entrada de l'altre
        if (last) writeMoney('amount', S.mode === 'gross' ? Math.round(slipOf(last.r).ordinary) : Math.round(last.gross));
        S.mode = b.dataset.mode;
        applyMode();
        schedule(0);
    }));
    amountIn.addEventListener('input', () => { syncRange(); Profile.refreshGroup(); schedule(); });
    range.addEventListener('input', () => { writeMoney('amount', toAmount(MODES[S.mode], +range.value)); range.classList.remove('empty'); Profile.refreshGroup(); schedule(); });
    $('paguesSwitch').addEventListener('click', e => {
        const b = e.target.closest('[data-pg]'); if (!b) return;
        if (b.dataset.pg === 'other') { $('paguesOther').hidden = false; b.parentNode.querySelectorAll('[data-pg]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); $('paguesOther').focus(); return; }
        setPagues(+b.dataset.pg);
    });
    $('paguesOther').addEventListener('change', e => setPagues(+e.target.value));
    $('extraPct').addEventListener('change', e => { S.extraPct = +e.target.value; if (S.mode === 'net') schedule(0); else { render(); updateUrl(); } });
    $('compareToggle').addEventListener('click', () => { setCompare(!S.compare); if (S.compare) $('compareGross').focus(); schedule(0); });
    $('compareGross').addEventListener('input', () => { Profile.refreshGroup(); schedule(); });

    Profile.mount($('profileFields'), {
        grossForGroup: () => {
            const a = readMoney('amount');
            const base = S.mode === 'gross' ? a : (last ? last.gross : a * S.pagues);
            const c = S.compare ? readMoney('compareGross') : NaN;
            return Number.isFinite(c) ? Math.min(base, c) : base;
        },
        onChange: () => schedule(),
        initial: Profile.decode(q0),
    });
    initMoneyInputs();
    applyMode();
    syncPagues();
    setCompare(S.compare);

    // ── Càlcul en directe ────────────────────────────────────────────────────
    function schedule(delay = 350) {
        clearTimeout(timer);
        timer = setTimeout(run, delay);
    }

    function updateUrl() {
        const q = new URLSearchParams();
        if (q0.has('lang')) q.set('lang', LANG);
        if (S.mode === 'net') q.set('m', 'net');
        const a = readMoney('amount');
        if (Number.isFinite(a)) q.set('a', a);
        if (S.pagues !== 12) q.set('p', S.pagues);
        if (S.extraPct !== 85) q.set('x', S.extraPct);
        const c = readMoney('compareGross');
        if (S.compare && Number.isFinite(c)) q.set('c', c);
        Profile.encode(q);
        const s = q.toString();
        history.replaceState(null, '', s ? '?' + s : location.pathname);
    }

    async function run() {
        updateUrl();
        const amount = readMoney('amount');
        const resultEl = $('result');
        if (!(amount > 0)) {
            last = null;
            $('resultPlaceholder').hidden = false;
            resultEl.innerHTML = ''; $('walkthrough').innerHTML = '';
            return;
        }
        const mySeq = ++seq;
        $('resultPlaceholder').hidden = true;
        if (!resultEl.innerHTML) resultEl.innerHTML = '<div class="result-skeleton" aria-busy="true"><div class="sk-hero"></div>' + '<div></div>'.repeat(7) + '</div>';
        resultEl.classList.add('is-loading');

        const profile = Profile.read();
        const body = { ...profile, n_pagues: S.pagues, extra_ratio: S.extraPct / 100 };
        const aux = { ...body, with_curve: false };
        const esp = profile.retribucio_en_especie_ann;
        try {
            const cmp = S.compare ? readMoney('compareGross') : NaN;
            const curveTo = cmp > 0 ? cmp : null;
            const r = S.mode === 'gross'
                ? await postApi('/api/calculate', { ...body, gross: amount, curve_to: curveTo })
                : await postApi('/api/net-to-gross', { ...body, net_per_paga: amount, curve_to: curveTo });
            const gross = S.mode === 'gross' ? amount : r.gross;
            const lowKey = S.mode === 'gross' ? Profile.groupRange() : null;
            const variants = Profile.effects();
            const calc = b => postApi('/api/calculate', { ...aux, gross, ...b });
            const [rc, rf, rl, ...rw] = await Promise.allSettled([
                cmp > 0 ? postApi('/api/calculate', { ...aux, gross: cmp }) : Promise.resolve(null),
                Profile.hasFamily() ? calc({ children: [], ascendants: [] }) : Promise.resolve(null),
                lowKey ? calc({ grup_cotitzacio: lowKey }) : Promise.resolve(null),
                ...variants.map(v => { const b = v.patch(aux); return postApi('/api/calculate', { ...b, gross }).then(x => ({ x, esp: b.retribucio_en_especie_ann })); }),
            ]);
            if (mySeq !== seq) return; // ja hi ha un càlcul més nou
            const netOf = x => x.rendiment_brut_treball - x.total_ss_anual - x.cuota_irpf_anual;
            last = { r, rc: rc.value || null, rLow: rl.value || null, gross, esp };
            Profile.setFamilyEffect(rf.value ? (netOf(r) - netOf(rf.value)) / 12 : 0);
            // Diners que arriben al compte (sense l'espècie): el que canvia cada opció triada
            const cashNet = (x, e) => netOf(x) - e;
            Profile.setEffects(Object.fromEntries(variants.map((v, i) => rw[i].value
                ? [v.kind, (cashNet(r, esp) - cashNet(rw[i].value.x, rw[i].value.esp)) / 12] : null).filter(Boolean)));
            if (S.mode === 'net') Profile.refreshGroup();
            render();
        } catch (err) {
            if (mySeq !== seq) return;
            resultEl.innerHTML = errorBox(err.message);
            $('walkthrough').innerHTML = '';
        } finally {
            if (mySeq === seq) resultEl.classList.remove('is-loading');
        }
    }

    // ── Resultats ────────────────────────────────────────────────────────────
    function render() {
        if (!last) return;
        const { r, rc, esp } = last;
        const s = last.slices = slicesOf(r);
        const sc = rc ? slicesOf(rc) : null;
        $('result').innerHTML = hero(r, s) + (sc ? compareBlock(s, sc) : '')
            + section(tr('On van els teus diners', 'A dónde va tu dinero', 'Where your money goes'), Charts.bar(s))
            + payslipBlock(r)
            + (r.curve ? section(tr('El teu sou dins la corba', 'Tu sueldo en la curva', 'Your salary on the curve'), '<div id="curveChart"></div>') : '')
            + `<details class="all-figures"><summary>${tr('Totes les xifres', 'Todas las cifras', 'All the figures')}</summary><div class="all-figures-body">${ssBreakdown(r)}${salaryBreakdown(r, s)}</div></details>`;
        if (r.curve) Charts.curve($('curveChart'), clipCurve(r.curve, Math.max(s.G, sc ? sc.G : 0)), [
            { g: s.G - esp, net: s.netAnnual, label: rc ? tr('actual', 'actual', 'current') : tr('tu', 'tú', 'you') },
            ...(sc ? [{ g: sc.G - esp, net: sc.netAnnual, label: tr('nou', 'nuevo', 'new') }] : []),
        ]);
        const region = Profile.read().region;
        if (rc) Walkthrough.render($('walkthrough'), rc.walkthrough, r.walkthrough, { region });
        else Walkthrough.render($('walkthrough'), r.walkthrough, null, { region });
        bindResult();
    }

    // Només un marge raonable per sobre del sou (si el backend encara envia una corba més llarga)
    const clipCurve = (pts, g) => { const top = Math.max(25000, g * 1.3, g + 6000); const out = pts.filter(p => p[0] <= top * 1.02); return out.length > 8 ? out : pts; };
    const section = (title, body, extra = '') => `<section class="res-block"${extra}><h2 class="res-title">${title}</h2>${body}</section>`;

    function hero(r, s) {
        const rate = `${gloss('efectiu')} <b>${fmtPct(r.tipus_efectiu)}</b>`;
        if (S.mode === 'net') {
            return `<div class="result-hero">
                <div class="result-hero-label">${tr('Brut anual que necessites', 'Bruto anual que necesitas', 'Annual gross you need')}</div>
                <div class="result-hero-value">${fmtEur0(last.gross)}</div>
                <div class="result-hero-sub">${rate}</div>
            </div>`;
        }
        if (!s.extras && S.unit === 'paga') S.unit = 'mes';
        const units = [
            ...(s.extras ? [['paga', tr('Per paga', 'Por paga', 'Per payment')]] : []),
            ['mes', tr('Per mes', 'Por mes', 'Per month')],
            ['any', tr('Per any', 'Por año', 'Per year')],
        ];
        const V = {
            paga: [s.ordinary, tr(`${gloss('extra', 'Pagues extra')} (${s.extras}): <b>${fmtEur0(s.extra)}</b>`, `${gloss('extra', 'Pagas extra')} (${s.extras}): <b>${fmtEur0(s.extra)}</b>`, `${gloss('extra', 'Extra payments')} (${s.extras}): <b>${fmtEur0(s.extra)}</b>`)],
            mes: [s.month, s.extras ? tr('Extres repartides', 'Extras repartidas', 'Extras spread out') : ''],
            any: [s.netAnnual, ''],
        };
        const [val, sub] = V[S.unit];
        const pick = { paga: 'ordinary', mes: 'month', any: 'netAnnual' }[S.unit];
        const slipVal = slipOf(r)[pick];
        const slipLow = last.rLow ? slipOf(last.rLow)[pick] : slipVal;
        const range = (lo, hi) => Math.round(lo) < Math.round(hi) ? `${fmtEur0(lo).replace(/\s?€/, '')} – ${fmtEur0(hi)}` : fmtEur0(hi);
        // Grup de cotització desconegut: mostrem el rang entre el grup més habitual i el grup 1
        const low = last.rLow ? { paga: 'ordinary', mes: 'month', any: 'netAnnual' }[S.unit] : null;
        const lowVal = low ? slicesOf(last.rLow)[low] : val;
        const shown = range(lowVal, val);
        const groupNote = Math.round(lowVal) < Math.round(val) ? `<div class="result-hero-sub"><button type="button" class="link-btn" id="pickGroup">${tr('Tria el teu grup de cotització', 'Elige tu grupo de cotización', 'Pick your Social Security group')}</button></div>` : '';
        return `<div class="result-hero">
            <div class="hero-top">
                <div class="unit-tabs" role="group" aria-label="${tr('Unitat', 'Unidad', 'Unit')}">${units.map(([k, l]) => `<button type="button" data-unit="${k}" aria-pressed="${k === S.unit}">${l}</button>`).join('')}</div>
            </div>
            <div class="result-hero-pair">
            <div>
            <div class="result-hero-label">${tr('Net', 'Neto', 'Net')}</div>
            <div class="result-hero-value">${shown}</div>
            <div class="result-hero-sub">${[sub, rate].filter(Boolean).join(' · ')}</div>
            ${groupNote}
            ${s.especie ? `<div class="result-hero-sub">${tr(`I a més ${fmtEur0(s.especie)} l'any en espècie`, `Y además ${fmtEur0(s.especie)} al año en especie`, `Plus ${fmtEur0(s.especie)} a year in kind`)}</div>` : ''}
            </div>
            </div>
            <button type="button" class="slip-guide" id="toSlip">
                <span>${tr('A la nòmina hi veuràs', 'En la nómina verás', 'Your payslip will show')}</span>
                <mark>${range(slipLow, slipVal)}</mark>
                <span class="slip-guide-why">${tr("La retenció és una aproximació; la diferència te la torna (o te la cobra) la renda.", 'La retención es una aproximación; la diferencia te la devuelve (o te la cobra) la renta.', 'Withholding is an estimate; your tax return settles the difference.')}</span>
            </button>
        </div>`;
    }

    function compareBlock(s, sc) {
        const per = s.extras ? tr('Net per paga', 'Neto por paga', 'Net per payment') : tr('Net al mes', 'Neto al mes', 'Net per month');
        const d = sc.netAnnual - s.netAnnual;
        const sign = v => (v >= 0 ? '+' : '−') + fmtEur0(Math.abs(v));
        const col = (title, x, cls = '') => `<div class="cmp-col ${cls}"><div class="cmp-h">${title}</div>
            <div class="cmp-big">${fmtEur0(x.ordinary)}</div><div class="cmp-l">${per}</div>
            <div class="cmp-row"><span>${tr('Brut', 'Bruto', 'Gross')}</span><b>${fmtEur0(x.G)}</b></div>
            <div class="cmp-row"><span>${tr('Net anual', 'Neto anual', 'Net per year')}</span><b>${fmtEur0(x.netAnnual)}</b></div>
            <div class="cmp-row"><span>${tr('IRPF efectiu', 'IRPF efectivo', 'Effective tax')}</span><b>${fmtPct(x.irpf / x.G * 100)}</b></div></div>`;
        return section(tr('Comparació', 'Comparación', 'Comparison'), `
            <div class="cmp">${col(tr('Sou actual', 'Sueldo actual', 'Current'), s)}${col(tr('Sou nou', 'Sueldo nuevo', 'New'), sc, 'new')}</div>
            <div class="cmp-delta ${d >= 0 ? 'up' : 'down'}">${tr(
                `<b>${sign(d)}</b> nets l'any · ${sign(sc.ordinary - s.ordinary)} per paga`,
                `<b>${sign(d)}</b> netos al año · ${sign(sc.ordinary - s.ordinary)} por paga`,
                `<b>${sign(d)}</b> net per year · ${sign(sc.ordinary - s.ordinary)} per payment`)}</div>
            ${Charts.deltaBar(d, sc.ss - s.ss, sc.irpf - s.irpf)}`);
    }

    function payslipBlock(r) {
        const s = slipOf(r);
        const extra = S.payslip === 'extra' && s.extras;
        const f = r.total_ss_mensual ? s.ssPaga / r.total_ss_mensual : 0;
        const rate = v => fmtPct(r.base_ss_mensual ? v / r.base_ss_mensual * 100 : NaN);
        const L = {
            base: tr('Salari base', 'Salario base', 'Base salary'), compl: tr('Complements', 'Complementos', 'Bonuses and supplements'),
            salary: tr('Salari', 'Salario', 'Salary'), extra: tr('Paga extraordinària (salari base)', 'Paga extraordinaria (salario base)', 'Extra payment (base salary)'),
        };
        const earn = extra ? [[s.ratio < 1 ? L.extra : tr('Paga extraordinària', 'Paga extraordinaria', 'Extra payment'), s.extraGross]]
            : s.extras && s.ratio < 1 ? [[L.base, s.extraGross], [L.compl, s.monthGross - s.extraGross]] : [[L.salary, s.monthGross]];
        if (!extra && s.espPaga) earn.push([tr('Retribució en espècie', 'Retribución en especie', 'Pay in kind'), s.espPaga]);
        const totEarn = earn.reduce((a, l) => a + l[1], 0);
        const ded = extra ? [[tr('Retenció IRPF', 'Retención IRPF', 'Income tax withholding'), fmtPct(r.tipo_retencio), s.extraIrpf]] : [
            [tr('Contingències comunes', 'Contingencias comunes', 'Common contingencies'), rate(r.ss_contingencies_comunes_mensual), r.ss_contingencies_comunes_mensual * f],
            [tr('Atur', 'Desempleo', 'Unemployment'), rate(r.ss_atur_mensual), r.ss_atur_mensual * f],
            [tr('Formació professional', 'Formación profesional', 'Vocational training'), rate(r.ss_formacio_mensual), r.ss_formacio_mensual * f],
            ['MEI', rate(r.ss_mei_mensual), r.ss_mei_mensual * f],
            [tr('Retenció IRPF', 'Retención IRPF', 'Income tax withholding'), fmtPct(r.tipo_retencio), s.irpfPaga],
            ...(s.espPaga ? [[tr('Espècie ja percebuda', 'Especie ya percibida', 'In kind already received'), '', s.espPaga]] : []),
        ];
        const totDed = ded.reduce((a, l) => a + l[2], 0);
        const liq = extra ? s.extra : s.ordinary;
        const tabs = s.extras ? `<div class="unit-tabs slip-tabs" role="group">
            <button type="button" data-slip="normal" aria-pressed="${!extra}">${tr('Mes normal', 'Mes normal', 'Regular month')}</button>
            <button type="button" data-slip="extra" aria-pressed="${!!extra}">${tr('Paga extra', 'Paga extra', 'Extra payment')}</button></div>` : '';
        return section(tr('La teva nòmina', 'Tu nómina', 'Your payslip'), `${tabs}
            <div class="slip" id="slipBlock">
              <table>
                <thead><tr><th colspan="3">${tr('Meritacions', 'Devengos', 'Earnings')}</th></tr></thead>
                <tbody>
                  ${earn.map(([l, v]) => `<tr><td>${l}</td><td class="slip-pct"></td><td class="n">${fmtEur(v)}</td></tr>`).join('')}
                  <tr class="tot"><td>${tr('Total meritat', 'Total devengado', 'Total earnings')}</td><td class="slip-pct"></td><td class="n">${fmtEur(totEarn)}</td></tr>
                </tbody>
                <thead><tr><th>${tr('Deduccions', 'Deducciones', 'Deductions')}</th><th class="n slip-pct">%</th><th></th></tr></thead>
                <tbody>
                  ${ded.map(([l, p, v]) => `<tr><td>${l}${p ? `<small class="slip-rate">${p}</small>` : ''}</td><td class="n slip-pct">${p}</td><td class="n">−${fmtEur(v)}</td></tr>`).join('')}
                  <tr class="tot"><td>${tr('Total a deduir', 'Total a deducir', 'Total deductions')}</td><td class="slip-pct"></td><td class="n">−${fmtEur(totDed)}</td></tr>
                </tbody>
              </table>
              <div class="liq"><span>${tr('Líquid a percebre', 'Líquido a percibir', 'Net pay')}</span><mark>${fmtEur(liq)}</mark></div>
              <div class="slip-note">↑ ${tr('Aquesta és la xifra que arriba al compte', 'Esta es la cifra que llega a la cuenta', 'This is what reaches your account')}${last.rLow ? ` · ${tr('amb el grup de cotització més habitual', 'con el grupo de cotización más habitual', 'with the most common contribution group')}` : ''}</div>
            </div>`);
    }

    function bindResult() {
        const res = $('result');
        res.querySelectorAll('[data-unit]').forEach(b => b.onclick = () => { S.unit = b.dataset.unit; render(); });
        res.querySelectorAll('[data-slip]').forEach(b => b.onclick = () => { S.payslip = b.dataset.slip; render(); });
        const ts = $('toSlip'); if (ts) ts.onclick = () => { const el = $('slipBlock'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1400); };
        const pg = $('pickGroup'); if (pg) pg.onclick = () => { const row = $('grupRow'); row.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 1400); };
        updateDock();
    }

    // ── Mòbil: barra fixa amb el net mentre edites el formulari ──────────────
    const dock = $('resultDock');
    let resultsVisible = false;
    new IntersectionObserver(([e]) => { resultsVisible = e.isIntersecting; updateDock(); }, { threshold: 0.15 }).observe(document.querySelector('.result-panel'));
    TWO_COLUMN_MQ.addEventListener('change', () => updateDock());
    function updateDock() {
        const s = last?.slices;
        dock.hidden = !s || TWO_COLUMN_MQ.matches || resultsVisible;
        if (dock.hidden) return;
        const [label, v] = S.mode === 'net' ? [tr('Brut anual', 'Bruto anual', 'Annual gross'), last.gross]
            : s.extras ? [tr('Net per paga', 'Neto por paga', 'Net per payment'), s.ordinary] : [tr('Net al mes', 'Neto al mes', 'Net per month'), s.ordinary];
        dock.innerHTML = `<span>${label}</span><b>${fmtEur0(v)}</b><span aria-hidden="true">↓</span>`;
    }
    dock.addEventListener('click', () => document.querySelector('.result-panel').scrollIntoView({ behavior: 'smooth' }));

    // Glossari: en mòbil, tocar un terme l'obre o el tanca
    document.addEventListener('click', e => {
        const g = e.target.closest('.gloss');
        document.querySelectorAll('.gloss.open').forEach(x => { if (x !== g) x.classList.remove('open'); });
        if (g) g.classList.toggle('open');
    });

    $('resultPlaceholder').textContent = tr('Escriu un sou i veuràs el resultat al moment.', 'Escribe un sueldo y verás el resultado al momento.', 'Type a salary and the result appears right away.');
    run();
})();
