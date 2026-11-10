// ── Configuració i utilitats compartides ─────────────────────────────────────
const API_BASE = 'https://understanding-taxes-111926362104.europe-west1.run.app';
// const API_BASE = 'http://localhost:8000';

// Mateixa condició que el layout de dues columnes a style.css
const TWO_COLUMN_MQ = window.matchMedia('(min-width: 768px) and (orientation: landscape), (min-width: 1024px)');

const _eurFormatter = new Intl.NumberFormat('ca-ES', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always',
});
function fmtEur(n) { return _eurFormatter.format(n); }
const _pctFormatter = new Intl.NumberFormat('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtPct(n) { return Number.isFinite(n) ? _pctFormatter.format(n) + '%' : '—'; }

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Pills amb input ocult associat
function bindPills(groupId, hiddenId) {
    const pills = document.querySelectorAll('#' + groupId + ' .pill');
    pills.forEach(pill => {
        pill.addEventListener('click', () => {
            pills.forEach(p => { p.classList.remove('selected'); p.setAttribute('aria-pressed', 'false'); });
            pill.classList.add('selected');
            pill.setAttribute('aria-pressed', 'true');
            document.getElementById(hiddenId).value = pill.dataset.value;
        });
    });
}

// Nombre de pagues: 12 / 14 / Altre (camp numèric visible només amb "Altre")
function bindPaguesPills(groupId, inputId) {
    const input = document.getElementById(inputId);
    document.querySelectorAll('#' + groupId + ' .pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('#' + groupId + ' .pill').forEach(p => {
                p.classList.toggle('selected', p === pill);
                p.setAttribute('aria-pressed', String(p === pill));
            });
            const other = pill.dataset.value === 'other';
            input.hidden = !other;
            if (other) { input.value = ''; input.focus(); }
            else input.value = pill.dataset.value;
        });
    });
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
        throw new Error("No s'ha pogut connectar amb el servidor. Torna-ho a provar.");
    }
    if (!response.ok) throw new Error(`El servidor ha retornat un error (${response.status}).`);
    return response.json();
}

// Estat de càrrega: spinner al botó + esquelet al panell de resultats.
// Retorna una funció per restaurar el botó.
function setSubmitting(form) {
    const btn = form.querySelector('[type="submit"]');
    const label = btn.dataset.label ??= btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Calculant…';
    return () => { btn.disabled = false; btn.textContent = label; };
}
function showLoading(resultEl) {
    resultEl.innerHTML = '<div class="result-skeleton" aria-busy="true" aria-label="Calculant…">'
        + '<div class="sk-hero"></div>' + '<div></div>'.repeat(7) + '</div>';
}
function showError(resultEl, message) {
    resultEl.innerHTML = '<div class="result-error" role="alert">Error: ' + escapeHtml(message) + '</div>';
}

// ── Blocs de resultats ───────────────────────────────────────────────────────
// rows: [label, amount, className?]
function resultHero(label, value, sub) {
    return `<div class="result-hero">
        <div class="result-hero-label">${label}</div>
        <div class="result-hero-value">${value}</div>
        ${sub ? `<div class="result-hero-sub">${sub}</div>` : ''}
    </div>`;
}
function resultSection(title, rows) {
    const body = rows.map(([label, amount, cls]) =>
        `<tr${cls ? ` class="${cls}"` : ''}><td>${label}</td><td class="amount">${amount}</td></tr>`).join('');
    return `<section class="result-section">
        <div class="result-section-title">${title}</div>
        <table class="result-table"><tbody>${body}</tbody></table>
    </section>`;
}

// ── Gràfics ──────────────────────────────────────────────────────────────────
function chartCard(base64, alt, kind) {
    return `<div class="chart-card chart-${kind}" role="button" tabindex="0" title="Ampliar">
        <img src="data:image/png;base64,${base64}" alt="${escapeHtml(alt)}"></div>`;
}
function openLightbox(src, alt) {
    const box = document.createElement('div');
    box.className = 'chart-lightbox';
    box.setAttribute('role', 'dialog');
    box.innerHTML = `<img src="${src}" alt="${escapeHtml(alt)}">`;
    const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    box.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(box);
}
document.addEventListener('click', e => {
    const card = e.target.closest('.chart-card');
    if (card) { const img = card.querySelector('img'); openLightbox(img.src, img.alt); }
});
document.addEventListener('keydown', e => {
    const card = e.target.closest?.('.chart-card');
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); card.click(); }
});

// ── Grups de cotització (compartit entre pàgines) ───────────────────────────
// [clau del backend, etiqueta, base mínima mensual]. Mantenir sincronitzat amb
// SS_BASE_MIN_BY_GROUP a backend/variables.py.
const GRUPS_COTITZACIO = [
    ['Grup 1 – Enginyers/Llicenciats/Alta direcció', 'Enginyers, llicenciats, alta direcció', 1929.00],
    ['Grup 2 – Enginyers tècnics/Tècnics titulats',  'Enginyers tècnics, tècnics titulats',   1599.60],
    ['Grup 3 – Caps administratius i de taller',     'Caps administratius i de taller',        1391.70],
    ['Grup 4 – Ajudants no titulats',                'Ajudants no titulats',                   1381.20],
    ['Grup 5 – Oficials administratius',             'Oficials administratius',                1381.20],
    ['Grup 6 – Subalterns',                          'Subalterns',                             1381.20],
    ['Grup 7 – Auxiliars administratius',            'Auxiliars administratius',               1381.20],
    ['Grups 8-11 – Oficials, especialistes i peons', 'Oficials, especialistes i peons',        1381.20],
];
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
    if (from === to) return `Grup ${_grupNum(from)} – ${GRUPS_COTITZACIO[from][1]}`;
    if (from === 0) return 'Tots els grups';
    return `Grups ${from + 1}–${_grupLast(to)} – Altres categories`;
}

