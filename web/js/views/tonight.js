// "Wat drinken we vanavond?" en restaurant-modus (wijnkaart fotograferen).
import { el, clear, field, input, toast, typeLabel, TYPE_ICONS, wineTitle, money, drinkStatus, shrinkImage, stars } from '../util.js';
import { api, photoUrl } from '../api.js';

const ROLE = { veilig: ['🎯', 'Veilige keuze', 'ok'], verrassing: ['🎲', 'Verrassing', 'gold'], 'nu-open': ['⏳', 'Nu openen', 'warn'] };

export async function render(main, { query }) {
  main.append(el('h1', { text: 'Vanavond' }));
  const tabs = el('div', { class: 'tabs' });
  const body = el('div');
  main.append(tabs, body);
  let mode = query.get('tab') === 'restaurant' ? 'restaurant' : 'home';
  for (const [key, label] of [['home', '🏠 Thuis: wat drinken we?'], ['restaurant', '🍽️ Restaurant: wijnkaart lezen']]) {
    const b = el('button', { type: 'button', class: key === mode ? 'active' : '', text: label });
    b.addEventListener('click', () => { mode = key; tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)); show(); });
    tabs.append(b);
  }
  function show() { clear(body); (mode === 'home' ? homeView : restaurantView)(body); }
  show();
}

function homeView(body) {
  body.append(el('p', { class: 'muted small', text: 'Eén tik en de huissommelier kiest drie flessen uit jullie kelder: een veilige keuze, een verrassing en iets dat nu open moet. Hij kijkt naar de dag, het seizoen, wat jullie recent dronken, jullie scores en de drinkvensters.' }));
  const dish = input({ placeholder: 'Wat eten we? (optioneel)', maxlength: 200 });
  const mood = input({ placeholder: 'Stemming of gezelschap, bijv. "rustige avond", "vrienden over" (optioneel)', maxlength: 100 });
  const btn = el('button', { class: 'btn gold', type: 'button', text: '🍷 Kies voor vanavond' });
  body.append(el('div', { class: 'card' }, el('div', { class: 'form-grid' }, el('div', { class: 'full' }, dish), el('div', { class: 'full' }, mood)), el('div', { class: 'row', style: { marginTop: '0.5rem' } }, btn)));
  const out = el('div');
  body.append(out);
  btn.addEventListener('click', async () => {
    btn.disabled = true; btn.textContent = 'De sommelier kijkt in de kelder…'; clear(out);
    try {
      const r = await api.post('/api/sommelier/tonight', { dish: dish.value || undefined, mood: mood.value || undefined });
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
