// Bulk-invoer met twee werkwijzen:
//  • Direct beoordelen: foto's → herkenning → per fles controleren en goedkeuren (alles in deze sessie).
//  • Later beoordelen: foto's + herkenning gaan naar de beoordelingswachtrij op de server; later (bijv. op de desktop)
//    loop je ze door. Niets komt in de kelder zonder expliciete goedkeuring per fles.
import { el, clear, field, input, select, checkbox, toast, confirmDialog, TYPE_LABELS, shrinkImage, wineTitle, money, fmtDateTime } from '../util.js';
import { api, photoUrl } from '../api.js';
import { loadWines, invalidateWines } from '../data.js';
import { destinationForm, duplicateDialog } from './wine.js';

const STATUS_LABEL = { wachten: 'In de wachtrij', herkennen: 'Herkennen…', uploaden: 'Opslaan in wachtrij…', controleren: 'Controleren', fout: 'Herkenning mislukt', goedgekeurd: 'Toegevoegd', overgeslagen: 'Overgeslagen', opgeslagen: 'In wachtrij voor later' };
const STATUS_CLASS = { wachten: '', herkennen: 'warn', uploaden: 'warn', controleren: 'gold', fout: 'bad', goedgekeurd: 'ok', overgeslagen: '', opgeslagen: 'ok' };
const Q_LABEL = { pending: 'Nog herkennen', recognized: 'Te beoordelen', failed: 'Herkenning mislukt', approved: 'Toegevoegd', skipped: 'Overgeslagen' };
const Q_CLASS = { pending: 'warn', recognized: 'gold', failed: 'bad', approved: 'ok', skipped: '' };

