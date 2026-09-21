// Blindproeverijen: de organisator ziet de wijnen pas na onthullen; deelnemers
// kunnen met de code op een kaart anoniem hun proefnotitie insturen.
import * as util from '../util.js';
import { api } from '../api.js';

const { el, clear, field, input, select, toast, modal, fmtDateTime, wineTitle } = util;
const endpoint = '/api/blind-tastings';

export async function render(main, { params, query, navigate }) {
  if (params?.[0]) return detail(main, params[0], navigate);
  const list = el('div', { class: 'stack' });
  main.append(el('div', { class: 'row between' }, el('h1', { text: 'Blindproeven' }),
    el('button', { class: 'btn gold', type: 'button', text: '＋ Nieuwe blindproeverij', onClick: () => createDialog(load, query?.get('evening')) })), list);
  async function load() {
    clear(list);
    const data = await api.get(endpoint);
    const tastings = data.blind_tastings || data.tastings || [];
    if (!tastings.length) return list.append(el('div', { class: 'empty' },
      el('div', { class: 'big', text: '🕵️' }), el('p', { text: 'Nog geen blindproeverijen.' }),
      el('button', { class: 'btn gold', type: 'button', text: '＋ Blindproeverij maken', onClick: () => createDialog(load, query?.get('evening')) })));
    tastings.forEach((t) => list.append(el('a', { class: 'card row between', href: `#/blindproeven/${t.id}`, style: { textDecoration: 'none', color: 'inherit' } },
      el('div', {}, el('strong', { text: t.name || t.title || 'Blindproeverij' }),
        el('div', { class: 'small muted', text: `${t.code_count ?? t.wine_count ?? 0} kaarten${t.evening_name ? ` · ${t.evening_name}` : ''}${t.status ? ` · ${statusLabel(t.status)}` : ''}` })),
      el('span', { class: 'muted', text: '→' }))));
  }
  await load();
}

function statusLabel(s) { return ({ draft: 'Concept', open: 'Actief', active: 'Actief', revealed: 'Onthuld', cancelled: 'Geannuleerd', completed: 'Afgerond' })[s] || s; }

async function detail(main, id, navigate) {
  const page = el('div', { class: 'stack' }); main.append(page);
  async function load() {
    clear(page);
    const data = await api.get(`${endpoint}/${id}`);
    const tasting = data.blind_tasting || data.tasting || data;
    const codes = data.codes || tasting.codes || [];
    const revealed = tasting.revealed || tasting.status === 'revealed';
    const owner = tasting.created_by_me ?? tasting.is_creator ?? true;
    page.append(el('a', { href: '#/blindproeven', class: 'muted small', text: '← Alle blindproeverijen' }),
      el('div', { class: 'row between' }, el('h1', { text: tasting.name || tasting.title || 'Blindproeverij' }),
        owner ? el('div', { class: 'row' },
          tasting.status === 'draft' && el('button', { class: 'btn gold sm', type: 'button', text: 'Openen', onClick: async () => {
            await api.post(`${endpoint}/${id}/open`); load();
          } }),
          !revealed && tasting.status === 'open' && el('button', { class: 'btn gold sm', type: 'button', text: 'Onthullen', onClick: async () => {
            if (window.confirm('De wijnen onthullen? Dit kan niet ongedaan worden gemaakt.')) { await api.post(`${endpoint}/${id}/reveal`); load(); }
          } }),
          !revealed && tasting.status !== 'cancelled' && el('button', { class: 'btn ghost sm', type: 'button', text: 'Annuleren', onClick: async () => {
            if (window.confirm('Deze blindproeverij annuleren?')) { await api.post(`${endpoint}/${id}/cancel`); load(); }
          } })) : null),
      el('div', { class: 'card small muted', text: `${tasting.evening_name ? `Avond: ${tasting.evening_name} · ` : ''}${codes.length} actieve kaart${codes.length === 1 ? '' : 'en'}${revealed ? ' · resultaten onthuld' : ''}` }));
    const cards = el('div', { class: 'stack' });
    if (!codes.length) cards.append(el('div', { class: 'empty' }, el('p', { text: 'Geen proefkaarten gevonden.' })));
    codes.forEach((code) => cards.append(codeCard(id, code, revealed, owner, load)));
    page.append(cards);
    if (revealed && (data.results || tasting.results)) page.append(results(data.results || tasting.results));
  }
  await load();
}

