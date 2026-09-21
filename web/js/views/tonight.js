// "Wat drinken we vanavond?" en restaurant-modus (wijnkaart fotograferen).
import { el, clear, field, input, toast, typeLabel, TYPE_ICONS, wineTitle, money, drinkStatus, shrinkImage } from '../util.js';
import { api } from '../api.js';
import { loadWines } from '../data.js';
import { DISHES, DISH_GROUPS } from '../pairings.js';
import { renderDishMatches, renderPairingAdvice, renderByWine } from './pairing.js';

const ROLE = { veilig: ['🎯', 'Veilige keuze', 'ok'], verrassing: ['🎲', 'Verrassing', 'gold'], 'nu-open': ['⏳', 'Nu openen', 'warn'] };

export async function render(main, { query = new URLSearchParams() } = {}) {
  main.classList.add('tonight-page');
  main.append(el('h1', { text: 'Vanavond' }), el('p', { class: 'muted', text: 'Spijs & wijn, een fles voor de avond of advies in het restaurant — alles op één plek.' }));
  const tabs = el('div', { class: 'tabs' });
  const body = el('div');
  main.append(tabs, body);
  let mode = ['wijn', 'restaurant'].includes(query.get('tab')) ? query.get('tab') : 'home';
  const panels = new Map();
  for (const [key, label] of [['home', '🏠 Gerecht & avondadvies'], ['wijn', '🍷 Wat eten we bij deze wijn?'], ['restaurant', '🍽️ Restaurant: wijnkaart lezen']]) {
    const b = el('button', { type: 'button', class: key === mode ? 'active' : '', text: label });
    b.setAttribute('aria-pressed', String(key === mode));
    b.addEventListener('click', () => {
      mode = key;
      tabs.querySelectorAll('button').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      window.history.replaceState(null, '', key === 'home' ? '#/vanavond' : `#/vanavond?tab=${key}`);
      show();
    });
    tabs.append(b);
  }
  function show() {
    for (const [key, panel] of panels) panel.hidden = key !== mode;
    if (panels.has(mode)) return;
    const panel = el('div');
    panels.set(mode, panel);
    body.append(panel);
    if (mode === 'home') homeView(panel);
    else if (mode === 'restaurant') restaurantView(panel);
    else wineView(panel);
  }
  show();
}

