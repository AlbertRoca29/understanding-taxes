// Formulari de perfil compartit per la calculadora (index.html) i l'increment.
// Les dues pàgines envien exactament el mateix perfil a l'API, així que sempre
// donen les mateixes xifres. Depèn de shared.js (pills, imports, grups SS).
//
//   Profile.mount(document.getElementById('profileFields'), {
//       grossForGroup: () => readMoney('gross'),  // sou que determina la base SS
//       watchIds: ['gross'],                      // camps que el canvien
//   });
//   const data = Profile.read();   // camps del model "Profile" de l'API
//
// mount() també inicialitza els camps d'import (€/k€) de tota la pàgina: no cal
// cridar initMoneyInputs() a part.
(function () {
    // Cada selector envia el valor representatiu del tram que realment compta.
    const DISAB_OPTS = [['Cap', 0], ['33–64%', 50], ['65% o més', 80]];
    const CHILD_AGE  = [['Menys de 3', 1], ['3–24 anys', 10], ['25 o més', 30]];
    const ASC_AGE    = [['Menys de 65', 60], ['65–74', 70], ['75 o més', 80]];

    const state = { selfDisability: 0, selfHelp: false, children: [], ascendants: [] };

    function staticPills(id, opts, current) {
        return `<div class="pill-group" id="${id}">` + opts.map(([v, label]) => {
            const sel = String(v) === String(current);
            return `<button type="button" aria-pressed="${sel}" class="pill${sel ? ' selected' : ''}" data-value="${v}">${label}</button>`;
        }).join('') + '</div>';
    }

    const HTML = `
        <div class="form-row">
            <label>Regió</label>
            ${staticPills('regionPills', [['Catalunya', 'Catalunya'], ['Mitjana espanyola', 'Mitjana espanyola']], 'Catalunya')}
            <input type="hidden" id="region" value="Catalunya">
        </div>

        <div class="form-row">
            <label>Nombre de pagues <span class="req">*</span></label>
            <div class="pill-group" id="paguesPills">
                <button type="button" aria-pressed="false" class="pill" data-value="12">12</button>
                <button type="button" aria-pressed="true" class="pill selected" data-value="14">14</button>
                <button type="button" aria-pressed="false" class="pill" data-value="other">Altre</button>
                <input type="number" id="n_pagues" class="pagues-other" required min="1" max="15" step="1" value="14" placeholder="Nº" aria-label="Nombre de pagues" hidden>
            </div>
        </div>

        <div class="form-row">
            <label for="grup_cotitzacio">Grup de cotització SS <span class="req">*</span></label>
            <select id="grup_cotitzacio" required></select>
        </div>

        <div class="form-row">
            <label>Edat</label>
            ${staticPills('agePills', [[30, '&lt; 65'], [65, '65+'], [75, '75+']], 30)}
            <input type="hidden" id="age" value="30">
        </div>

        <div class="form-row">
            <label>Tipus de contracte</label>
            ${staticPills('contractTypePills', [['indefinite', 'Indefinit'], ['temporary', 'Temporal']], 'indefinite')}
            <input type="hidden" id="contract_type" value="indefinite">
        </div>

        <details>
            <summary>Retribució en espècie i deduccions</summary>
            <div class="group-content">
                <div class="form-row">
                    <label for="retribucio_en_especie_ann">Retribució en espècie anual</label>
                    <div class="input-affix">
                        <input type="text" inputmode="decimal" data-money autocomplete="off" id="retribucio_en_especie_ann" value="0" placeholder="Ex: 0">
                    </div>
                </div>
                <div class="form-row">
                    <label for="other_deductions">Altres deduccions</label>
                    <div class="input-affix">
                        <input type="text" inputmode="decimal" data-money autocomplete="off" id="other_deductions" value="0" placeholder="Ex: 0">
                    </div>
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
                    <div class="group-title">Fills</div>
                    <div class="field-hint">Els fills de 25 anys o més només compten si tenen discapacitat.</div>
                    <div id="childrenList" class="person-list"></div>
                    <button type="button" class="add-btn" data-add="children">+ Afegir fill</button>
                </div>

                <div>
                    <div class="group-title">Ascendents a càrrec</div>
                    <div class="field-hint">Un pare/mare/avi compta si té 65 anys o més o té discapacitat.</div>
                    <div id="ascendantsList" class="person-list"></div>
                    <button type="button" class="add-btn" data-add="ascendants">+ Afegir ascendent</button>
                </div>
            </div>
        </details>`;

    const $ = id => document.getElementById(id);

    // Grup de pills que torna a renderitzar en clicar (targetes de persona)
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
        g.appendChild(pillGroup(DISAB_OPTS, state.selfDisability, v => {
            state.selfDisability = v; if (v !== 50) state.selfHelp = false; renderSelf();
        }));
        const w = $('selfHelpWrap'); w.innerHTML = '';
        if (state.selfDisability === 50) w.appendChild(helpToggle(state.selfHelp, v => { state.selfHelp = v; }));
    }

    const MEMBERS = {
        children:   { listId: 'childrenList',   ageOpts: CHILD_AGE, label: 'Fill',      blank: () => ({ age: 10, disability: 0, help: false }) },
        ascendants: { listId: 'ascendantsList', ageOpts: ASC_AGE,   label: 'Ascendent', blank: () => ({ age: 70, disability: 0, help: false }) },
    };
    function renderMembers(key) {
        const { listId, ageOpts, label } = MEMBERS[key];
        const list = $(listId); list.innerHTML = '';
        const rerender = () => renderMembers(key);
        state[key].forEach((m, i) => {
            const card = document.createElement('div');
            card.className = 'person-card';
            card.innerHTML = `<div class="person-card-head"><span>${label} ${i + 1}</span>
                <button type="button" class="remove-btn" aria-label="Eliminar ${label.toLowerCase()} ${i + 1}">&times;</button></div>`;
            card.querySelector('.remove-btn').onclick = () => { state[key].splice(i, 1); rerender(); };
            card.appendChild(miniRow('Edat', pillGroup(ageOpts, m.age, v => { m.age = v; rerender(); })));
            card.appendChild(miniRow('Discapacitat', pillGroup(DISAB_OPTS, m.disability, v => {
                m.disability = v; if (v !== 50) m.help = false; rerender();
            })));
            if (m.disability === 50) card.appendChild(helpToggle(m.help, v => { m.help = v; }));
            list.appendChild(card);
        });
    }

    window.Profile = {
        mount(el, { grossForGroup, watchIds = [] } = {}) {
            el.innerHTML = HTML;
            // La retribució en espècie també compta per a la base de cotització
            initGrupSelect('grup_cotitzacio',
                () => grossForGroup() + (readMoney('retribucio_en_especie_ann') || 0),
                [...watchIds, 'retribucio_en_especie_ann']);
            bindPaguesPills('paguesPills', 'n_pagues');
            initMoneyInputs();
            bindPills('regionPills', 'region');
            bindPills('agePills', 'age');
            bindPills('contractTypePills', 'contract_type');
            renderSelf();
            Object.keys(MEMBERS).forEach(key => {
                renderMembers(key);
                el.querySelector(`[data-add="${key}"]`).onclick = () => { state[key].push(MEMBERS[key].blank()); renderMembers(key); };
            });
        },
        read() {
            const member = m => ({ age: m.age, disability: m.disability, needs_help: m.disability === 50 ? m.help : false });
            return {
                region: $('region').value,
                n_pagues: parseInt($('n_pagues').value),
                pagues_prorratejades: true,
                retribucio_en_especie_ann: readMoney('retribucio_en_especie_ann') || 0,
                grup_cotitzacio: $('grup_cotitzacio').value,
                contract_type: $('contract_type').value,
                other_deductions: readMoney('other_deductions') || 0,
                age: parseInt($('age').value),
                disability_percent_self: state.selfDisability,
                disability_self_help: state.selfDisability === 50 ? state.selfHelp : false,
                children: state.children.map(member),
                ascendants: state.ascendants.map(member),
            };
        },
    };
})();
