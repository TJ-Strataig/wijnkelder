// Wijnhuizen: overzicht van alle producenten in de kelder, met AI-profiel en eigen notities.
import { el, clear, input, toast, modal, confirmDialog, select, TYPE_ICONS, stars, fmtDateTime } from '../util.js';
import { invalidateWines } from '../data.js';
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
    if (!compact) {
      box.append(el('div', { class: 'row', style: { marginTop: '0.8rem' } },
        el('button', { class: 'btn ghost sm', type: 'button', text: '🔗 Samenvoegen met ander wijnhuis…', onClick: () => manualMergeDialog(name, () => { toast('Samengevoegd', 'ok'); onUpdated && onUpdated(); }) })));
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
  const variants = el('div');
  const list = el('div');
  const panel = el('div');
  main.append(variants, list, panel);
  const { producers } = await api.get('/api/producers');
  const reloadAll = async () => { const r = await api.get('/api/producers'); producers.splice(0, producers.length, ...r.producers); draw(); clear(panel); variantsSection(variants, reloadAll); };
  variantsSection(variants, reloadAll);
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


// ---- Mogelijk hetzelfde wijnhuis ----------------------------------------------------------------
// Vergelijkt alle producentnamen (schrijfwijze, afkortingen, rechtsvormen, typefouten) en stelt voor om ze onder één naam te registreren.
export async function variantsSection(box, onChanged) {
  clear(box);
  let data;
  try { data = await api.get('/api/producers/varianten'); } catch { return; }
  const card = el('div', { class: 'card' });
  const head = el('div', { class: 'row between' }, el('h2', { style: { margin: 0 }, text: '🔍 Mogelijk hetzelfde wijnhuis' }),
    data.dismissed ? el('button', { class: 'btn ghost sm', type: 'button', text: `Verborgen keuzes terughalen (${data.dismissed})`, onClick: async () => { await api.del('/api/producers/distinct'); variantsSection(box, onChanged); } }) : null);
  card.append(head);
  if (!data.groups.length) {
    card.append(el('p', { class: 'small muted', style: { margin: '0.4rem 0 0' }, text: 'Geen dubbele wijnhuizen gevonden — elke producent staat onder één naam geregistreerd. Dit wordt bij elk bezoek opnieuw gecontroleerd.' }));
    box.append(card); return;
  }
  card.append(el('p', { class: 'small muted', text: `${data.groups.length} groep${data.groups.length === 1 ? '' : 'en'} met namen die waarschijnlijk hetzelfde wijnhuis zijn. Kies per groep de juiste naam en voeg samen, of geef aan dat het verschillende huizen zijn.` }));
  for (const g of data.groups) card.append(variantGroup(g, () => { variantsSection(box, onChanged); onChanged && onChanged(); }));
  box.append(card);
}

function variantGroup(g, done) {
  const wrap = el('div', { class: 'variant-group', style: { borderTop: '1px solid var(--line)', padding: '0.7rem 0' } });
  const badge = el('span', { class: `badge ${g.confidence === 'zeker' ? 'ok' : g.confidence === 'waarschijnlijk' ? 'warn' : ''}`, text: g.confidence });
  wrap.append(el('div', { class: 'row between' }, el('strong', { text: `${g.variants.length} schrijfwijzen · ${g.wines} wijn${g.wines === 1 ? '' : 'en'}, ${g.bottles} fles${g.bottles === 1 ? '' : 'sen'} in de kelder` }), badge));
  wrap.append(el('div', { class: 'small muted', text: `Waarom: ${g.reasons.join('; ')}.` }));
  const target = input({ maxlength: 200, placeholder: 'Naam waaronder registreren' }); target.value = g.suggested;
  const radios = el('div', { style: { margin: '0.4rem 0' } });
  const groupId = `vg-${Math.random().toString(36).slice(2)}`;
  for (const v of g.variants) {
    const r = el('input', { type: 'radio', name: groupId, value: v.name });
    if (v.name === g.suggested) r.checked = true;
    r.addEventListener('change', () => { target.value = v.name; });
    radios.append(el('label', { class: 'row', style: { gap: '0.5rem', alignItems: 'baseline', padding: '0.15rem 0', cursor: 'pointer' } }, r,
      el('span', {}, el('strong', { text: v.name }), el('span', { class: 'small muted', text: ` · ${v.wines} wijn${v.wines === 1 ? '' : 'en'}, ${v.bottles} in kelder${v.has_profile ? ' · heeft AI-profiel' : ''}${v.region || v.country ? ` · ${[v.region, v.country].filter(Boolean).join(', ')}` : ''}` }))));
  }
  const mergeBtn = el('button', { class: 'btn gold sm', type: 'button', text: '🔗 Samenvoegen onder deze naam', onClick: async () => {
    const t = target.value.trim(); if (!t) return toast('Vul een naam in', 'error');
    const ok = await confirmDialog('Wijnhuizen samenvoegen', `Alle ${g.wines} wijnen van ${g.variants.map((v) => `"${v.name}"`).join(', ')} worden geregistreerd onder "${t}". Het AI-profiel en jullie notities blijven bewaard. Dit is per wijn terug te draaien via Bewerken.`, { okLabel: 'Samenvoegen' });
    if (!ok) return;
    mergeBtn.disabled = true;
    try { const r = await api.post('/api/producers/merge', { names: g.variants.map((v) => v.name), target: t }); invalidateWines(); toast(`${r.wines} wijn${r.wines === 1 ? '' : 'en'} bijgewerkt naar "${t}"`, 'ok'); done(); }
    catch (e) { toast(e.message, 'error'); mergeBtn.disabled = false; }
  } });
  const distinctBtn = el('button', { class: 'btn ghost sm', type: 'button', text: 'Dit zijn verschillende huizen', onClick: async () => {
    try { await api.post('/api/producers/distinct', { names: g.variants.map((v) => v.name) }); toast('Niet meer voorgesteld'); done(); } catch (e) { toast(e.message, 'error'); }
  } });
  wrap.append(radios, el('div', { class: 'row', style: { gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' } }, el('div', { class: 'grow', style: { minWidth: '12rem' } }, target), mergeBtn, distinctBtn));
  return wrap;
}

// Handmatig samenvoegen wanneer de automatische controle een variant niet herkent.
async function manualMergeDialog(name, done) {
  const { producers } = await api.get('/api/producers');
  const others = producers.filter((p) => p.name !== name).sort((a, b) => a.name.localeCompare(b.name));
  if (!others.length) return toast('Er zijn geen andere wijnhuizen om mee samen te voegen.');
  const other = select(others.map((p) => [p.name, `${p.name} (${p.wines} wijn${p.wines === 1 ? '' : 'en'})`]));
  const target = input({ maxlength: 200 }); target.value = name;
  const useOther = el('button', { class: 'btn ghost sm', type: 'button', text: '← Gebruik die naam', onClick: () => { target.value = other.value; } });
  const dlg = modal({
    title: `"${name}" samenvoegen met…`,
    body: el('div', {}, el('label', { class: 'small', text: 'Ander wijnhuis' }), other, el('label', { class: 'small', style: { marginTop: '0.6rem', display: 'block' }, text: 'Naam waaronder alles wordt geregistreerd' }), el('div', { class: 'row', style: { gap: '0.5rem' } }, el('div', { class: 'grow' }, target), useOther)),
    actions: [{ label: 'Annuleren', class: 'ghost' }, { label: 'Samenvoegen', onClick: async () => {
      const t = target.value.trim(); if (!t) { toast('Vul een naam in', 'error'); return true; }
      try { await api.post('/api/producers/merge', { names: [name, other.value], target: t }); invalidateWines(); done(); } catch (e) { toast(e.message, 'error'); return true; }
    } }],
  });
  return dlg;
}
