// Shared top bar + topic toggles for all prototypes
(function () {
  const pages = [
    ['index.html', 'Overview'],
    ['dataflow.html', 'A · Dependency graph'],
    ['flowchart.html', 'B · Flowchart'],
    ['zoommap.html', 'C · Zoomable map'],
    ['waterfall.html', 'D · Live walkthrough'],
  ];
  const here = location.pathname.split('/').pop() || 'index.html';
  const bar = document.createElement('header');
  bar.className = 'topbar';
  bar.innerHTML = `<h1>IRPF 2026 · Algoritmo de retenciones</h1><nav>${pages.map(([h, t]) =>
    `<a href="${h}" class="${h === here ? 'active' : ''}">${t}</a>`).join('')}</nav>`;
  document.body.prepend(bar);

  // topic state persisted per viewer
  const KEY = 'irpf-topics-v2';
  let state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
  const T = IRPF.topics;
  for (const k in T) if (!(k in state)) state[k] = T[k].default;
  state.core = true;

  window.Topics = {
    on: k => !!state[k],
    visible: n => !!state[n.topic],
    render(el, onChange) {
      el.innerHTML = Object.entries(T).map(([k, t]) => `
        <label class="topic"><input type="checkbox" data-k="${k}" ${state[k] ? 'checked' : ''} ${t.locked ? 'disabled' : ''}>
        ${t.label}${t.excluded ? '<span class="ask">out</span>' : ''}</label>`).join('') +
        `<div style="margin-top:8px;display:flex;gap:6px"><button class="btn" data-all="1">All</button><button class="btn" data-all="0">Final scope</button></div>`;
      el.querySelectorAll('input').forEach(i => i.onchange = () => {
        state[i.dataset.k] = i.checked; save(); onChange();
      });
      el.querySelectorAll('[data-all]').forEach(b => b.onclick = () => {
        for (const k in T) state[k] = b.dataset.all === '1' ? true : !T[k].excluded;
        save(); this.render(el, onChange); onChange();
      });
    },
  };
  const fmt = v => typeof v === 'number' ? v.toLocaleString('es-ES', { maximumFractionDigits: 2, useGrouping: 'always' }) : v === true ? 'S' : v === false ? 'N' : (v ?? '');
  window.fmtVal = fmt;
  const usedBy = {};
  IRPF.nodes.forEach(n => n.deps.forEach(d => (usedBy[d] = usedBy[d] || []).push(n.id)));
  window.Detail = {
    render(el, id, values, onPick) {
      const n = IRPF.byId[id];
      if (!n) { el.innerHTML = '<div class="lb">Click a node to see its formula, inputs and what it feeds.</div>'; return; }
      const chips = ids => ids.map(d => `<span class="chip" data-id="${d}">${IRPF.byId[d].name}</span>`).join('') || '<i>—</i>';
      el.innerHTML = `<div class="detail">
        <div class="nm">${n.name}</div><div class="lb">${n.label} · <a href="https://sede.agenciatributaria.gob.es/static_files/Sede/Programas_ayuda/Retenciones/2026/Algoritmo%20Retenciones-2026_10sept.pdf#page=${n.p}" target="_blank">PDF p.${n.p}</a> · <span style="color:var(--niche)">${IRPF.topics[n.topic].label}</span></div>
        ${n.desc ? `<div>${n.desc}</div>` : ''}
        ${n.f ? `<pre>${n.f}</pre>` : ''}
        ${n.note ? `<div style="font-size:12px;color:var(--decision)">⚠ ${n.note}</div>` : ''}
        ${values && id in values ? `<div style="margin:6px 0">Example value: <span class="val">${fmt(values[id])}</span></div>` : ''}
        <div style="margin-top:8px"><b>Depends on</b><br>${chips(n.deps)}</div>
        <div style="margin-top:6px"><b>Feeds into</b><br>${chips(usedBy[id] || [])}</div></div>`;
      el.querySelectorAll('.chip').forEach(c => c.onclick = () => onPick(c.dataset.id));
    },
  };

  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
})();
