import * as util from '../util.js';
import { api } from '../api.js';

const { el, clear, field, input, toast, select, modal, fmtDateTime } = util;
const statuses = [['planned', 'Gepland'], ['completed', 'Afgerond'], ['cancelled', 'Geannuleerd']];
const kinds = [['home', 'Thuis'], ['restaurant', 'Restaurant']];

export async function render(main, { params, navigate }) {
  if (params?.[0]) return detail(main, params[0], navigate);
  main.append(el('div', { class: 'row between' }, el('h1', { text: 'Avondplanning' }),
    el('button', { class: 'btn gold', type: 'button', text: '＋ Nieuwe avond', onClick: () => eveningDialog(load) })));
  const filters = el('div', { class: 'row' });
  const status = select([['', 'Alle statussen'], ...statuses], { 'aria-label': 'Filter status' });
  filters.append(status); main.append(filters);
  const list = el('div', { class: 'stack' }); main.append(list);
  async function load() {
    clear(list);
    const { evenings } = await api.get(`/api/evenings${status.value ? `?status=${encodeURIComponent(status.value)}` : ''}`);
    if (!evenings.length) return list.append(el('div', { class: 'empty' }, el('div', { class: 'big', text: '🌙' }),
      el('p', { text: 'Nog geen geplande avonden. Plan een diner of restaurantbezoek.' }),
      el('button', { class: 'btn gold', type: 'button', text: '＋ Nieuwe avond', onClick: () => eveningDialog(load) })));
    for (const evening of evenings) list.append(card(evening));
  }
  status.addEventListener('change', load);
  await load();
}

function card(e) {
  const label = e.kind === 'restaurant' ? `🍽️ ${e.restaurant_name || 'Restaurant'}` : '🏠 Thuis';
  return el('a', { class: 'card row between', href: `#/avonden/${e.id}`, style: { textDecoration: 'none', color: 'inherit' } },
    el('div', {}, el('strong', { text: e.title || label }), el('div', { class: 'small muted', text: `${fmtDateTime(e.starts_at)} · ${statusLabel(e.status)}${e.selection_name ? ` · ${e.selection_name}` : ''}` })),
    el('span', { class: 'muted', text: '→' }));
}

function statusLabel(value) { return statuses.find(([key]) => key === value)?.[1] || value; }

async function detail(main, id, navigate) {
  const page = el('div', { class: 'stack' }); main.append(page);
  async function load() {
    clear(page);
    const { evening: e } = await api.get(`/api/evenings/${id}`);
    const label = e.kind === 'restaurant' ? `🍽️ ${e.restaurant_name || 'Restaurant'}` : '🏠 Thuis';
    page.append(el('a', { href: '#/avonden', class: 'muted small', text: '← Alle avonden' }),
      el('div', { class: 'row between' }, el('h1', { text: e.title || label }),
        el('div', { class: 'row' }, el('button', { class: 'btn secondary sm', type: 'button', text: 'Bewerken', onClick: () => eveningDialog(load, e) }),
          el('button', { class: 'btn ghost sm', type: 'button', text: 'Verwijderen', onClick: async () => { if (window.confirm('Deze avond verwijderen?')) { await api.del(`/api/evenings/${id}`); navigate('/avonden'); } } }))),
      el('div', { class: 'card stack' }, el('div', { text: `${fmtDateTime(e.starts_at)}${e.ends_at ? ` – ${fmtDateTime(e.ends_at)}` : ''}` }),
        el('div', { text: `${label} · ${statusLabel(e.status)}` }),
        e.restaurant_address ? el('div', { class: 'muted', text: e.restaurant_address }) : null,
        e.dish ? el('div', { text: `Gerecht/menu: ${e.dish}` }) : null,
        e.mood ? el('div', { text: `Stemming: ${e.mood}` }) : null,
        e.guests ? el('div', { text: `Gasten: ${e.guests}` }) : null,
        e.notes ? el('p', { text: e.notes }) : null,
        e.selection_id ? el('a', { href: `#/selecties/${e.selection_id}`, text: `Selectie: ${e.selection_name || 'openen'} →` }) : null));
  }
  await load();
}

async function eveningDialog(reload, existing = null) {
  const title = input({ value: existing?.title || '', maxlength: 300 });
  const starts = input({ type: 'datetime-local', value: localValue(existing?.starts_at) });
  const ends = input({ type: 'datetime-local', value: localValue(existing?.ends_at) });
  const kind = select(kinds, { value: existing?.kind || 'home' });
  const status = select(statuses, { value: existing?.status || 'planned' });
  const selection = select([['', 'Geen selectie']], { value: existing?.selection_id || '' });
  const restaurant = input({ value: existing?.restaurant_name || '', maxlength: 300 });
  const address = input({ value: existing?.restaurant_address || '', maxlength: 300 });
  const dish = input({ value: existing?.dish || '', maxlength: 300 });
  const mood = input({ value: existing?.mood || '', maxlength: 300 });
  const guests = input({ value: existing?.guests || '', maxlength: 500 });
  const notes = input({ value: existing?.notes || '', maxlength: 2000 });
  try {
    const { selections } = await api.get('/api/selections');
    for (const s of selections) selection.append(el('option', { value: s.id, text: s.name }));
    selection.value = existing?.selection_id || '';
  } catch { /* selectie blijft optioneel */ }
  const restaurantFields = el('div', { class: 'stack' }, field('Restaurantnaam', restaurant), field('Adres', address));
  const sync = () => { restaurantFields.hidden = kind.value !== 'restaurant'; };
  kind.addEventListener('change', sync); sync();
  modal({ title: existing ? 'Avond bewerken' : 'Nieuwe avond', body: el('div', { class: 'stack' },
    field('Titel', title), field('Start *', starts), field('Einde *', ends), field('Type', kind), field('Status', status),
    field('Selectie', selection), restaurantFields, field('Gerecht of menu', dish), field('Stemming', mood),
    field('Gasten', guests), field('Notities', notes)),
    actions: [{ label: 'Annuleren', class: 'ghost' }, { label: 'Bewaren', class: 'gold', onClick: async () => {
      if (!starts.value || Number.isNaN(new Date(starts.value).getTime()) || (ends.value && Number.isNaN(new Date(ends.value).getTime()))) {
        toast('De starttijd is verplicht en moet geldig zijn.', 'error'); return true;
      }
      const body = {
        title: title.value, starts_at: new Date(starts.value).toISOString(),
        ends_at: ends.value ? new Date(ends.value).toISOString() : null,
        kind: kind.value, status: status.value, selection_id: selection.value || null,
        dish: dish.value, mood: mood.value, guests: guests.value, notes: notes.value,
      };
      if (kind.value === 'restaurant') Object.assign(body, { restaurant_name: restaurant.value, restaurant_address: address.value });
      try { if (existing) await api.patch(`/api/evenings/${existing.id}`, body); else await api.post('/api/evenings', body); reload(); } catch (e) { toast(e.message, 'error'); return true; }
    } }] });
}

function localValue(value) {
  if (!value) return '';
  const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