// Gedeelde aankoopgegevens voor een partij: datum, winkel, locatie, cadeau — GEEN prijs (die verschilt per fles).
function batchForm() {
  const date = el('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
  const place = input({ placeholder: 'Bijv. Gall & Gall, Wijnkoperij De Gouden Ton', maxlength: 150 });
  const location = input({ placeholder: 'Bijv. Rek A, plank 2', maxlength: 120, list: 'locaties' });
  const gifted = checkbox('Dit zijn gekregen flessen (cadeau)');
  const giftedFrom = input({ placeholder: 'Van wie?', maxlength: 120 });
  const giftWrap = field('Gekregen van', giftedFrom); giftWrap.hidden = true;
  gifted.input.addEventListener('change', () => { giftWrap.hidden = !gifted.input.checked; });
  const node = el('div', { class: 'form-grid' }, field('Aankoop-/ontvangstdatum', date), field('Winkel / wijnhandel', place), field('Locatie in de kelder', location), el('div', { class: 'field' }, gifted.wrap), giftWrap);
  return {
    node,
    values: () => ({ purchase_date: date.value || null, purchase_place: place.value.trim() || null, location: location.value.trim() || null, gifted: gifted.input.checked, gifted_from: giftedFrom.value.trim() || null }),
    label: () => [place.value.trim(), date.value].filter(Boolean).join(' · ') || null,
  };
}

// Per fles: aantal en prijs (leeg = onbekend) prominent; datum/winkel/locatie inklapbaar.
function bottleFields(defaults = {}) {
  const qty = el('input', { type: 'number', min: 1, max: 500, value: defaults.quantity ?? 1, 'aria-label': 'Aantal', style: { width: '5rem' } });
  const price = el('input', { type: 'number', min: 0, step: '0.01', placeholder: 'onbekend', value: defaults.price ?? '', 'aria-label': 'Prijs per fles', style: { width: '7rem' } });
  const size = select([[750, '750 ml'], [375, '375 ml'], [500, '500 ml'], [1500, 'Magnum 1,5 l'], [3000, '3 l']], { value: defaults.size_ml ?? 750, style: { width: 'auto' } });
  const date = el('input', { type: 'date', value: defaults.purchase_date || '' });
  const place = input({ value: defaults.purchase_place || '', placeholder: 'Winkel', maxlength: 150 });
  const location = input({ value: defaults.location || '', placeholder: 'Locatie', maxlength: 120 });
  const gifted = checkbox('Gekregen', { checked: !!defaults.gifted });
  const quick = el('div', { class: 'row' }, el('label', { class: 'small row' }, 'Aantal', qty), el('label', { class: 'small row' }, 'Prijs p.st. €', price), size);
  const more = el('details', { class: 'small' }, el('summary', { text: 'Datum, winkel, locatie voor deze fles' }), el('div', { class: 'form-grid' }, field('Datum', date), field('Winkel', place), field('Locatie', location), el('div', { class: 'field' }, gifted.wrap)));
  return {
    node: el('div', { class: 'stack' }, quick, more),
    values: () => ({ quantity: Number(qty.value) || 1, price: price.value === '' ? null : Number(price.value), size_ml: Number(size.value), purchase_date: date.value || null, purchase_place: place.value.trim() || null, location: location.value.trim() || null, gifted: gifted.input.checked, gifted_from: defaults.gifted_from || null, currency: 'EUR' }),
  };
}

// Wijnvelden voor de controle.
function wineFields(w) {
  const F = {};
  const mk = (k, attrs = {}) => (F[k] = input({ value: w[k] ?? '', maxlength: 200, ...attrs }));
  mk('name', { placeholder: 'Naam *' }); mk('producer', { placeholder: 'Producent' });
  F.type = select(Object.entries(TYPE_LABELS), { value: w.type || 'rood' });
  F.vintage = el('input', { type: 'number', min: 1800, max: 2100, value: w.vintage ?? '', placeholder: 'Jaargang' });
  mk('country', { placeholder: 'Land' }); mk('region', { placeholder: 'Streek' }); mk('appellation', { placeholder: 'Appellatie' });
  F.grapes = input({ value: (w.grapes || []).join(', '), placeholder: 'Druiven (komma-gescheiden)', maxlength: 500 });
  const node = el('div', { class: 'form-grid' },
    el('div', { class: 'full' }, field('Naam *', F.name)), field('Producent', F.producer), field('Type', F.type), field('Jaargang', F.vintage),
    field('Land', F.country), field('Streek', F.region), field('Appellatie', F.appellation), el('div', { class: 'full' }, field('Druiven', F.grapes)));
  const extra = [['Drinkvenster', w.drink_from || w.drink_until ? `${w.drink_from || '?'} – ${w.drink_until || '?'}` : null], ['Bewaarwijn', w.aging_wine ? 'ja' : null], ['Lekker bij', (w.food_pairings || []).slice(0, 5).join(', ') || null], ['Prijsindicatie', w.estimated_price ? money(w.estimated_price) : null], ['Beschrijving', w.description]].filter(([, v]) => v);
  if (extra.length) node.append(el('details', { class: 'small full' }, el('summary', { text: 'Overige herkende gegevens (worden meegenomen)' }), el('dl', { class: 'kv' }, extra.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]))));
  return {
    node,
    values: () => ({ ...w, name: F.name.value.trim(), producer: F.producer.value.trim() || null, type: F.type.value, vintage: F.vintage.value ? Number(F.vintage.value) : null, country: F.country.value.trim() || null, region: F.region.value.trim() || null, appellation: F.appellation.value.trim() || null, grapes: F.grapes.value.split(',').map((s) => s.trim()).filter(Boolean) }),
  };
}

function findDuplicate(existing, w) {
  const n = (w.name || '').toLowerCase(), p = (w.producer || '').toLowerCase();
  return existing.find((x) => x.name.toLowerCase() === n && (x.producer || '').toLowerCase() === p && (x.vintage || null) === (w.vintage || null)) || null;
}

async function recognizeDataUrl(dataUrl) {
  const r = await api.post('/api/ai/recognize', { image: dataUrl });
  const wine = Object.fromEntries(Object.entries(r.wine).filter(([k, v]) => v !== null && v !== undefined && k !== 'confidence'));
  if (!wine.type) wine.type = 'rood';
  return { wine, confidence: r.wine.confidence };
}

