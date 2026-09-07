// Wijnhuizen: overzicht van alle producenten in de kelder, met AI-profiel en eigen notities.
import { el, clear, input, toast, TYPE_ICONS, stars, fmtDateTime } from '../util.js';
import { api } from '../api.js';

// Herbruikbaar paneel met de informatie van één wijnhuis (gebruikt op de kaart, in de lijst en op de wijnpagina).
export function producerPanel(name, { compact = false, onUpdated } = {}) {
  const box = el('div', { class: 'card', style: { marginTop: '1rem' } });
  box.append(el('p', { class: 'muted small', text: 'Laden…' }));
  (async () => {
    let data;
    try { data = await api.get(`/api/producers/by-name?name=${encodeURIComponent(name)}`); } catch (e) { clear(box); box.append(el('p', { class: 'badge bad', text: e.message })); return; }
    draw(data);
  })();

  function draw(data) {
    clear(box);
    const p = data.profile;
    box.append(el('div', { class: 'row between' }, el('h2', { style: { margin: 0 }, text: `🏡 ${name}` }),
      el('button', { class: 'btn secondary sm', type: 'button', text: p ? '✨ Profiel vernieuwen' : '✨ Profiel opvragen (AI)', onClick: async (e) => {
        const b = e.currentTarget; b.disabled = true; b.textContent = 'Bezig…';
        try { await api.post('/api/producers/profile', { name }); toast('Profiel bijgewerkt', 'ok'); draw(await api.get(`/api/producers/by-name?name=${encodeURIComponent(name)}`)); onUpdated && onUpdated(); }
        catch (err) { toast(err.message, 'error'); b.disabled = false; b.textContent = 'Opnieuw proberen'; }
      } })));
    if (!p) {
      box.append(el('p', { class: 'muted small', text: 'Nog geen informatie over dit wijnhuis. Laat de AI-sommelier een profiel schrijven: geschiedenis, ligging, stijl, eigenaar, wijnmaker en bekendste wijnen.' }));
    } else {
      if (p.description) box.append(el('p', { text: p.description }));
      const kv = el('dl', { class: 'kv' });
      const add = (k, v) => { if (v) kv.append(el('dt', { text: k }), el('dd', { text: Array.isArray(v) ? v.join(', ') : String(v) })); };
      add('Ligging', [p.address, p.region, p.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', '));
      add('Opgericht', p.founded); add('Eigenaar', p.owner); add('Wijnmaker', p.winemaker);
      add('Wijngaard', p.hectares ? `${p.hectares} ha` : null); add('Filosofie', p.philosophy); add('Bekende wijnen', p.signature_wines);
      box.append(kv);
      if (p.website) box.append(el('p', {}, el('a', { href: p.website, target: '_blank', rel: 'noopener noreferrer', text: p.website.replace(/^https:\/\//, '') })));
      box.append(el('p', { class: 'small muted', text: `AI-profiel${p.confidence !== null && p.confidence !== undefined ? ` · zekerheid ${Math.round(p.confidence * 100)}%` : ''} · ${fmtDateTime(p.updated_at)}. Controleer belangrijke feiten; de AI kan zich vergissen bij kleine of gelijknamige wijnhuizen.` }));
      // Eigen notities
      const notes = el('textarea', { placeholder: 'Eigen notities over dit wijnhuis (bezoek, contact, favoriete wijnen…)', maxlength: 4000 });
      notes.value = p.notes || '';
      const save = el('button', { class: 'btn ghost sm', type: 'button', text: 'Notities opslaan' });
      save.addEventListener('click', async () => { try { await api.patch(`/api/producers/${p.id}`, { notes: notes.value }); toast('Opgeslagen', 'ok'); } catch (e) { toast(e.message, 'error'); } });
      box.append(el('details', { style: { marginTop: '0.5rem' } }, el('summary', { class: 'small', text: p.notes ? 'Onze notities' : 'Notitie toevoegen' }), notes, save));
    }
    if (!compact && data.wines.length) {
      box.append(el('h3', { style: { marginTop: '0.8rem' }, text: 'Van dit wijnhuis in onze kelder' }));
      const ul = el('ul', { class: 'small', style: { paddingLeft: '1.1rem' } });
      for (const w of data.wines) ul.append(el('li', {}, el('a', { href: `#/wijn/${w.id}`, text: `${TYPE_ICONS[w.type] || ''} ${w.name}${w.vintage ? ' ' + w.vintage : ''}` }),
        el('span', { class: 'muted', text: ` · ${w.bottles_in_cellar} in kelder${w.bottles_history ? `, ${w.bottles_history} gedronken` : ''}` }), w.avg_rating ? el('span', { class: 'stars', text: ` ${stars(w.avg_rating)}` }) : null));
      box.append(ul);
    }
  }
  return box;
}

export async function render(main) {
  main.append(el('h1', { text: 'Wijnhuizen' }), el('p', { class: 'muted small', text: 'Alle producenten uit onze kelder. Tik op een wijnhuis voor geschiedenis, ligging, stijl en onze eigen notities.' }));
  const search = el('input', { type: 'search', placeholder: 'Zoek een wijnhuis…', 'aria-label': 'Zoeken' });
  main.append(el('div', { class: 'toolbar' }, search, el('a', { class: 'btn ghost', href: '#/herkomst', text: '🗺️ Op de kaart' })));
  const list = el('div');
  const panel = el('div');
  main.append(list, panel);
  const { producers } = await api.get('/api/producers');
  if (!producers.length) return list.append(el('div', { class: 'empty' }, el('div', { class: 'big', text: '🏡' }), el('p', { text: 'Nog geen producenten bekend. Vul bij je wijnen de producent in.' })));

  function draw() {
    clear(list);
    const q = search.value.trim().toLowerCase();
    const card = el('div', { class: 'card' });
    for (const p of producers.filter((x) => !q || `${x.name} ${x.region || ''} ${x.country || ''}`.toLowerCase().includes(q))) {
      const row = el('button', { class: 'producer-card', type: 'button', style: { width: '100%', textAlign: 'left', background: 'none', border: 0, borderBottom: '1px solid var(--line)', padding: '0.6rem 0', font: 'inherit', color: 'inherit', cursor: 'pointer' } },
        el('div', {}, el('strong', { text: p.name }), el('div', { class: 'small muted', text: [p.region, p.country].filter(Boolean).join(', ') || '—' }),
          p.profile?.description ? el('div', { class: 'small', style: { marginTop: '0.2rem' }, text: p.profile.description.slice(0, 120) + (p.profile.description.length > 120 ? '…' : '') }) : null),
        el('div', { class: 'small muted', style: { textAlign: 'right' } }, `${p.wines} wijn${p.wines === 1 ? '' : 'en'}`, el('br'), `${p.bottles || 0} flessen`, el('br'), p.profile ? el('span', { class: 'badge ok', text: 'profiel' }) : el('span', { class: 'badge', text: 'geen profiel' })));
      row.addEventListener('click', () => { clear(panel); panel.append(producerPanel(p.name, { onUpdated: async () => { const r = await api.get('/api/producers'); producers.splice(0, producers.length, ...r.producers); draw(); } })); panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      card.append(row);
    }
    list.append(card);
  }
  search.addEventListener('input', draw);
  draw();
}
