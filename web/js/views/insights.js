// Inzichten: smaakprofiel per persoon, prijs-kwaliteit, jaaroverzicht.
import { el, clear, select, typeLabel, TYPE_ICONS, money, stars, wineTitle } from '../util.js';
import { api } from '../api.js';

function bars(rows, { max = null, labelFn = (r) => r.label, valFn = (r) => r.n, fmt = (v) => String(v) } = {}) {
  const m = max ?? Math.max(1, ...rows.map(valFn));
  return el('div', { class: 'bars' }, rows.map((r) => el('div', { class: 'bar' }, el('span', { text: labelFn(r) }), el('div', { class: 'track' }, el('div', { class: 'fill', style: { width: `${Math.max(2, (valFn(r) / m) * 100)}%` } })), el('span', { class: 'small muted', text: fmt(valFn(r)) }))));
}
const scoreBars = (rows) => bars(rows, { max: 100, valFn: (r) => r.avg, labelFn: (r) => `${r.label} (${r.n})`, fmt: (v) => String(v) });

export async function render(main, { query }) {
  main.append(el('h1', { text: 'Inzichten' }));
  const tabs = el('div', { class: 'tabs' }); const body = el('div');
  main.append(tabs, body);
  let mode = ['taste', 'value', 'year'].includes(query.get('tab')) ? query.get('tab') : 'taste';
  for (const [key, label] of [['taste', '👅 Smaakprofielen'], ['value', '💶 Prijs & kwaliteit'], ['year', '📅 Jaaroverzicht']]) {
    const b = el('button', { type: 'button', class: key === mode ? 'active' : '', text: label });
    b.addEventListener('click', () => { mode = key; tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)); show(); });
    tabs.append(b);
  }
  async function show() { clear(body); body.append(el('p', { class: 'muted small', text: 'Laden…' })); const fn = { taste: tasteView, value: valueView, year: yearView }[mode]; await fn(body); }
  show();
}