export async function render(main, { query }) {
  main.append(el('h1', { text: 'Bulk toevoegen' }));
  const tabs = el('div', { class: 'tabs' });
  const body = el('div');
  main.append(tabs, body);
  let existing = [];
  try { existing = await loadWines(); } catch { /* niet kritisch */ }
  main.append(el('datalist', { id: 'locaties' }, [...new Set(existing.flatMap((w) => (w.locations || '').split(',')).filter(Boolean))].map((v) => el('option', { value: v }))));

  const queueCount = el('span', { class: 'badge gold', hidden: true, style: { marginLeft: '0.4rem' } });
  let mode = query.get('tab') === 'queue' ? 'queue' : 'upload';
  for (const [key, label] of [['upload', '📷 Foto\'s toevoegen'], ['queue', '🗂️ Beoordelen']]) {
    const b = el('button', { type: 'button', class: key === mode ? 'active' : '' }, label, key === 'queue' ? queueCount : null);
    b.addEventListener('click', () => { mode = key; tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)); show(); });
    tabs.append(b);
  }
  async function refreshCount() {
    try { const q = await api.get('/api/intake'); const n = q.counts.recognized + q.counts.pending + q.counts.failed; queueCount.textContent = String(n); queueCount.hidden = !n; } catch { /* stil */ }
  }
  refreshCount();
  function show() { clear(body); (mode === 'upload' ? uploadView : queueView)(body, existing, { refreshCount }); }
  show();
}

