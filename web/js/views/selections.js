import * as util from '../util.js';
import { api } from '../api.js';

const { el, clear } = util;
const field = (label, node) => el('label', {}, label, node);
const input = (attrs) => el('input', { type: 'text', ...attrs });
const modal = (...args) => util.modal?.(...args);
const toast = (...args) => util.toast?.(...args);
const wineTitle = (w) => [w.producer, w.name].filter(Boolean).join(' · ') + (w.vintage ? ` ${w.vintage}` : '');

export async function render(main, { params, navigate }) {
  if (params?.[0]) return detail(main, params[0], navigate);
  main.append(el('div', { class: 'row between' }, el('h1', { text: 'Selecties' }),
    el('button', { class: 'btn gold', type: 'button', text: '＋ Nieuwe selectie', onClick: () => selectionDialog(load) })));
  const list = el('div', { class: 'stack' }); main.append(list);
  async function load() {
    clear(list);
    const { selections } = await api.get('/api/selections');
    if (!selections.length) return list.append(el('div', { class: 'empty' }, el('div', { class: 'big', text: '🍷' }),
      el('p', { text: 'Nog geen selecties. Maak bijvoorbeeld een selectie voor een diner of wijnproeverij.' })));
    for (const s of selections) list.append(el('a', { class: 'card row between selection-card', href: `#/selecties/${s.id}`, style: { textDecoration: 'none', color: 'inherit' } },
      el('div', {}, el('strong', { text: s.name }), el('div', { class: 'small muted', text: `${s.wine_count || 0} wijn${s.wine_count === 1 ? '' : 'en'}${s.created_by_name ? ` · ${s.created_by_name}` : ''}` })),
      el('span', { class: 'muted', text: '→' })));
  }
  await load();
}

async function detail(main, id, navigate) {
  const page = el('div', { class: 'selection-page' }); main.append(page);
  async function load() {
    clear(page);
    const { selection, wines } = await api.get(`/api/selections/${id}`);
    page.append(el('div', { class: 'row between' },
      el('div', {}, el('a', { href: '#/selecties', class: 'muted small', text: '← Alle selecties' }), el('h1', { text: selection.name })),
      el('div', { class: 'row' },
        el('button', { class: 'btn secondary sm', type: 'button', text: 'Hernoemen', onClick: () => selectionDialog(load, selection) }),
        el('button', { class: 'btn ghost sm', type: 'button', text: 'Verwijderen', onClick: async () => {
          if (window.confirm(`"${selection.name}" verwijderen?`)) {
            await api.del(`/api/selections/${id}`); navigate('/selecties');
          }
        } }))),
      el('p', { class: 'muted small', text: `${wines.length} wijn${wines.length === 1 ? '' : 'en'} in deze selectie` }));
    const actions = el('div', { class: 'row' });
    actions.append(el('button', { class: 'btn gold', type: 'button', text: '＋ Wijn toevoegen', onClick: () => addWineDialog(id, load) }));
    page.append(actions);
    const list = el('div', { class: 'stack', style: { marginTop: '1rem' } });
    if (!wines.length) list.append(el('div', { class: 'empty' }, el('p', { text: 'Deze selectie bevat nog geen wijnen.' })));
    for (const wine of wines) list.append(el('div', { class: 'card row between' },
      el('a', { href: `#/wijn/${wine.id}`, style: { textDecoration: 'none', color: 'inherit' } }, el('strong', { text: wineTitle(wine) })),
      el('button', { class: 'btn ghost sm', type: 'button', text: 'Verwijderen', onClick: async () => { await api.del(`/api/selections/${id}/wines/${wine.id}`); load(); } })));
    page.append(list);
  }
  await load();
}

function selectionDialog(reload, selection = null) {
  const name = input({ value: selection?.name || '', placeholder: 'Bijv. Zomerdiner', maxlength: 120 });
  modal({ title: selection ? 'Selectie hernoemen' : 'Nieuwe selectie', body: field('Naam *', name),
    actions: [{ label: 'Annuleren', class: 'ghost' }, { label: selection ? 'Opslaan' : 'Aanmaken', class: 'gold', onClick: async () => {
      if (!name.value.trim()) { toast('Naam is verplicht', 'error'); return true; }
      if (selection) await api.patch(`/api/selections/${selection.id}`, { name: name.value });
      else await api.post('/api/selections', { name: name.value });
      reload();
    } }] });
}

async function addWineDialog(selectionId, reload) {
  const { wines } = await api.get('/api/wines?all=1');
  const select = el('select', {}, wines.map((w) => el('option', { value: w.id, text: wineTitle(w) })));
  if (!wines.length) return toast('Voeg eerst een wijn toe aan de kelder.', 'error');
  modal({ title: 'Wijn toevoegen', body: field('Wijn', select), actions: [{ label: 'Annuleren', class: 'ghost' }, { label: 'Toevoegen', class: 'gold', onClick: async () => {
    await api.post(`/api/selections/${selectionId}/wines`, { wine_id: select.value }); reload();
  } }] });
}
