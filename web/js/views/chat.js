// Chat met de Sommelier: tekst, foto's (etiket of wijnkaart) en spraak. Alleen over wijn.
import { el, clear, toast, confirmDialog, shrinkImage, fmtDateTime } from '../util.js';
import { api, photoUrl, session } from '../api.js';
import { invalidateWines } from '../data.js';

const QUICK = [
  ['🍷 Wat drinken we vanavond?', 'Wat drinken we vanavond?'],
  ['⏳ Wat moet er snel op?', 'Welke wijnen moeten snel gedronken worden?'],
  ['📷 Etiket', null],
  ['🔎 Hebben we nog…', 'Hebben we nog '],
  ['🗂️ Wachtrij', 'Wat staat er in de beoordelingswachtrij?'],
];

const TOOL_LABEL = { zoek_kelder: 'kelder doorzocht', wijn_details: 'wijn bekeken', herken_etiket: 'etiket herkend', lees_wijnkaart: 'wijnkaart gelezen', zet_in_wachtrij: 'in wachtrij gezet', voeg_toe_aan_kelder: 'toegevoegd', fles_afboeken: 'fles afgeboekt', kies_vanavond: 'suggesties gekozen', verlanglijst: 'verlanglijst', drinkvensters: 'drinkvensters bekeken', wachtrij_status: 'wachtrij bekeken', onderwerpbewaking: 'onderwerp geweigerd' };