// ---------------------------------------------------------------------------
function uploadView(body, existing, { refreshCount }) {
  body.append(el('p', { class: 'muted small', text: 'Kies of fotografeer meerdere etiketten tegelijk — van één of van verschillende wijnhuizen. De AI-sommelier herkent ze; jij controleert en keurt elke fles apart goed voordat hij in de kelder komt.' }));

  const batch = batchForm();
  const later = checkbox('Later beoordelen — zet alles in de beoordelingswachtrij, zodat je het straks (bijv. op de desktop) rustig kunt doorlopen');
  body.append(el('div', { class: 'card' },
    el('strong', { text: 'Aankoopgegevens voor deze partij' }),
    el('p', { class: 'muted small', text: 'Datum, winkel en locatie gelden voor alle flessen van deze partij. Aantal en prijs vul je per fles in.' }),
    batch.node,
    el('div', { style: { marginTop: '0.4rem', padding: '0.6rem', background: 'var(--paper)', borderRadius: '10px' } }, later.wrap)));

  const fileInput = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  const camInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const drop = el('div', { class: 'dropzone', tabindex: 0, role: 'button' }, el('div', { style: { fontSize: '2rem' }, text: '📷📷📷' }), el('div', { text: 'Tik om meerdere foto\'s te kiezen' }), el('div', { class: 'muted small', text: 'Op de iPhone: selecteer in de fotobibliotheek alle etiketten die je zojuist hebt gefotografeerd.' }));
  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('active'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('active'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('active'); addFiles([...e.dataTransfer.files]); });
  fileInput.addEventListener('change', () => { addFiles([...fileInput.files]); fileInput.value = ''; });
  camInput.addEventListener('change', () => { addFiles([...camInput.files]); camInput.value = ''; });
  body.append(el('div', { class: 'card' }, drop, fileInput, camInput, el('div', { class: 'row', style: { marginTop: '0.6rem' } },
    el('button', { class: 'btn secondary', type: 'button', text: '📸 Foto maken en toevoegen', onClick: () => camInput.click() }),
    el('span', { class: 'muted small', text: 'Herhaal dit per fles; de verwerking loopt intussen door.' }))));

  const progressText = el('span', { class: 'muted small' });
  const startBtn = el('button', { class: 'btn gold sm', type: 'button', text: 'Herkenning starten', hidden: true });
  const toQueueBtn = el('a', { class: 'btn ghost sm', href: '#/bulk?tab=queue', text: 'Naar de beoordelingswachtrij →', hidden: true });
  body.append(el('div', { class: 'row between', style: { margin: '1rem 0 0.5rem' } }, progressText, el('div', { class: 'row' }, toQueueBtn, startBtn)));
  const list = el('div', { class: 'stack' });
  body.append(list);

  const items = []; let running = false;
  startBtn.addEventListener('click', runQueue);

  function addFiles(files) {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return toast('Geen afbeeldingen gevonden', 'error');
    for (const f of imgs) items.push({ id: crypto.randomUUID(), file: f, status: 'wachten', deferred: later.input.checked });
    toast(`${imgs.length} foto${imgs.length === 1 ? '' : "'s"} toegevoegd${later.input.checked ? ' — gaan naar de wachtrij' : ''}`, 'ok');
    drawAll(); runQueue();
  }

  async function runQueue() {
    if (running) return; running = true; startBtn.hidden = true;
    try {
      for (const it of items) {
        if (it.status !== 'wachten') continue;
        it.status = 'herkennen'; draw(it); updateProgress();
        try {
          if (!it.dataUrl) { const s = await shrinkImage(it.file); it.dataUrl = s.dataUrl; it.blob = s.blob; }
          let wine = null, confidence = null, err = null;
          try { ({ wine, confidence } = await recognizeDataUrl(it.dataUrl)); }
          catch (e) { if (e.status === 429 || e.status === 401) throw e; err = e.message; }
          it.wine = wine; it.confidence = confidence; it.error = err;
          if (it.deferred) {
            it.status = 'uploaden'; draw(it);
            const up = await api.upload(it.blob);
            await api.post('/api/intake', { label_image_key: up.key, batch_label: batch.label(), bottle: { ...batch.values(), quantity: 1 }, wine, confidence });
            it.status = 'opgeslagen'; toQueueBtn.hidden = false; refreshCount();
          } else {
            it.duplicate = wine ? findDuplicate(existing, wine) : null;
            it.status = wine ? 'controleren' : 'fout';
          }
        } catch (e) {
          it.status = 'fout'; it.error = e.message;
          if (e.status === 429) { toast('AI-limiet bereikt (60 per uur). De rest wacht; probeer later "Herkenning starten".', 'error'); for (const rest of items) if (rest.status === 'herkennen') rest.status = 'wachten'; break; }
          if (e.status === 401) break;
        }
        draw(it); updateProgress();
      }
    } finally { running = false; startBtn.hidden = !items.some((i) => i.status === 'wachten'); updateProgress(); }
  }

  function updateProgress() {
    const c = (s) => items.filter((i) => i.status === s).length;
    const parts = [];
    const busy = c('wachten') + c('herkennen') + c('uploaden');
    if (busy) parts.push(`${busy} bezig`);
    if (c('controleren')) parts.push(`${c('controleren')} te controleren`);
    if (c('opgeslagen')) parts.push(`${c('opgeslagen')} in wachtrij voor later`);
    if (c('goedgekeurd')) parts.push(`${c('goedgekeurd')} toegevoegd`);
    if (c('fout')) parts.push(`${c('fout')} mislukt`);
    if (c('overgeslagen')) parts.push(`${c('overgeslagen')} overgeslagen`);
    progressText.textContent = items.length ? `${items.length} foto's · ${parts.join(' · ')}` : '';
  }
  function drawAll() { clear(list); for (const it of items) list.append(card(it)); updateProgress(); }
  function draw(it) { const old = list.querySelector(`[data-id="${it.id}"]`); const fresh = card(it); old ? old.replaceWith(fresh) : list.append(fresh); }

  function card(it) {
    const c = el('div', { class: 'card bulk-item', dataset: { id: it.id } });
    const thumb = el('div', { class: 'bulk-thumb' });
    if (it.dataUrl) thumb.append(el('img', { src: it.dataUrl, alt: '' }));
    else { thumb.append(el('span', { class: 'muted small', text: '…' })); shrinkImage(it.file, 500, 0.7).then((s) => { clear(thumb); thumb.append(el('img', { src: s.dataUrl, alt: '' })); }).catch(() => {}); }
    const head = el('div', { class: 'row between' },
      el('div', { class: 'row' }, el('span', { class: `badge ${STATUS_CLASS[it.status]}`, text: STATUS_LABEL[it.status] }), it.confidence !== null && it.confidence !== undefined && it.status === 'controleren' ? el('span', { class: 'muted small', text: `zekerheid ${Math.round(it.confidence * 100)}%` }) : null),
      it.status === 'goedgekeurd' ? el('a', { class: 'small', href: `#/wijn/${it.savedId}`, text: 'Bekijken →' }) : null);
    const b = el('div', { class: 'grow' }, head);
    if (it.status === 'controleren') b.append(reviewBlock(it));
    else if (it.status === 'opgeslagen') b.append(el('p', { class: 'small muted', text: it.wine ? `${wineTitle(it.wine)} — staat klaar in de beoordelingswachtrij.` : 'Herkenning mislukt; in de wachtrij kun je de gegevens handmatig invullen of de herkenning opnieuw proberen.' }));
    else if (it.status === 'fout') b.append(el('p', { class: 'small', text: it.error || 'Onbekende fout' }), el('div', { class: 'row' },
      el('button', { class: 'btn sm', type: 'button', text: 'Opnieuw proberen', onClick: () => { it.status = 'wachten'; it.error = null; draw(it); runQueue(); } }),
      el('button', { class: 'btn ghost sm', type: 'button', text: 'Handmatig invullen', onClick: () => { it.wine = { name: '', type: 'rood' }; it.status = 'controleren'; draw(it); } }),
      el('button', { class: 'btn ghost sm', type: 'button', text: 'Overslaan', onClick: () => { it.status = 'overgeslagen'; draw(it); updateProgress(); } })));
    else if (it.status === 'goedgekeurd') b.append(el('p', { class: 'small', text: `${wineTitle(it.wine)} · ${it.bottle.quantity} fles${it.bottle.quantity === 1 ? '' : 'sen'}${it.bottle.price ? ` · ${money(it.bottle.price)} p.st.` : ''}` }));
    else if (it.status === 'overgeslagen') b.append(el('button', { class: 'btn ghost sm', type: 'button', text: 'Toch beoordelen', onClick: () => { it.status = it.wine ? 'controleren' : 'wachten'; draw(it); runQueue(); } }));
    else b.append(el('p', { class: 'muted small', text: it.file.name }));
    c.append(thumb, b);
    return c;
  }

  function reviewBlock(it) {
    const wf = wineFields(it.wine);
    const bf = bottleFields({ ...batch.values(), quantity: 1 });
    const wrap = el('div');
    if (it.duplicate) wrap.append(el('div', { class: 'badge warn', style: { marginBottom: '0.5rem' }, text: `Staat al in de kelder (${it.duplicate.bottles_in_cellar}×). Goedkeuren boekt flessen bij op die wijn.` }));
    const df = destinationForm({ compact: true });
    wrap.append(wf.node, el('div', { style: { padding: '0.6rem', margin: '0.4rem 0', background: 'var(--paper)', borderRadius: '10px' } }, bf.node, df.node));
    const approveBtn = el('button', { class: 'btn gold', type: 'button', text: '✓ Goedkeuren en toevoegen' });
    approveBtn.addEventListener('click', async () => {
      const w = wf.values(); if (!w.name) return toast('Vul een naam in', 'error');
      approveBtn.disabled = true; approveBtn.textContent = 'Toevoegen…';
      it.wine = w; it.bottle = bf.values(); const consumed = df.values() || undefined;
      try {
        let labelKey = null; if (it.blob) { try { labelKey = (await api.upload(it.blob)).key; } catch { /* foto optioneel */ } }
        const create = (extra = {}) => api.post('/api/wines', { ...w, label_image_key: labelKey, quantity: it.bottle.quantity, bottle: it.bottle, consumed, ...extra });
        let r;
        try { r = await create(); }
        catch (e) {
          if (e.status !== 409 || !e.data?.duplicate) throw e;
          const choice = await duplicateDialog(e.data.duplicate, { quantity: it.bottle.quantity });
          if (!choice) { approveBtn.disabled = false; approveBtn.textContent = '✓ Goedkeuren en toevoegen'; return; }
          r = await create(choice === 'merge' ? { merge_into: e.data.duplicate.id } : { allow_duplicate: true });
        }
        it.savedId = r.wine.id; it.status = 'goedgekeurd';
        existing.push({ id: r.wine.id, name: w.name, producer: w.producer, vintage: w.vintage, bottles_in_cellar: it.bottle.quantity });
        invalidateWines(); toast(`${wineTitle(w)} toegevoegd`, 'ok');
      } catch (e) { toast(e.message, 'error'); approveBtn.disabled = false; approveBtn.textContent = '✓ Goedkeuren en toevoegen'; return; }
      draw(it); updateProgress();
    });
    const deferBtn = el('button', { class: 'btn ghost sm', type: 'button', text: 'Later beoordelen', title: 'Naar de beoordelingswachtrij', onClick: async () => {
      try {
        const up = it.blob ? await api.upload(it.blob) : null;
        await api.post('/api/intake', { label_image_key: up?.key || null, batch_label: batch.label(), bottle: bf.values(), wine: wf.values(), confidence: it.confidence });
        it.status = 'opgeslagen'; toQueueBtn.hidden = false; refreshCount(); draw(it); updateProgress();
      } catch (e) { toast(e.message, 'error'); }
    } });
    wrap.append(el('div', { class: 'row' }, approveBtn, deferBtn, el('button', { class: 'btn ghost sm', type: 'button', text: 'Overslaan', onClick: () => { it.status = 'overgeslagen'; draw(it); updateProgress(); } })));
    return wrap;
  }

  body.append(el('p', { class: 'muted small', style: { marginTop: '1.5rem' }, text: 'Tip: fotografeer bij goed licht recht van voren. Herkenning kost ongeveer een cent (Claude Haiku / GPT-4o mini) tot enkele centen (Sonnet) per foto; maximaal 60 per uur per persoon.' }));
}

