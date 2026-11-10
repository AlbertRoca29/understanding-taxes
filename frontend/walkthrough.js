// Pas a pas de l'algorisme oficial de retencions (AEAT 2026), a partir del "walkthrough"
// que retorna l'API. Mode simple (calculadora) o comparació abans → després (increment).
//
//   Walkthrough.render(el, w)            // un sou
//   Walkthrough.render(el, wNew, wPrev)  // increment: mostra el canvi a cada pas
//   opts.region: 'Catalunya' | 'Mitjana espanyola' (per anomenar l'escala)
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
        const region = opts.region === 'Mitjana espanyola' ? 'de retencions (estatal ×2)' : 'estatal + catalana';
        const otherCot = w.OTHER_DEDUCTIONS > 0 ? ` + ${eur(w.OTHER_DEDUCTIONS)} altres deduccions` : '';
        const pv = k => p ? p[k] : null;

        // 1 · Del brut a la base
        const wf = waterfall([
            { label: 'Sou brut', code: 'RETRIB', v: R, pv: pv('RETRIB'), total: true, cls: 'wt-start' },
            { label: 'Cotitzacions', code: 'COTIZACIONES', v: w.COTIZACIONES, pv: pv('COTIZACIONES'), sub: 'SS' + otherCot },
            { label: 'Altres despeses', code: 'OTROSGASTOS', v: w.OTROSGASTOS, pv: pv('OTROSGASTOS'), sub: w.INCREGASDISTRA ? `2.000 + ${eur(w.INCREGASDISTRA)} per discapacitat` : '2.000 € fixos' },
            { label: 'Reducció art. 20', code: 'RED20', v: w.RED20, pv: pv('RED20'), sub: w.RED20 > 0 ? 'rendiment net ≤ 19.747,50 €' : 'rendiment net massa alt' },
            ...(w.HIJOS || (p && p.HIJOS) ? [{ label: 'Més de 2 fills', code: 'HIJOS', v: w.HIJOS, pv: pv('HIJOS'), sub: '600 €' }] : []),
            { label: 'Base de retenció', code: 'BASE', v: w.BASE, pv: pv('BASE'), total: true, cls: 'wt-tot' },
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

        // 4 · Escala
        const maxB = Math.max(w.BASE, w.MINPERFA, p ? p.BASE : 0, 1);
        const preCap = w.CUOTA_PRE;
        const exentLine = w.EXENTOS
            ? `<span class="wt-pill wt-ok">Sí → no es reté res</span>`
            : `<span class="wt-pill wt-no">No → s'aplica l'escala</span>`;

        // 5 · Tipus
        const dImp = p ? w.IMPORTE - p.IMPORTE : 0, dR = p ? R - p.RETRIB : 0;

        el.innerHTML = `
        <div class="wt">
          <div class="wt-head">
            <div class="wt-title">Com es calcula la retenció, pas a pas</div>
            <div class="wt-subtitle">Segons l'<a href="https://sede.agenciatributaria.gob.es/static_files/Sede/Programas_ayuda/Retenciones/2026/Algoritmo%20Retenciones-2026_10sept.pdf" target="_blank" rel="noopener">algorisme oficial de l'AEAT 2026</a>${p ? `. Cada pas mostra el valor amb el sou nou i <b>el canvi</b> respecte de l'actual (la marca negra és el valor actual).` : '.'}</div>
          </div>

          <div class="wt-card"><div class="wt-h">1 · Del sou brut a la base de retenció</div>
            <div class="wt-p">Es resten les cotitzacions, una despesa fixa de 2.000 € i, si cobres poc, la reducció de l'art. 20 (fins a 7.302 €).</div>
            ${wf}</div>

          <div class="wt-card"><div class="wt-h">2 · El mínim personal i familiar <span>· ${p ? `${eur(w.MINPERFA)}${delta(w.MINPERFA, p.MINPERFA)}` : eur(w.MINPERFA)}</span></div>
            <div class="wt-p">La part de la renda que no tributa perquè cobreix les necessitats bàsiques teves i de la teva família.</div>
            <div class="wt-wf">${minRows.map(([l, k, sub]) => `<div class="wt-lab">${l}<code>${k} · ${sub}</code></div>
              <div class="wt-track"><div class="wt-bar wt-min" style="left:0;width:${w[k] / maxMin * 100}%"></div></div><div class="wt-num">${eur(w[k])}</div>`).join('')}</div>
            ${p ? '<div class="wt-p" style="margin-top:8px">El mínim no depèn del sou: és el mateix abans i després de l\'increment.</div>' : ''}</div>

          <div class="wt-card"><div class="wt-h">3 · Estàs per sota del límit sense retenció?</div>
            <div class="wt-kv"><span>Límit per a ${w.NUMDES >= 2 ? '2 o més fills' : w.NUMDES === 1 ? '1 fill' : 'cap fill'} (taula 1, situació general)</span><span>${eur(w.TABLA1)}</span>
              <span>El teu sou brut</span><span>${eur(R)}</span></div>
            <div style="margin-top:8px">${exentLine}${p && p.EXENTOS !== w.EXENTOS ? ' <span class="wt-pill wt-warn">abans de l\'increment: ' + (p.EXENTOS ? 'exempt' : 'no exempt') + '</span>' : ''}</div></div>

          <div class="wt-card"><div class="wt-h">4 · L'escala s'aplica dues vegades <span>· escala ${region}</span></div>
            <div class="wt-p">Quota = escala(base) − escala(mínim). El mínim «tributa» als trams més baixos i se't torna.</div>
            <div class="wt-rowlab">escala(BASE ${eur(w.BASE)}) = <b>${eur(w.CUOTA1)}</b>${p ? delta(w.CUOTA1, p.CUOTA1) : ''}</div>${brkBar(w.BASE, maxB, w.ESCALA, p ? p.BASE : null)}
            <div class="wt-rowlab">escala(MÍNIM ${eur(w.MINPERFA)}) = <b>${eur(w.CUOTA2)}</b></div>${brkBar(w.MINPERFA, maxB, w.ESCALA)}
            <div class="wt-kv"><span>Diferència</span><span>${eur(preCap)}</span>
              ${w.LIMITE != null ? `<span>Límit del 43 % (sous ≤ 35.200 €): 0,43 × (sou − límit taula 1)</span><span>${eur(Math.max(0, w.LIMITE))}${w.CAPPED ? ' ← s\'aplica' : ''}</span>` : ''}
              <span><b>Quota de retenció</b></span><span><b>${p ? `${eur(w.CUOTA)}${delta(w.CUOTA, p.CUOTA)}` : eur(w.CUOTA)}</b></span></div></div>

          <div class="wt-card"><div class="wt-h">5 · El tipus de retenció</div>
            <div class="wt-kv"><span>Quota ÷ sou brut × 100, truncat a 2 decimals</span><span>${pct(w.TIPO_RAW)}</span>
              ${w.FLOOR_APPLIED ? `<span>Mínim del 2 % per contracte temporal</span><span>${pct(w.TIPO)}</span>` : ''}</div>
            <div class="wt-big">
              <div><div class="wt-rowlab">Tipus</div><div class="wt-n">${pct(w.TIPO)}</div>${p ? `<div class="wt-was">abans ${pct(p.TIPO)}</div>` : ''}</div>
              <div><div class="wt-rowlab">Retenció anual</div><div class="wt-n wt-n2">${eur(w.IMPORTE)}</div>${p ? `<div class="wt-was">abans ${eur(p.IMPORTE)}</div>` : ''}</div>
              ${p ? `<div><div class="wt-rowlab">De cada euro de l'increment</div><div class="wt-n wt-n2">${dR > 0 ? Math.round(dImp / dR * 100) : 0} cèntims</div><div class="wt-was">van a l'IRPF</div></div>`
                  : `<div><div class="wt-rowlab">Tipus marginal</div><div class="wt-n wt-n2">${pct(w.MARGINAL)}</div><div class="wt-was">IRPF de l'euro següent</div></div>`}
            </div></div>
        </div>`;
    }

    window.Walkthrough = { render };
})();
