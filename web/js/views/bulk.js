// Bulk-invoer: meerdere etiketfoto's tegelijk → AI-herkenning in de wachtrij → per fles controleren en goedkeuren.
// Niets komt in de kelder zonder expliciete goedkeuring per fles.
import { el, clear, field, input, select, checkbox, toast, confirmDialog, TYPE_LABELS, TYPE_ICONS, shrinkImage, wineTitle, money } from '../util.js';
import { api } from '../api.js';
import { loadWines, invalidateWines } from '../data.js';
import { bottleForm } from './wine.js';

// status per item: wachten → herkennen → controleren | fout → goedgekeurd | overgeslagen
const STATUS_LABEL = { wachten: 'In de wachtrij', herkennen: 'Herkennen…', controleren: 'Controleren', fout: 'Herkenning mislukt', goedgekeurd: 'Toegevoegd', overgeslagen: 'Overgeslagen' };
const STATUS_CLASS = { wachten: '', herkennen: 'warn', controleren: 'gold', fout: 'bad', goedgekeurd: 'ok', overgeslagen: '' };

export async function render(main, { navigate }) {
  main.append(el('h1', { text: 'Bulk toevoegen' }),
    el('p', { class: 'muted small', text: 'Kies of fotografeer meerdere etiketten tegelijk. De AI-sommelier herkent ze één voor één; daarna controleer en keur je iedere fles apart goed voordat hij in de kelder komt.' }));

  const items = []; // { id, file, blob, dataUrl, status, wine, error, bottle }
  let running = false;
  let existing = [];
  try { existing = await loadWines(); } catch { /* niet kritisch */ }

  // Gedeelde aankoopgegevens (gelden als standaard voor elke fles; per fles aanpasbaar)
  const shared = bottleForm({ hideQty: true });
  const sharedCard = el('details', { class: 'card', open: true },
    el('summary', { style: { cursor: 'pointer', fontWeight: 600 }, text: 'Aankoopgegevens voor deze partij (standaard voor alle flessen)' }),
    el('p', { class: 'muted small', text: 'Bijv. datum, winkel en kelderlocatie. Per fles kun je dit nog aanpassen.' }),
    shared.node);
  main.append(sharedCard);

  // Foto's kiezen
  const fileInput = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  const camInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const drop = el('div', { class: 'dropzone', tabindex: 0, role: 'button' },
    el('div', { style: { fontSize: '2rem' }, text: '📷📷📷' }),
    el('div', { text: 'Tik om meerdere foto\'s te kiezen' }),
    el('div', { class: 'muted small', text: 'Op de iPhone: selecteer in de fotobibliotheek alle etiketten die je zojuist hebt gefotografeerd.' }));
  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('active'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('active'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('active'); addFiles([...e.dataTransfer.files]); });
  fileInput.addEventListener('change', () => { addFiles([...fileInput.files]); fileInput.value = ''; });
  camInput.addEventListener('change', () => { addFiles([...camInput.files]); camInput.value = ''; });
  const camBtn = el('button', { class: 'btn secondary', type: 'button', text: '📸 Foto maken en toevoegen', onClick: () => camInput.click() });
  main.append(el('div', { class: 'card' }, drop, fileInput, camInput, el('div', { class: 'row', style: { marginTop: '0.6rem' } }, camBtn, el('span', { class: 'muted small', text: 'Herhaal dit voor elke fles; de wachtrij loopt intussen door.' }))));

  // Voortgang en wachtrij
  const progress = el('div', { class: 'row between', style: { margin: '1rem 0 0.5rem' } });
  const progressText = el('span', { class: 'muted small' });
  const startBtn = el('button', { class: 'btn gold sm', type: 'button', text: 'Herkenning starten', hidden: true });
  const approveAllBtn = el('button', { class: 'btn ghost sm', type: 'button', text: 'Alles wat klaar staat goedkeuren', hidden: true });
  progress.append(progressText, el('div', { class: 'row' }, approveAllBtn, startBtn));
  const list = el('div', { class: 'stack' });
  main.append(progress, list);

  startBtn.addEventListener('click', () => runQueue());
  approveAllBtn.addEventListener('click', async () => {
    const ready = items.filter((i) => i.status === 'controleren');
    if (!ready.length) return;
    if (!(await confirmDialog('Alles goedkeuren', `${ready.length} herkende fles(sen) zonder verdere controle toevoegen aan de kelder?`, { okLabel: 'Toevoegen' }))) return;
    for (const it of ready) await approve(it);
  });

  function addFiles(files) {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return toast('Geen afbeeldingen gevonden', 'error');
    for (const f of imgs) items.push({ id: crypto.randomUUID(), file: f, status: 'wachten', wine: null, error: null, bottle: null, dataUrl: null, blob: null });
    toast(`${imgs.length} foto${imgs.length === 1 ? '' : "'s"} toegevoegd aan de wachtrij`, 'ok');
    drawAll();
    runQueue();
  }

  async function runQueue() {
    if (running) return;
    running = true; startBtn.hidden = true;
    try {
      for (const it of items) {
        if (it.status !== 'wachten') continue;
        it.status = 'herkennen'; draw(it); updateProgress();
        try {
          if (!it.dataUrl) { const s = await shrinkImage(it.file); it.dataUrl = s.dataUrl; it.blob = s.blob; }
          const { wine } = await api.post('/api/ai/recognize', { image: it.dataUrl });
          it.wine = Object.fromEntries(Object.entries(wine).filter(([k, v]) => v !== null && v !== undefined && k !== 'confidence'));
          it.confidence = wine.confidence;
          if (!it.wine.type) it.wine.type = 'rood';
          it.duplicate = findDuplicate(it.wine);
          it.status = 'controleren';
        } catch (e) {
          it.status = 'fout'; it.error = e.message;
          if (e.status === 429) { toast('AI-limiet bereikt (60 per uur). De rest wacht; probeer later "Herkenning starten".', 'error'); for (const rest of items) if (rest.status === 'herkennen') rest.status = 'wachten'; break; }
          if (e.status === 401) break;
        }
        draw(it); updateProgress();
      }
    } finally {
      running = false;
      startBtn.hidden = !items.some((i) => i.status === 'wachten');
      updateProgress();
    }
  }

  function findDuplicate(w) {
    const n = (w.name || '').toLowerCase(), p = (w.producer || '').toLowerCase();
    return existing.find((x) => x.name.toLowerCase() === n && (x.producer || '').toLowerCase() === p && (x.vintage || null) === (w.vintage || null)) || null;
  }

  function updateProgress() {
    const c = (s) => items.filter((i) => i.status === s).length;
    const parts = [];
    if (c('wachten') + c('herkennen')) parts.push(`${c('wachten') + c('herkennen')} in wachtrij`);
    if (c('controleren')) parts.push(`${c('controleren')} te controleren`);
    if (c('goedgekeurd')) parts.push(`${c('goedgekeurd')} toegevoegd`);
    if (c('fout')) parts.push(`${c('fout')} mislukt`);
    if (c('overgeslagen')) parts.push(`${c('overgeslagen')} overgeslagen`);
    progressText.textContent = items.length ? `${items.length} foto's · ${parts.join(' · ')}` : '';
    approveAllBtn.hidden = c('controleren') < 2;
  }

  function drawAll() { clear(list); for (const it of items) list.append(card(it)); updateProgress(); }
  function draw(it) { const old = list.querySelector(`[data-id="${it.id}"]`); const fresh = card(it); old ? old.replaceWith(fresh) : list.append(fresh); }

  function card(it) {
    const c = el('div', { class: 'card bulk-item', dataset: { id: it.id } });
    const thumb = el('div', { class: 'bulk-thumb' });
    if (it.dataUrl) thumb.append(el('img', { src: it.dataUrl, alt: '' }));
    else { thumb.append(el('span', { class: 'muted small', text: '…' })); readPreview(it, thumb); }
    const head = el('div', { class: 'row between' },
      el('div', { class: 'row' }, el('span', { class: `badge ${STATUS_CLASS[it.status]}`, text: STATUS_LABEL[it.status] }), it.confidence !== undefined && it.confidence !== null && it.status === 'controleren' ? el('span', { class: 'muted small', text: `zekerheid ${Math.round(it.confidence * 100)}%` }) : null),
      it.status === 'goedgekeurd' ? el('a', { class: 'small', href: `#/wijn/${it.savedId}`, text: 'Bekijken →' }) : null);
    const body = el('div', { class: 'grow' }, head);

    if (it.status === 'controleren') body.append(reviewForm(it));
    else if (it.status === 'fout') body.append(el('p', { class: 'small', text: it.error || 'Onbekende fout' }), el('div', { class: 'row' },
      el('button', { class: 'btn sm', type: 'button', text: 'Opnieuw proberen', onClick: () => { it.status = 'wachten'; it.error = null; draw(it); runQueue(); } }),
      el('button', { class: 'btn ghost sm', type: 'button', text: 'Handmatig invullen', onClick: () => { it.wine = { name: '', type: 'rood' }; it.status = 'controleren'; draw(it); } }),
      el('button', { class: 'btn ghost sm', type: 'button', text: 'Overslaan', onClick: () => { it.status = 'overgeslagen'; draw(it); updateProgress(); } })));
    else if (it.status === 'goedgekeurd') body.append(el('p', { class: 'small', text: `${wineTitle(it.wine)} · ${it.bottle.quantity} fles${it.bottle.quantity === 1 ? '' : 'sen'}` }));
    else if (it.status === 'overgeslagen') body.append(el('button', { class: 'btn ghost sm', type: 'button', text: 'Toch beoordelen', onClick: () => { it.status = it.wine ? 'controleren' : 'wachten'; draw(it); runQueue(); } }));
    else body.append(el('p', { class: 'muted small', text: it.file.name }));
    c.append(thumb, body);
    return c;
  }

  async function readPreview(it, thumb) {
    try { const s = await shrinkImage(it.file, 600, 0.7); if (!it.dataUrl) { /* kleine preview alleen voor weergave */ } clear(thumb); thumb.append(el('img', { src: s.dataUrl, alt: '' })); } catch { /* laat leeg */ }
  }

  function reviewForm(it) {
    const w = it.wine;
    const F = {};
    const mk = (k, attrs = {}) => (F[k] = input({ value: w[k] ?? '', maxlength: 200, ...attrs }));
    mk('name', { placeholder: 'Naam *' }); mk('producer', { placeholder: 'Producent' });
    F.type = select(Object.entries(TYPE_LABELS), { value: w.type || 'rood' });
    F.vintage = el('input', { type: 'number', min: 1800, max: 2100, value: w.vintage ?? '', placeholder: 'Jaargang' });
    mk('country', { placeholder: 'Land' }); mk('region', { placeholder: 'Streek' }); mk('appellation', { placeholder: 'Appellatie' });
    F.grapes = input({ value: (w.grapes || []).join(', '), placeholder: 'Druiven (komma-gescheiden)', maxlength: 500 });
    const wrap = el('div');
    if (it.duplicate) wrap.append(el('div', { class: 'badge warn', style: { marginBottom: '0.5rem' }, text: `Staat al in de kelder (${it.duplicate.bottles_in_cellar}×). Goedkeuren voegt flessen toe aan die wijn.` }));
    wrap.append(el('div', { class: 'form-grid' },
      el('div', { class: 'full' }, field('Naam *', F.name)), field('Producent', F.producer), field('Type', F.type), field('Jaargang', F.vintage),
      field('Land', F.country), field('Streek', F.region), field('Appellatie', F.appellation), el('div', { class: 'full' }, field('Druiven', F.grapes))));
    // Overige herkende gegevens (drinkvenster, beschrijving) inklapbaar tonen
    const extra = [['Drinkvenster', w.drink_from || w.drink_until ? `${w.drink_from || '?'} – ${w.drink_until || '?'}` : null], ['Bewaarwijn', w.aging_wine ? 'ja' : null], ['Lekker bij', (w.food_pairings || []).slice(0, 5).join(', ') || null], ['Prijsindicatie', w.estimated_price ? money(w.estimated_price) : null], ['Beschrijving', w.description]].filter(([, v]) => v);
    if (extra.length) wrap.append(el('details', { class: 'small', style: { margin: '0.3rem 0 0.6rem' } }, el('summary', { text: 'Overige herkende gegevens (worden meegenomen)' }), el('dl', { class: 'kv' }, extra.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]))));
    // Flesgegevens: vooraf ingevuld met de gedeelde aankoopgegevens
    const bf = bottleForm({ ...shared.values(), quantity: 1 });
    wrap.append(el('details', { class: 'small', style: { marginBottom: '0.6rem' } }, el('summary', { text: 'Aantal, prijs en locatie voor deze fles' }), bf.node));
    const qtyQuick = el('input', { type: 'number', min: 1, max: 500, value: 1, style: { width: '5rem' }, 'aria-label': 'Aantal flessen' });
    qtyQuick.addEventListener('input', () => { const q = bf.node.querySelector('input[type="number"][min="1"]'); if (q) q.value = qtyQuick.value; });
    const approveBtn = el('button', { class: 'btn gold', type: 'button', text: '✓ Goedkeuren en toevoegen' });
    approveBtn.addEventListener('click', async () => {
      const name = F.name.value.trim();
      if (!name) return toast('Vul een naam in', 'error');
      it.wine = { ...w, name, producer: F.producer.value.trim() || null, type: F.type.value, vintage: F.vintage.value ? Number(F.vintage.value) : null, country: F.country.value.trim() || null, region: F.region.value.trim() || null, appellation: F.appellation.value.trim() || null, grapes: F.grapes.value.split(',').map((s) => s.trim()).filter(Boolean) };
      const b = bf.values(); b.quantity = Number(qtyQuick.value) || b.quantity || 1;
      it.bottle = b;
      approveBtn.disabled = true; approveBtn.textContent = 'Toevoegen…';
      await approve(it);
    });
    wrap.append(el('div', { class: 'row' }, el('label', { class: 'row small' }, 'Aantal', qtyQuick), approveBtn,
      el('button', { class: 'btn ghost sm', type: 'button', text: 'Overslaan', onClick: () => { it.status = 'overgeslagen'; draw(it); updateProgress(); } })));
    return wrap;
  }

  async function approve(it) {
    try {
      if (!it.bottle) it.bottle = { ...shared.values(), quantity: 1 };
      let labelKey = null;
      if (it.blob) { try { labelKey = (await api.upload(it.blob)).key; } catch { /* foto is niet verplicht */ } }
      const dup = findDuplicate(it.wine);
      let savedId;
      if (dup) {
        const r = await api.post(`/api/wines/${dup.id}/bottles`, it.bottle);
        savedId = r.wine.id;
      } else {
        const payload = { ...it.wine, label_image_key: labelKey, quantity: it.bottle.quantity, bottle: it.bottle };
        const r = await api.post('/api/wines', payload);
        savedId = r.wine.id;
        existing.push({ id: savedId, name: it.wine.name, producer: it.wine.producer, vintage: it.wine.vintage, bottles_in_cellar: it.bottle.quantity });
      }
      it.savedId = savedId; it.status = 'goedgekeurd';
      invalidateWines();
      toast(`${wineTitle(it.wine)} toegevoegd`, 'ok');
    } catch (e) {
      it.status = 'controleren'; toast(e.message, 'error');
    }
    draw(it); updateProgress();
  }

  main.append(el('p', { class: 'muted small', style: { marginTop: '1.5rem' }, text: 'Tip: fotografeer bij goed licht recht van voren; het achteretiket helpt bij druiven en alcohol. Herkenning kost per foto ongeveer een cent (Claude Haiku/GPT-4o mini) tot enkele centen (Sonnet). Maximaal 60 herkenningen per uur per persoon.' }));
}
