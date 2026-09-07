// Spijs & wijn: welke wijn uit onze kelder past bij een gerecht, en andersom.
import { el, clear, select, toast, typeLabel, TYPE_ICONS, wineTitle, drinkStatus } from '../util.js';
import { api } from '../api.js';
import { loadWines } from '../data.js';
import { DISHES, DISH_GROUPS, winesForDish, dishesForWine, matchDishText } from '../pairings.js';
import { wineCard } from './cellar.js';

export async function render(main) {
  const wines = (await loadWines()).filter((w) => w.bottles_in_cellar > 0);
  main.append(el('h1', { text: 'Spijs & wijn' }), el('p', { class: 'muted', text: 'Kies een gerecht en zie welke wijnen uit onze eigen kelder erbij passen — of kies een wijn en ontdek wat je erbij kunt eten.' }));

  const tabs = el('div', { class: 'tabs' });
  const body = el('div');
  main.append(tabs, body);
  const modes = [['gerecht', 'Ik eet… → welke wijn?'], ['wijn', 'Ik open… → wat eten we?']];
  let mode = 'gerecht';
  for (const [key, label] of modes) {
    const b = el('button', { type: 'button', class: key === mode ? 'active' : '', text: label });
    b.addEventListener('click', () => { mode = key; tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)); show(); });
    tabs.append(b);
  }
  function show() { clear(body); (mode === 'gerecht' ? byDish : byWine)(body, wines); }
  show();
}

function byDish(body, wines) {
  const groups = DISH_GROUPS.map((g) => [g, DISHES.filter((d) => d.group === g)]);
  const dishSel = el('select', { 'aria-label': 'Gerecht' });
  dishSel.append(el('option', { value: '', text: '— kies een gerecht —' }));
  for (const [g, ds] of groups) {
    const og = el('optgroup', { label: g });
    for (const d of ds) og.append(el('option', { value: d.id, text: d.name }));
    dishSel.append(og);
  }
  const free = el('input', { type: 'search', placeholder: 'Of typ wat je gaat eten, bijv. "lamsrack met rozemarijn"', maxlength: 300 });
  const aiBtn = el('button', { class: 'btn gold', type: 'button', text: '✨ Vraag de AI-sommelier' });
  body.append(el('div', { class: 'card' }, el('div', { class: 'form-grid' }, el('div', {}, dishSel), el('div', { class: 'full' }, free)), el('div', { class: 'row', style: { marginTop: '0.5rem' } }, aiBtn, el('span', { class: 'muted small', text: 'De AI kijkt naar de hele kelder, inclusief drinkvensters, en legt uit waarom.' }))));

  const result = el('div');
  body.append(result);

  function showRules() {
    clear(result);
    let dishId = dishSel.value;
    if (!dishId && free.value.trim()) { const m = matchDishText(free.value); if (m) { dishId = m.id; dishSel.value = m.id; } }
    if (!dishId) return;
    const matches = winesForDish(wines, dishId);
    const dish = DISHES.find((d) => d.id === dishId);
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
  dishSel.addEventListener('change', showRules);
  free.addEventListener('input', () => { dishSel.value = ''; showRules(); });

  aiBtn.addEventListener('click', async () => {
    const dish = free.value.trim() || (dishSel.value ? DISHES.find((d) => d.id === dishSel.value).name : '');
    if (!dish) return toast('Kies of typ eerst een gerecht', 'error');
    aiBtn.disabled = true; aiBtn.textContent = 'De sommelier denkt na…';
    try {
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
    } catch (e) { toast(e.message, 'error'); } finally { aiBtn.disabled = false; aiBtn.textContent = '✨ Vraag de AI-sommelier'; }
  });
}

function byWine(body, wines) {
  const sel = select([['', '— kies een wijn uit de kelder —'], ...wines.sort((a, b) => wineTitle(a).localeCompare(wineTitle(b), 'nl')).map((w) => [w.id, `${TYPE_ICONS[w.type] || ''} ${wineTitle(w)} (${w.bottles_in_cellar}×)`])]);
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