// ---------------------------------------------------------------------------
async function queueView(body, existing, { refreshCount }) {
  body.append(el('p', { class: 'muted small', text: 'Alles wat via "Later beoordelen" is opgeslagen. Controleer per fles de gegevens, vul aantal en prijs in en keur goed. Alle leden van het huishouden zien dezelfde wachtrij.' }));
  const top = el('div', { class: 'row between', style: { marginBottom: '0.5rem' } });
  const list = el('div', { class: 'stack' });
  body.append(top, list);

  async function load() {
    clear(list); clear(top);
    const q = await api.get('/api/intake');
    const open = q.items.filter((i) => ['recognized', 'pending', 'failed'].includes(i.status));
    const done = q.items.filter((i) => ['approved', 'skipped'].includes(i.status));
    const todo = q.counts.pending + q.counts.failed;
    top.append(el('span', { class: 'muted small', text: `${open.length} te beoordelen · ${q.counts.approved} toegevoegd · ${q.counts.skipped} overgeslagen` }),
      el('div', { class: 'row' },
        todo ? el('button', { class: 'btn secondary sm', type: 'button', text: `Herkenning uitvoeren (${todo})`, onClick: (e) => recognizeQueued(open.filter((i) => i.status !== 'recognized'), e.currentTarget) }) : null,
        done.length ? el('button', { class: 'btn ghost sm', type: 'button', text: 'Afgehandelde opruimen', onClick: async () => { if (await confirmDialog('Opruimen', `${done.length} afgehandelde items uit de wachtrij verwijderen? Toegevoegde wijnen blijven gewoon in de kelder.`, { okLabel: 'Opruimen' })) { await api.post('/api/intake/cleanup'); load(); refreshCount(); } } }) : null));
    if (!q.items.length) return list.append(el('div', { class: 'empty' }, el('div', { class: 'big', text: '🗂️' }), el('p', { text: 'De beoordelingswachtrij is leeg. Zet bij "Foto\'s toevoegen" het vinkje "Later beoordelen" aan om hier items te verzamelen.' })));
    const groups = new Map();
    for (const it of [...open, ...done]) { const k = it.batch_label || 'Zonder partij'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
    for (const [label, items] of groups) {
      list.append(el('h2', {}, label, el('span', { class: 'muted small', style: { fontFamily: 'var(--font-sans)', fontWeight: 400 }, text: ` · ${items.length} foto's · ${items[0].created_by_name || ''} · ${fmtDateTime(items[items.length - 1].created_at)}` })));
      for (const it of items) list.append(queueCard(it));
    }
  }

  async function recognizeQueued(items, btn) {
    btn.disabled = true; btn.textContent = 'Herkennen…';
    for (const it of items) {
      try {
        if (!it.label_image_url) continue;
        const res = await fetch(photoUrl(it.label_image_url)); const blob = await res.blob();
        const { dataUrl } = await shrinkImage(blob);
        const { wine, confidence } = await recognizeDataUrl(dataUrl);
        await api.patch(`/api/intake/${it.id}`, { wine, confidence, status: 'recognized', error: null });
      } catch (e) {
        await api.patch(`/api/intake/${it.id}`, { status: 'failed', error: e.message }).catch(() => {});
        if (e.status === 429) { toast('AI-limiet bereikt; probeer het later opnieuw.', 'error'); break; }
      }
    }
    load(); refreshCount();
  }

  function queueCard(it) {
    const c = el('div', { class: 'card bulk-item' });
    const thumb = el('div', { class: 'bulk-thumb' });
    if (it.label_image_url) thumb.append(el('img', { src: photoUrl(it.label_image_url), alt: '', loading: 'lazy' }));
    const head = el('div', { class: 'row between' },
      el('div', { class: 'row' }, el('span', { class: `badge ${Q_CLASS[it.status]}`, text: Q_LABEL[it.status] }), it.confidence !== null && it.confidence !== undefined && it.status === 'recognized' ? el('span', { class: 'muted small', text: `zekerheid ${Math.round(it.confidence * 100)}%` }) : null),
      it.status === 'approved' && it.approved_wine_id ? el('a', { class: 'small', href: `#/wijn/${it.approved_wine_id}`, text: 'Bekijken →' }) : null);
    const b = el('div', { class: 'grow' }, head);
    if (it.status === 'recognized') b.append(reviewBlock(it));
    else if (it.status === 'failed' || it.status === 'pending') b.append(el('p', { class: 'small muted', text: it.error ? `Herkenning mislukt: ${it.error}` : 'Nog niet herkend.' }), el('div', { class: 'row' },
      el('button', { class: 'btn ghost sm', type: 'button', text: 'Handmatig invullen', onClick: async () => { await api.patch(`/api/intake/${it.id}`, { wine: it.wine || { name: '', type: 'rood' }, status: 'recognized' }); load(); } }),
      el('button', { class: 'btn ghost sm', type: 'button', text: 'Verwijderen', onClick: async () => { await api.del(`/api/intake/${it.id}`); load(); refreshCount(); } })));
    else if (it.status === 'approved') b.append(el('p', { class: 'small', text: `${wineTitle(it.wine || {})} · ${it.bottle?.quantity || 1} fles${(it.bottle?.quantity || 1) === 1 ? '' : 'sen'}${it.bottle?.price ? ` · ${money(it.bottle.price)} p.st.` : ''}` }));
    else if (it.status === 'skipped') b.append(el('div', { class: 'row' }, el('span', { class: 'small muted', text: it.wine ? wineTitle(it.wine) : '' }), el('button', { class: 'btn ghost sm', type: 'button', text: 'Toch beoordelen', onClick: async () => { await api.patch(`/api/intake/${it.id}`, { status: 'recognized', wine: it.wine || { name: '', type: 'rood' } }); load(); refreshCount(); } })));
    c.append(thumb, b);
    return c;
  }

  function reviewBlock(it) {
    const wf = wineFields(it.wine || { name: '', type: 'rood' });
    const bf = bottleFields(it.bottle || { quantity: 1 });
    const wrap = el('div');
    const dup = it.wine ? findDuplicate(existing, it.wine) : null;
    if (dup) wrap.append(el('div', { class: 'badge warn', style: { marginBottom: '0.5rem' }, text: `Staat al in de kelder (${dup.bottles_in_cellar}×). Goedkeuren boekt flessen bij op die wijn.` }));
    const df = destinationForm({ compact: true });
    wrap.append(wf.node, el('div', { style: { padding: '0.6rem', margin: '0.4rem 0', background: 'var(--paper)', borderRadius: '10px' } }, bf.node, df.node));
    const approveBtn = el('button', { class: 'btn gold', type: 'button', text: '✓ Goedkeuren en toevoegen' });
    approveBtn.addEventListener('click', async () => {
      const w = wf.values(); if (!w.name) return toast('Vul een naam in', 'error');
      approveBtn.disabled = true; approveBtn.textContent = 'Toevoegen…';
      try {
        const approveCall = (extra = {}) => api.post(`/api/intake/${it.id}/approve`, { wine: w, bottle: bf.values(), consumed: df.values() || undefined, ...extra });
        let r;
        try { r = await approveCall(); }
        catch (e) {
          if (e.status !== 409 || !e.data?.duplicate) throw e;
          const choice = await duplicateDialog(e.data.duplicate, { quantity: bf.values().quantity });
          if (!choice) { approveBtn.disabled = false; approveBtn.textContent = '✓ Goedkeuren en toevoegen'; return; }
          r = await approveCall(choice === 'merge' ? { existing_wine_id: e.data.duplicate.id } : { allow_duplicate: true });
        }
        existing.push({ id: r.wine_id, name: w.name, producer: w.producer, vintage: w.vintage, bottles_in_cellar: bf.values().quantity });
        invalidateWines(); toast(`${wineTitle(w)} toegevoegd`, 'ok'); load(); refreshCount();
      } catch (e) { toast(e.message, 'error'); approveBtn.disabled = false; approveBtn.textContent = '✓ Goedkeuren en toevoegen'; }
    });
    const saveBtn = el('button', { class: 'btn ghost sm', type: 'button', text: 'Wijzigingen bewaren', title: 'Opslaan zonder goed te keuren', onClick: async () => { try { await api.patch(`/api/intake/${it.id}`, { wine: wf.values(), bottle: bf.values() }); toast('Bewaard', 'ok'); } catch (e) { toast(e.message, 'error'); } } });
    const skipBtn = el('button', { class: 'btn ghost sm', type: 'button', text: 'Overslaan', onClick: async () => { await api.patch(`/api/intake/${it.id}`, { status: 'skipped', wine: wf.values() }); load(); refreshCount(); } });
    const delBtn = el('button', { class: 'btn ghost sm', type: 'button', text: '🗑', title: 'Verwijderen uit wachtrij', onClick: async () => { if (await confirmDialog('Verwijderen', 'Dit item en de foto uit de wachtrij verwijderen?', { okLabel: 'Verwijderen', danger: true })) { await api.del(`/api/intake/${it.id}`); load(); refreshCount(); } } });
    wrap.append(el('div', { class: 'row' }, approveBtn, saveBtn, skipBtn, delBtn));
    return wrap;
  }
  await load();
}
