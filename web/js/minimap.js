// Minimalistische tegelkaart zonder externe bibliotheken (past binnen de strikte CSP).
// Ondersteunt slepen, scroll-/knijpzoom, tegels van OpenTopoMap (topografisch), spelden met clustering en popups.
import { el, clear } from './util.js';

const TILE_SIZE = 256;
const MIN_ZOOM = 2, MAX_ZOOM = 15; // OpenTopoMap gaat tot 17; 15 is ruim voldoende voor een wijnhuis

export const TILE_SOURCES = {
  topo: { url: (z, x, y) => `https://${'abc'[(x + y) % 3]}.tile.opentopomap.org/${z}/${x}/${y}.png`, attribution: 'Kaart: © OpenStreetMap-bijdragers, SRTM | Weergave: © OpenTopoMap (CC-BY-SA)', maxZoom: 15 },
  street: { url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, attribution: 'Kaart: © OpenStreetMap-bijdragers', maxZoom: 18 },
};

function lon2x(lon, z) { return ((lon + 180) / 360) * Math.pow(2, z) * TILE_SIZE; }
function lat2y(lat, z) { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z) * TILE_SIZE; }
function x2lon(x, z) { return (x / (Math.pow(2, z) * TILE_SIZE)) * 360 - 180; }
function y2lat(y, z) { const n = Math.PI - (2 * Math.PI * y) / (Math.pow(2, z) * TILE_SIZE); return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); }

export class MiniMap {
  constructor(container, { center = [48, 5], zoom = 5, source = 'topo', onMarkerClick } = {}) {
    this.container = container;
    this.container.classList.add('minimap');
    this.lat = center[0]; this.lon = center[1]; this.zoom = zoom;
    this.source = TILE_SOURCES[source] || TILE_SOURCES.topo;
    this.onMarkerClick = onMarkerClick;
    this.markers = [];
    this.tiles = new Map();
    this.tileLayer = el('div', { class: 'mm-tiles' });
    this.markerLayer = el('div', { class: 'mm-markers' });
    this.popup = el('div', { class: 'mm-popup', hidden: true });
    this.attribution = el('div', { class: 'mm-attribution', text: this.source.attribution });
    const zoomIn = el('button', { class: 'mm-btn', type: 'button', 'aria-label': 'Inzoomen', text: '+' });
    const zoomOut = el('button', { class: 'mm-btn', type: 'button', 'aria-label': 'Uitzoomen', text: '−' });
    const fit = el('button', { class: 'mm-btn', type: 'button', 'aria-label': 'Alles tonen', title: 'Alle wijnen in beeld', text: '⛶' });
    zoomIn.addEventListener('click', () => this.setZoom(this.zoom + 1));
    zoomOut.addEventListener('click', () => this.setZoom(this.zoom - 1));
    fit.addEventListener('click', () => this.fitMarkers());
    this.controls = el('div', { class: 'mm-controls' }, zoomIn, zoomOut, fit);
    clear(container);
    container.append(this.tileLayer, this.markerLayer, this.popup, this.controls, this.attribution);
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(container);
    this.render();
  }

  destroy() { this.resizeObserver.disconnect(); }

  setSource(name) { this.source = TILE_SOURCES[name] || TILE_SOURCES.topo; this.attribution.textContent = this.source.attribution; this.tiles.clear(); clear(this.tileLayer); this.render(); }

  setView(lat, lon, zoom = this.zoom) { this.lat = lat; this.lon = lon; this.zoom = Math.max(MIN_ZOOM, Math.min(this.source.maxZoom || MAX_ZOOM, zoom)); this.render(); }
  setZoom(z, anchor) {
    const nz = Math.max(MIN_ZOOM, Math.min(this.source.maxZoom || MAX_ZOOM, Math.round(z)));
    if (nz === this.zoom) return;
    if (anchor) {
      // Zoom rond het aangewezen punt (muis/vingers)
      const { w, h } = this.size();
      const before = this.pixelToLatLon(anchor.x, anchor.y);
      this.zoom = nz;
      const cx = lon2x(before.lon, nz) - (anchor.x - w / 2), cy = lat2y(before.lat, nz) - (anchor.y - h / 2);
      this.lon = x2lon(cx, nz); this.lat = y2lat(cy, nz);
    } else this.zoom = nz;
    this.render();
  }

  size() { return { w: this.container.clientWidth || 300, h: this.container.clientHeight || 300 }; }
  pixelToLatLon(px, py) {
    const { w, h } = this.size();
    const cx = lon2x(this.lon, this.zoom), cy = lat2y(this.lat, this.zoom);
    return { lat: y2lat(cy + (py - h / 2), this.zoom), lon: x2lon(cx + (px - w / 2), this.zoom) };
  }
  latLonToPixel(lat, lon) {
    const { w, h } = this.size();
    const cx = lon2x(this.lon, this.zoom), cy = lat2y(this.lat, this.zoom);
    return { x: lon2x(lon, this.zoom) - cx + w / 2, y: lat2y(lat, this.zoom) - cy + h / 2 };
  }

  // markers: [{ lat, lon, label, count, color, data }]
  setMarkers(markers) { this.markers = markers; this.hidePopup(); this.render(); }

  fitMarkers(padding = 40) {
    if (!this.markers.length) return;
    const lats = this.markers.map((m) => m.lat), lons = this.markers.map((m) => m.lon);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const { w, h } = this.size();
    let z = this.source.maxZoom || MAX_ZOOM;
    for (; z > MIN_ZOOM; z--) {
      const dx = Math.abs(lon2x(maxLon, z) - lon2x(minLon, z)), dy = Math.abs(lat2y(maxLat, z) - lat2y(minLat, z));
      if (dx <= w - padding * 2 && dy <= h - padding * 2) break;
    }
    this.setView((minLat + maxLat) / 2, (minLon + maxLon) / 2, Math.min(z, 12));
  }