// Desplegable que s'adapta al sou: només mostra les opcions que canvien el
// resultat i es plega quan el grup no afecta. `getAnnualGross` retorna el sou
// brut anual que determina la base (NaN si encara no s'ha escrit).
function initGrupSelect(id, getAnnualGross, watchIds) {
    const select = document.getElementById(id);
    const note = document.createElement('div');
    note.className = 'grup-collapsed';
    note.innerHTML = '<span class="grup-ok">✓</span> No afecta amb aquest sou';
    const hint = document.createElement('div');
    hint.className = 'field-hint';
    select.after(note, hint);

    let chosen = 0; // índex del grup triat (per defecte, grup 1)
    let buckets = [];
    select.addEventListener('change', () => {
        const [from, to] = buckets[select.selectedIndex];
        chosen = from === to ? from : to; // una opció agrupada → la categoria més genèrica
    });

    const render = () => {
        const gross = getAnnualGross();
        const hasGross = Number.isFinite(gross) && gross > 0;
        buckets = grupBuckets(hasGross ? gross / 12 : 0);
        select.innerHTML = buckets.map((b, i) => {
            const sel = chosen >= b[0] && chosen <= b[1];
            return `<option value="${GRUPS_COTITZACIO[b[0]][0]}"${sel ? ' selected' : ''}>${_bucketLabel(b)}</option>`;
        }).join('');
        const collapsed = buckets.length === 1;
        select.hidden = collapsed;
        note.hidden = !collapsed;
        const g1Threshold = GRUPS_COTITZACIO[0][2] * 12;
        hint.textContent = collapsed ? ''
            : hasGross ? 'Només hi surten els grups que canvien el resultat amb aquest sou.'
            : `Surt a la capçalera de la nòmina. A partir de ${Math.round(g1Threshold).toLocaleString('ca-ES')} € bruts anuals no afecta el resultat.`;
        hint.hidden = !hint.textContent;
    };
    watchIds.forEach(w => document.getElementById(w).addEventListener('input', render));
    render();
}

// ── Camps d'import (€) amb separador de milers mentre s'escriu ──────────────
// Format català: punt per als milers, coma per als decimals.
function formatMoneyText(raw) {
    const s = raw.replace(/[^\d,]/g, '');
    const comma = s.indexOf(',');
    let int = comma >= 0 ? s.slice(0, comma) : s;
    const dec = comma >= 0 ? s.slice(comma + 1).replace(/,/g, '').slice(0, 2) : null;
    int = int.replace(/^0+(?=\d)/, '');
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return dec !== null ? (grouped || '0') + ',' + dec : grouped;
}
// Text escrit/enganxat: l'últim separador seguit d'1–2 dígits és el decimal;
// la resta de punts/comes es tracten com a milers ("1.500,50", "1500.5", "30.000").
function normalizeMoneyChunk(t) {
    if (t === '.' || t === ',') return ',';
    const m = t.match(/^(.*)[.,](\d{1,2})$/);
    if (m) return m[1].replace(/[.,]/g, '') + ',' + m[2];
    return t.replace(/[.,]/g, '');
}
function readMoney(id) {
    const v = document.getElementById(id).value.replace(/\./g, '').replace(',', '.');
    return v === '' ? NaN : parseFloat(v);
}
function initMoneyInputs() {
    document.querySelectorAll('input[data-money]').forEach(input => {
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
            input.setSelectionRange(pos, pos);
        });
    });
}

// Espera que les imatges (gràfics) estiguin decodificades: si no, la pàgina
// encara és curta i el scroll queda tallat a mig camí.
async function scrollToResultsIfStacked() {
    if (TWO_COLUMN_MQ.matches) return;
    const panel = document.querySelector('.result-panel');
    await Promise.all([...panel.querySelectorAll('img')].map(img => img.decode().catch(() => {})));
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

(function () {
    const page = (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '');

    document.getElementById('navbar').innerHTML = `
        <div class="navbar-inner">
            <div class="navbar-links">
                <a href="index.html"${page === 'index' ? ' class="active" aria-current="page"' : ''}>Calculadora sou net</a>
                <a href="increment.html"${page === 'increment' ? ' class="active" aria-current="page"' : ''}>Increment de sou</a>
            </div>
            <a class="navbar-author" href="https://github.com/AlbertRoca29" target="_blank" rel="noopener" title="Albert Roca Llevadot" aria-label="Albert Roca Llevadot a GitHub">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
                <span class="navbar-author-name">Albert Roca Llevadot</span>
            </a>
        </div>`;

    const githubSvg = document.querySelector('.navbar-author svg').outerHTML;

    document.getElementById('site-footer').innerHTML = `
        <a href="https://github.com/AlbertRoca29" target="_blank" rel="noopener">
            ${githubSvg}
            AlbertRoca29
        </a>
        <span class="sep">·</span>
        <a href="mailto:albertrocallevadot@gmail.com" class="footer-email">albertrocallevadot@gmail.com</a>`;
})();
