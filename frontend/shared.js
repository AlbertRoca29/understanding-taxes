// ── Configuració i utilitats compartides ─────────────────────────────────────
// En local (localhost / 127.0.0.1) fa servir el backend local del port 8000.
const API_BASE = ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'http://localhost:8000'
    : 'https://understanding-taxes-111926362104.europe-west1.run.app';

// Mateixa condició que el layout de dues columnes a style.css
const TWO_COLUMN_MQ = window.matchMedia('(min-width: 768px) and (orientation: landscape), (min-width: 1024px)');

// ── Idioma ───────────────────────────────────────────────────────────────────
// Català per defecte. ?lang=es|en o l'últim triat (localStorage).
const LANGS = ['ca', 'es', 'en'];
const LANG = (() => {
    const q = new URLSearchParams(location.search).get('lang');
    if (LANGS.includes(q)) return q;
    try { const s = localStorage.getItem('lang'); if (LANGS.includes(s)) return s; } catch {}
    return 'ca';
})();
document.documentElement.lang = LANG;
// Text en els tres idiomes, al costat d'on es fa servir
function tr(ca, es, en) { return LANG === 'es' ? es : LANG === 'en' ? en : ca; }
function setLang(l) {
    try { localStorage.setItem('lang', l); } catch {}
    const u = new URL(location.href);
    u.searchParams.set('lang', l);
    location.href = u.toString(); // l'estat del formulari viatja a l'URL
}

