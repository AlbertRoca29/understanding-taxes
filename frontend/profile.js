// Shared salary profile form: used by the calculator (index.html) and the increment page.
// Both pages send exactly the same profile to the API, so they always produce the same numbers.
//
//   Profile.mount(document.getElementById('profileFields'));
//   const data = Profile.read();   // fields of the API "Profile" model
(function () {
    const API_BASE = 'https://understanding-taxes-111926362104.europe-west1.run.app';
    // const API_BASE = 'http://localhost:8000';

    const GROUPS = [
        ['Grup 1 – Enginyers/Llicenciats/Alta direcció', 'Grup 1 – Enginyers, Llicenciats, Alta direcció'],
        ['Grup 2 – Enginyers tècnics/Tècnics titulats', 'Grup 2 – Enginyers tècnics, Tècnics titulats'],
        ['Grup 3 – Caps administratius i de taller', 'Grup 3 – Caps administratius i de taller'],
        ['Grup 4 – Ajudants no titulats', 'Grup 4 – Ajudants no titulats'],
        ['Grup 5 – Oficials administratius', 'Grup 5 – Oficials administratius'],
        ['Grup 6 – Subalterns', 'Grup 6 – Subalterns'],
        ['Grup 7 – Auxiliars administratius', 'Grup 7 – Auxiliars administratius'],
        ['Grups 8-11 – Oficials, especialistes i peons', 'Grups 8-11 – Oficials, especialistes i peons'],
    ];
    // Cada selector envia el valor representatiu del tram que realment compta.
    const DISAB_OPTS = [['Cap', 0], ['33–64%', 50], ['65% o més', 80]];
    const CHILD_AGE  = [['Menys de 3', 1], ['3–24 anys', 10], ['25 o més', 30]];
    const ASC_AGE    = [['Menys de 65', 60], ['65–74', 70], ['75 o més', 80]];

    const state = { region: 'Catalunya', age: 30, contract_type: 'indefinite', selfDisability: 0, selfHelp: false, children: [], ascendants: [] };

    function pills(id, opts, current) {
        return `<div class="pill-group" id="${id}">` + opts.map(([v, label]) =>
            `<div class="pill${String(current) === String(v) ? ' selected' : ''}" data-value="${v}">${label}</div>`).join('') + '</div>';
    }

    const HTML = `
        <div class="form-row">
            <label>Regió</label>
            ${pills('regionPills', [['Catalunya', 'Catalunya'], ['Mitjana espanyola', 'Mitjana espanyola']], state.region)}
        </div>
        <div class="form-row">
            <label for="n_pagues">Nombre de pagues <span style="color:var(--primary)">*</span></label>
            <input type="number" id="n_pagues" required min="1" max="15" value="14" placeholder="Ex: 14">
        </div>
        <div class="form-row">
            <label for="grup_cotitzacio">Grup de cotització SS <span style="color:var(--primary)">*</span></label>
            <select id="grup_cotitzacio" required>${GROUPS.map(([v, l], i) => `<option value="${v}"${i === 0 ? ' selected' : ''}>${l}</option>`).join('')}</select>
        </div>
        <div class="form-row">
            <label>Edat</label>
            ${pills('agePills', [[30, '&lt; 65'], [65, '65+'], [75, '75+']], state.age)}
        </div>
        <div class="form-row">
            <label>Tipus de contracte</label>
            ${pills('contractTypePills', [['indefinite', 'Indefinit'], ['temporary', 'Temporal']], state.contract_type)}
        </div>
        <details>
            <summary>Retribució en espècie i deduccions</summary>
            <div class="group-content">
                <div class="form-row">
                    <label for="retribucio_en_especie_ann">Retribució en espècie anual (€)</label>
                    <input type="number" id="retribucio_en_especie_ann" value="0" step="any" placeholder="Ex: 0">
                </div>
                <div class="form-row">
                    <label for="other_deductions">Altres deduccions (€)</label>
                    <input type="number" id="other_deductions" value="0" step="any" placeholder="Ex: 0">
                    <div class="field-hint">Quotes sindicals, col·legi professional… Es resten com les cotitzacions.</div>
                </div>
            </div>
        </details>
        <details>
            <summary>Situació personal i familiar</summary>
            <div class="group-content">
                <div class="mini-row">
                    <span class="mini-label">La teva discapacitat</span>
                    <div id="selfDisabilityGroup"></div>
                </div>
                <div id="selfHelpWrap"></div>
                <div>
                    <label style="font-weight:600;margin-bottom:6px;display:block;font-size:0.9em">Fills</label>
                    <div class="field-hint" style="margin-bottom:8px">Els fills de 25 anys o més només compten si tenen discapacitat.</div>
                    <div id="childrenList" style="display:flex;flex-direction:column;gap:10px"></div>
                    <button type="button" class="add-btn" data-add="children" style="margin-top:10px">+ Afegir fill</button>
                </div>
                <div>
                    <label style="font-weight:600;margin-bottom:6px;display:block;font-size:0.9em">Ascendents a càrrec</label>
                    <div class="field-hint" style="margin-bottom:8px">Un pare/mare/avi compta si té 65 anys o més o té discapacitat.</div>
                    <div id="ascendantsList" style="display:flex;flex-direction:column;gap:10px"></div>
                    <button type="button" class="add-btn" data-add="ascendants" style="margin-top:10px">+ Afegir ascendent</button>
                </div>
            </div>
        </details>`;

    let root;
    const $ = id => root.querySelector('#' + id);

    function bindPills(id, onPick) {
        $(id).querySelectorAll('.pill').forEach(p => p.onclick = () => {
            $(id).querySelectorAll('.pill').forEach(x => x.classList.remove('selected'));
            p.classList.add('selected');
            onPick(p.dataset.value);
        });
    }

    // Llista de pills que torna a renderitzar en clicar (per a les targetes de persona)
    function pillGroup(opts, current, onPick) {
        const g = document.createElement('div');
        g.className = 'pill-group';
        opts.forEach(([label, val]) => {
            const p = document.createElement('div');
            p.className = 'pill' + (current === val ? ' selected' : '');
            p.textContent = label;
            p.onclick = () => onPick(val);
            g.appendChild(p);
        });
        return g;
    }
    // L'ajuda només es demana al tram 33–64%; a 65%+ ja s'aplica automàticament.
    function helpToggle(checked, onChange) {
        const l = document.createElement('label');
        l.className = 'switch';
        l.innerHTML = `<input type="checkbox" ${checked ? 'checked' : ''}><span class="slider"></span>Necessita ajuda de tercers o mobilitat reduïda`;
        l.querySelector('input').onchange = e => onChange(e.target.checked);
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
        g.appendChild(pillGroup(DISAB_OPTS, state.selfDisability, v => { state.selfDisability = v; if (v !== 50) state.selfHelp = false; renderSelf(); }));
        const w = $('selfHelpWrap'); w.innerHTML = '';
        if (state.selfDisability === 50) w.appendChild(helpToggle(state.selfHelp, v => { state.selfHelp = v; }));
    }

    function renderMembers(key, listId, ageOpts, label) {
        const list = $(listId); list.innerHTML = '';
        const rerender = () => renderMembers(key, listId, ageOpts, label);
        state[key].forEach((m, i) => {
            const card = document.createElement('div');
            card.className = 'person-card';
            card.innerHTML = `<div class="person-card-head"><span>${label} ${i + 1}</span><button type="button" class="remove-btn">&times;</button></div>`;
            card.querySelector('.remove-btn').onclick = () => { state[key].splice(i, 1); rerender(); };
            card.appendChild(miniRow('Edat', pillGroup(ageOpts, m.age, v => { m.age = v; rerender(); })));
            card.appendChild(miniRow('Discapacitat', pillGroup(DISAB_OPTS, m.disability, v => { m.disability = v; if (v !== 50) m.help = false; rerender(); })));
            if (m.disability === 50) card.appendChild(helpToggle(m.help, v => { m.help = v; }));
            list.appendChild(card);
        });
    }

    window.Profile = {
        API_BASE,
        mount(el) {
            root = el;
            el.innerHTML = HTML;
            bindPills('regionPills', v => state.region = v);
            bindPills('agePills', v => state.age = parseInt(v));
            bindPills('contractTypePills', v => state.contract_type = v);
            renderSelf();
            renderMembers('children', 'childrenList', CHILD_AGE, 'Fill');
            renderMembers('ascendants', 'ascendantsList', ASC_AGE, 'Ascendent');
            el.querySelector('[data-add="children"]').onclick = () => { state.children.push({ age: 10, disability: 0, help: false }); renderMembers('children', 'childrenList', CHILD_AGE, 'Fill'); };
            el.querySelector('[data-add="ascendants"]').onclick = () => { state.ascendants.push({ age: 70, disability: 0, help: false }); renderMembers('ascendants', 'ascendantsList', ASC_AGE, 'Ascendent'); };
        },
        nPagues() { return parseInt($('n_pagues').value); },
        read() {
            const member = m => ({ age: m.age, disability: m.disability, needs_help: m.disability === 50 ? m.help : false });
            return {
                region: state.region,
                n_pagues: this.nPagues(),
                pagues_prorratejades: true,
                retribucio_en_especie_ann: parseFloat($('retribucio_en_especie_ann').value) || 0,
                grup_cotitzacio: $('grup_cotitzacio').value,
                contract_type: state.contract_type,
                other_deductions: parseFloat($('other_deductions').value) || 0,
                age: state.age,
                disability_percent_self: state.selfDisability,
                disability_self_help: state.selfDisability === 50 ? state.selfHelp : false,
                children: state.children.map(member),
                ascendants: state.ascendants.map(member),
            };
        },
        async post(path, body) {
            const r = await fetch(this.API_BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!r.ok) throw new Error('API error');
            return r.json();
        },
    };
})();