function codeCard(id, code, revealed, owner, reload) {
  const value = code.code || code.token || code.id;
  const wine = code.wine || (code.name || code.wine_name ? { name: code.name || code.wine_name, producer: code.producer, vintage: code.vintage } : null);
  const note = code.tasting || code.note || {};
  const rating = input({ type: 'number', min: 1, max: 100, value: note.rating ?? '', placeholder: '1–100' });
  const notes = el('textarea', { rows: 3, maxlength: 2000, placeholder: 'Geur, smaak en afdronk…' }); notes.value = note.notes || '';
  const aromas = input({ value: note.aromas || '', placeholder: 'Aroma’s (komma-gescheiden)' });
  const card = el('div', { class: 'card stack' },
    el('div', { class: 'row between' }, el('h2', { text: `Kaart ${value || '—'}` }),
      revealed && wine ? el('strong', { class: 'gold-text', text: wineTitle(wine) }) : el('span', { class: 'badge', text: 'Blind' })),
    !revealed ? el('p', { class: 'muted small', text: 'Gebruik deze code om anoniem te proeven en je notitie in te sturen.' }) : null,
    el('div', { class: 'tasting-fields' }, field('Score', rating), field('Aroma’s', aromas), field('Notitie', notes)));
  if (!revealed) card.append(el('button', { class: 'btn gold', type: 'button', text: 'Notitie bewaren', onClick: async () => {
    await api.post(`${endpoint}/${id}/codes/${encodeURIComponent(value)}/tasting`, { rating: rating.value === '' ? null : Number(rating.value), aromas: aromas.value, notes: notes.value });
    toast('Je proefnotitie is bewaard.', 'ok');
  } }));
  if (revealed && code.result) card.append(el('div', { class: 'note small' }, el('strong', { text: 'Resultaat' }), ` ${code.result.average ?? code.result.avg_rating ?? '—'} gemiddeld`));
  return card;
}

function results(items) {
  return el('div', { class: 'card stack' }, el('h2', { text: 'Resultaten' }),
    ...(Array.isArray(items) ? items : []).map((r, i) => el('div', { class: 'row between' },
      el('span', { text: r.wine ? wineTitle(r.wine) : r.name ? wineTitle(r) : r.wine_name || `Wijn ${i + 1}` }),
      el('strong', { text: `${r.average ?? r.avg_rating ?? '—'}${r.count ? ` (${r.count} scores)` : ''}` }))));
}

async function createDialog(reload, eveningId = '') {
  const name = input({ placeholder: 'Bijv. Bourgogne blind', maxlength: 120 });
  const evening = select([['', 'Geen avond']]);
  const selection = select([['', 'Geen selectie']]);
  const wines = el('div', { class: 'stack' });
  try {
    const [e, s] = await Promise.all([api.get('/api/evenings'), api.get('/api/selections')]);
    (e.evenings || []).forEach((x) => evening.append(el('option', { value: x.id, text: x.title || x.name || fmtDateTime(x.starts_at) })));
    (s.selections || []).forEach((x) => selection.append(el('option', { value: x.id, text: x.name })));
  } catch { /* opties zijn aanvullend */ }
  if (eveningId) {
    evening.value = eveningId;
    try {
      const { evening: selectedEvening } = await api.get(`/api/evenings/${encodeURIComponent(eveningId)}`);
      if (selectedEvening?.selection_id) selection.value = selectedEvening.selection_id;
    } catch { /* de avond is optioneel */ }
  }
  async function loadWines() {
    clear(wines);
    if (!selection.value) return wines.append(el('small', { class: 'muted', text: 'Kies een selectie om de wijnen te laden.' }));
    const data = await api.get(`/api/selections/${selection.value}`);
    (data.wines || []).forEach((w) => {
      const cb = el('input', { type: 'checkbox', value: w.id, checked: true });
      wines.append(el('label', { class: 'check' }, cb, wineTitle(w)));
    });
  }
  selection.addEventListener('change', loadWines);
  await loadWines();
  modal({ title: 'Nieuwe blindproeverij', body: el('div', { class: 'stack' },
    field('Naam *', name), field('Avond', evening), field('Wijnselectie', selection),
    el('div', {}, el('strong', { text: 'Wijnen' }), wines)),
    actions: [{ label: 'Annuleren', class: 'ghost' }, { label: 'Aanmaken', class: 'gold', onClick: async () => {
      if (!name.value.trim()) { toast('Een naam is verplicht.', 'error'); return true; }
      const wine_ids = [...wines.querySelectorAll('input[type="checkbox"]:checked')].map((x) => x.value);
      if (!wine_ids.length) { toast('Kies minstens één wijn.', 'error'); return true; }
      await api.post(endpoint, { name: name.value.trim(), evening_id: evening.value || null, selection_id: selection.value || null, wine_ids });
      reload();
    } }] });
}
