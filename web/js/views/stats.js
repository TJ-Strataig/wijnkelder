// Statistieken: kengetallen, verdeling en drinkvenster-overzicht.
import { el, typeLabel, TYPE_ICONS, money, stars, wineTitle } from '../util.js';
import { api } from '../api.js';

function bars(rows, labelFn = (r) => r.label) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return el('div', { class: 'bars' }, rows.map((r) => el('div', { class: 'bar' },
    el('span', { text: labelFn(r) }), el('div', { class: 'track' }, el('div', { class: 'fill', style: { width: `${(r.n / max) * 100}%` } })), el('span', { class: 'small muted', text: String(r.n) }))));
}

function wineList(title, items, cls, note) {
  const c = el('div', { class: 'card' });
  c.append(el('h2', { style: { marginTop: 0 } }, el('span', { class: `badge ${cls}`, text: String(items.length) }), ` ${title}`));
  if (note) c.append(el('p', { class: 'muted small', text: note }));
  if (!items.length) c.append(el('p', { class: 'muted small', text: 'Geen wijnen in deze categorie.' }));
  for (const w of items) c.append(el('div', { class: 'row between', style: { padding: '0.35rem 0', borderBottom: '1px solid var(--line)' } },
    el('a', { href: `#/wijn/${w.id}`, style: { textDecoration: 'none', color: 'inherit' }, text: `${TYPE_ICONS[w.type] || ''} ${wineTitle(w)}` }),
    el('span', { class: 'small muted', text: `${w.bottles}× · ${w.drink_from || '?'}–${w.drink_until || '?'}` })));
  return c;
}

export async function render(main) {
  const s = await api.get('/api/stats');
  const t = s.totals;
  main.append(el('h1', { text: 'Statistieken' }));
  main.append(el('div', { class: 'kpis' },
    kpi(t.bottles, 'flessen in de kelder'), kpi(t.wines, 'verschillende wijnen'), kpi(money(t.purchase_value), 'aankoopwaarde'),
    kpi(money(t.estimated_value), 'geschatte waarde', 'incl. prijsindicatie voor gekregen flessen'), kpi(t.consumed, 'flessen gedronken'), kpi(t.gifted_bottles, 'gekregen flessen'), kpi(t.tastings, 'proefnotities')));

  const grid = el('div', { class: 'grid', style: { marginTop: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' } });
  grid.append(
    el('div', { class: 'card' }, el('h2', { style: { marginTop: 0 }, text: 'Per type' }), bars(s.byType, (r) => `${TYPE_ICONS[r.label] || ''} ${typeLabel(r.label)}`)),
    el('div', { class: 'card' }, el('h2', { style: { marginTop: 0 }, text: 'Per land' }), bars(s.byCountry)),
    el('div', { class: 'card' }, el('h2', { style: { marginTop: 0 }, text: 'Per jaargang' }), bars(s.byVintage, (r) => (r.label ? String(r.label) : 'Non-vintage'))),
    el('div', { class: 'card' }, el('h2', { style: { marginTop: 0 }, text: 'Gedronken per maand' }), s.consumedPerMonth.length ? bars([...s.consumedPerMonth].reverse()) : el('p', { class: 'muted small', text: 'Nog niets gedronken volgens de app…' })),
  );
  main.append(grid);

  if (s.topRated.length) {
    const c = el('div', { class: 'card', style: { marginTop: '1rem' } });
    c.append(el('h2', { style: { marginTop: 0 }, text: 'Best beoordeeld' }));
    for (const w of s.topRated) c.append(el('div', { class: 'row between', style: { padding: '0.35rem 0', borderBottom: '1px solid var(--line)' } },
      el('a', { href: `#/wijn/${w.id}`, style: { textDecoration: 'none', color: 'inherit' }, text: `${TYPE_ICONS[w.type] || ''} ${wineTitle(w)}` }),
      el('span', {}, el('span', { class: 'stars', text: stars(w.avg_rating) }), el('span', { class: 'small muted', text: ` ${Math.round(w.avg_rating)} (${w.n})` }))));
    main.append(c);
  }

  main.append(el('h2', { text: `Drinkvensters (${s.year})` }));
  const g2 = el('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' } });
  g2.append(
    wineList('Nu op z\'n best', s.drinkNow, 'ok'),
    wineList('Snel drinken', s.drinkSoon, 'warn', 'Het drinkvenster sluit dit of volgend jaar.'),
    wineList('Over het hoogtepunt', s.pastPeak, 'bad', 'Open deze binnenkort — of geniet van het avontuur.'),
    wineList('Nog te jong', s.tooYoung, '', 'Geduld: deze wijnen worden nog beter.'),
  );
  main.append(g2);
}

function kpi(v, l, title) {
  return el('div', { class: 'kpi', title }, el('div', { class: 'v', text: String(v ?? 0) }), el('div', { class: 'l', text: l }));
}