async function tasteView(body) {
  const d = await api.get('/api/insights/taste'); clear(body);
  if (!d.household.tastings) return body.append(el('div', { class: 'empty' }, el('div', { class: 'big', text: '👅' }), el('p', { text: 'Nog geen proefnotities met een score. Geef bij het openen van een fles een score, dan ontstaat hier jullie smaakprofiel.' })));
  body.append(el('p', { class: 'muted small', text: 'Gemiddelde scores per persoon. Zo zie je wie waarvan houdt — handig bij het inkopen. Minimaal een paar proefnotities per categorie geeft een betrouwbaar beeld.' }));
  if (d.differences.length) {
    const c = el('div', { class: 'card', style: { borderLeft: '4px solid var(--gold)' } }, el('h2', { style: { marginTop: 0 }, text: 'Waar jullie verschillen' }));
    const names = Object.keys(d.differences[0]).filter((k) => !['dim', 'label', 'diff'].includes(k));
    for (const x of d.differences) c.append(el('div', { class: 'row between', style: { padding: '0.3rem 0', borderBottom: '1px solid var(--line)' } }, el('span', {}, el('strong', { text: x.label }), el('span', { class: 'muted small', text: ` (${{ byType: 'type', byGrape: 'druif', byCountry: 'land', byRegion: 'streek' }[x.dim]})` })), el('span', { class: 'small', text: names.map((n) => `${n}: ${x[n]}`).join(' · ') })));
    body.append(c);
  }
  if (d.shared.length) body.append(el('div', { class: 'card' }, el('h2', { style: { marginTop: 0 }, text: '❤️ Gedeelde favorieten (beiden ≥ 88)' }), el('ul', {}, d.shared.map((w) => el('li', {}, el('a', { href: `#/wijn/${w.wine_id}`, text: `${TYPE_ICONS[w.type] || ''} ${wineTitle(w)}` }), el('span', { class: 'muted small', text: ` — ${Object.entries(w.ratings).map(([n, r]) => `${n} ${r}`).join(', ')}` }))))));
  const grid = el('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' } });
  for (const p of d.perUser) {
    if (!p.tastings) { grid.append(el('div', { class: 'card' }, el('h2', { style: { marginTop: 0 }, text: p.user.name }), el('p', { class: 'muted small', text: 'Nog geen scores.' }))); continue; }
    grid.append(el('div', { class: 'card' },
      el('h2', { style: { marginTop: 0 }, text: p.user.name }),
      el('div', { class: 'kpis', style: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' } }, kpi(p.tastings, 'proefnotities'), kpi(p.avg, 'gem. score'), kpi(p.buyAgainRate !== null ? `${p.buyAgainRate}%` : '—', 'opnieuw kopen')),
      el('h3', { text: 'Per type' }), scoreBars(p.byType),
      el('h3', { text: 'Favoriete druiven' }), scoreBars(p.byGrape.slice(0, 6)),
      el('h3', { text: 'Per streek' }), scoreBars(p.byRegion.slice(0, 6)),
      p.byBody.length ? el('div', {}, el('h3', { text: 'Body' }), scoreBars(p.byBody)) : null,
      el('h3', { text: 'Top 5' }), el('ol', { class: 'small' }, p.top.map((w) => el('li', {}, el('a', { href: `#/wijn/${w.wine_id}`, text: wineTitle(w) }), ` — ${w.rating}`)))));
  }
  body.append(grid);
}

async function valueView(body) {
  const d = await api.get('/api/insights/price-quality'); clear(body);
  if (!d.points.length) return body.append(el('div', { class: 'empty' }, el('div', { class: 'big', text: '💶' }), el('p', { text: 'Nog niet genoeg wijnen met zowel een prijs als een score.' })));
  body.append(el('p', { class: 'muted small', text: 'Welke wijnen gaven de meeste punten voor hun geld? "Waarde" is hoeveel punten een wijn scoorde boven wat je op basis van de prijs mag verwachten (ten opzichte van jullie eigen collectie).' }));
  const grid = el('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' } });
  const list = (title, items, cls) => { const c = el('div', { class: 'card' }, el('h2', { style: { marginTop: 0 }, text: title })); if (!items.length) c.append(el('p', { class: 'muted small', text: 'Niets gevonden.' })); for (const p of items) c.append(el('div', { class: 'row between', style: { padding: '0.35rem 0', borderBottom: '1px solid var(--line)' } }, el('div', {}, el('a', { href: `#/wijn/${p.id}`, style: { textDecoration: 'none', color: 'inherit', fontWeight: 600 }, text: `${TYPE_ICONS[p.type] || ''} ${wineTitle(p)}` }), el('div', { class: 'small muted', text: `${money(p.price)} · score ${p.avg_rating} (verwacht ${p.expected})` })), el('span', { class: `badge ${cls}`, text: `${p.value_score > 0 ? '+' : ''}${p.value_score}` }))); return c; };
  grid.append(list('🏆 Beste prijs-kwaliteit', d.bestValue, 'ok'), list('😕 Viel tegen voor de prijs', d.disappointing, 'bad'));
  body.append(grid);
  body.append(el('div', { class: 'card' }, el('h2', { style: { marginTop: 0 }, text: 'Gemiddelde score per prijsklasse' }), bars(d.byBand, { max: 100, valFn: (r) => r.avg, labelFn: (r) => `${r.label} (${r.n})` }),
    el('p', { class: 'small muted', style: { marginTop: '0.6rem' }, text: d.slope > 0 ? `Elke verdubbeling van de prijs levert jullie gemiddeld ${Math.round(d.slope * Math.LN2 * 10) / 10} punten meer op.` : 'Duurder is bij jullie niet per se beter.' })));
  // Eenvoudige scatter: prijs (log) vs score
  const c = el('div', { class: 'card' }, el('h2', { style: { marginTop: 0 }, text: 'Prijs tegenover score' }));
  const W = 600, H = 280, pad = 36;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('preserveAspectRatio', 'xMidYMid meet'); svg.style.width = '100%'; svg.style.maxWidth = '100%'; svg.style.height = 'auto'; svg.style.display = 'block';
  const lp = d.points.map((p) => Math.log(p.price)); const minX = Math.min(...lp), maxX = Math.max(...lp) + 0.01; const minY = Math.min(50, ...d.points.map((p) => p.avg_rating)) - 2, maxY = 100;
  const sx = (x) => pad + ((Math.log(x) - minX) / (maxX - minX)) * (W - pad * 2), sy = (y) => H - pad - ((y - minY) / (maxY - minY)) * (H - pad * 2);
  const mk = (t, a) => { const n = document.createElementNS('http://www.w3.org/2000/svg', t); for (const [k, v] of Object.entries(a)) n.setAttribute(k, v); return n; };
  svg.append(mk('line', { x1: pad, y1: H - pad, x2: W - pad, y2: H - pad, stroke: 'var(--line)' }), mk('line', { x1: pad, y1: pad, x2: pad, y2: H - pad, stroke: 'var(--line)' }));
  for (const v of [10, 20, 50, 100, 200]) if (Math.log(v) >= minX && Math.log(v) <= maxX) { const t = mk('text', { x: sx(v), y: H - pad + 14, 'font-size': 10, 'text-anchor': 'middle', fill: 'var(--muted)' }); t.textContent = `€${v}`; svg.append(t); }
  for (const v of [60, 70, 80, 90, 100]) if (v >= minY) { const t = mk('text', { x: pad - 6, y: sy(v) + 3, 'font-size': 10, 'text-anchor': 'end', fill: 'var(--muted)' }); t.textContent = v; svg.append(t); }
  for (const p of d.points) { const circ = mk('circle', { cx: sx(p.price), cy: sy(p.avg_rating), r: 6, fill: p.value_score >= 3 ? 'var(--ok)' : p.value_score <= -3 ? 'var(--bad)' : 'var(--bordeaux-light)', opacity: 0.85 }); const title = mk('title', {}); title.textContent = `${wineTitle(p)} — ${money(p.price)}, score ${p.avg_rating}`; circ.append(title); svg.append(circ); }
  c.append(svg, el('p', { class: 'small muted', text: 'Groen = beter dan verwacht voor de prijs, rood = minder. Beweeg over een punt voor de naam.' }));
  body.append(c);
}

