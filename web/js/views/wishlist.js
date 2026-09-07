// Verlanglijst: wijnen die we nog willen kopen.
import { el, clear, field, input, select, modal, confirmDialog, toast, TYPE_LABELS, TYPE_ICONS, money, fmtDate } from '../util.js';
import { api } from '../api.js';

export async function render(main) {
  main.append(el('div', { class: 'row between' }, el('h1', { text: 'Verlanglijst' }), el('button', { class: 'btn gold', type: 'button', text: '＋ Toevoegen', onClick: () => addDialog(load) })));
  const list = el('div');
  main.append(list);
  async function load() {
    clear(list);
    const { items } = await api.get('/api/wishlist');
    if (!items.length) return list.append(el('div', { class: 'empty' }, el('div', { class: 'big', text: '📝' }), el('p', { text: 'Nog niets op de verlanglijst.' })));
    const card = el('div', { class: 'card' });
    for (const it of items) {
      card.append(el('div', { class: 'row between', style: { padding: '0.5rem 0', borderBottom: '1px solid var(--line)' } },
        el('div', {},
          el('strong', { text: `${TYPE_ICONS[it.type] || '🍇'} ${it.producer ? it.producer + ' · ' : ''}${it.name}${it.vintage ? ' ' + it.vintage : ''}` }),
          el('div', { class: 'small muted', text: [it.max_price ? `max ${money(it.max_price)}` : null, it.note, `${it.created_by_name || ''} · ${fmtDate(it.created_at)}`].filter(Boolean).join(' · ') })),
        el('div', { class: 'row' },
          el('a', { class: 'btn secondary sm', href: '#/toevoegen', text: 'Gekocht → toevoegen' }),
          el('button', { class: 'btn ghost sm', type: 'button', text: '✕', title: 'Verwijderen', onClick: async () => { if (await confirmDialog('Verwijderen', 'Van de verlanglijst halen?', { okLabel: 'Verwijderen', danger: true })) { await api.del(`/api/wishlist/${it.id}`); load(); } } }))));
    }
    list.append(card);
  }
  load();
}

function addDialog(reload) {
  const name = input({ placeholder: 'Naam van de wijn', maxlength: 200 });
  const producer = input({ placeholder: 'Producent', maxlength: 200 });
  const vintage = el('input', { type: 'number', min: 1800, max: 2100, placeholder: 'Jaargang' });
  const type = select([['', '— type —'], ...Object.entries(TYPE_LABELS)]);
  const maxPrice = el('input', { type: 'number', min: 0, step: '0.01', placeholder: 'Maximale prijs €' });
  const note = input({ placeholder: 'Waarom / waar gezien', maxlength: 1000 });
  modal({
    title: 'Toevoegen aan verlanglijst',
    body: el('div', { class: 'form-grid' }, el('div', { class: 'full' }, field('Naam *', name)), field('Producent', producer), field('Jaargang', vintage), field('Type', type), field('Max. prijs', maxPrice), el('div', { class: 'full' }, field('Notitie', note))),
    actions: [{ label: 'Annuleren', class: 'ghost' }, { label: 'Toevoegen', class: 'gold', onClick: async () => {
      if (!name.value.trim()) { toast('Naam is verplicht', 'error'); return true; }
      await api.post('/api/wishlist', { name: name.value, producer: producer.value, vintage: vintage.value || null, type: type.value || null, max_price: maxPrice.value || null, note: note.value });
      reload();
    } }],
  });
}
