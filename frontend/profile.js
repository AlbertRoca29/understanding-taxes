// Formulari de perfil (tot menys el sou i les pagues). Depèn de shared.js.
//
//   Profile.mount(el, {
//       grossForGroup: () => 30000,     // sou que determina la base SS
//       onChange: () => recalcula(),    // qualsevol canvi del perfil
//       initial: Profile.decode(params) // opcional: estat desat (URL)
//   });
//   Profile.read()              // camps del model "Profile" de l'API (sense n_pagues)
//   Profile.groupRange()        // clau del grup 1 si el grup no se sap i canvia el resultat
//   Profile.effects()           // [{kind, patch}] una per cada opció canviada (patch la desfà)
//   Profile.setEffects({kind: €/mes})  // mostra quant canvia el net cada opció triada
//   Profile.encode/decode(URLSearchParams)
(function () {
    // Cada selector envia el valor representatiu del tram que realment compta.
    const DISAB_OPTS = () => [[tr('Cap', 'Ninguna', 'None'), 0], ['33–64 %', 50], [tr('65 % o més', '65 % o más', '65 % or more'), 80]];
    const CHILD_AGE  = () => [[tr('Menys de 3', 'Menos de 3', 'Under 3'), 1], [tr('3–24 anys', '3–24 años', '3–24'), 10], [tr('25 o més', '25 o más', '25 or older'), 30]];
    const ASC_AGE    = () => [[tr('Menys de 65', 'Menos de 65', 'Under 65'), 60], ['65–74', 70], [tr('75 o més', '75 o más', '75 or older'), 80]];
    const REGIONS    = () => [['Catalunya', 'Catalunya'], ['Mitjana espanyola', tr('Mitjana espanyola', 'Media española', 'Spanish average')]];
    const AGES       = () => [[30, tr('Menys de 65', 'Menos de 65', 'Under 65')], [65, '65–74'], [75, tr('75 o més', '75 o más', '75 or older')]];
    const CONTRACTS  = () => [['indefinite', tr('Indefinit', 'Indefinido', 'Permanent')], ['temporary', tr('Temporal', 'Temporal', 'Temporary')]];

    const DEFAULT = { region: 'Catalunya', grup: -1, age: 30, contract: 'indefinite', especie: 0, other: 0,
        selfDisability: 0, selfHelp: false, children: [], ascendants: [] };
    let state = structuredClone(DEFAULT);
    let editing = null;     // [key, idx] de la persona que s'està editant
    let caseOpen = null;    // xip d'"El teu cas" obert
    let grossForGroup = () => NaN, onChange = () => {};
    let buckets = [];

    const $ = id => document.getElementById(id);
    const changed = () => onChange();
    const labelOf = (opts, v) => (opts.find(([k]) => String(k) === String(v)) || [, ''])[1];

    function staticPills(id, opts, current) {
        return `<div class="pill-group" id="${id}">` + opts.map(([v, label]) => {
            const sel = String(v) === String(current);
            return `<button type="button" aria-pressed="${sel}" class="pill${sel ? ' selected' : ''}" data-value="${v}">${label}</button>`;
        }).join('') + '</div>';
    }

    const html = () => `
        <div class="form-row" id="grupRow">
            <span class="field-label">${tr('Grup de cotització SS', 'Grupo de cotización SS', 'Social Security group')}</span>
            <div id="grupField"></div>
        </div>

        <div class="form-row">
            <span class="field-label">${tr('La teva situació', 'Tu situación', 'Your situation')}</span>
            <div class="field-hint">${tr("Toca el que no encaixi amb tu per canviar-ho.", 'Toca lo que no encaje contigo para cambiarlo.', "Tap anything that doesn't match you to change it.")}</div>
            <div class="case-grid" id="caseChips"></div>
            <div class="case-editor" id="caseEditor" hidden>
                <div data-panel="region">${staticPills('regionPills', REGIONS(), state.region)}<input type="hidden" id="region" value="${state.region}"></div>
                <div data-panel="age">${staticPills('agePills', AGES(), state.age)}<input type="hidden" id="age" value="${state.age}"></div>
                <div data-panel="contract">${staticPills('contractTypePills', CONTRACTS(), state.contract)}<input type="hidden" id="contract_type" value="${state.contract}">
                    <div class="field-hint">${tr('Amb contracte temporal es cotitza una mica més per atur i la retenció mínima és del 2 %.', 'Con contrato temporal se cotiza algo más por desempleo y la retención mínima es del 2 %.', 'Temporary contracts pay a bit more unemployment contribution and have a 2 % minimum withholding.')}</div></div>
                <div data-panel="disab"><div id="selfDisabilityGroup"></div><div id="selfHelpWrap"></div></div>
                <div data-panel="especie"><div class="input-affix">
                    <input type="text" inputmode="decimal" data-money autocomplete="off" id="retribucio_en_especie_ann" value="${moneyToText(state.especie)}" placeholder="0" aria-label="${tr('Retribució en espècie anual', 'Retribución en especie anual', 'Annual pay in kind')}"></div>
                    <div class="field-hint">${tr("A l'any. Assegurança mèdica, cotxe d'empresa… Tributa però no arriba al compte.", 'Al año. Seguro médico, coche de empresa… Tributa pero no llega a la cuenta.', "Per year. Health insurance, company car… It's taxed but doesn't reach your account.")}</div></div>
                <div data-panel="other"><div class="input-affix">
                    <input type="text" inputmode="decimal" data-money autocomplete="off" id="other_deductions" value="${moneyToText(state.other)}" placeholder="0" aria-label="${tr('Altres deduccions', 'Otras deducciones', 'Other deductions')}"></div>
                    <div class="field-hint">${tr('A l\'any. Quotes sindicals, col·legi professional…', 'Al año. Cuotas sindicales, colegio profesional…', 'Per year. Union dues, professional association fees…')}</div></div>
                <button type="button" class="add-btn" id="caseDone">${tr('Fet', 'Hecho', 'Done')}</button>
            </div>
        </div>

        <div class="form-row">
            <span class="field-label">${tr('Família a càrrec', 'Familia a cargo', 'Dependants')}</span>
            <div class="chip-row" id="familyChips"></div>
            <div id="memberEditor"></div>
            <div class="family-effect" id="familyEffect" hidden></div>
        </div>`;

    // ── Grup de cotització: rang per defecte, triar és opcional ──────────────
    function renderGrup() {
        const gross = grossForGroup() + (readMoney('retribucio_en_especie_ann') || 0);
        const has = Number.isFinite(gross) && gross > 0;
        buckets = grupBuckets(has ? gross / 12 : 0);
        const row = $('grupRow'), f = $('grupField');
        row.hidden = !has || buckets.length === 1;
        if (row.hidden) { f.innerHTML = ''; return; }
        const sel = state.grup < 0 ? -1 : buckets.findIndex(([a, b]) => state.grup >= a && state.grup <= b);
        f.innerHTML = `<div class="field-hint">${tr('Surt a la capçalera de la nòmina.', 'Aparece en la cabecera de la nómina.', 'It is in your payslip header.')}</div>
            <div class="grup-list" role="group">
              <button type="button" class="grup-opt${sel < 0 ? ' on' : ''}" data-g="-1" aria-pressed="${sel < 0}"><b>${tr('No ho sé', 'No lo sé', "I don't know")}</b><span>${tr('Et mostrem el rang', 'Te mostramos el rango', "We'll show the range")}</span></button>
              ${buckets.map((b, i) => `<button type="button" class="grup-opt${i === sel ? ' on' : ''}" data-g="${b[1]}" aria-pressed="${i === sel}"><b>${b[0] === b[1] ? `${_grupWord()} ${_grupNum(b[0])}` : `${_grupsWord()} ${b[0] + 1}–${_grupLast(b[1])}`}</b><span>${b[0] === b[1] ? GRUPS_COTITZACIO[b[0]][1] : tr('Oficials, administratius, peons…', 'Oficiales, administrativos, peones…', 'Officers, clerks, labourers…')}</span></button>`).join('')}
            </div>`;
        f.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { state.grup = +b.dataset.g; renderGrup(); changed(); });
    }
    const bucketKey = b => GRUPS_COTITZACIO[b[0]][0];

    // ── "El teu cas": un xip per camp, amb el valor actual visible ──────────
    const CASE = {
        region:   [() => tr('On vius', 'Dónde vives', 'Where you live'), () => labelOf(REGIONS(), $('region').value)],
        age:      [() => tr('Edat', 'Edad', 'Age'), () => labelOf(AGES(), $('age').value)],
        contract: [() => tr('Contracte', 'Contrato', 'Contract'), () => labelOf(CONTRACTS(), $('contract_type').value)],
        disab:    [() => tr('Discapacitat', 'Discapacidad', 'Disability'), () => labelOf(DISAB_OPTS().map(([l, v]) => [v, l]), state.selfDisability)],
        especie:  [() => tr('Pagaments en espècie', 'Pagos en especie', 'Benefits in kind'), () => readMoney('retribucio_en_especie_ann') > 0 ? `${fmtEur0(readMoney('retribucio_en_especie_ann'))}/${tr('any', 'año', 'yr')}` : tr('Cap', 'Ninguno', 'None')],
        other:    [() => tr('Quotes sindicals o col·legi', 'Cuotas sindicales o colegio', 'Union or association fees'), () => readMoney('other_deductions') > 0 ? `${fmtEur0(readMoney('other_deductions'))}/${tr('any', 'año', 'yr')}` : tr('Cap', 'Ninguna', 'None')],
    };
    let effects = {};
    const effectBadge = e => Math.round(e) ? `<span class="fx ${e > 0 ? 'up' : 'down'}">${e > 0 ? '+' : '−'}${fmtEur0(Math.abs(e))}${tr('/mes', '/mes', '/mo')}</span>` : '';
    const isDefault = {
        region: () => $('region').value === 'Catalunya', age: () => $('age').value === '30', contract: () => $('contract_type').value === 'indefinite',
        disab: () => !state.selfDisability, especie: () => !(readMoney('retribucio_en_especie_ann') > 0), other: () => !(readMoney('other_deductions') > 0),
    };
    function renderCase() {
        $('caseChips').innerHTML = Object.keys(CASE).map(k => {
            const set = !isDefault[k]();
            return `<button type="button" class="case-tile${caseOpen === k ? ' editing' : ''}${set ? ' set' : ''}" data-case="${k}" aria-expanded="${caseOpen === k}">
                <span class="ct-l">${escapeHtml(CASE[k][0]())}</span><span class="ct-v">${escapeHtml(CASE[k][1]())}</span>${set && effects[k] ? effectBadge(effects[k]) : ''}</button>`;
        }).join('');
        $('caseChips').querySelectorAll('[data-case]').forEach(b => b.onclick = () => {
            caseOpen = caseOpen === b.dataset.case ? null : b.dataset.case; renderCase();
            if (caseOpen === 'especie' || caseOpen === 'other') $(caseOpen === 'especie' ? 'retribucio_en_especie_ann' : 'other_deductions').focus();
        });
        $('caseEditor').hidden = !caseOpen;
        $('caseEditor').querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== caseOpen; });
    }

    // Grup de pills que torna a renderitzar en clicar
    function pillGroup(opts, current, onPick) {
        const g = document.createElement('div');
        g.className = 'pill-group';
        opts.forEach(([label, val]) => {
            const p = document.createElement('button');
            p.type = 'button';
            p.className = 'pill' + (current === val ? ' selected' : '');
            p.setAttribute('aria-pressed', String(current === val));
            p.textContent = label;
            p.onclick = () => onPick(val);
            g.appendChild(p);
        });
        return g;
    }
    // L'ajuda només es demana al tram 33–64 %; a 65 %+ ja s'aplica automàticament.
    function helpToggle(checked, onToggle) {
        const l = document.createElement('label');
        l.className = 'switch';
        l.innerHTML = `<input type="checkbox" ${checked ? 'checked' : ''}><span class="slider"></span>${tr('Necessita ajuda de tercers o mobilitat reduïda', 'Necesita ayuda de terceros o movilidad reducida', 'Needs assistance or has reduced mobility')}`;
        l.querySelector('input').onchange = e => onToggle(e.target.checked);
        return l;
    }
    function miniRow(label, el) {
        const r = document.createElement('div');
        r.className = 'mini-row';
        r.innerHTML = `<span class="mini-label">${label}</span>`;
        r.appendChild(el);
        return r;
    }

    function renderSelf() {
        const g = $('selfDisabilityGroup'); g.innerHTML = '';
        g.appendChild(pillGroup(DISAB_OPTS(), state.selfDisability, v => {
            state.selfDisability = v; if (v !== 50) state.selfHelp = false; renderSelf(); renderCase(); changed();
        }));
        const w = $('selfHelpWrap'); w.innerHTML = '';
        if (state.selfDisability === 50) w.appendChild(helpToggle(state.selfHelp, v => { state.selfHelp = v; changed(); }));
    }

    // ── Família com a xips ──────────────────────────────────────────────────
    const MEMBERS = {
        children:   { ageOpts: CHILD_AGE, label: () => tr('Fill', 'Hijo', 'Child'), add: () => tr('+ fill', '+ hijo', '+ child'), blank: () => ({ age: 10, disability: 0, help: false }) },
        ascendants: { ageOpts: ASC_AGE,   label: () => tr('Pare/mare', 'Padre/madre', 'Parent'), add: () => tr('+ pare/mare', '+ padre/madre', '+ parent'), blank: () => ({ age: 70, disability: 0, help: false }) },
    };
    function chipText(key, m) {
        const { ageOpts, label } = MEMBERS[key];
        const age = ageOpts().find(([, v]) => v === m.age)?.[0] ?? '';
        const dis = m.disability ? ` · ${tr('disc.', 'disc.', 'disab.')} ${m.disability === 50 ? '33–64 %' : '65 %+'}` : '';
        return `${label()} · ${age.toLowerCase()}${dis}`;
    }
    function renderFamily() {
        const row = $('familyChips'); row.innerHTML = '';
        Object.keys(MEMBERS).forEach(key => state[key].forEach((m, i) => {
            const on = editing && editing[0] === key && editing[1] === i;
            const chip = document.createElement('span');
            chip.className = 'chip' + (on ? ' editing' : '');
            chip.innerHTML = `<button type="button" class="chip-main" aria-expanded="${on}">${escapeHtml(chipText(key, m))}</button>`
                + `<button type="button" class="chip-x" aria-label="${tr('Treure', 'Quitar', 'Remove')}">×</button>`;
            chip.querySelector('.chip-main').onclick = () => { editing = on ? null : [key, i]; renderFamily(); };
            chip.querySelector('.chip-x').onclick = () => {
                state[key].splice(i, 1); editing = null; renderFamily(); changed();
            };
            row.appendChild(chip);
        }));
        Object.entries(MEMBERS).forEach(([key, def]) => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'chip chip-add'; b.textContent = def.add();
            b.onclick = () => { state[key].push(def.blank()); editing = [key, state[key].length - 1]; renderFamily(); changed(); };
            row.appendChild(b);
        });

        const ed = $('memberEditor'); ed.innerHTML = '';
        if (!editing) return;
        const [key, i] = editing, m = state[key][i];
        if (!m) { editing = null; return; }
        const box = document.createElement('div');
        box.className = 'member-editor';
        const redo = () => { renderFamily(); changed(); };
        box.appendChild(miniRow(tr('Edat', 'Edad', 'Age'), pillGroup(MEMBERS[key].ageOpts(), m.age, v => { m.age = v; redo(); })));
        box.appendChild(miniRow(tr('Discapacitat', 'Discapacidad', 'Disability'), pillGroup(DISAB_OPTS(), m.disability, v => {
            m.disability = v; if (v !== 50) m.help = false; redo();
        })));
        if (m.disability === 50) box.appendChild(helpToggle(m.help, v => { m.help = v; changed(); }));
        const hint = document.createElement('div');
        hint.className = 'field-hint';
        hint.textContent = key === 'children'
            ? tr('Els fills de 25 anys o més només compten si tenen discapacitat.', 'Los hijos de 25 años o más solo cuentan si tienen discapacidad.', 'Children aged 25 or older only count if they have a disability.')
            : tr('Compta si té 65 anys o més o té discapacitat.', 'Cuenta si tiene 65 años o más o tiene discapacidad.', 'Counts if 65 or older or with a disability.');
        box.appendChild(hint);
        const done = document.createElement('button');
        done.type = 'button'; done.className = 'add-btn'; done.textContent = tr('Fet', 'Hecho', 'Done');
        done.onclick = () => { editing = null; renderFamily(); };
        box.appendChild(done);
        ed.appendChild(box);
    }

    // ── URL: estat compacte ─────────────────────────────────────────────────
    const encMembers = list => list.map(m => `${m.age}.${m.disability}${m.help ? '.1' : ''}`).join('_');
    const decMembers = s => (s || '').split('_').filter(Boolean).map(t => {
        const [a, d, h] = t.split('.').map(Number);
        return { age: a || 10, disability: [0, 50, 80].includes(d) ? d : 0, help: h === 1 };
    });

    window.Profile = {
        mount(el, { grossForGroup: g, onChange: cb, initial } = {}) {
            if (initial) state = { ...structuredClone(DEFAULT), ...initial };
            grossForGroup = g || (() => NaN);
            onChange = cb || (() => {});
            el.innerHTML = html();
            initMoneyInputs(el);
            const pick = () => {
                state.region = $('region').value; state.age = +$('age').value; state.contract = $('contract_type').value;
                renderCase(); changed();
            };
            bindPills('regionPills', 'region', pick);
            bindPills('agePills', 'age', pick);
            bindPills('contractTypePills', 'contract_type', pick);
            ['retribucio_en_especie_ann', 'other_deductions'].forEach(id => $(id).addEventListener('input', () => { renderGrup(); renderCase(); changed(); }));
            $('caseDone').onclick = () => { caseOpen = null; renderCase(); };
            renderSelf();
            renderCase();
            renderFamily();
            renderGrup();
        },
        refreshGroup() { if ($('grupField')) renderGrup(); },
        read() {
            const member = m => ({ age: m.age, disability: m.disability, needs_help: m.disability === 50 ? m.help : false });
            const b = state.grup >= 0 ? buckets.find(([a, z]) => state.grup >= a && state.grup <= z) : null;
            return {
                region: $('region').value,
                pagues_prorratejades: true,
                retribucio_en_especie_ann: readMoney('retribucio_en_especie_ann') || 0,
                // Sense grup triat: el més habitual (el darrer, amb la base mínima més baixa)
                grup_cotitzacio: bucketKey(b || buckets[buckets.length - 1] || [GRUPS_COTITZACIO.length - 1]),
                contract_type: $('contract_type').value,
                other_deductions: readMoney('other_deductions') || 0,
                age: parseInt($('age').value),
                disability_percent_self: state.selfDisability,
                disability_self_help: state.selfDisability === 50 ? state.selfHelp : false,
                children: state.children.map(member),
                ascendants: state.ascendants.map(member),
            };
        },
        // Grup amb la base més alta, per mostrar el rang quan el grup no se sap
        groupRange() {
            return state.grup < 0 && buckets.length > 1 ? bucketKey(buckets[0]) : null;
        },
        hasFamily() { return state.children.length + state.ascendants.length > 0; },
        setFamilyEffect(euros) {
            const el = $('familyEffect');
            if (!el) return;
            el.hidden = !(euros > 0.5);
            el.textContent = tr(`Gràcies a la família cobres ${fmtEur0(euros)} més nets al mes`,
                `Gracias a la familia cobras ${fmtEur0(euros)} más netos al mes`,
                `Your family adds ${fmtEur0(euros)} net to your pay each month`);
        },
        // Una variant per cada opció que no és la per defecte: el patch la desfà,
        // així la diferència és el que aquella opció canvia el net.
        effects() {
            const out = [];
            if (!isDefault.region()) out.push({ kind: 'region', patch: p => ({ ...p, region: 'Catalunya' }) });
            if (!isDefault.age()) out.push({ kind: 'age', patch: p => ({ ...p, age: 30 }) });
            if (!isDefault.contract()) out.push({ kind: 'contract', patch: p => ({ ...p, contract_type: 'indefinite' }) });
            if (!isDefault.disab()) out.push({ kind: 'disab', patch: p => ({ ...p, disability_percent_self: 0, disability_self_help: false }) });
            if (!isDefault.especie()) out.push({ kind: 'especie', patch: p => ({ ...p, retribucio_en_especie_ann: 0 }) });
            if (!isDefault.other()) out.push({ kind: 'other', patch: p => ({ ...p, other_deductions: 0 }) });
            return out;
        },
        setEffects(map) { effects = map || {}; renderCase(); },
        encode(q) {
            const p = this.read();
            if (p.region !== 'Catalunya') q.set('r', 'e');
            if (state.grup >= 0) q.set('g', state.grup);
            if (p.age !== 30) q.set('age', p.age);
            if (p.contract_type !== 'indefinite') q.set('ct', 't');
            if (p.retribucio_en_especie_ann) q.set('esp', p.retribucio_en_especie_ann);
            if (p.other_deductions) q.set('od', p.other_deductions);
            if (state.selfDisability) q.set('d', state.selfDisability + (state.selfHelp ? '.1' : ''));
            if (state.children.length) q.set('k', encMembers(state.children));
            if (state.ascendants.length) q.set('as', encMembers(state.ascendants));
        },
        decode(q) {
            const num = (k, d) => { const v = parseFloat(q.get(k)); return Number.isFinite(v) ? v : d; };
            const [d, h] = (q.get('d') || '0').split('.').map(Number);
            return {
                region: q.get('r') === 'e' ? 'Mitjana espanyola' : 'Catalunya',
                grup: q.has('g') ? Math.min(GRUPS_COTITZACIO.length - 1, Math.max(0, num('g', 0) | 0)) : -1,
                age: [30, 65, 75].includes(num('age', 30)) ? num('age', 30) : 30,
                contract: q.get('ct') === 't' ? 'temporary' : 'indefinite',
                especie: Math.max(0, num('esp', 0)), other: Math.max(0, num('od', 0)),
                selfDisability: [0, 50, 80].includes(d) ? d : 0, selfHelp: h === 1,
                children: decMembers(q.get('k')), ascendants: decMembers(q.get('as')),
            };
        },
    };
})();