async function yearView(body) {
  let d = await api.get('/api/insights/year'); clear(body);
  const head = el('div', { class: 'row between' }, el('h2', { style: { margin: 0 }, text: `Wijnjaar ${d.year}` }), null);
  const sel = select((d.years.length ? d.years : [String(d.year)]).map((y) => [y, y]), { value: String(d.year), style: { width: 'auto' } });
  head.lastChild?.remove?.(); head.append(sel);
  const content = el('div');
  body.append(head, content);
  sel.addEventListener('change', async () => { d = await api.get(`/api/insights/year?year=${sel.value}`); head.firstChild.textContent = `Wijnjaar ${d.year}`; draw(); });
  function draw() {
    clear(content);
    const t = d.totals;
    if (!t.consumed && !t.bought) return content.append(el('div', { class: 'empty' }, el('div', { class: 'big', text: '📅' }), el('p', { text: `Nog geen activiteit in ${d.year}.` })));
    content.append(el('div', { class: 'kpis' }, kpi(t.consumed, 'flessen gedronken'), kpi(t.bought, 'flessen gekocht'), kpi(t.gifts_received, 'cadeau gekregen'), kpi(money(t.spent), 'uitgegeven'), kpi(money(t.drunk_value), 'waarde gedronken'), kpi(t.avg_rating ?? '—', 'gem. score'), kpi(t.tastings, 'proefnotities')));
    const hi = el('div', { class: 'grid', style: { marginTop: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' } });
    if (d.best) hi.append(el('div', { class: 'card' }, el('div', { class: 'small muted', text: '🏆 Beste fles van het jaar' }), el('a', { href: `#/wijn/${d.best.wine_id}`, style: { fontFamily: 'var(--font-serif)', fontSize: '1.15rem', textDecoration: 'none', color: 'inherit' }, text: wineTitle(d.best) }), el('div', { class: 'small', text: `${d.best.rating}/100 volgens ${d.best.by}` })));
    if (d.oldest) hi.append(el('div', { class: 'card' }, el('div', { class: 'small muted', text: '🕰️ Oudste fles geopend' }), el('div', { style: { fontFamily: 'var(--font-serif)', fontSize: '1.15rem' }, text: wineTitle(d.oldest) }), el('div', { class: 'small', text: `${d.oldest.age} jaar oud` })));
    if (d.mostDrunk.length) hi.append(el('div', { class: 'card' }, el('div', { class: 'small muted', text: '🔁 Meest gedronken' }), el('div', { style: { fontFamily: 'var(--font-serif)', fontSize: '1.15rem' }, text: d.mostDrunk[0].label }), el('div', { class: 'small', text: `${d.mostDrunk[0].n}× geopend` })));
    if (d.countries.length) hi.append(el('div', { class: 'card' }, el('div', { class: 'small muted', text: '🌍 Landen geproefd' }), el('div', { style: { fontFamily: 'var(--font-serif)', fontSize: '1.15rem' }, text: String(d.countries.length) }), el('div', { class: 'small', text: d.countries.join(', ') })));
    content.append(hi);
    const g = el('div', { class: 'grid', style: { marginTop: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' } });
    g.append(el('div', { class: 'card' }, el('h3', { text: 'Per maand' }), bars(d.byMonth, { labelFn: (r) => ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'][Number(r.label.slice(5, 7)) - 1] })));
    if (d.byType.length) g.append(el('div', { class: 'card' }, el('h3', { text: 'Per type' }), bars(d.byType, { labelFn: (r) => `${TYPE_ICONS[r.label] || ''} ${typeLabel(r.label)}` })));
    if (d.byCountry.length) g.append(el('div', { class: 'card' }, el('h3', { text: 'Per land' }), bars(d.byCountry)));
    if (d.byGrape.length) g.append(el('div', { class: 'card' }, el('h3', { text: 'Druiven' }), bars(d.byGrape)));
    if (d.perPerson.length) g.append(el('div', { class: 'card' }, el('h3', { text: 'Wie opende de fles?' }), bars(d.perPerson)));
    if (d.occasions.length) g.append(el('div', { class: 'card' }, el('h3', { text: 'Gelegenheden' }), bars(d.occasions)));
    if (d.places.length) g.append(el('div', { class: 'card' }, el('h3', { text: 'Waar gedronken' }), bars(d.places)));
    content.append(g);
  }
  draw();
}

function kpi(v, l) { return el('div', { class: 'kpi' }, el('div', { class: 'v', text: String(v ?? '—') }), el('div', { class: 'l', text: l })); }