// ── Format de números (sempre format català: 1.234,56 €) ────────────────────
const _eurFormatter = new Intl.NumberFormat('ca-ES', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always',
});
const _eur0Formatter = new Intl.NumberFormat('ca-ES', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: 'always',
});
function fmtEur(n) { return _eurFormatter.format(n); }
function fmtEur0(n) { return _eur0Formatter.format(Math.round(n)); }
const _pctFormatter = new Intl.NumberFormat('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtPct(n) { return Number.isFinite(n) ? _pctFormatter.format(n) + ' %' : '—'; }

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Pills amb input ocult associat
function bindPills(groupId, hiddenId, onPick) {
    const pills = document.querySelectorAll('#' + groupId + ' .pill');
    pills.forEach(pill => {
        pill.addEventListener('click', () => {
            pills.forEach(p => { p.classList.remove('selected'); p.setAttribute('aria-pressed', 'false'); });
            pill.classList.add('selected');
            pill.setAttribute('aria-pressed', 'true');
            document.getElementById(hiddenId).value = pill.dataset.value;
            onPick?.(pill.dataset.value);
        });
    });
}
function selectPill(groupId, hiddenId, value) {
    document.querySelectorAll('#' + groupId + ' .pill').forEach(p => {
        const on = p.dataset.value === String(value);
        p.classList.toggle('selected', on);
        p.setAttribute('aria-pressed', String(on));
    });
    document.getElementById(hiddenId).value = value;
}

// POST JSON a l'API amb missatges d'error llegibles
async function postApi(path, body) {
    let response;
    try {
        response = await fetch(API_BASE + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    } catch {
        throw new Error(tr("No s'ha pogut connectar amb el servidor. Torna-ho a provar.",
            'No se ha podido conectar con el servidor. Vuelve a intentarlo.',
            "Couldn't reach the server. Please try again."));
    }
    if (response.status === 404) {
        throw new Error(tr('El servidor encara no té aquest càlcul. Cal desplegar la versió nova del backend.',
            'El servidor aún no tiene este cálculo. Hay que desplegar la versión nueva del backend.',
            "The server doesn't have this calculation yet. The new backend version needs to be deployed."));
    }
    if (!response.ok) throw new Error(tr(`El servidor ha retornat un error (${response.status}).`,
        `El servidor ha devuelto un error (${response.status}).`, `The server returned an error (${response.status}).`));
    return response.json();
}
function errorBox(message) {
    return '<div class="result-error" role="alert">' + escapeHtml(message) + '</div>';
}

// ── Glossari: termes amb una definició curta en passar-hi per sobre ─────────
const GLOSSARY = {
    retencio: [tr('Retenció', 'Retención', 'Withholding'),
        tr("Percentatge del sou que l'empresa avança a Hisenda cada mes. A la renda es regularitza.",
           'Porcentaje del sueldo que la empresa adelanta a Hacienda cada mes. En la renta se regulariza.',
           'Share of your pay your employer sends to the tax office each month. It is settled in the yearly tax return.')],
    ss: [tr('Seguretat Social', 'Seguridad Social', 'Social Security'),
        tr('La teva part de les cotitzacions: pensió, atur i formació.',
           'Tu parte de las cotizaciones: pensión, paro y formación.',
           'Your share of contributions: pension, unemployment and training.')],
    irpf: ['IRPF', tr("L'impost sobre la renda. A la nòmina se'n paga una part cada mes (la retenció).",
           'El impuesto sobre la renta. En la nómina se paga una parte cada mes (la retención).',
           'Income tax. Part of it is paid from each payslip (the withholding).')],
    extra: [tr('Paga extra', 'Paga extra', 'Extra payment'),
        tr('No porta Seguretat Social: ja es cotitza repartida en els 12 mesos.',
           'No lleva Seguridad Social: ya se cotiza repartida en los 12 meses.',
           'No Social Security is taken from it: that is already spread over the 12 months.')],
    base: [tr('Base de cotització', 'Base de cotización', 'Contribution base'),
        tr('El sou mensual sobre el qual es calcula la Seguretat Social, amb les extres prorratejades.',
           'El sueldo mensual sobre el que se calcula la Seguridad Social, con las extras prorrateadas.',
           'The monthly pay Social Security is calculated on, with the extra payments spread in.')],
    marginal: [tr('Tipus marginal', 'Tipo marginal', 'Marginal rate'),
        tr("Quin percentatge d'IRPF paga el pròxim euro que guanyis.",
           'Qué porcentaje de IRPF paga el próximo euro que ganes.',
           'How much income tax the next euro you earn pays.')],
    extraPct: ['', tr("En molts convenis la paga extra és només el salari base, sense complements. Si a tu et paguen un mes sencer, tria-ho.",
           'En muchos convenios la paga extra es solo el salario base, sin complementos. Si a ti te pagan un mes entero, elígelo.',
           'In many agreements the extra payment is base salary only, without bonuses. If yours is a full month, pick that.')],
};
function gloss(key, text) {
    const [label, def] = GLOSSARY[key];
    return `<span class="gloss" tabindex="0" data-tip="${escapeHtml(def)}">${text ?? label}</span>`;
}

// ── Desglossament d'un sou ───────────────────────────────────────────────────
// Reparteix l'any en pagues tal com surt a la nòmina (el backend fa el mateix):
//  · la SS es cotitza 12 vegades (amb la prorrata de les extres dins la base) i
//    les pagues extra no en porten;
//  · l'IRPF es reté al mateix tipus a cada paga, també sobre l'espècie mensual;
//  · cada extra val `ratio` mesos normals (molts convenis: només salari base);
//  · l'espècie no es cobra en diners: no arriba al compte.
function salarySlices(r, n, especie = 0, ratio = 1) {
    const G = r.rendiment_brut_treball, ss = r.total_ss_anual, irpf = r.cuota_irpf_anual;
    const cash = G - especie, t = G ? irpf / G : 0;
    const extras = Math.max(0, n - 12);
    const k = extras ? ratio : 1;
    const month = cash / (extras ? 12 + extras * k : n);     // brut en diners d'un mes normal
    const extraGross = extras ? month * k : null;
    const periods = extras ? 12 : n;
    const espPaga = especie / periods, ssPaga = ss / periods;
    const irpfPaga = t * (month + espPaga);
    const netAnnual = cash - ss - irpf;
    return {
        n, extras, ratio: k, G, ss, irpf, especie, netAnnual, t,
        monthGross: month, extraGross, espPaga, ssPaga, irpfPaga,
        grossPaga: month + espPaga,
        ordinary: month - ssPaga - irpfPaga,
        extra: extras ? extraGross * (1 - t) : null,
        extraIrpf: extras ? extraGross * t : null,
        month: netAnnual / 12,
        share: G ? netAnnual / G * 100 : NaN,
    };
}

function resultSection(title, rows) {
    const body = rows.map(([label, amount, cls]) =>
        `<tr${cls ? ` class="${cls}"` : ''}><td>${label}</td><td class="amount">${amount}</td></tr>`).join('');
    return `<section class="result-section">
        <div class="result-section-title">${title}</div>
        <table class="result-table"><tbody>${body}</tbody></table>
    </section>`;
}

// Totes les xifres (plegat): només el que no surt ja a la nòmina ni a la barra.
function salaryBreakdown(r, s) {
    const neg = v => '−' + fmtEur(v);
    return resultSection(tr("Com s'arriba a l'IRPF (anual)", 'Cómo se llega al IRPF (anual)', 'How income tax is worked out (yearly)'), [
        [tr('Sou brut', 'Sueldo bruto', 'Gross pay'), fmtEur(r.rendiment_brut_treball)],
        [tr('Seguretat Social', 'Seguridad Social', 'Social Security'), neg(r.total_ss_anual), 'minus'],
        [tr('Despeses de feina', 'Gastos del trabajo', 'Work expenses'), neg(r.gastos_deducibles), 'minus'],
        ...(r.reduccio_rendiments_treball > 0 ? [[tr('Reducció per sou baix', 'Reducción por sueldo bajo', 'Low-pay reduction'), neg(r.reduccio_rendiments_treball), 'minus']] : []),
        [tr('Part que tributa', 'Parte que tributa', 'Taxable part'), fmtEur(r.base_imponible), 'total'],
        [tr("Part lliure d'impostos", 'Parte libre de impuestos', 'Tax-free part'), fmtEur(r.minim_personal_familiar), 'sub'],
        [tr('IRPF anual', 'IRPF anual', 'Yearly income tax'), `<b>${fmtEur(r.cuota_irpf_anual)}</b>`],
        [gloss('retencio'), `<b>${fmtPct(r.tipo_retencio)}</b>`],
        [gloss('marginal'), `<b>${fmtPct(r.marginal_irpf_percent)}</b>`],
    ]);
}

// ── Grups de cotització ─────────────────────────────────────────────────────
// [clau del backend, etiqueta, base mínima mensual]. Mantenir sincronitzat amb
// SS_BASE_MIN_BY_GROUP a backend/variables.py. La clau no es tradueix.
const GRUPS_COTITZACIO = [
    ['Grup 1 – Enginyers/Llicenciats/Alta direcció', tr('Enginyers, llicenciats, alta direcció', 'Ingenieros, licenciados, alta dirección', 'Engineers, graduates, senior management'), 1929.00],
    ['Grup 2 – Enginyers tècnics/Tècnics titulats',  tr('Enginyers tècnics, tècnics titulats', 'Ingenieros técnicos, técnicos titulados', 'Technical engineers, qualified technicians'), 1599.60],
    ['Grup 3 – Caps administratius i de taller',     tr('Caps administratius i de taller', 'Jefes administrativos y de taller', 'Office and workshop supervisors'), 1391.70],
    ['Grup 4 – Ajudants no titulats',                tr('Ajudants no titulats', 'Ayudantes no titulados', 'Non-graduate assistants'), 1381.20],
    ['Grup 5 – Oficials administratius',             tr('Oficials administratius', 'Oficiales administrativos', 'Administrative officers'), 1381.20],
    ['Grup 6 – Subalterns',                          tr('Subalterns', 'Subalternos', 'Junior staff'), 1381.20],
    ['Grup 7 – Auxiliars administratius',            tr('Auxiliars administratius', 'Auxiliares administrativos', 'Administrative assistants'), 1381.20],
    ['Grups 8-11 – Oficials, especialistes i peons', tr('Oficials, especialistes i peons', 'Oficiales, especialistas y peones', 'Tradespeople, specialists and labourers'), 1381.20],
];
const _grupWord = () => tr('Grup', 'Grupo', 'Group');
const _grupsWord = () => tr('Grups', 'Grupos', 'Groups');
const _grupNum = i => i === GRUPS_COTITZACIO.length - 1 ? '8–11' : String(i + 1);
const _grupLast = i => i === GRUPS_COTITZACIO.length - 1 ? '11' : String(i + 1);

// Agrupa els grups que donen el mateix resultat per a una base mensual donada:
// la base de cotització és max(sou/12, mínim del grup), així que tots els grups
// amb mínim ≤ base són equivalents, i també els que comparteixen mínim.
// Retorna [[primerIdx, darrerIdx], ...].
function grupBuckets(monthlyBase) {
    const buckets = [];
    GRUPS_COTITZACIO.forEach(([, , min], i) => {
        const eff = Math.max(min, monthlyBase || 0);
        const last = buckets[buckets.length - 1];
        if (last && last.eff === eff) last.to = i;
        else buckets.push({ from: i, to: i, eff });
    });
    return buckets.map(b => [b.from, b.to]);
}
function _bucketLabel([from, to]) {
    if (from === to) return `${_grupWord()} ${_grupNum(from)} – ${GRUPS_COTITZACIO[from][1]}`;
    if (from === 0) return tr('Tots els grups', 'Todos los grupos', 'All groups');
    return `${_grupsWord()} ${from + 1}–${_grupLast(to)} – ${tr('Altres categories', 'Otras categorías', 'Other categories')}`;
}

// Desplegable que s'adapta al sou: només mostra les opcions que canvien el
// resultat i es plega quan el grup no afecta. `getAnnualGross` retorna el sou
// brut anual que determina la base (NaN si encara no s'ha escrit).
// Retorna { render, get(), set(idx) } per poder desar i restaurar el grup triat.
function initGrupSelect(id, getAnnualGross, initial = 0) {
    const select = document.getElementById(id);
    const note = document.createElement('div');
    note.className = 'grup-collapsed';
    note.innerHTML = `<span class="grup-ok">✓</span> ${tr('No afecta amb aquest sou', 'No afecta con este sueldo', 'Makes no difference at this salary')}`;
    const hint = document.createElement('div');
    hint.className = 'field-hint';
    select.after(note, hint);

    let chosen = initial; // índex del grup triat (per defecte, grup 1)
    let buckets = [];
    select.addEventListener('change', () => {
        const [from, to] = buckets[select.selectedIndex];
        chosen = from === to ? from : to; // una opció agrupada → la categoria més genèrica
    });

    const render = () => {
        const gross = getAnnualGross();
        const hasGross = Number.isFinite(gross) && gross > 0;
        buckets = grupBuckets(hasGross ? gross / 12 : 0);
        select.innerHTML = buckets.map(b => {
            const sel = chosen >= b[0] && chosen <= b[1];
            return `<option value="${GRUPS_COTITZACIO[b[0]][0]}"${sel ? ' selected' : ''}>${_bucketLabel(b)}</option>`;
        }).join('');
        const collapsed = buckets.length === 1;
        select.hidden = collapsed;
        note.hidden = !collapsed;
        const g1Threshold = Math.round(GRUPS_COTITZACIO[0][2] * 12).toLocaleString('ca-ES');
        hint.textContent = collapsed ? ''
            : hasGross ? tr('Només hi surten els grups que canvien el resultat amb aquest sou.', 'Solo aparecen los grupos que cambian el resultado con este sueldo.', 'Only the groups that change the result at this salary are listed.')
            : tr(`Surt a la capçalera de la nòmina. A partir de ${g1Threshold} € bruts anuals no afecta el resultat.`,
                 `Aparece en la cabecera de la nómina. A partir de ${g1Threshold} € brutos anuales no afecta al resultado.`,
                 `It's in your payslip header. Above ${g1Threshold} € gross a year it makes no difference.`);
        hint.hidden = !hint.textContent;
    };
    render();
    return { render, get: () => chosen, set(i) { chosen = i; render(); } };
}

// ── Camps d'import (€) amb separador de milers mentre s'escriu ──────────────
// Format català: punt per als milers, coma per als decimals.
// Els imports es poden escriure en euros o en milers d'euros (k€): el botó
// d'unitat de cada camp canvia tots els camps de la pàgina alhora.
let moneyInThousands = false;
try { moneyInThousands = localStorage.getItem('moneyUnit') === 'k'; } catch {}
const moneyDecimals = () => moneyInThousands ? 3 : 2;

function formatMoneyText(raw, maxDec = moneyDecimals()) {
    const s = raw.replace(/[^\d,]/g, '');
    const comma = s.indexOf(',');
    let int = comma >= 0 ? s.slice(0, comma) : s;
    const dec = comma >= 0 ? s.slice(comma + 1).replace(/,/g, '').slice(0, maxDec) : null;
    int = int.replace(/^0+(?=\d)/, '');
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return dec !== null ? (grouped || '0') + ',' + dec : grouped;
}
// Text escrit/enganxat: l'últim separador seguit d'1–2 dígits (1–3 en k€) és el
// decimal; la resta de punts/comes es tracten com a milers ("1.500,50", "1500.5", "30.000").
function normalizeMoneyChunk(t) {
    if (t === '.' || t === ',') return ',';
    const m = t.match(new RegExp(`^(.*)[.,](\\d{1,${moneyDecimals()}})$`));
    if (m) return m[1].replace(/[.,]/g, '') + ',' + m[2];
    return t.replace(/[.,]/g, '');
}
function parseMoneyText(text) {
    const v = text.replace(/\./g, '').replace(',', '.');
    return v === '' ? NaN : parseFloat(v);
}
function moneyToText(n) {
    if (!Number.isFinite(n)) return '';
    const fixed = n.toFixed(moneyDecimals()).replace(/\.?0+$/, '');
    return formatMoneyText(fixed.replace('.', ','));
}
// Sempre en euros, sigui quina sigui la unitat del camp
function readMoney(id) {
    const n = parseMoneyText(document.getElementById(id).value);
    return moneyInThousands ? n * 1000 : n;
}
// Escriu un import en euros respectant la unitat activa (€ o k€)
function writeMoney(id, euros) {
    document.getElementById(id).value = Number.isFinite(euros) ? moneyToText(moneyInThousands ? euros / 1000 : euros) : '';
}
function refreshMoneyUnitUi() {
    document.querySelectorAll('input[data-money]').forEach(input => {
        const ph = input.dataset.placeholderEur ??= input.placeholder;
        const m = ph.match(/^(.*?)([\d.,]+)$/);
        if (m && moneyInThousands) input.placeholder = m[1] + moneyToText(parseMoneyText(m[2]) / 1000);
        else input.placeholder = ph;
    });
    document.querySelectorAll('.money-unit').forEach(btn => {
        btn.textContent = moneyInThousands ? 'k€' : '€';
        btn.setAttribute('aria-pressed', String(moneyInThousands));
        btn.title = moneyInThousands
            ? tr("En milers d'euros. Clica per passar a euros", 'En miles de euros. Haz clic para pasar a euros', 'In thousands of euros. Click to switch to euros')
            : tr('En euros. Clica per escriure en milers (k€)', 'En euros. Haz clic para escribir en miles (k€)', 'In euros. Click to type in thousands (k€)');
    });
}
function setMoneyInThousands(k) {
    if (k === moneyInThousands) return;
    const values = [...document.querySelectorAll('input[data-money]')].map(i => [i, parseMoneyText(i.value)]);
    moneyInThousands = k;
    values.forEach(([input, n]) => { if (Number.isFinite(n)) input.value = moneyToText(k ? n / 1000 : n * 1000); });
    try { localStorage.setItem('moneyUnit', k ? 'k' : 'eur'); } catch {}
    refreshMoneyUnitUi();
}
function initMoneyInputs(root = document) {
    root.querySelectorAll('input[data-money]:not([data-money-ready])').forEach(input => {
        input.dataset.moneyReady = '1';
        const affix = input.closest('.input-affix');
        if (affix) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'money-unit';
            btn.setAttribute('aria-label', tr("Escriure l'import en milers d'euros", 'Escribir el importe en miles de euros', 'Type the amount in thousands of euros'));
            btn.addEventListener('click', () => { setMoneyInThousands(!moneyInThousands); input.focus(); });
            affix.appendChild(btn);
        }
        if (moneyInThousands) {
            const n = parseMoneyText(input.value);
            if (Number.isFinite(n)) input.value = moneyToText(n / 1000);
        }
        input.value = formatMoneyText(input.value);
        input.addEventListener('paste', e => {
            e.preventDefault();
            const text = normalizeMoneyChunk(e.clipboardData.getData('text'));
            input.setRangeText(text, input.selectionStart, input.selectionEnd, 'end');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        input.addEventListener('input', e => {
            let caret = input.selectionStart;
            // Text inserit: un punt tecleja una coma decimal (els punts són els milers)
            if (e.data && /[.,]/.test(e.data) && input.value.slice(caret - e.data.length, caret) === e.data) {
                const chunk = normalizeMoneyChunk(e.data);
                input.value = input.value.slice(0, caret - e.data.length) + chunk + input.value.slice(caret);
                caret += chunk.length - e.data.length;
                input.setSelectionRange(caret, caret);
            }
            // Manté el cursor al mateix dígit després de reformatar
            const significant = input.value.slice(0, caret).replace(/[^\d,]/g, '').length;
            const formatted = formatMoneyText(input.value);
            input.value = formatted;
            let pos = 0, seen = 0;
            while (pos < formatted.length && seen < significant) {
                if (/[\d,]/.test(formatted[pos])) seen++;
                pos++;
            }
            if (document.activeElement === input) input.setSelectionRange(pos, pos);
        });
    });
    refreshMoneyUnitUi();
}

// ── Capçalera i peu ──────────────────────────────────────────────────────────
(function () {
    const githubSvg = '<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';
    const nav = document.getElementById('navbar');
    if (nav) nav.innerHTML = `
        <div class="navbar-inner">
            <a class="navbar-brand" href="index.html">${tr('Calculadora de sou net', 'Calculadora de sueldo neto', 'Net salary calculator')}</a>
            <div class="lang-switch" role="group" aria-label="${tr('Idioma', 'Idioma', 'Language')}">
                ${LANGS.map(l => `<button type="button" data-lang="${l}" aria-pressed="${l === LANG}">${l.toUpperCase()}</button>`).join('')}
            </div>
        </div>`;
    nav?.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => { if (b.dataset.lang !== LANG) setLang(b.dataset.lang); }));

    const footer = document.getElementById('site-footer');
    if (footer) footer.innerHTML = `
        <a href="https://github.com/AlbertRoca29" target="_blank" rel="noopener">${githubSvg} Albert Roca Llevadot</a>
        <span class="sep">·</span>
        <a href="mailto:albertrocallevadot@gmail.com" class="footer-email">albertrocallevadot@gmail.com</a>
        <span class="sep">·</span>
        <a href="https://sede.agenciatributaria.gob.es/static_files/Sede/Programas_ayuda/Retenciones/2026/Algoritmo%20Retenciones-2026_10sept.pdf" target="_blank" rel="noopener">${tr('Algorisme oficial AEAT 2026', 'Algoritmo oficial AEAT 2026', 'Official AEAT 2026 algorithm')}</a>`;
})();
