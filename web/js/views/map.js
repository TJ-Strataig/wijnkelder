// Herkomstkaart: waar komen onze wijnen vandaan? Klik op een speld voor de wijnen en het wijnhuis.
import { el, clear, select, toast, typeLabel, TYPE_ICONS, wineTitle } from '../util.js';
import { api } from '../api.js';
import { MiniMap } from '../minimap.js';
import { producerPanel } from './producers.js';

const TYPE_COLORS = { rood: '#7a1f36', wit: '#c9a24a', rose: '#e07a95', mousserend: '#7a9a5a', port: '#4a1023', dessert: '#d9a441', versterkt: '#8b5a2b', oranje: '#e2893b', overig: '#777' };
const PRECISION_LABEL = { producer: 'wijnhuis', manual: 'handmatig geplaatst', appellation: 'appellatie', region: 'streek', country: 'land' };

let mapInstance = null;

export function destroy() { if (mapInstance) { mapInstance.destroy(); mapInstance = null; } }

export async function render(main) {
  main.append(el('h1', { text: 'Herkomst van onze wijnen' }));
  const intro = el('p', { class: 'muted small', text: 'Topografische kaart met alle wijnen in de kelder. Tik op een speld voor de wijnen en het wijnhuis; gouden bollen zijn groepen — tik om in te zoomen.' });
  main.append(intro);

  const status = el('div', { class: 'row between', style: { marginBottom: '0.6rem' } });
  const mapEl = el('div', { class: 'minimap' });
  const detail = el('div', { style: { marginTop: '1rem' } });
  const legend = el('div', { class: 'legend', style: { margin: '0.6rem 0' } });
  main.append(status, mapEl, legend, detail);

  const sourceSel = select([['topo', 'Topografisch'], ['street', 'Stratenkaart']], { 'aria-label': 'Kaartstijl', style: { width: 'auto' } });
  const layerSel = select([['cellar', 'In de kelder'], ['consumed', 'Gedronken'], ['both', 'Beide']], { 'aria-label': 'Laag', style: { width: 'auto' } });
  const geoBtn = el('button', { class: 'btn secondary sm', type: 'button', text: 'Locaties bepalen' });
  const info = el('span', { class: 'small muted' });
  status.append(info, el('div', { class: 'row' }, layerSel, sourceSel, geoBtn));
  layerSel.addEventListener('change', () => load(true));

  const map = new MiniMap(mapEl, { center: [46, 6], zoom: 4, onMarkerClick: (items, at) => showLocation(items) });
  mapInstance = map;
  sourceSel.addEventListener('change', () => map.setSource(sourceSel.value));

  for (const [t, c] of Object.entries(TYPE_COLORS)) legend.append(el('span', {}, el('span', { class: 'dot', style: { background: c } }), typeLabel(t)));
  legend.append(el('span', {}, el('span', { class: 'dot', style: { background: '#8a8a8a' } }), 'gedronken (laag "Gedronken")'));

  let data = { located: [], missing: [] };
  async function load(fit = true) {
    data = await api.get('/api/map');
    const layer = layerSel.value;
    let markers = layer === 'consumed' ? [] : data.located.map((w) => ({ lat: w.lat, lon: w.lon, label: wineTitle(w), count: w.bottles, color: TYPE_COLORS[w.type] || TYPE_COLORS.overig, data: w }));
    if (layer !== 'cellar') {
      const c = await api.get('/api/map/consumed');
      const inCellar = new Set(data.located.map((w) => w.id));
      for (const w of c.consumed) if (layer === 'consumed' || !inCellar.has(w.id)) markers.push({ lat: w.lat, lon: w.lon, label: wineTitle(w), count: w.bottles, color: '#8a8a8a', data: { ...w, consumed: true, bottles: w.bottles } });
      const visited = c.countries.filter((x) => x.consumed > 0).map((x) => x.country);
      info.textContent = `${markers.length} locaties · ${visited.length} landen geproefd: ${visited.slice(0, 8).join(', ')}${visited.length > 8 ? '…' : ''}`;
    }
    map.setMarkers(markers);
    if (fit && markers.length) map.fitMarkers();
    const bottles = data.located.reduce((s, w) => s + w.bottles, 0);
    if (layer === 'cellar') info.textContent = `${data.located.length} wijnen (${bottles} flessen) op de kaart` + (data.missing.length ? ` · ${data.missing.length} zonder locatie` : '');
    geoBtn.hidden = !data.missing.length;
    geoBtn.textContent = `Locaties bepalen (${data.missing.length})`;
    if (!data.located.length && !data.missing.length) {
      clear(detail); detail.append(el('div', { class: 'empty' }, el('div', { class: 'big', text: '🗺️' }), el('p', { text: 'Nog geen wijnen in de kelder.' })));
    } else if (!data.located.length) {
      clear(detail); detail.append(el('p', { class: 'muted', text: 'Klik op "Locaties bepalen" om de herkomst van je wijnen op te zoeken (land, streek, appellatie en waar mogelijk het wijnhuis zelf).' }));
    }
  }

  geoBtn.addEventListener('click', async () => {
    geoBtn.disabled = true; geoBtn.textContent = 'Locaties opzoeken…';
    try {
      let remaining = 1, rounds = 0;
      while (remaining > 0 && rounds < 6) { // max 30 wijnen per klik, netjes voor de geocodeerdienst
        const r = await api.post('/api/map/geocode', {});
        remaining = r.remaining; rounds++;
        info.textContent = `Bezig… nog ${remaining} te bepalen`;
        if (!r.results.length) break;
      }
      toast('Locaties bijgewerkt', 'ok');
      await load(true);
    } catch (e) { toast(e.message, 'error'); } finally { geoBtn.disabled = false; }
  });

  function showLocation(items) {
    const first = items[0].data;
    const wines = items.map((i) => i.data);
    const producers = [...new Set(wines.map((w) => w.producer).filter(Boolean))];
    const title = producers.length === 1 ? producers[0] : (first.appellation || first.region || first.country || 'Locatie');
    // Popup op de kaart
    const pop = el('div', {});
    pop.append(el('h3', { text: title }));
    pop.append(el('div', { class: 'small muted', text: [first.appellation, first.region, first.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ') + (first.precision ? ` · nauwkeurigheid: ${PRECISION_LABEL[first.precision] || first.precision}` : '') }));
    pop.append(el('ul', {}, wines.map((w) => el('li', {}, el('a', { href: `#/wijn/${w.id}`, text: `${TYPE_ICONS[w.type] || ''} ${w.name}${w.vintage ? ' ' + w.vintage : ''}` }), el('span', { class: 'muted small', text: ` · ${w.bottles}×` })))));
    if (producers.length === 1) {
      const b = el('button', { class: 'btn sm', type: 'button', style: { marginTop: '0.5rem' }, text: 'Over dit wijnhuis ↓' });
      b.addEventListener('click', () => { detail.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      pop.append(b);
    }
    map.showPopup(items[0].lat, items[0].lon, pop);
    // Detailpaneel onder de kaart
    clear(detail);
    detail.append(el('h2', { text: title }));
    const grid = el('div', { class: 'grid' });
    for (const w of wines) {
      grid.append(el('a', { class: 'card', href: `#/wijn/${w.id}`, style: { textDecoration: 'none', color: 'inherit' } },
        el('strong', { text: `${TYPE_ICONS[w.type] || ''} ${w.name}${w.vintage ? ' ' + w.vintage : ''}` }),
        el('div', { class: 'small muted', text: [w.producer, w.appellation || w.region, `${w.bottles} fles${w.bottles === 1 ? '' : 'sen'}${w.consumed ? ' gedronken' : ''}`, w.avg_rating ? `score ${Math.round(w.avg_rating)}` : null].filter(Boolean).join(' · ') })));
    }
    detail.append(grid);
    for (const p of producers) detail.append(producerPanel(p, { compact: false, onUpdated: () => load(false) }));
  }

  try { await load(true); } catch (e) { toast(e.message, 'error'); }

  // Wijnen zonder locatie tonen met knop om handmatig te plaatsen
  if (data.missing.length) {
    const miss = el('details', { class: 'card', style: { marginTop: '1rem' } }, el('summary', { text: `${data.missing.length} wijnen zonder locatie` }));
    for (const w of data.missing) miss.append(el('div', { class: 'row between', style: { padding: '0.3rem 0' } }, el('a', { href: `#/wijn/${w.id}`, text: wineTitle(w) }), el('span', { class: 'small muted', text: [w.region, w.country].filter(Boolean).join(', ') || 'geen land/streek ingevuld' })));
    main.append(miss);
  }
  return { destroy };
}
