const KEY = 'wijnkelder.design';

export function getDesign() {
  try {
    return localStorage.getItem(KEY) === 'classic' ? 'classic' : 'modern';
  } catch {
    return 'modern';
  }
}

export function applyDesign(design = getDesign()) {
  const mode = design === 'classic' ? 'classic' : 'modern';
  document.documentElement.dataset.design = mode;
  document.body?.classList.toggle('design-modern', mode === 'modern');
  document.body?.classList.toggle('design-classic', mode === 'classic');
  return mode;
}

export function setDesign(design) {
  const mode = design === 'classic' ? 'classic' : 'modern';
  try { localStorage.setItem(KEY, mode); } catch { /* veilige fallback: huidige pagina blijft bruikbaar */ }
  return applyDesign(mode);
}

export function toggleDesign() {
  return setDesign(getDesign() === 'modern' ? 'classic' : 'modern');
}
