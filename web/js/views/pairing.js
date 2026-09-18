// Spijs & wijn: welke wijn uit onze kelder past bij een gerecht, en andersom.
import { el, clear, select, typeLabel, TYPE_ICONS, wineTitle, drinkStatus } from '../util.js';
import { api } from '../api.js';
import { DISHES, winesForDish, dishesForWine, matchDishText } from '../pairings.js';
import { wineCard } from './cellar.js';

export function renderDishMatches(result, wines, dishText, selectedId = '') {
  clear(result);
  if (!wines.length) return result.append(el('p', { class: 'muted', text: 'Er zijn geen flessen in de kelder om te combineren.' }));
  if (!dishText) return;
  const dish = selectedId ? DISHES.find((d) => d.id === selectedId) : matchDishText(dishText);
  if (!dish) return result.append(el('p', { class: 'muted small', text: 'Geen vaste spijs-wijnregel herkend. Vraag de sommelier om advies bij dit gerecht.' }));
  const matches = winesForDish(wines, dish.id);
  result.append(el('h2', { text: `Uit onze kelder bij ${dish.name.toLowerCase()}` }));
  if (!matches.length) return result.append(el('p', { class: 'muted', text: 'Geen passende wijn in de kelder. Misschien iets voor de verlanglijst?' }));
  result.append(el('p', { class: 'muted small', text: `Passende stijlen: ${Object.keys(dish.types).map(typeLabel).join(', ')} · druiven: ${dish.grapes.slice(0, 6).join(', ')}` }));
  const grid = el('div', { class: 'grid' });
  for (const { wine, score } of matches.slice(0, 12)) {
    const card = wineCard(wine);
    card.querySelector('.badges').prepend(el('span', { class: 'badge gold', text: `Match ${score}%` }));
    grid.append(card);
  }
  result.append(grid);
}

export async function renderPairingAdvice(result, wines, dish) {
  const res = await api.post('/api/ai/pair', { dish });
  clear(result);
  result.append(el('h2', { text: `Advies van de sommelier bij "${dish}"` }));
  if (res.summary) result.append(el('p', { text: res.summary }));
  if (!res.suggestions.length) result.append(el('p', { class: 'muted', text: 'Geen passende wijn gevonden in de kelder.' }));
  for (const s of res.suggestions) {
    const w = wines.find((x) => x.id === s.wine_id);
    if (!w) continue;
    const st = drinkStatus(w);
    result.append(el('div', { class: 'card suggestion' },
      el('div', { class: 'score', text: s.score !== null ? `${s.score}` : '★' }),
      el('div', {},
        el('a', { href: `#/wijn/${w.id}`, style: { fontWeight: 600, textDecoration: 'none', color: 'inherit', fontSize: '1.05rem' }, text: `${TYPE_ICONS[w.type] || ''} ${wineTitle(w)}` }),
        el('div', { class: 'small muted', text: [typeLabel(w.type), w.region || w.country, `${w.bottles_in_cellar} fles(sen)`, st?.label].filter(Boolean).join(' · ') }),
        el('p', { style: { margin: '0.4rem 0 0' }, text: s.reason || '' }),
        s.serving_tip ? el('div', { class: 'small', text: `Serveertip: ${s.serving_tip}` }) : null)));
  }
}

export function renderByWine(body, wines) {
  if (!wines.length) return body.append(el('p', { class: 'muted', text: 'Er zijn geen flessen in de kelder om een gerecht bij te kiezen.' }));
  const sel = select([['', '— kies een wijn uit de kelder —'], ...wines.sort((a, b) => wineTitle(a).localeCompare(wineTitle(b), 'nl')).map((w) => [w.id, `${TYPE_ICONS[w.type] || ''} ${wineTitle(w)} (${w.bottles_in_cellar}×)`])], { 'aria-label': 'Kies een wijn' });
  const result = el('div');
  body.append(el('div', { class: 'card' }, sel), result);
  sel.addEventListener('change', async () => {
    clear(result);
    const w = wines.find((x) => x.id === sel.value);
    if (!w) return;
    const rules = dishesForWine(w, { min: 40, limit: 10 });
    result.append(el('h2', { text: `Lekker bij ${wineTitle(w)}` }));
    if (w.food_pairings?.length) result.append(el('div', { class: 'pill-list', style: { marginBottom: '0.6rem' } }, w.food_pairings.map((p) => el('span', { class: 'badge gold', text: p }))));
    const list = el('div', { class: 'bars' });
    for (const r of rules) list.append(el('div', { class: 'bar' }, el('span', { text: r.dish.name }), el('div', { class: 'track' }, el('div', { class: 'fill', style: { width: `${r.score}%` } })), el('span', { class: 'small muted', text: `${r.score}%` })));
    result.append(list.childElementCount ? list : el('p', { class: 'muted', text: 'Geen regels gevonden; vraag de AI-sommelier op de detailpagina.' }));
    result.append(el('p', { style: { marginTop: '0.8rem' } }, el('a', { class: 'btn secondary sm', href: `#/wijn/${w.id}`, text: 'Naar de wijn → AI-sommelier vragen' })));
  });
}