export async function render(main) {
  main.classList.add('chat-main');
  const head = el('div', { class: 'row between chat-head' },
    el('div', {}, el('h1', { style: { margin: 0 }, text: '🍷 De Sommelier' }), el('div', { class: 'small muted', text: 'Praat alleen over wijn. Stuur een etiket, een wijnkaart of een vraag.' })),
    el('button', { class: 'btn ghost sm', type: 'button', text: 'Gesprek wissen', onClick: async () => { if (await confirmDialog('Gesprek wissen', 'Alle berichten in deze chat verwijderen? Je kelder blijft ongemoeid.', { okLabel: 'Wissen', danger: true })) { await api.del('/api/sommelier/chat'); load(); } } }));
  const log = el('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite' });
  const quick = el('div', { class: 'chips chat-quick' });
  const preview = el('div', { class: 'chat-preview', hidden: true });
  const input = el('textarea', { class: 'chat-input', placeholder: 'Vraag de Sommelier… (bijv. "past deze Rioja bij lamsrack?")', rows: 1, maxlength: 2000, enterkeyhint: 'send' });
  const fileInput = el('input', { type: 'file', accept: 'image/*', hidden: true });
  const camInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const photoBtn = el('button', { class: 'icon-btn chat-btn', type: 'button', title: 'Foto kiezen', 'aria-label': 'Foto kiezen', text: '🖼️' });
  const camBtn = el('button', { class: 'icon-btn chat-btn', type: 'button', title: 'Foto maken', 'aria-label': 'Foto maken', text: '📷' });
  const micBtn = el('button', { class: 'icon-btn chat-btn', type: 'button', title: 'Spreek je vraag in', 'aria-label': 'Spreek in', text: '🎤' });
  const sendBtn = el('button', { class: 'btn gold chat-send', type: 'button', text: '➤', 'aria-label': 'Versturen' });
  const composer = el('div', { class: 'chat-composer' }, preview, el('div', { class: 'chat-row' }, photoBtn, camBtn, input, micBtn, sendBtn), fileInput, camInput);
  main.append(head, log, quick, composer);

  let pending = null; // { dataUrl, blob }
  let busy = false;

  for (const [label, text] of QUICK) {
    const c = el('button', { class: 'chip', type: 'button', text: label });
    c.addEventListener('click', () => { if (text === null) camInput.click(); else if (text.endsWith(' ')) { input.value = text; input.focus(); } else send(text); });
    quick.append(c);
  }

  function bubble(m) {
    const me = m.role === 'user';
    const b = el('div', { class: `chat-msg ${me ? 'me' : 'som'}` });
    if (m.image_url) b.append(el('img', { class: 'chat-img', src: photoUrl(m.image_url), alt: 'Meegestuurde foto', loading: 'lazy' }));
    else if (m.local_image) b.append(el('img', { class: 'chat-img', src: m.local_image, alt: 'Meegestuurde foto' }));
    if (m.content && m.content !== '📷 (foto)') b.append(...renderText(m.content));
    if (m.actions?.length) b.append(el('div', { class: 'chat-actions', text: m.actions.map((a) => TOOL_LABEL[a.tool] || a.tool).filter((v, i, a) => a.indexOf(v) === i).join(' · ') }));
    if (m.created_at) b.append(el('div', { class: 'chat-time', text: fmtDateTime(m.created_at) }));
    return b;
  }

  // Eenvoudige opmaak: regels, opsommingen en **vet**; alles via textContent (geen HTML-injectie mogelijk)
  function renderText(text) {
    const out = [];
    for (const line of String(text).split('\n')) {
      const p = el('p', { class: 'chat-p' });
      const bullet = /^\s*[-•*]\s+/.test(line);
      const parts = (bullet ? '• ' + line.replace(/^\s*[-•*]\s+/, '') : line).split(/(\*\*[^*]+\*\*)/g);
      for (const part of parts) { if (/^\*\*[^*]+\*\*$/.test(part)) p.append(el('strong', { text: part.slice(2, -2) })); else if (part) p.append(part); }
      out.push(p);
    }
    return out;
  }

  function scroll() { log.scrollTop = log.scrollHeight; }

  async function load() {
    clear(log);
    try {
      const { messages } = await api.get('/api/sommelier/chat');
      if (!messages.length) log.append(el('div', { class: 'chat-msg som' }, ...renderText(`Goedendag ${session.user?.name || ''}! Ik ben jullie huissommelier. Ik ken de kelder en help met:\n- **wat je vanavond opent** (evt. bij een gerecht)\n- **etiketten**: stuur een foto, ik herken de wijn en zet hem klaar\n- **wijnkaarten** in een restaurant: foto + wat je eet\n- **voorraad, drinkvensters, verlanglijst** en het afboeken van een fles met proefnotitie\n\nIk praat alleen over wijn. Waarmee kan ik helpen? 🍷`)));
      for (const m of messages) log.append(bubble(m));
    } catch (e) { log.append(el('p', { class: 'badge bad', text: e.message })); }
    scroll();
  }

  async function setPhoto(file) {
    try { pending = await shrinkImage(file, 1600, 0.86); clear(preview); preview.append(el('img', { src: pending.dataUrl, alt: '' }), el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Foto verwijderen', text: '✕', onClick: () => { pending = null; preview.hidden = true; } })); preview.hidden = false; input.focus(); }
    catch (e) { toast(e.message, 'error'); }
  }
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) setPhoto(fileInput.files[0]); fileInput.value = ''; });
  camInput.addEventListener('change', () => { if (camInput.files[0]) setPhoto(camInput.files[0]); camInput.value = ''; });
  photoBtn.addEventListener('click', () => fileInput.click());
  camBtn.addEventListener('click', () => camInput.click());

  async function send(forcedText) {
    if (busy) return;
    const text = (forcedText ?? input.value).trim();
    if (!text && !pending) return;
    busy = true; sendBtn.disabled = true; input.value = ''; autosize();
    const mine = { role: 'user', content: text || '📷 (foto)', local_image: pending?.dataUrl };
    log.append(bubble(mine));
    const typing = el('div', { class: 'chat-msg som typing' }, el('span'), el('span'), el('span'));
    log.append(typing); scroll();
    const img = pending?.dataUrl; pending = null; preview.hidden = true;
    try {
      const r = await api.post('/api/sommelier/chat', { text, image: img || undefined });
      typing.remove();
      log.append(bubble({ role: 'assistant', content: r.reply, actions: r.actions, created_at: new Date().toISOString() }));
      if (r.actions?.some((a) => ['voeg_toe_aan_kelder', 'fles_afboeken', 'zet_in_wachtrij'].includes(a.tool))) invalidateWines();
    } catch (e) { typing.remove(); log.append(el('div', { class: 'chat-msg som' }, el('p', { class: 'chat-p', text: `Sorry, dat ging mis: ${e.message}` }))); }
    busy = false; sendBtn.disabled = false; scroll(); input.focus();
  }
  sendBtn.addEventListener('click', () => send());
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.matchMedia('(min-width: 900px)').matches) { e.preventDefault(); send(); } });
  function autosize() { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; }
  input.addEventListener('input', autosize);

  // Spraak: Web Speech API (iPhone Safari, Chrome). Zet gesproken tekst in het invoerveld.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) micBtn.hidden = true;
  else {
    let rec = null;
    micBtn.addEventListener('click', () => {
      if (rec) { rec.stop(); return; }
      rec = new SR(); rec.lang = 'nl-NL'; rec.interimResults = true; rec.continuous = false;
      micBtn.classList.add('recording'); micBtn.textContent = '⏹';
      let finalText = '';
      rec.onresult = (e) => { let interim = ''; for (const r of e.results) { if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript; } input.value = (finalText + ' ' + interim).trim(); autosize(); };
      rec.onerror = (e) => { toast(e.error === 'not-allowed' ? 'Geen toestemming voor de microfoon' : 'Spraakherkenning mislukt', 'error'); };
      rec.onend = () => { micBtn.classList.remove('recording'); micBtn.textContent = '🎤'; rec = null; if (input.value.trim()) send(); };
      try { rec.start(); } catch { rec = null; micBtn.classList.remove('recording'); micBtn.textContent = '🎤'; }
    });
  }

  await load();
  return { destroy() { main.classList.remove('chat-main'); } };
}
