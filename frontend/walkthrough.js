// Pas a pas de l'impost real anual (IRPF 2026), a partir del "walkthrough"
// que retorna l'API. Mode simple (calculadora) o comparació abans → després (increment).
//
//   Walkthrough.render(el, w)            // un sou
//   Walkthrough.render(el, wNew, wPrev)  // increment: mostra el canvi a cada pas
//   opts.region: 'Catalunya' | 'Mitjana espanyola' (per anomenar l'escala autonòmica)
(function () {
    const eur = v => (+v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }) + ' €';
    const pct = v => (+v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
    const BCOL = ['#f6c4c1', '#f0a8a4', '#e8746e', '#e2231a', '#b81b13', '#8f150f', '#6a0f0b', '#4a0a07'];

    function delta(a, b, fmt = eur) {
        const d = a - b;
        if (Math.abs(d) < 0.005) return '<span class="wt-d wt-same">sense canvi</span>';
        return `<span class="wt-d ${d > 0 ? 'wt-up' : 'wt-down'}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}</span>`;
    }
    // Número de la columna dreta: en mode comparació, valor nou + canvi respecte de l'anterior
    function num(v, p, key, sign = '') {
        const main = `${sign}${eur(Math.abs(v))}`;
        if (!p) return main;
        return `${main}${delta(Math.abs(v), Math.abs(p[key] ?? 0))}`;
    }

    function brackets(x, scale) {
        const out = [];
        scale.forEach(([lo, hi, rate], i) => {
            if (x > lo) out.push({ i, amt: Math.min(x, hi ?? Infinity) - lo, rate });
        });
        return out;
    }
    function brkBar(x, max, scale, ghost) {
        const b = brackets(x, scale);
        const col = i => BCOL[Math.min(i, BCOL.length - 1)];
        return `<div class="wt-brkwrap"><div class="wt-brk" style="width:${Math.max(3, x / max * 100)}%">${b.map(s =>
            `<div style="flex:${s.amt};background:${col(s.i)}" title="${eur(s.amt)} × ${(s.rate * 100).toFixed(1)} %">${(s.rate * 100).toFixed(1).replace('.0', '')} %</div>`).join('')}</div>
            ${ghost != null ? `<div class="wt-ghost" style="left:${ghost / max * 100}%" title="Abans: ${eur(ghost)}"></div>` : ''}</div>`;
    }

    function waterfall(rows, max, p) {
        let run = 0;
        return `<div class="wt-wf">${rows.map(r => {
            let left, w, cls;
            if (r.total) { left = 0; w = r.v; run = r.v; cls = r.cls; } else { w = r.v; run -= r.v; left = run; cls = 'wt-neg'; }
            const ghost = p && r.total ? `<div class="wt-ghost" style="left:${r.pv / max * 100}%" title="Abans: ${eur(r.pv)}"></div>` : '';
            return `<div class="wt-lab">${r.label}<code>${r.code}${r.sub ? ' · ' + r.sub : ''}</code></div>
                <div class="wt-track"><div class="wt-bar ${cls}" style="left:${left / max * 100}%;width:${Math.max(0, w) / max * 100}%"></div>${ghost}</div>
                <div class="wt-num">${r.total ? '' : '− '}${p ? `${eur(r.v)}${delta(r.v, r.pv)}` : eur(r.v)}</div>`;
        }).join('')}</div>`;
    }

    function render(el, w, p, opts = {}) {
        const R = w.RETRIB, max = Math.max(R, p ? p.RETRIB : 0);
        const aut = opts.region === 'Mitjana espanyola' ? 'autonòmica (mitjana = estatal)' : 'catalana';
        const otherCot = w.OTHER_DEDUCTIONS > 0 ? ` + ${eur(w.OTHER_DEDUCTIONS)} altres deduccions` : '';
        const pv = k => p ? p[k] : null;

        // 1 · Del brut a la base
        const wf = waterfall([
            { label: 'Sou brut', code: 'brut', v: R, pv: pv('RETRIB'), total: true, cls: 'wt-start' },
            { label: 'Cotitzacions', code: 'SS', v: w.COTIZACIONES, pv: pv('COTIZACIONES'), sub: 'Seguretat Social' + otherCot },
            { label: 'Altres despeses', code: 'art. 19', v: w.OTROSGASTOS, pv: pv('OTROSGASTOS'), sub: w.INCREGASDISTRA ? `2.000 + ${eur(w.INCREGASDISTRA)} per discapacitat` : '2.000 € fixos' },
            { label: 'Reducció', code: 'art. 20', v: w.RED20, pv: pv('RED20'), sub: w.RED20 > 0 ? 'rendiment net ≤ 19.747,50 €' : 'rendiment net massa alt' },
            { label: 'Base liquidable', code: 'base', v: w.BASE, pv: pv('BASE'), total: true, cls: 'wt-tot' },
        ], max, p);

        // 2 · Mínim personal i familiar
        const minRows = [
            ['Tu', 'MINCON', w.PER65 ? `5.550 + ${w.PER75 ? '1.150 + 1.400 (75+)' : '1.150 (65+)'}` : '5.550 € general'],
            ['Fills', 'MINDESG', '1r 2.400 · 2n 2.700 · 3r 4.000 · 4t+ 4.500'],
            ['Fills menors de 3', 'MINDES3', '2.800 € cadascun'],
            ['Ascendents', 'MINAS', '1.150 (+1.400 si 75+)'],
            ['La teva discapacitat', 'MINDISC', '3.000 / 9.000 (+3.000 assistència)'],
            ['Discapacitat de familiars', 'MDISDEAS', '3.000 / 9.000 (+3.000 assistència)'],
        ].filter(([, k]) => w[k] > 0);
        const maxMin = Math.max(w.BASE, w.MINPERFA, 1);

        // 3 · Les dues escales
        const maxB = Math.max(w.BASE, w.MINPERFA, p ? p.BASE : 0, 1);
        const scaleBlock = (name, scale, qBase, qMin, q, key) => `
            <div class="wt-rowlab" style="margin-top:10px"><b>Escala ${name}</b></div>
            <div class="wt-rowlab">sobre la base ${eur(w.BASE)} = ${eur(qBase)}</div>${brkBar(w.BASE, maxB, scale, p ? p.BASE : null)}
            <div class="wt-rowlab">sobre el mínim ${eur(w.MINPERFA)} = ${eur(qMin)}</div>${brkBar(w.MINPERFA, maxB, scale)}
            <div class="wt-kv"><span>Quota ${name}</span><span><b>${p ? `${eur(q)}${delta(q, p[key])}` : eur(q)}</b></span></div>`;

        // 4 · Deducció per rendiments del treball (SMI)
        const showSmi = w.RETRIB < 20048.45 || (p && p.RETRIB < 20048.45);
        const smiCard = showSmi ? `
          <div class="wt-card"><div class="wt-h">4 · Deducció per rendiments del treball <span>· ${p ? `${eur(w.DED_SMI)}${delta(w.DED_SMI, p.DED_SMI)}` : eur(w.DED_SMI)}</span></div>
            <div class="wt-p">Perquè qui cobra el salari mínim (17.094 €) no pagui IRPF: es resten fins a 590,89 €, que baixen 20 cèntims per cada euro que guanyes per sobre del salari mínim i desapareixen als 20.048,45 €.</div>
            <div class="wt-kv"><span>Quota estatal + ${aut}</span><span>${eur(w.QUOTA_INTEGRA)}</span>
              <span>− Deducció</span><span>−${eur(w.DED_SMI)}</span></div></div>` : '';

        // 5 · Resultat
        const dQ = p ? w.QUOTA - p.QUOTA : 0, dR = p ? R - p.RETRIB : 0;
        const n = showSmi ? 5 : 4;

        el.innerHTML = `
        <div class="wt">
          <div class="wt-head">
            <div class="wt-title">Com es calcula el teu IRPF, pas a pas</div>
            <div class="wt-subtitle">Impost anual 2026 segons la llei de l'IRPF${opts.region === 'Mitjana espanyola' ? '' : ' i l\'escala catalana'}${p ? `. Cada pas mostra el valor amb el sou nou i <b>el canvi</b> respecte de l'actual (la marca negra és el valor actual).` : '.'}</div>
          </div>

          <div class="wt-card"><div class="wt-h">1 · Del sou brut a la base liquidable</div>
            <div class="wt-p">Es resten les cotitzacions, una despesa fixa de 2.000 € i, si cobres poc, la reducció de l'art. 20 (fins a 7.302 €).</div>
            ${wf}</div>

          <div class="wt-card"><div class="wt-h">2 · El mínim personal i familiar <span>· ${p ? `${eur(w.MINPERFA)}${delta(w.MINPERFA, p.MINPERFA)}` : eur(w.MINPERFA)}</span></div>
            <div class="wt-p">La part de la renda que no tributa perquè cobreix les necessitats bàsiques teves i de la teva família.</div>
            <div class="wt-wf">${minRows.map(([l, k, sub]) => `<div class="wt-lab">${l}<code>${sub}</code></div>
              <div class="wt-track"><div class="wt-bar wt-min" style="left:0;width:${w[k] / maxMin * 100}%"></div></div><div class="wt-num">${eur(w[k])}</div>`).join('')}</div>
            ${p ? '<div class="wt-p" style="margin-top:8px">El mínim no depèn del sou: és el mateix abans i després de l\'increment.</div>' : ''}</div>

          <div class="wt-card"><div class="wt-h">3 · Dues escales: l'estatal i la ${aut}</div>
            <div class="wt-p">L'IRPF es paga meitat a l'Estat i meitat a la comunitat. A cada escala: quota = escala(base) − escala(mínim). El mínim «tributa» als trams més baixos i se't resta.</div>
            ${scaleBlock('estatal', w.ESCALA_EST, w.CUOTA_EST_BASE, w.CUOTA_EST_MIN, w.Q_EST, 'Q_EST')}
            ${scaleBlock(aut, w.ESCALA_AUT, w.CUOTA_AUT_BASE, w.CUOTA_AUT_MIN, w.Q_AUT, 'Q_AUT')}</div>
          ${smiCard}
          <div class="wt-card"><div class="wt-h">${n} · El teu IRPF</div>
            <div class="wt-big">
              <div><div class="wt-rowlab">IRPF anual</div><div class="wt-n">${eur(w.QUOTA)}</div>${p ? `<div class="wt-was">abans ${eur(p.QUOTA)}</div>` : ''}</div>
              <div><div class="wt-rowlab">Tipus efectiu</div><div class="wt-n wt-n2">${pct(w.TIPUS_EFECTIU)}</div>${p ? `<div class="wt-was">abans ${pct(p.TIPUS_EFECTIU)}</div>` : '<div class="wt-was">IRPF ÷ sou brut</div>'}</div>
              ${p ? `<div><div class="wt-rowlab">De cada euro de l'increment</div><div class="wt-n wt-n2">${dR > 0 ? Math.round(dQ / dR * 100) : 0} cèntims</div><div class="wt-was">van a l'IRPF</div></div>`
                  : `<div><div class="wt-rowlab">Tipus marginal</div><div class="wt-n wt-n2">${pct(w.MARGINAL)}</div><div class="wt-was">IRPF de l'euro següent</div></div>`}
            </div></div>
        </div>`;
    }

    window.Walkthrough = { render };
})();
