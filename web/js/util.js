// DOM-hulpfuncties (veilig: alles via textContent, nooit innerHTML), formattering, meldingen en modals.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') throw new Error('innerHTML is niet toegestaan');
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') for (const [prop, val] of Object.entries(v)) { if (prop.startsWith('--')) node.style.setProperty(prop, val); else node.style[prop] = val; }
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  append(node, children);
  return node;
}

export function append(parent, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    parent.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return parent;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function field(labelText, input, { hint } = {}) {
  return el('label', { class: 'field' }, el('span', { text: labelText }), input, hint ? el('small', { class: 'muted', text: hint }) : null);
}

export function input(attrs = {}) {
  return el('input', { type: 'text', ...attrs });
}

export function select(options, attrs = {}) {
  const s = el('select', attrs);
  for (const o of options) {
    const [value, label] = Array.isArray(o) ? o : [o, o];
    s.append(el('option', { value, text: label }));
  }
  if (attrs.value !== undefined) s.value = attrs.value ?? '';
  return s;
}

export function checkbox(labelText, attrs = {}) {
  const cb = el('input', { type: 'checkbox', ...attrs });
  if (attrs.checked) cb.checked = true;
  return { wrap: el('label', { class: 'check' }, cb, labelText), input: cb };
}

// ---- formattering ----------------------------------------------------------

export const TYPE_LABELS = {
  rood: 'Rood', wit: 'Wit', rose: 'Rosé', mousserend: 'Mousserend', port: 'Port', dessert: 'Dessertwijn', versterkt: 'Versterkt', oranje: 'Oranje', overig: 'Overig',
};
export const TYPE_ICONS = { rood: '🍷', wit: '🥂', rose: '🌸', mousserend: '🍾', port: '🍯', dessert: '🍰', versterkt: '🥃', oranje: '🍊', overig: '🍇' };
export const REMOVE_REASONS = { consumed: 'Gedronken', gifted_away: 'Weggegeven', sold: 'Verkocht', damaged: 'Kurk / beschadigd', other: 'Anders' };

export function typeLabel(t) { return TYPE_LABELS[t] || t || '—'; }

export function money(v, currency = 'EUR') {
  if (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) return '—';
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(v));
}

export function fmtDate(d) {
  if (!d) return '—';
  const date = new Date(d.length === 10 ? d + 'T12:00:00' : d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(d) {
  if (!d) return '—';
  const date = new Date(d.includes('T') ? d : d.replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function stars(rating) {
  if (rating === null || rating === undefined) return '';
  const n = Math.round((Number(rating) / 20) * 2) / 2; // 100-punts → 5 sterren (halve sterren)
  const full = Math.floor(n);
  return '★'.repeat(full) + (n % 1 ? '½' : '') + '☆'.repeat(Math.max(0, 5 - Math.ceil(n)));
}

export function wineTitle(w) {
  return [w.producer, w.name].filter(Boolean).join(' · ') + (w.vintage ? ` ${w.vintage}` : '');
}

// Status van het drinkvenster ten opzichte van dit jaar.
export function drinkStatus(w, year = new Date().getFullYear()) {
  const from = w.drink_from, until = w.drink_until, pf = w.peak_from, pu = w.peak_until;
  if (!from && !until && !pf && !pu) return null;
  if (until && year > until) return { key: 'past', label: 'Over hoogtepunt', cls: 'bad' };
  if (from && year < from) return { key: 'young', label: `Te jong (vanaf ${from})`, cls: 'warn' };
  if ((pf ?? from ?? 0) <= year && (pu ?? until ?? 9999) >= year) return { key: 'peak', label: 'Nu op z\'n best', cls: 'ok' };
  if (until && until - year <= 1) return { key: 'soon', label: `Snel drinken (tot ${until})`, cls: 'warn' };
  return { key: 'ok', label: 'Kan nu gedronken worden', cls: '' };
}

// ---- meldingen -------------------------------------------------------------

export function toast(message, kind = '') {
  const root = document.getElementById('toasts');
  const t = el('div', { class: `toast ${kind}`, text: message });
  root.append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 6000 : 3200);
}

// ---- modal -----------------------------------------------------------------

export function modal({ title, body, actions = [], onClose } = {}) {
  const root = document.getElementById('modal-root');
  clear(root);
  const box = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialoog' });
  const backdrop = el('div', { class: 'modal-backdrop' }, box);
  const close = () => { backdrop.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  if (title) box.append(el('h2', { text: title }));
  append(box, [body]);
  const act = el('div', { class: 'modal-actions' });
  for (const a of actions) {
    const b = el('button', { class: `btn ${a.class || ''}`, type: 'button', text: a.label });
    b.addEventListener('click', async () => {
      if (!a.onClick) return close();
      b.disabled = true;
      try {
        const keepOpen = await a.onClick(close);
        if (!keepOpen) close();
      } catch (e) {
        toast(e.message || 'Er ging iets mis', 'error');
      } finally {
        b.disabled = false;
      }
    });
    act.append(b);
  }
  if (actions.length) box.append(act);
  root.append(backdrop);
  const first = box.querySelector('input, select, textarea, button');
  first && first.focus();
  return { close, box };
}

export function confirmDialog(title, text, { okLabel = 'Ja', danger = false } = {}) {
  return new Promise((resolve) => {
    modal({
      title,
      body: el('p', { text }),
      onClose: () => resolve(false),
      actions: [
        { label: 'Annuleren', class: 'ghost' },
        { label: okLabel, class: danger ? 'danger' : '', onClick: () => { resolve(true); } },
      ],
    });
  });
}

// ---- afbeeldingen ----------------------------------------------------------

// Verkleint een foto in de browser (sneller uploaden, minder AI-kosten) en geeft een JPEG-blob + data-URL terug.
export async function shrinkImage(file, maxSide = 1600, quality = 0.86) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error('Deze foto kan niet worden gelezen. Probeer een JPEG of PNG.');
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return { blob, dataUrl };
}

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function uniqSorted(values) {
  return [...new Set(values.filter((v) => v !== null && v !== undefined && v !== ''))].sort((a, b) => String(a).localeCompare(String(b), 'nl'));
}

export function download(filename, text, type = 'text/plain') {
  const blob = text instanceof Blob ? text : new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 500);
}
