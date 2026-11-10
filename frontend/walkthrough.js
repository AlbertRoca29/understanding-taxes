// Com es calcula l'IRPF, en llenguatge planer, a partir del "walkthrough" de l'API
// (algorisme oficial AEAT 2026). Només es mostra el que s'aplica al teu cas.
//
//   Walkthrough.render(el, w)            // un sou
//   Walkthrough.render(el, wNew, wPrev)  // comparació: mostra el canvi a cada pas
//   opts.region: 'Catalunya' | 'Mitjana espanyola' (per anomenar l'escala)
(function () {
    const eur = v => fmtEur(+v);
    const pct = v => fmtPct(+v);
    const BCOL = ['#f3cfcc', '#e8a9a4', '#d9706a', '#c43434', '#a12a2a', '#80211f', '#611816', '#431010'];
    const before = () => tr('Abans', 'Antes', 'Before');

    function delta(a, b, fmt = eur) {
        const d = a - b;
        if (Math.abs(d) < 0.005) return `<span class="wt-d wt-same">${tr('sense canvi', 'sin cambio', 'no change')}</span>`;
        return `<span class="wt-d ${d > 0 ? 'wt-up' : 'wt-down'}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}</span>`;
    }

    // Trams de la base amb els primers `min` euros a 0 %: escala(base) − escala(mínim)
    // és exactament això, perquè la quota és la suma de (tros × tipus) de cada tram.
    function zeroTrams(base, min, scale) {
        const out = [];
        const z = Math.min(base, min);
        if (z > 0) out.push({ lo: 0, hi: z, rate: 0, i: -1 });
        scale.forEach(([lo, hi, rate], i) => {
            const a = Math.max(lo, min), b = Math.min(hi ?? Infinity, base);
            if (b > a) out.push({ lo: a, hi: b, rate, i });
        });
        return out;
    }
    function brkBar(trams, base, max, ghost) {
        const col = t => t.i < 0 ? '#3aa76d' : BCOL[Math.min(t.i, BCOL.length - 1)];
        return `<div class="wt-brkwrap"><div class="wt-brk" style="width:${Math.max(3, base / max * 100)}%">${trams.map(t =>
            `<div style="flex:${t.hi - t.lo};background:${col(t)}" title="${eur(t.hi - t.lo)} × ${(t.rate * 100).toFixed(1)} %">${(t.rate * 100).toFixed(1).replace('.0', '')} %</div>`).join('')}</div>
            ${ghost != null ? `<div class="wt-ghost" style="left:${ghost / max * 100}%" title="${before()}: ${eur(ghost)}"></div>` : ''}</div>`;
    }

    function waterfall(rows, max, p) {
        let run = 0;
        return `<div class="wt-wf">${rows.map(r => {
            let left, w, cls;
            if (r.total) { left = 0; w = r.v; run = r.v; cls = r.cls; } else { w = r.v; run -= r.v; left = run; cls = 'wt-neg'; }
            const ghost = p && r.total ? `<div class="wt-ghost" style="left:${r.pv / max * 100}%" title="${before()}: ${eur(r.pv)}"></div>` : '';
            return `<div class="wt-lab">${r.label}${r.sub ? `<small>${r.sub}</small>` : ''}</div>
                <div class="wt-track"><div class="wt-bar ${cls}" style="left:${left / max * 100}%;width:${Math.max(0, w) / max * 100}%"></div>${ghost}</div>
                <div class="wt-num">${r.total ? '' : '− '}${p ? `${eur(r.v)}${delta(r.v, r.pv)}` : eur(r.v)}</div>`;
        }).join('')}</div>`;
    }

    const card = (title, total, text, inner = '') => `<div class="wt-card"><div class="wt-h">${title}${total ? `<span class="wt-tot-n">${total}</span>` : ''}</div>${text ? `<div class="wt-p">${text}</div>` : ''}${inner}</div>`;

    function render(el, w, p) {
        const R = w.RETRIB, max = Math.max(R, p ? p.RETRIB : 0);
        const pv = k => p ? p[k] : null;
        const has = k => w[k] > 0 || (p && p[k] > 0);
        const withDelta = (k, fmt = eur) => p ? `${fmt(w[k])}${delta(w[k], p[k], fmt)}` : fmt(w[k]);
        const step = t => t; // la numeració la fa el CSS (counter), en ordre de pantalla

        // 1 · Quina part del sou paga IRPF
        const ssSub = w.OTHER_DEDUCTIONS > 0 ? tr(`inclou ${eur(w.OTHER_DEDUCTIONS)} de quotes`, `incluye ${eur(w.OTHER_DEDUCTIONS)} de cuotas`, `includes ${eur(w.OTHER_DEDUCTIONS)} in fees`) : '';
        const wf = waterfall([
            { label: tr('Sou brut', 'Sueldo bruto', 'Gross pay'), v: R, pv: pv('RETRIB'), total: true, cls: 'wt-start' },
            { label: tr('Seguretat Social', 'Seguridad Social', 'Social Security'), sub: ssSub, v: w.COTIZACIONES, pv: pv('COTIZACIONES') },
            { label: tr('Despeses de feina', 'Gastos del trabajo', 'Work expenses'), v: w.OTROSGASTOS, pv: pv('OTROSGASTOS'),
              sub: w.INCREGASDISTRA ? tr('2.000 € + extra per discapacitat', '2.000 € + extra por discapacidad', '2.000 € + disability extra') : tr('2.000 € per a tothom', '2.000 € para todos', '2.000 € for everyone') },
            ...(has('RED20') ? [{ label: tr('Reducció per sou baix', 'Reducción por sueldo bajo', 'Low-pay reduction'), v: w.RED20, pv: pv('RED20') }] : []),
            ...(has('HIJOS') ? [{ label: tr('Per tenir més de 2 fills', 'Por tener más de 2 hijos', 'For having 3+ children'), v: w.HIJOS, pv: pv('HIJOS') }] : []),
            { label: tr('Part que tributa', 'Parte que tributa', 'Taxable part'), v: w.BASE, pv: pv('BASE'), total: true, cls: 'wt-tot' },
        ], max, p);

        // 2 · Part lliure d'impostos (només les línies que hi sumen)
        const minRows = [
            [tr('Per a tu', 'Para ti', 'For you'), 'MINCON'],
            [tr('Pels fills', 'Por los hijos', 'For your children'), 'MINDESG'],
            [tr('Fills menors de 3 anys', 'Hijos menores de 3 años', 'Children under 3'), 'MINDES3'],
            [tr('Pels pares', 'Por los padres', 'For your parents'), 'MINAS'],
            [tr('Per la teva discapacitat', 'Por tu discapacidad', 'For your disability'), 'MINDISC'],
            [tr('Per discapacitat de familiars', 'Por discapacidad de familiares', "For relatives' disability"), 'MDISDEAS'],
        ].filter(([, k]) => w[k] > 0);
        const maxMin = Math.max(...minRows.map(([, k]) => w[k]), 1);

        // 3 · Trams
        const maxB = Math.max(w.BASE, p ? p.BASE : 0, 1);
        const trams = zeroTrams(w.BASE, w.MINPERFA, w.ESCALA);

        const dImp = p ? w.IMPORTE - p.IMPORTE : 0, dR = p ? R - p.RETRIB : 0;
        const pdf = 'https://sede.agenciatributaria.gob.es/static_files/Sede/Programas_ayuda/Retenciones/2026/Algoritmo%20Retenciones-2026_10sept.pdf';

        const exempt = w.EXENTOS
            ? card(step(tr('No et toca retenció', 'No te toca retención', 'No withholding for you')), '',
                tr(`Amb aquest sou i la teva família, Hisenda no et reté res fins a ${eur(w.TABLA1)} l'any.`,
                   `Con este sueldo y tu familia, Hacienda no te retiene nada hasta ${eur(w.TABLA1)} al año.`,
                   `With this pay and your family, nothing is withheld up to ${eur(w.TABLA1)} a year.`))
            : '';

        const bands = w.EXENTOS ? '' : card(step(tr("L'impost, per trams", 'El impuesto, por tramos', 'The tax, band by band')), withDelta('CUOTA'),
            tr("La part que tributa es reparteix en trams. La part lliure d'impostos va al 0 % i cada tram següent paga un percentatge més alt.",
               'La parte que tributa se reparte en tramos. La parte libre de impuestos va al 0 % y cada tramo siguiente paga un porcentaje más alto.',
               'The taxable part is split into bands. The tax-free part pays 0 % and each next band pays a higher rate.'),
            `${brkBar(trams, w.BASE, maxB, p ? p.BASE : null)}
            <div class="wt-kv">${trams.map(t => `<span>${eur(t.lo)} – ${eur(t.hi)} <span class="wt-rate">${t.i < 0 ? tr('lliure', 'libre', 'tax-free') : pct(t.rate * 100)}</span></span><span>${eur((t.hi - t.lo) * t.rate)}</span>`).join('')}
              ${w.CAPPED ? `<span>${tr('Límit per a sous baixos', 'Límite para sueldos bajos', 'Cap for low pay')}</span><span>${eur(Math.max(0, w.LIMITE))}</span>` : ''}</div>`);

        el.innerHTML = `
        <div class="wt">
          <div class="wt-head">
            <div class="wt-title">${tr("Com es calcula l'IRPF", 'Cómo se calcula el IRPF', 'How income tax is worked out')}</div>
            ${p ? `<div class="wt-subtitle">${tr('Amb el sou nou. La marca negra és el sou actual.', 'Con el sueldo nuevo. La marca negra es el sueldo actual.', 'With the new salary. The black mark is the current one.')}</div>` : ''}
          </div>
          ${card(step(tr('Quina part del sou paga IRPF', 'Qué parte del sueldo paga IRPF', 'How much of your pay is taxed')), '',
            tr('No tot el sou tributa: primer es resten aquestes quantitats.', 'No todo el sueldo tributa: primero se restan estas cantidades.', 'Not all your pay is taxed: these amounts come off first.'), wf)}
          ${card(step(tr("Part lliure d'impostos", 'Parte libre de impuestos', 'Tax-free part')), withDelta('MINPERFA'),
            tr('Diners que no paguen IRPF perquè cobreixen les necessitats bàsiques. Depèn de tu i la teva família, no del sou.',
               'Dinero que no paga IRPF porque cubre las necesidades básicas. Depende de ti y tu familia, no del sueldo.',
               "Money that isn't taxed because it covers basic needs. It depends on you and your family, not on your pay."),
            minRows.length > 1 ? `<div class="wt-wf">${minRows.map(([l, k]) => `<div class="wt-lab">${l}</div>
              <div class="wt-track"><div class="wt-bar wt-min" style="left:0;width:${w[k] / maxMin * 100}%"></div></div><div class="wt-num">${eur(w[k])}</div>`).join('')}</div>` : '')}
          ${exempt}${bands}
          ${card(step(tr('El resultat', 'El resultado', 'The result')), '', '',
            `<div class="wt-big">
              <div><div class="wt-rowlab">${tr('IRPF a l\'any', 'IRPF al año', 'Income tax per year')}</div><div class="wt-n">${eur(w.IMPORTE)}</div>${p ? `<div class="wt-was">${tr('ara', 'ahora', 'now')} ${eur(p.IMPORTE)}</div>` : ''}</div>
              <div><div class="wt-rowlab">${tr('Retenció a la nòmina', 'Retención en la nómina', 'Payslip withholding')}</div><div class="wt-n wt-n2">${pct(w.TIPO)}</div>${p ? `<div class="wt-was">${tr('ara', 'ahora', 'now')} ${pct(p.TIPO)}</div>` : `<div class="wt-was">${tr('IRPF ÷ sou brut', 'IRPF ÷ sueldo bruto', 'Income tax ÷ gross pay')}</div>`}</div>
              ${p ? `<div><div class="wt-rowlab">${tr('De cada 100 € de més', 'De cada 100 € de más', 'Of every extra 100 €')}</div><div class="wt-n wt-n2">${dR !== 0 ? Math.round(dImp / dR * 100) : 0} €</div><div class="wt-was">${tr("van a l'IRPF", 'van al IRPF', 'go to income tax')}</div></div>`
                  : `<div><div class="wt-rowlab">${tr('Si guanyes 100 € més', 'Si ganas 100 € más', 'If you earn 100 € more')}</div><div class="wt-n wt-n2">${Math.round(w.MARGINAL)} €</div><div class="wt-was">${tr("aniran a l'IRPF", 'irán al IRPF', 'go to income tax')}</div></div>`}
            </div>
            ${w.FLOOR_APPLIED ? `<div class="wt-p" style="margin-top:8px">${tr('Amb contracte temporal la retenció mínima és del 2 %.', 'Con contrato temporal la retención mínima es del 2 %.', 'Temporary contracts have a 2 % minimum.')}</div>` : ''}`)}
          <a class="wt-src" href="${pdf}" target="_blank" rel="noopener">${tr("Fórmula oficial de l'AEAT 2026", 'Fórmula oficial de la AEAT 2026', 'Official AEAT 2026 formula')} ↗</a>
        </div>`;
    }

    window.Walkthrough = { render };
})();