function homeView(body) {
  body.append(el('p', { class: 'muted small', text: 'Kies of typ een gerecht voor directe spijs-wijnmatches uit jullie kelder. De huissommelier combineert het gerecht en jullie stemming met scores, drinkvensters en wat jullie recent dronken: een veilige keuze, een verrassing en iets dat nu open moet. Ook zonder gerecht kun je avondadvies vragen.' }),
    el('a', { class: 'btn secondary sm', href: '#/avonden', text: '🌙 Bewaar als avond' }));
  const dishSel = el('select', { 'aria-label': 'Kies een gerecht' }, el('option', { value: '', text: '— kies een gerecht (optioneel) —' }));
  for (const group of DISH_GROUPS) {
    dishSel.append(el('optgroup', { label: group }, DISHES.filter((d) => d.group === group).map((d) => el('option', { value: d.id, text: d.name }))));
  }
  const dish = input({ placeholder: 'Of typ je gerecht, bijv. lamsrack met rozemarijn', maxlength: 200 });
  const mood = input({ placeholder: 'Stemming of gezelschap, bijv. "rustige avond", "vrienden over" (optioneel)', maxlength: 100 });
  const btn = el('button', { class: 'btn gold', type: 'button', text: '🍷 Kies voor vanavond' });
  const pairBtn = el('button', { class: 'btn secondary', type: 'button', text: '✨ Uitgebreid wijnadvies bij gerecht', disabled: true });
  body.append(el('div', { class: 'card' }, el('div', { class: 'form-grid' },
    field('Gerecht uit de lijst', dishSel), field('Eigen gerecht', dish), field('Stemming of gezelschap', mood)),
    el('div', { class: 'row', style: { marginTop: '0.5rem' } }, btn, pairBtn),
    el('p', { class: 'muted small', text: 'Directe matches gebruiken vaste regels, zonder AI. Avondadvies neemt ook je stemming mee; uitgebreid wijnadvies richt zich op het gerecht. AI wordt alleen op verzoek gebruikt.' })));
  const out = el('div', { 'aria-live': 'polite' });
  const pairOut = el('div', { 'aria-live': 'polite' });
  const matches = el('div', { 'aria-live': 'polite' });
  body.append(out, pairOut, matches);
  let wines = null;
  let revision = 0;
  let pairingBusy = false;
  const dishText = () => dish.value.trim() || DISHES.find((d) => d.id === dishSel.value)?.name || '';
  function updateMatches() {
    pairBtn.disabled = !wines || !dishText() || pairingBusy;
    if (wines) renderDishMatches(matches, wines, dishText(), dishSel.value);
  }
  function changed() { revision++; clear(out); clear(pairOut); updateMatches(); }
  dishSel.addEventListener('change', () => { dish.value = ''; changed(); });
  dish.addEventListener('input', () => { dishSel.value = ''; changed(); });
  mood.addEventListener('input', changed);
  async function loadMatches() {
    clear(matches); matches.append(el('p', { class: 'muted small', text: 'Kelder laden voor spijs-wijnmatches…' }));
    try {
      wines = (await loadWines()).filter((w) => w.bottles_in_cellar > 0);
      updateMatches();
    } catch (e) {
      clear(matches);
      matches.append(el('p', { class: 'muted', text: `Spijs-wijnmatches konden niet worden geladen: ${e.message}` }),
        el('button', { class: 'btn secondary sm', type: 'button', text: 'Kelder opnieuw laden', onClick: loadMatches }));
    }
  }
  loadMatches();
  pairBtn.addEventListener('click', async () => {
    const text = dishText();
    if (!text) return toast('Kies of typ eerst een gerecht', 'error');
    if (!wines || pairingBusy) return;
    const current = revision;
    pairingBusy = true; updateMatches();
    pairBtn.textContent = 'De sommelier denkt na…'; clear(pairOut);
    try {
      const result = el('div');
      await renderPairingAdvice(result, wines, text);
      if (current === revision) pairOut.append(result);
    } catch (e) { toast(e.message, 'error'); }
    finally { pairingBusy = false; pairBtn.textContent = '✨ Uitgebreid wijnadvies bij gerecht'; updateMatches(); }
  });
  btn.addEventListener('click', async () => {
    const current = revision;
    btn.disabled = true; btn.textContent = 'De sommelier kijkt in de kelder…'; clear(out);
    try {
      const r = await api.post('/api/sommelier/tonight', { dish: dishText() || undefined, mood: mood.value.trim() || undefined });
      if (current !== revision) return;
      out.append(el('h2', { text: 'Advies voor vanavond' }));
      if (r.summary) out.append(el('p', { style: { fontFamily: 'var(--font-serif)', fontSize: '1.1rem' }, text: r.summary }));
      if (!r.picks.length) out.append(el('p', { class: 'muted', text: 'Geen suggestie gevonden — is de kelder leeg?' }));
      for (const p of r.picks) {
        const [ico, label, cls] = ROLE[p.role] || ROLE.veilig;
        const w = p.wine; const st = drinkStatus(w);
        out.append(el('div', { class: 'card suggestion' }, el('div', { class: 'score', style: { fontSize: '1.8rem' }, text: ico }),
          el('div', {}, el('span', { class: `badge ${cls}`, text: label }),
            el('div', {}, el('a', { href: `#/wijn/${w.id}`, style: { fontWeight: 600, fontSize: '1.05rem', textDecoration: 'none', color: 'inherit' }, text: `${TYPE_ICONS[w.type] || ''} ${wineTitle(w)}` })),
            el('div', { class: 'small muted', text: [typeLabel(w.type), w.region || w.country, `${w.bottles} fles${w.bottles === 1 ? '' : 'sen'}`, w.avg_rating ? `jullie score ${Math.round(w.avg_rating)}` : null, st?.label].filter(Boolean).join(' · ') }),
            el('p', { style: { margin: '0.4rem 0 0' }, text: p.reason || '' }), p.serve ? el('div', { class: 'small', text: `Serveertip: ${p.serve}` }) : null,
            el('div', { class: 'row', style: { marginTop: '0.5rem' } }, el('a', { class: 'btn sm', href: `#/wijn/${w.id}`, text: 'Openen & proefnotitie →' })))));
      }
      out.append(el('button', { class: 'btn ghost sm', type: 'button', text: '🔄 Andere suggesties', onClick: () => btn.click() }));
    } catch (e) { toast(e.message, 'error'); } finally { btn.disabled = false; btn.textContent = '🍷 Kies voor vanavond'; }
  });
}

