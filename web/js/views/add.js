// Wijn toevoegen (via foto of handmatig) en bewerken.
import { el, clear, field, input, select, checkbox, toast, TYPE_LABELS, shrinkImage, wineTitle } from '../util.js';
import { api, photoUrl } from '../api.js';
import { loadWines, invalidateWines } from '../data.js';
import { bottleForm, destinationForm } from './wine.js';

export async function render(main, { params, mode, navigate }) {
  const editing = mode === 'edit';
  let existing = null;
  if (editing) existing = (await api.get(`/api/wines/${params[0]}`)).wine;

  main.append(el('div', { class: 'row between' }, el('h1', { text: editing ? `Bewerken — ${existing.name}` : 'Wijn toevoegen' }),
    editing ? null : el('a', { class: 'btn ghost sm', href: '#/bulk', text: '📷 Meerdere flessen tegelijk' })));
  const wrap = el('div', { class: 'stack' });
  main.append(wrap);

  const draft = { ...(existing || {}), type: existing?.type || 'rood', grapes: existing?.grapes || [], food_pairings: existing?.food_pairings || [] };
  let labelKey = existing?.label_image_key || null;
  let labelPreviewUrl = existing?.label_image_url ? photoUrl(existing.label_image_url) : null;

  // ---- Stap 1: foto ----------------------------------------------------------
  const photoCard = el('div', { class: 'card' });
  photoCard.append(el('h2', { style: { marginTop: 0 }, text: editing ? 'Etiketfoto' : '1. Maak of kies een foto van het etiket' }));
  const fileInput = el('input', { type: 'file', accept: 'image/*', hidden: true });
  const drop = el('div', { class: 'dropzone', tabindex: 0, role: 'button' },
    el('div', { style: { fontSize: '2rem' }, text: '📷' }),
    el('div', { text: 'Tik om een foto te maken of te kiezen' }),
    el('div', { class: 'muted small', text: 'De AI-sommelier herkent de wijn en vult de gegevens in. Je kunt daarna alles nog aanpassen.' }));
  const preview = el('img', { class: 'preview', alt: 'Voorbeeld van het etiket', hidden: !labelPreviewUrl, src: labelPreviewUrl || null });
  const hint = input({ placeholder: 'Optionele aanwijzing voor de AI, bijv. "achteretiket" of "jaargang 2019"', maxlength: 300 });
  const recognizeBtn = el('button', { class: 'btn gold', type: 'button', text: '✨ Herken wijn vanaf foto', disabled: true });
  const statusLine = el('div', { class: 'small muted' });
  let photo = null; // { blob, dataUrl }

  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('active'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('active'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('active'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
  fileInput.addEventListener('change', () => fileInput.files[0] && handleFile(fileInput.files[0]));

  async function handleFile(file) {
    try {
      statusLine.textContent = 'Foto verkleinen…';
      photo = await shrinkImage(file);
      preview.src = photo.dataUrl; preview.hidden = false;
      labelKey = null; // nieuwe foto wordt bij opslaan geüpload
      recognizeBtn.disabled = false;
      statusLine.textContent = 'Foto klaar. Herken de wijn of vul de gegevens zelf in.';
      if (!editing) recognize();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function recognize() {
    if (!photo) return;
    recognizeBtn.disabled = true; recognizeBtn.textContent = 'Herkennen…';
    statusLine.textContent = 'De AI-sommelier bekijkt het etiket…';
    try {
      const { wine } = await api.post('/api/ai/recognize', { image: photo.dataUrl, hint: hint.value || undefined });
      Object.assign(draft, Object.fromEntries(Object.entries(wine).filter(([k, v]) => v !== null && v !== undefined && k !== 'confidence')));
      fillForm();
      const conf = wine.confidence !== null && wine.confidence !== undefined ? ` (zekerheid ${Math.round(wine.confidence * 100)}%)` : '';
      statusLine.textContent = `Herkend: ${wineTitle(wine)}${conf}. Controleer de gegevens hieronder.`;
      toast('Wijn herkend — controleer de gegevens', 'ok');
      await checkDuplicate();
      formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      statusLine.textContent = '';
      toast(e.message, 'error');
    } finally { recognizeBtn.disabled = false; recognizeBtn.textContent = '✨ Herken wijn vanaf foto'; }
  }
  recognizeBtn.addEventListener('click', recognize);
  photoCard.append(drop, fileInput, preview, el('div', { class: 'row', style: { marginTop: '0.7rem' } }, el('div', { class: 'grow' }, hint), recognizeBtn), statusLine);
  wrap.append(photoCard);

  // ---- Stap 2: gegevens -------------------------------------------------------
  const formCard = el('div', { class: 'card' });
  formCard.append(el('h2', { style: { marginTop: 0 }, text: editing ? 'Gegevens' : '2. Controleer of vul de gegevens in' }));
  const F = {};
  const mk = (key, attrs = {}) => (F[key] = input({ maxlength: 200, ...attrs }));
  const mkNum = (key, attrs = {}) => (F[key] = el('input', { type: 'number', ...attrs }));
  const mkSel = (key, opts, attrs = {}) => (F[key] = select(opts, attrs));
  const optional = (arr) => [['', '— kies —'], ...arr.map((v) => [v, v])];

  mk('name', { required: true, placeholder: 'Bijv. Château Margaux' }); mk('producer', { placeholder: 'Producent / domein' });
  mk('country', { placeholder: 'Frankrijk', list: 'landen' }); mk('region', { placeholder: 'Bordeaux', list: 'streken' }); mk('appellation', { placeholder: 'Margaux AOC' });
  mkSel('type', Object.entries(TYPE_LABELS));
  mkNum('vintage', { min: 1800, max: 2100, placeholder: 'Leeg = non-vintage' });
  mk('grapes', { placeholder: 'Cabernet Sauvignon, Merlot (komma-gescheiden)', maxlength: 500 });
  mkNum('alcohol', { min: 0, max: 30, step: '0.1', placeholder: '13.5' });
  mkSel('sweetness', optional(['droog', 'halfdroog', 'halfzoet', 'zoet', 'brut', 'extra brut', 'demi-sec']));
  mkSel('body', optional(['licht', 'medium', 'vol']));
  mkSel('tannin', optional(['laag', 'medium', 'hoog', 'n.v.t.']));
  mkSel('acidity', optional(['laag', 'medium', 'hoog']));
  const aging = checkbox('Bewaarwijn (wordt beter met rijping)'); F.aging_wine = aging.input;
  mkNum('drink_from', { min: 1800, max: 2200, placeholder: 'jaar' }); mkNum('drink_until', { min: 1800, max: 2200, placeholder: 'jaar' });
  mkNum('peak_from', { min: 1800, max: 2200, placeholder: 'jaar' }); mkNum('peak_until', { min: 1800, max: 2200, placeholder: 'jaar' });
  F.development = el('textarea', { placeholder: 'Hoe ontwikkelt deze wijn zich? Jong fruitig, later meer leer en tabak…', maxlength: 2000 });
  mk('serving_temp', { placeholder: '16-18 °C', maxlength: 40 }); mkNum('decant_minutes', { min: 0, max: 600, placeholder: 'minuten' });
  mk('food_pairings', { placeholder: 'Lamsrack, gerijpte kaas, wild (komma-gescheiden)', maxlength: 1000 });
  F.description = el('textarea', { placeholder: 'Stijl en karakter van de wijn', maxlength: 4000 });
  F.notes = el('textarea', { placeholder: 'Eigen notities (bijv. waar gekocht, waarom, herinnering)', maxlength: 4000 });

  const enrichBtn = el('button', { class: 'btn secondary sm', type: 'button', text: '✨ Ontbrekende gegevens laten aanvullen door AI' });
  enrichBtn.addEventListener('click', async () => {
    readForm();
    if (!draft.name) return toast('Vul eerst de naam in', 'error');
    enrichBtn.disabled = true;
    try {
      const { wine } = await api.post('/api/ai/enrich', { name: draft.name, producer: draft.producer, vintage: draft.vintage, country: draft.country, region: draft.region, grapes: draft.grapes, type: draft.type });
      for (const [k, v] of Object.entries(wine)) if ((draft[k] === null || draft[k] === undefined || draft[k] === '' || (Array.isArray(draft[k]) && !draft[k].length)) && v !== null && v !== undefined) draft[k] = v;
      fillForm(); toast('Gegevens aangevuld — controleer ze', 'ok');
    } catch (e) { toast(e.message, 'error'); } finally { enrichBtn.disabled = false; }
  });

  const dupNotice = el('div', { class: 'badge warn', hidden: true });

  formCard.append(
    el('div', { class: 'form-grid' },
      el('div', { class: 'full' }, field('Naam van de wijn *', F.name)), field('Producent', F.producer), field('Type *', F.type), field('Jaargang', F.vintage),
      field('Land', F.country), field('Streek', F.region), field('Appellatie / classificatie', F.appellation),
      el('div', { class: 'full' }, field('Druiven', F.grapes)), field('Alcohol %', F.alcohol), field('Zoetheid', F.sweetness), field('Body', F.body), field('Tannine', F.tannin), field('Zuren', F.acidity)),
    dupNotice,
    el('div', { class: 'row', style: { margin: '0.5rem 0 1rem' } }, enrichBtn),
    el('fieldset', {}, el('legend', { text: 'Rijping & drinkvenster' }),
      el('div', { class: 'field' }, aging.wrap),
      el('div', { class: 'form-grid' }, field('Drinken vanaf', F.drink_from), field('Drinken tot', F.drink_until), field('Op z\'n best vanaf', F.peak_from), field('Op z\'n best tot', F.peak_until)),
      field('Ontwikkeling', F.development),
      el('div', { class: 'form-grid' }, field('Serveertemperatuur', F.serving_temp), field('Decanteren (min)', F.decant_minutes))),
    el('fieldset', {}, el('legend', { text: 'Smaak & eten' }), field('Lekker bij', F.food_pairings), field('Beschrijving', F.description), field('Eigen notities', F.notes)),
  );
  wrap.append(formCard);

  // ---- Stap 3: flessen (alleen bij nieuw) -------------------------------------
  let bottles = null, destination = null;
  if (!editing) {
    const bCard = el('div', { class: 'card' });
    bCard.append(el('h2', { style: { marginTop: 0 }, text: '3. Flessen' }));
    destination = destinationForm();
    bottles = bottleForm({});
    bCard.append(destination.node, el('hr', { style: { border: 0, borderTop: '1px solid var(--line)', margin: '0.8rem 0' } }), bottles.node,
      el('p', { class: 'muted small', text: 'Bij een gekregen fles kun je na het opslaan met één klik een prijsindicatie ophalen. Een fles die al gedronken is (bijv. in een restaurant) komt direct in de historie en telt niet mee in de kelder.' }));
    wrap.append(bCard);
  }

  // Datalists voor autocomplete op basis van bestaande wijnen
  try {
    const all = await loadWines();
    const dl = (id, vals) => el('datalist', { id }, [...new Set(vals.filter(Boolean))].map((v) => el('option', { value: v })));
    wrap.append(dl('landen', all.map((w) => w.country)), dl('streken', all.map((w) => w.region)), dl('locaties', all.flatMap((w) => (w.locations || '').split(','))));
  } catch { /* niet kritisch */ }

  // ---- Opslaan ----------------------------------------------------------------
  const saveBtn = el('button', { class: 'btn gold', type: 'button', text: editing ? 'Wijzigingen opslaan' : 'Toevoegen' });
  wrap.append(el('div', { class: 'row', style: { justifyContent: 'flex-end' } }, el('a', { class: 'btn ghost', href: editing ? `#/wijn/${existing.id}` : '#/kelder', text: 'Annuleren' }), saveBtn));
  saveBtn.addEventListener('click', async () => {
    readForm();
    if (!draft.name) return toast('De naam van de wijn is verplicht', 'error');
    saveBtn.disabled = true;
    try {
      if (photo && !labelKey) {
        const up = await api.upload(photo.blob);
        labelKey = up.key;
      }
      const payload = { ...draft, label_image_key: labelKey };
      delete payload.label_image_url; delete payload.bottles_in_cellar; delete payload.bottles_total; delete payload.avg_rating; delete payload.tasting_count; delete payload.cellar_value; delete payload.locations; delete payload.any_gifted;
      let result;
      if (editing) {
        result = await api.put(`/api/wines/${existing.id}`, payload);
      } else {
        const b = bottles.values();
        const consumed = destination.values();
        result = await api.post('/api/wines', { ...payload, quantity: b.quantity, bottle: b, consumed: consumed || undefined });
      }
      invalidateWines();
      toast(editing ? 'Wijn bijgewerkt' : (destination?.isHistory() ? 'Wijn toegevoegd aan de historie 🥂' : 'Wijn toegevoegd aan de kelder 🍷'), 'ok');
      navigate(`/wijn/${result.wine.id}`);
    } catch (e) { toast(e.message, 'error'); saveBtn.disabled = false; }
  });

  function fillForm() {
    for (const [k, node] of Object.entries(F)) {
      if (k === 'aging_wine') node.checked = !!draft.aging_wine;
      else if (k === 'grapes' || k === 'food_pairings') node.value = (draft[k] || []).join(', ');
      else node.value = draft[k] ?? '';
    }
  }
  function readForm() {
    for (const [k, node] of Object.entries(F)) {
      if (k === 'aging_wine') draft.aging_wine = node.checked;
      else if (k === 'grapes' || k === 'food_pairings') draft[k] = node.value.split(',').map((s) => s.trim()).filter(Boolean);
      else if (node.type === 'number') draft[k] = node.value === '' ? null : Number(node.value);
      else draft[k] = node.value.trim() || null;
    }
    if (!draft.type) draft.type = 'rood';
  }
  async function checkDuplicate() {
    if (editing) return;
    try {
      const all = await loadWines();
      const same = all.find((w) => w.name.toLowerCase() === (draft.name || '').toLowerCase() && (w.producer || '').toLowerCase() === (draft.producer || '').toLowerCase() && (w.vintage || null) === (draft.vintage || null));
      if (same) {
        clear(dupNotice);
        dupNotice.append('Deze wijn staat al in de kelder — ', el('a', { href: `#/wijn/${same.id}`, text: 'voeg daar flessen toe' }), ' in plaats van een dubbele.');
        dupNotice.hidden = false;
      } else dupNotice.hidden = true;
    } catch { /* stil */ }
  }
  F.name.addEventListener('blur', () => { readForm(); checkDuplicate(); });
  fillForm();
}
