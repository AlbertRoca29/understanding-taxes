// Gràfics en SVG a partir dels números de l'API (substitueixen els PNG del servidor).
//
//   Charts.bar(slices)                 // barra brut = net + SS + IRPF (+ espècie)
//   Charts.curve(el, curve, marks)     // corba brut → net amb el tipus marginal a sota
//     curve: [[brut, net, ss, irpf, marginal%], ...]  (camp "curve" de l'API)
//     marks: [{ g, net, label }]
(function () {
    const parts = s => [
        ['net', tr('Et queda', 'Te queda', 'You keep'), s.netAnnual],
        ['irpf', gloss('irpf'), s.irpf],
        ['ss', gloss('ss'), s.ss],
        ...(s.especie ? [['esp', tr('En espècie', 'En especie', 'In kind'), s.especie]] : []),
    ];

    function bar(s) {
        const ps = parts(s);
        return `<div class="money-bar" role="img" aria-label="${escapeHtml(ps.map(([, l, v]) => `${l.replace(/<[^>]+>/g, '')}: ${fmtEur0(v)}`).join(', '))}">
            ${ps.map(([k, , v]) => `<div class="seg-${k}" style="flex:${Math.max(v, 0)}">${v / s.G > 0.09 ? Math.round(v / s.G * 100) + ' %' : ''}</div>`).join('')}
        </div>
        <div class="money-legend">${ps.map(([k, l, v]) =>
            `<div><span class="sw seg-${k}"></span><span class="lg-l">${l}</span><b>${fmtEur0(v)}</b><span class="lg-p">${Math.round(v / s.G * 100)} %</span></div>`).join('')}</div>`;
    }

    // Barra petita per a una diferència entre dos sous (on va cada euro de més)
    function deltaBar(dNet, dSS, dIrpf) {
        const tot = dNet + dSS + dIrpf;
        if (!(tot > 0)) return '';
        const p = v => Math.round(v / tot * 100);
        return `<div class="money-bar thin">${[['net', dNet], ['irpf', dIrpf], ['ss', dSS]].map(([k, v]) =>
            `<div class="seg-${k}" style="flex:${Math.max(v, 0)}"></div>`).join('')}</div>
            <div class="field-hint">${tr(`De cada 100 € de més: ${p(dNet)} per a tu`, `De cada 100 € de más: ${p(dNet)} para ti`, `Of every extra 100 €: ${p(dNet)} for you`)}</div>`;
    }

    function curve(el, pts, marks = []) {
        if (!Array.isArray(pts) || pts.length < 2) { el.innerHTML = ''; return; }
        const W = 640, H = 250, L = 48, R = 14, T = 12, B = 28, H2 = 90, T2 = 10, B2 = 24;
        const x0 = pts[0][0], x1 = pts[pts.length - 1][0];
        const yMax = niceMax(x1);
        const sx = g => L + (g - x0) / (x1 - x0) * (W - L - R);
        const sy = v => T + (1 - v / yMax) * (H - T - B);
        const mMax = Math.max(10, ...pts.map(p => p[4]));
        const mTop = Math.ceil(mMax / 10) * 10;
        const sy2 = v => T2 + (1 - v / mTop) * (H2 - T2 - B2);
        const k = v => v >= 1000 ? Math.round(v / 1000) + 'k' : String(v);

        const netD = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)} ${sy(p[1]).toFixed(1)}`).join('');
        const gap = `M${sx(x0)} ${sy(x0)} L${sx(x1)} ${sy(x1)} ` + pts.slice().reverse().map(p => `L${sx(p[0]).toFixed(1)} ${sy(p[1]).toFixed(1)}`).join('') + 'Z';
        // Marginal: escalons (constant fins al punt següent)
        const margD = pts.map((p, i) => i ? `H${sx(p[0]).toFixed(1)} V${sy2(p[4]).toFixed(1)}` : `M${sx(p[0]).toFixed(1)} ${sy2(p[4]).toFixed(1)}`).join('');

        const yTicks = [0, .25, .5, .75, 1].map(f => f * yMax);
        const xTicks = ticks(x0, x1);
        el.innerHTML = `
        <div class="chart-wrap">
          <svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${tr('Sou net segons el sou brut', 'Sueldo neto según el sueldo bruto', 'Net pay by gross pay')}">
            ${yTicks.map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}"/><text class="tick" x="${L - 6}" y="${sy(v) + 4}" text-anchor="end">${k(v)}</text>`).join('')}
            ${xTicks.map(v => `<text class="tick" x="${sx(v)}" y="${H - 8}" text-anchor="middle">${k(v)}</text>`).join('')}
            <path class="gap" d="${gap}"/>
            <line class="gross" x1="${sx(x0)}" y1="${sy(x0)}" x2="${sx(x1)}" y2="${sy(x1)}"/>
            <path class="net" d="${netD}"/>
            <text class="lbl lbl-gross" x="${sx(x1) - 4}" y="${sy(x1) + 14}" text-anchor="end">${tr('brut', 'bruto', 'gross')}</text>
            <text class="lbl lbl-net" x="${sx(x1) - 4}" y="${sy(pts[pts.length - 1][1]) + 16}" text-anchor="end">net</text>
            ${marks.map((m, i) => `<g class="mark mark-${i}"><line x1="${sx(m.g)}" x2="${sx(m.g)}" y1="${sy(m.g)}" y2="${sy(m.net)}"/><circle cx="${sx(m.g)}" cy="${sy(m.net)}" r="5"/>
                <text class="lbl" x="${sx(m.g) + (sx(m.g) > W * .7 ? -8 : 8)}" y="${sy(m.net) + (i ? -10 : 18)}" text-anchor="${sx(m.g) > W * .7 ? 'end' : 'start'}">${escapeHtml(m.label)}</text></g>`).join('')}
            <line class="hover-line" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
            <rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/>
          </svg>
          <div class="chart-sub">${tr("Tipus marginal d'IRPF", 'Tipo marginal de IRPF', 'Marginal income tax rate')}</div>
          <svg viewBox="0 0 ${W} ${H2}" class="chart chart-marg" aria-hidden="true">
            ${[0, mTop / 2, mTop].map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${sy2(v)}" y2="${sy2(v)}"/><text class="tick" x="${L - 6}" y="${sy2(v) + 4}" text-anchor="end">${v} %</text>`).join('')}
            <path class="marg" d="${margD}"/>
            ${marks.map((m, i) => `<line class="mark-v mark-${i}" x1="${sx(m.g)}" x2="${sx(m.g)}" y1="${T2}" y2="${H2 - B2}"/>`).join('')}
          </svg>
          <div class="chart-read" aria-live="polite"></div>
        </div>`;

        const svg = el.querySelector('svg.chart'), hl = svg.querySelector('.hover-line'), read = el.querySelector('.chart-read');
        const show = clientX => {
            const r = svg.getBoundingClientRect();
            const x = (clientX - r.left) / r.width * W;
            const g = x0 + (x - L) / (W - L - R) * (x1 - x0);
            let best = pts[0];
            pts.forEach(p => { if (Math.abs(p[0] - g) < Math.abs(best[0] - g)) best = p; });
            hl.setAttribute('x1', sx(best[0])); hl.setAttribute('x2', sx(best[0])); hl.setAttribute('visibility', 'visible');
            read.innerHTML = tr(
                `<b>${fmtEur0(best[0])}</b> bruts → <b>${fmtEur0(best[1])}</b> nets (${Math.round(best[1] / best[0] * 100)} %) · marginal ${fmtPct(best[4])}`,
                `<b>${fmtEur0(best[0])}</b> brutos → <b>${fmtEur0(best[1])}</b> netos (${Math.round(best[1] / best[0] * 100)} %) · marginal ${fmtPct(best[4])}`,
                `<b>${fmtEur0(best[0])}</b> gross → <b>${fmtEur0(best[1])}</b> net (${Math.round(best[1] / best[0] * 100)} %) · marginal ${fmtPct(best[4])}`);
        };
        svg.addEventListener('pointermove', e => show(e.clientX));
        svg.addEventListener('pointerleave', () => hl.setAttribute('visibility', 'hidden'));
    }
    function niceMax(v) { const step = v > 150000 ? 50000 : v > 60000 ? 20000 : 10000; return Math.ceil(v / step) * step; }
    function ticks(a, b) {
        const step = b - a > 150000 ? 50000 : b - a > 70000 ? 20000 : 10000;
        const out = [];
        for (let v = Math.ceil(a / step) * step; v <= b; v += step) out.push(v);
        return out;
    }

    window.Charts = { bar, deltaBar, curve };
})();