async function wineView(body) {
  clear(body);
  body.append(el('p', { class: 'muted small', text: 'Kelder laden…' }));
  try {
    const wines = (await loadWines()).filter((w) => w.bottles_in_cellar > 0);
    clear(body);
    body.append(el('p', { class: 'muted', text: 'Kies een wijn uit jullie kelder en ontdek welke gerechten erbij passen.' }));
    renderByWine(body, wines);
  } catch (e) {
    clear(body);
    body.append(el('p', { class: 'muted', text: `Kelder kon niet worden geladen: ${e.message}` }),
      el('button', { class: 'btn secondary sm', type: 'button', text: 'Opnieuw proberen', onClick: () => wineView(body) }));
  }
}

function restaurantView(body) {
  body.append(el('p', { class: 'muted small', text: 'Fotografeer de wijnkaart. De sommelier leest hem, markeert wat jullie al kennen (met jullie eigen score) en adviseert wat het beste past bij jullie smaak, het gerecht en het budget.' }));
  const dish = input({ placeholder: 'Wat gaan we eten? (optioneel)', maxlength: 200 });
  const budget = el('input', { type: 'number', min: 0, placeholder: 'Budget per fles € (optioneel)' });
  const fileInput = el('input', { type: 'file', accept: 'image/*', hidden: true });
  const drop = el('div', { class: 'dropzone', tabindex: 0, role: 'button' }, el('div', { style: { fontSize: '2rem' }, text: '📜' }), el('div', { text: 'Fotografeer of kies de wijnkaart' }), el('div', { class: 'muted small', text: 'Bij een lange kaart: één foto per pagina, één voor één.' }));
  drop.addEventListener('click', () => fileInput.click());
  const preview = el('img', { class: 'preview', alt: '', hidden: true });
  const out = el('div');
  body.append(el('div', { class: 'card' }, el('div', { class: 'form-grid' }, dish, budget), drop, fileInput, preview), out);
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0]; if (!f) return;
    clear(out); out.append(el('p', { class: 'muted small', text: 'De sommelier leest de kaart…' }));
    try {
      const { dataUrl } = await shrinkImage(f, 2000, 0.88);
      preview.src = dataUrl; preview.hidden = false;
      const r = await api.post('/api/sommelier/restaurant', { image: dataUrl, dish: dish.value || undefined, budget: budget.value || undefined });
      clear(out);
      if (r.summary) out.append(el('div', { class: 'card', style: { borderLeft: '4px solid var(--gold)' } }, el('p', { style: { margin: 0, fontFamily: 'var(--font-serif)', fontSize: '1.05rem' }, text: r.summary }), r.avoid?.length ? el('p', { class: 'small muted', style: { margin: '0.4rem 0 0' }, text: `Liever niet: ${r.avoid.join(' · ')}` }) : null));
      if (!r.wines.length) return out.append(el('p', { class: 'muted', text: 'Geen wijnen herkend op de foto. Probeer een scherpere foto of dichterbij.' }));
      const tbl = el('table', { class: 'table' });
      tbl.append(el('thead', {}, el('tr', {}, ['Match', 'Wijn', 'Prijs', 'Waarom'].map((h) => el('th', { text: h })))));
      const tb = el('tbody');
      for (const w of r.wines) {
        tb.append(el('tr', { style: r.top3.includes(w.name) ? { background: 'rgba(201,162,74,0.12)' } : {} },
          el('td', {}, el('span', { class: `badge ${w.fit >= 75 ? 'ok' : w.fit >= 50 ? 'gold' : ''}`, text: w.fit !== null ? `${w.fit}%` : '—' })),
          el('td', {}, el('strong', { text: `${TYPE_ICONS[w.type] || ''} ${[w.producer, w.name, w.vintage].filter(Boolean).join(' ')}` }), w.known ? el('div', { class: 'small', style: { color: 'var(--ok)' } }, '✓ Bekend', w.known_note ? ` — ${w.known_note}` : '') : null),
          el('td', { class: 'small', text: w.price ? `${money(w.price)}${w.by_glass ? ' /glas' : ''}` : '—' }),
          el('td', { class: 'small', text: w.reason || '' })));
      }
      tbl.append(tb); out.append(el('div', { class: 'card table-wrap' }, tbl));
      out.append(el('p', { class: 'small muted', text: 'Gedronken en bevallen? Voeg de fles toe via Toevoegen → "Al gedronken → direct naar de historie" met de naam van het restaurant.' }), el('a', { class: 'btn secondary sm', href: '#/toevoegen', text: 'Fles vastleggen in de historie' }));
    } catch (e) { clear(out); toast(e.message, 'error'); }
    fileInput.value = '';
  });
}
