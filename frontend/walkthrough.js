// Com es calcula l'IRPF real de l'any, en llenguatge planer, a partir del "walkthrough"
// de l'API. Només es mostra el que s'aplica al teu cas.
//
//   Walkthrough.render(el, w)            // un sou
//   Walkthrough.render(el, wNew, wPrev)  // comparació: mostra el canvi a cada pas
//   opts.region: 'Catalunya' | 'Mitjana espanyola' (per anomenar la part autonòmica)
(function () {
    const eur = v => fmtEur(+v);
    const pct = v => fmtPct(+v);
    // Trams: rampa del color principal, de suau a intens. El tram lliure va en gris ratllat.
    const BMIX = [22, 38, 55, 72, 88, 100, 100, 100];
    const bandBg = i => `color-mix(in srgb, var(--primary) ${BMIX[Math.min(i, BMIX.length - 1)]}%, ${i > 5 ? 'black' : 'var(--card)'} ${i > 5 ? (i - 5) * 15 : 100 - BMIX[Math.min(i, BMIX.length - 1)]}%)`;
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
        return `<div class="wt-brkwrap"><div class="wt-brk" style="width:${Math.max(3, base / max * 100)}%">${trams.map(t =>
            `<div class="${t.i < 0 ? 'wt-free' : t.i < 3 ? 'wt-light' : ''}" style="flex:${t.hi - t.lo};${t.i < 0 ? '' : `background:${bandBg(t.i)}`}" title="${eur(t.hi - t.lo)} × ${(t.rate * 100).toFixed(1)} %">${(t.rate * 100).toFixed(1).replace('.0', '')} %</div>`).join('')}</div>
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

    function render(el, w, p, opts = {}) {
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

        // 3 · Trams: una escala estatal i una autonòmica
        const maxB = Math.max(w.BASE, p ? p.BASE : 0, 1);
        const regional = opts.region === 'Mitjana espanyola';
        const autName = regional ? tr('autonòmica', 'autonómica', 'regional') : tr('catalana', 'catalana', 'Catalan');
        const bandsOf = (scale, key) => {
            const trams = zeroTrams(w.BASE, w.MINPERFA, scale);
            return `${brkBar(trams, w.BASE, maxB, p ? p.BASE : null)}
            <div class="wt-kv">${trams.map(t => `<span>${eur(t.lo)} – ${eur(t.hi)} <span class="wt-rate">${t.i < 0 ? tr('lliure', 'libre', 'tax-free') : pct(t.rate * 100)}</span></span><span>${eur((t.hi - t.lo) * t.rate)}</span>`).join('')}</div>`;
        };
        const bands = card(step(tr('Part estatal', 'Parte estatal', 'State part')), withDelta('Q_EST'),
                tr("L'IRPF es paga en dues parts. La part que tributa es reparteix en trams: la part lliure d'impostos va al 0 % i cada tram següent paga un percentatge més alt.",
                   'El IRPF se paga en dos partes. La parte que tributa se reparte en tramos: la parte libre de impuestos va al 0 % y cada tramo siguiente paga un porcentaje más alto.',
                   'Income tax is paid in two parts. The taxable part is split into bands: the tax-free part pays 0 % and each next band pays a higher rate.'),
                bandsOf(w.ESCALA_EST))
            + card(step(tr(`Part ${autName}`, `Parte ${autName}`, `${autName[0].toUpperCase() + autName.slice(1)} part`)), withDelta('Q_AUT'),
                regional ? tr("Amb la mitjana espanyola, la part autonòmica fa servir els mateixos trams que l'estatal.",
                              'Con la media española, la parte autonómica usa los mismos tramos que la estatal.',
                              'With the Spanish average, the regional part uses the same bands as the state one.')
                         : tr('La Generalitat té els seus propis trams.', 'La Generalitat tiene sus propios tramos.', 'Catalonia has its own bands.'),
                bandsOf(w.ESCALA_AUT));

        // 4 · Deducció per sou baix (DA 61a LIRPF): només fins a 20.048,45 €
        const smi = has('DED_SMI') ? card(step(tr('Deducció per sou baix', 'Deducción por sueldo bajo', 'Low-pay tax credit')), p ? `−${eur(w.DED_SMI)}${delta(w.DED_SMI, p.DED_SMI)}` : `−${eur(w.DED_SMI)}`,
            tr("Perquè qui cobra el salari mínim (17.094 €) no pagui IRPF, es resten fins a 590,89 €. Per cada euro que guanyes per sobre del salari mínim baixa 20 cèntims, i desapareix als 20.048,45 €.",
               'Para que quien cobra el salario mínimo (17.094 €) no pague IRPF, se restan hasta 590,89 €. Por cada euro que ganas por encima del salario mínimo baja 20 céntimos, y desaparece a los 20.048,45 €.',
               'So that people on the minimum wage (17,094 €) pay no income tax, up to 590.89 € comes off. It drops 20 cents for every euro you earn above the minimum wage and disappears at 20,048.45 €.')) : '';

        const dImp = p ? w.QUOTA - p.QUOTA : 0, dR = p ? R - p.RETRIB : 0;
        const law = 'https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764';

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
          ${bands}${smi}
          ${card(step(tr('El resultat', 'El resultado', 'The result')), '', '',
            `<div class="wt-big">
              <div><div class="wt-rowlab">${tr('IRPF a l\'any', 'IRPF al año', 'Income tax per year')}</div><div class="wt-n">${eur(w.QUOTA)}</div>${p ? `<div class="wt-was">${tr('ara', 'ahora', 'now')} ${eur(p.QUOTA)}</div>` : ''}</div>
              <div><div class="wt-rowlab">${tr('IRPF efectiu', 'IRPF efectivo', 'Effective tax rate')}</div><div class="wt-n wt-n2">${pct(w.TIPUS_EFECTIU)}</div>${p ? `<div class="wt-was">${tr('ara', 'ahora', 'now')} ${pct(p.TIPUS_EFECTIU)}</div>` : `<div class="wt-was">${tr('IRPF ÷ sou brut', 'IRPF ÷ sueldo bruto', 'Income tax ÷ gross pay')}</div>`}</div>
              ${p ? `<div><div class="wt-rowlab">${tr('De cada 100 € de més', 'De cada 100 € de más', 'Of every extra 100 €')}</div><div class="wt-n wt-n2">${dR !== 0 ? Math.round(dImp / dR * 100) : 0} €</div><div class="wt-was">${tr("van a l'IRPF", 'van al IRPF', 'go to income tax')}</div></div>`
                  : `<div><div class="wt-rowlab">${tr('Si guanyes 100 € més', 'Si ganas 100 € más', 'If you earn 100 € more')}</div><div class="wt-n wt-n2">${Math.round(w.MARGINAL)} €</div><div class="wt-was">${tr("aniran a l'IRPF", 'irán al IRPF', 'go to income tax')}</div></div>`}
            </div>
`)}
          <a class="wt-src" href="${law}" target="_blank" rel="noopener">${tr("Llei de l'IRPF", 'Ley del IRPF', 'Income Tax Act')} ↗</a>
        </div>`;
    }

    window.Walkthrough = { render };
})();
