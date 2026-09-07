// Historie: alle flessen die de kelder hebben verlaten, alle proefnotities en het activiteitenlogboek.
import { el, clear, select, typeLabel, TYPE_ICONS, stars, money, fmtDate, fmtDateTime, REMOVE_REASONS } from '../util.js';
import { api, photoUrl } from '../api.js';
import { tastingNote } from './wine.js';

const ACTION_LABELS = {
  'wine.created': 'voegde een wijn toe', 'wine.updated': 'bewerkte een wijn', 'wine.deleted': 'verwijderde een wijn', 'bottles.added': 'voegde flessen toe',
  'bottle.removed': 'haalde een fles uit de kelder', 'bottle.restored': 'zette een fles terug', 'tasting.added': 'schreef een proefnotitie', 'user.registered': 'werd lid van het huishouden',
  'user.login': 'logde in', 'invite.created': 'maakte een uitnodiging', 'invite.revoked': 'trok een uitnodiging in', 'user.updated': 'wijzigde een gebruiker', 'user.removed': 'verwijderde een gebruiker',
  'passkey.added': 'voegde een passkey toe', 'passkey.removed': 'verwijderde een passkey', 'ai.recognize': 'liet een etiket herkennen', 'ai.price': 'haalde een prijsindicatie op', 'ai.settings': 'wijzigde de AI-instellingen',
};

export async function render(main) {
  main.append(el('h1', { text: 'Historie' }));
  const tabs = el('div', { class: 'tabs' });
  const body = el('div');
  main.append(tabs, body);
  const views = { flessen: renderBottles, proefnotities: renderTastings, activiteit: renderActivity };
  let active = 'flessen';
  for (const key of Object.keys(views)) {
    const b = el('button', { type: 'button', class: key === active ? 'active' : '', text: key[0].toUpperCase() + key.slice(1) });
    b.addEventListener('click', () => { active = key; tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)); show(); });
    tabs.append(b);
  }
  let hist = null;
  async function show() {
    clear(body);
    body.append(el('p', { class: 'muted small', text: 'Laden…' }));
    if (!hist) hist = await api.get('/api/history');
    clear(body);
    await views[active](body, hist);
  }
  show();
}

async function renderBottles(body, hist) {
  const { bottles } = hist;
  if (!bottles.length) return body.append(el('div', { class: 'empty' }, el('div', { class: 'big', text: '📜' }), el('p', { text: 'Nog geen historie. Zodra je een fles opent of weggeeft, verschijnt die hier.' })));
  const reason = select([['', 'Alle redenen'], ...Object.entries(REMOVE_REASONS)]);
  const yearSel = select([['', 'Alle jaren'], ...[...new Set(bottles.map((b) => (b.removed_at || '').slice(0, 4)).filter(Boolean))].sort().reverse().map((y) => [y, y])]);
  const search = el('input', { type: 'search', placeholder: 'Zoek in historie…' });
  body.append(el('div', { class: 'toolbar' }, search, reason, yearSel));
  const summary = el('div', { class: 'muted small', style: { marginBottom: '0.5rem' } });
  const list = el('div', { class: 'card' });
  body.append(summary, list);
  function update() {
    const q = search.value.toLowerCase();
    const rows = bottles.filter((b) => (!reason.value || b.status === reason.value) && (!yearSel.value || (b.removed_at || '').startsWith(yearSel.value)) &&
      (!q || [b.name, b.producer, b.country, b.region, b.vintage, b.removed_note, b.removed_by_name].join(' ').toLowerCase().includes(q)));
    clear(list);
    const spent = rows.reduce((s, b) => s + (b.price || 0), 0);
    summary.textContent = `${rows.length} flessen · ${rows.filter((b) => b.status === 'consumed').length} gedronken${spent ? ` · aankoopwaarde ${money(spent)}` : ''}`;
    for (const b of rows) {
      list.append(el('div', { class: 'history-item' },
        b.label_image_url ? el('img', { src: photoUrl(b.label_image_url), alt: '' }) : el('div', { class: `ph type-${b.type}`, text: TYPE_ICONS[b.type] || '🍇' }),
        el('div', {},
          el('a', { href: `#/wijn/${b.wine_id}`, style: { fontWeight: 600, textDecoration: 'none', color: 'inherit' }, text: `${b.producer ? b.producer + ' · ' : ''}${b.name}${b.vintage ? ' ' + b.vintage : ''}` }),
          el('div', { class: 'small muted', text: [typeLabel(b.type), b.region || b.country, b.gifted ? '🎁 gekregen' : money(b.price)].filter(Boolean).join(' · ') }),
          el('div', { class: 'small', text: `${REMOVE_REASONS[b.status] || b.status} op ${fmtDate(b.removed_at)}${b.removed_by_name ? ` door ${b.removed_by_name}` : ''}${b.removed_note ? ` — ${b.removed_note}` : ''}` })),
        b.rating ? el('span', { class: 'stars', title: `${b.rating}/100`, text: stars(b.rating) }) : el('span')));
    }
    if (!rows.length) list.append(el('p', { class: 'muted center', text: 'Niets gevonden.' }));
  }
  for (const c of [search, reason, yearSel]) c.addEventListener('input', update);
  update();
}

async function renderTastings(body) {
  const { tastings } = await api.get('/api/tastings');
  if (!tastings.length) return body.append(el('div', { class: 'empty' }, el('div', { class: 'big', text: '📝' }), el('p', { text: 'Nog geen proefnotities.' })));
  const card = el('div', { class: 'card stack' });
  for (const t of tastings) {
    card.append(el('div', {},
      el('a', { href: `#/wijn/${t.wine_id}`, style: { fontWeight: 600, textDecoration: 'none', color: 'inherit' }, text: `${TYPE_ICONS[t.type] || ''} ${t.producer ? t.producer + ' · ' : ''}${t.wine_name}${t.vintage ? ' ' + t.vintage : ''}` }),
      tastingNote(t, null)));
  }
  body.append(card);
}

async function renderActivity(body, hist) {
  const card = el('div', { class: 'card' });
  const tbl = el('table', { class: 'table' });
  tbl.append(el('thead', {}, el('tr', {}, ['Wanneer', 'Wie', 'Wat'].map((h) => el('th', { text: h })))));
  const tb = el('tbody');
  for (const a of hist.activity) {
    const d = a.details || {};
    const extra = [d.name, d.quantity ? `${d.quantity} fles(sen)` : null, d.reason ? REMOVE_REASONS[d.reason] : null, d.rating ? `${d.rating}/100` : null, d.price ? money(d.price) : null].filter(Boolean).join(' · ');
    tb.append(el('tr', {}, el('td', { class: 'small muted', text: fmtDateTime(a.at) }), el('td', { text: a.user_name || 'Systeem' }),
      el('td', {}, ACTION_LABELS[a.action] || a.action, extra ? el('div', { class: 'small muted', text: extra }) : null)));
  }
  tbl.append(tb);
  card.append(el('div', { class: 'table-wrap' }, tbl));
  body.append(card);
}