  bindEvents() {
    const c = this.container;
    let drag = null, pinch = null, moved = false;
    const pointers = new Map();
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.mm-btn, .mm-popup')) return;
      pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      c.setPointerCapture(e.pointerId);
      if (pointers.size === 1) { drag = { x: e.offsetX, y: e.offsetY }; moved = false; }
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }; drag = null; }
    });
    c.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const targetZoom = pinch.zoom + Math.log2(dist / pinch.dist);
        if (Math.abs(targetZoom - this.zoom) >= 1) this.setZoom(targetZoom, pinch.mid);
        return;
      }
      if (drag) {
        const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        drag = { x: e.offsetX, y: e.offsetY };
        const cx = lon2x(this.lon, this.zoom) - dx, cy = lat2y(this.lat, this.zoom) - dy;
        this.lon = x2lon(cx, this.zoom); this.lat = Math.max(-85, Math.min(85, y2lat(cy, this.zoom)));
        this.render();
      }
    });
    const up = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; if (pointers.size === 0) { drag = null; if (!moved && !e.target.closest('.mm-marker, .mm-popup, .mm-btn')) this.hidePopup(); } };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.setZoom(this.zoom + (e.deltaY < 0 ? 1 : -1), { x: e.offsetX, y: e.offsetY }); }, { passive: false });
    c.addEventListener('dblclick', (e) => { if (!e.target.closest('.mm-marker, .mm-btn')) this.setZoom(this.zoom + 1, { x: e.offsetX, y: e.offsetY }); });
  }

  render() {
    const { w, h } = this.size();
    const z = this.zoom;
    const cx = lon2x(this.lon, z), cy = lat2y(this.lat, z);
    const n = Math.pow(2, z);
    const x0 = Math.floor((cx - w / 2) / TILE_SIZE), x1 = Math.floor((cx + w / 2) / TILE_SIZE);
    const y0 = Math.max(0, Math.floor((cy - h / 2) / TILE_SIZE)), y1 = Math.min(n - 1, Math.floor((cy + h / 2) / TILE_SIZE));
    const keep = new Set();
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        const wx = ((tx % n) + n) % n;
        const key = `${z}/${wx}/${ty}`;
        keep.add(key);
        let img = this.tiles.get(key);
        if (!img) {
          img = el('img', { class: 'mm-tile', alt: '', draggable: 'false', src: this.source.url(z, wx, ty), loading: 'lazy' });
          img.addEventListener('load', () => img.classList.add('loaded'));
          this.tiles.set(key, img); this.tileLayer.append(img);
        }
        img.style.transform = `translate(${Math.round(tx * TILE_SIZE - cx + w / 2)}px, ${Math.round(ty * TILE_SIZE - cy + h / 2)}px)`;
      }
    }
    for (const [key, img] of this.tiles) if (!keep.has(key)) { img.remove(); this.tiles.delete(key); }
    this.renderMarkers();
  }

  // Clustert spelden die op het scherm dichter dan ~36px bij elkaar liggen.
  renderMarkers() {
    clear(this.markerLayer);
    const { w, h } = this.size();
    const placed = [];
    for (const m of this.markers) {
      const p = this.latLonToPixel(m.lat, m.lon);
      if (p.x < -60 || p.x > w + 60 || p.y < -60 || p.y > h + 60) continue;
      const near = placed.find((q) => Math.hypot(q.x - p.x, q.y - p.y) < 36);
      if (near) { near.items.push(m); continue; }
      placed.push({ x: p.x, y: p.y, items: [m] });
    }
    for (const c of placed) {
      const count = c.items.reduce((s, m) => s + (m.count || 1), 0);
      const cluster = c.items.length > 1;
      const btn = el('button', { class: `mm-marker ${cluster ? 'cluster' : ''}`, type: 'button', style: { left: `${c.x}px`, top: `${c.y}px`, '--c': c.items[0].color || 'var(--bordeaux)' }, 'aria-label': cluster ? `${c.items.length} locaties` : c.items[0].label || 'Locatie' },
        el('span', { class: 'mm-pin' }), el('span', { class: 'mm-count', text: String(count) }));
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (cluster && this.zoom < (this.source.maxZoom || MAX_ZOOM)) {
          const lats = c.items.map((m) => m.lat), lons = c.items.map((m) => m.lon);
          const spread = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lons) - Math.min(...lons));
          if (spread > 0.0005) { this.setView((Math.max(...lats) + Math.min(...lats)) / 2, (Math.max(...lons) + Math.min(...lons)) / 2, this.zoom + 2); return; }
        }
        this.onMarkerClick && this.onMarkerClick(c.items, { x: c.x, y: c.y });
      });
      this.markerLayer.append(btn);
    }
    if (this.popupAnchor) {
      const p = this.latLonToPixel(this.popupAnchor.lat, this.popupAnchor.lon);
      this.popup.style.left = `${p.x}px`; this.popup.style.top = `${p.y - 44}px`;
    }
  }

  showPopup(lat, lon, content) {
    this.popupAnchor = { lat, lon };
    clear(this.popup);
    const close = el('button', { class: 'mm-close', type: 'button', 'aria-label': 'Sluiten', text: '×' });
    close.addEventListener('click', () => this.hidePopup());
    this.popup.append(close, content);
    this.popup.hidden = false;
    this.renderMarkers();
  }
  hidePopup() { this.popup.hidden = true; this.popupAnchor = null; }
}
