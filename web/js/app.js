// Startpunt van de webapp: routering, navigatie, thema en sessiebewaking.
import { el, clear, toast, modal, fmtDateTime } from './util.js';
import { api } from './api.js';
import { session } from './api.js';
import { logout } from './auth.js';
import { invalidateWines } from './data.js';
import * as login from './views/login.js';
import * as cellar from './views/cellar.js';
import * as wine from './views/wine.js';
import * as add from './views/add.js';
import * as history from './views/history.js';
import * as pairing from './views/pairing.js';
import * as stats from './views/stats.js';
import * as wishlist from './views/wishlist.js';
import * as admin from './views/admin.js';
import * as settings from './views/settings.js';
import * as mapView from './views/map.js';
import * as bulk from './views/bulk.js';
import * as tonight from './views/tonight.js';
import * as insights from './views/insights.js';
import * as manage from './views/manage.js';
import * as producers from './views/producers.js';

const NAV = [
  { path: '/kelder', label: 'Kelder', ico: '🍷' },
  { path: '/toevoegen', label: 'Toevoegen', ico: '＋' },
  { path: '/vanavond', label: 'Vanavond', ico: '🥂' },
  { path: '/historie', label: 'Historie', ico: '📜' },
  { path: '/meer', label: 'Meer', ico: '☰' },
];

const ROUTES = [
  { pattern: /^\/login$/, view: login, public: true },
  { pattern: /^\/registreren$/, view: login, public: true, mode: 'register' },
  { pattern: /^\/kelder$/, view: cellar },
  { pattern: /^\/wijn\/([^/]+)$/, view: wine },
  { pattern: /^\/toevoegen$/, view: add },
  { pattern: /^\/bulk$/, view: bulk },
  { pattern: /^\/vanavond$/, view: tonight },
  { pattern: /^\/inzichten$/, view: insights },
  { pattern: /^\/voorraad$/, view: manage },
  { pattern: /^\/wijn\/([^/]+)\/bewerken$/, view: add, mode: 'edit' },
  { pattern: /^\/historie$/, view: history },
  { pattern: /^\/spijs$/, view: pairing },
  { pattern: /^\/statistieken$/, view: stats },
  { pattern: /^\/verlanglijst$/, view: wishlist },
  { pattern: /^\/beheer$/, view: admin, admin: true },
  { pattern: /^\/instellingen$/, view: settings },
  { pattern: /^\/herkomst$/, view: mapView },
  { pattern: /^\/wijnhuizen$/, view: producers },
  { pattern: /^\/meer$/, view: { render: renderMore } },
];

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/kelder';
  const [path, query = ''] = raw.split('?');
  return { path, query: new URLSearchParams(query) };
}

export function navigate(path) {
  location.hash = path.startsWith('#') ? path : `#${path}`;
}

function renderNav(active) {
  const user = session.user;
  const side = document.getElementById('sidenav');
  const bottom = document.getElementById('bottomnav');
  clear(side); clear(bottom);
  const items = [...NAV.filter((n) => n.path !== '/meer'), { path: '/spijs', label: 'Spijs & wijn', ico: '🍽️' }, { path: '/inzichten', label: 'Inzichten', ico: '👅' }, { path: '/voorraad', label: 'Voorraad', ico: '🛒' }, { path: '/bulk', label: 'Bulk', ico: '📷' }, { path: '/herkomst', label: 'Herkomst', ico: '🗺️' }, { path: '/wijnhuizen', label: 'Wijnhuizen', ico: '🏡' }, { path: '/statistieken', label: 'Statistieken', ico: '📊' }, { path: '/verlanglijst', label: 'Verlanglijst', ico: '📝' }];
  if (user?.role === 'admin') items.push({ path: '/beheer', label: 'Beheer', ico: '👥' });
  items.push({ path: '/instellingen', label: 'Instellingen', ico: '⚙️' });
  for (const n of items) side.append(el('a', { href: `#${n.path}`, class: active === n.path ? 'active' : '' }, el('span', { class: 'ico', text: n.ico }), n.label));
  for (const n of NAV) {
    const isActive = active === n.path || (n.path === '/meer' && ['/spijs', '/inzichten', '/voorraad', '/bulk', '/herkomst', '/wijnhuizen', '/statistieken', '/verlanglijst', '/beheer', '/instellingen'].includes(active));
    bottom.append(el('a', { href: `#${n.path}`, class: isActive ? 'active' : '' }, el('span', { class: 'ico', text: n.ico }), n.label));
  }
  document.getElementById('user-chip').textContent = user ? user.name : '';
  refreshBell();
}

function renderMore(main) {
  const user = session.user;
  const links = [
    ['/spijs', '🍽️', 'Spijs & wijn', 'Welke wijn bij welk gerecht — en andersom'],
    ['/inzichten', '👅', 'Inzichten', 'Smaakprofiel van Angela en Tije, prijs-kwaliteit, jaaroverzicht'],
    ['/voorraad', '🛒', 'Voorraad & beheer', 'Aankooplijst met budget, inventarisatie, cadeau-register'],
    ['/vanavond?tab=restaurant', '🍽️', 'Restaurant-modus', 'Wijnkaart fotograferen en advies krijgen'],
    ['/bulk', '📷', 'Bulk toevoegen', 'Meerdere etiketfoto\'s tegelijk; direct of later per fles goedkeuren'],
    ['/bulk?tab=queue', '🗂️', 'Beoordelingswachtrij', 'Flessen die nog gecontroleerd en goedgekeurd moeten worden'],
    ['/herkomst', '🗺️', 'Herkomst', 'Topografische kaart: waar komen onze wijnen vandaan?'],
    ['/wijnhuizen', '🏡', 'Wijnhuizen', 'Informatie over de producenten in onze kelder'],
    ['/statistieken', '📊', 'Statistieken', 'Waarde, verdeling, wat nu drinken'],
    ['/verlanglijst', '📝', 'Verlanglijst', 'Wijnen die we nog willen kopen'],
    user?.role === 'admin' ? ['/beheer', '👥', 'Beheer', 'Huishoudleden en uitnodigingen'] : null,
    ['/instellingen', '⚙️', 'Instellingen', 'Passkeys, thema, export'],
  ].filter(Boolean);
  main.append(el('h1', { text: 'Meer' }), el('div', { class: 'stack' }, links.map(([p, ico, t, d]) =>
    el('a', { href: `#${p}`, class: 'card row', style: { textDecoration: 'none', color: 'inherit' } },
      el('span', { style: { fontSize: '1.6rem' }, text: ico }),
      el('div', {}, el('strong', { text: t }), el('div', { class: 'muted small', text: d }))))),
    el('button', { class: 'btn ghost block', type: 'button', onClick: async () => { await logout(); navigate('/login'); }, text: 'Uitloggen' }));
}

// Meldingen (in-app inbox) in de bovenbalk
let bellTimer = null;
async function refreshBell() {
  const bell = document.getElementById('bell'); if (!bell || !session.token) return;
  try {
    const { unread } = await api.get('/api/notifications');
    bell.dataset.count = unread || '';
    bell.title = unread ? `${unread} nieuwe melding${unread === 1 ? '' : 'en'}` : 'Meldingen';
  } catch { /* stil */ }
}
window.addEventListener('DOMContentLoaded', () => {
  const bell = document.getElementById('bell');
  bell?.addEventListener('click', async () => {
    const { notifications } = await api.get('/api/notifications');
    const body = el('div', { class: 'stack' });
    if (!notifications.length) body.append(el('p', { class: 'muted', text: 'Nog geen meldingen. Zet in Instellingen de wekelijkse sommelier-tip en drinkvenster-meldingen aan.' }));
    for (const n of notifications) body.append(el('div', { class: 'note', style: n.read_at ? { opacity: 0.7 } : {} }, el('strong', { text: n.title }), el('div', { class: 'small', text: n.body || '' }), el('div', { class: 'row between small muted' }, el('span', { text: fmtDateTime(n.created_at) }), n.link ? el('a', { href: n.link, text: 'Openen →' }) : null)));
    modal({ title: 'Meldingen', body, actions: [{ label: 'Sluiten' }], onClose: refreshBell });
    await api.post('/api/notifications/read');
  });
  bellTimer = setInterval(refreshBell, 5 * 60 * 1000);
});

let currentView = null;
async function render() {
  const { path, query } = parseHash();
  const main = document.getElementById('main');
  const route = ROUTES.find((r) => r.pattern.test(path));
  const loggedIn = !!session.token;

  if (!route) return navigate('/kelder');
  if (!route.public && !loggedIn) return navigate('/login');
  if (route.public && loggedIn && path === '/login') return navigate('/kelder');
  if (route.admin && session.user?.role !== 'admin') { toast('Alleen voor beheerders', 'error'); return navigate('/kelder'); }

  document.getElementById('topbar').hidden = !loggedIn;
  document.getElementById('bottomnav').hidden = !loggedIn;
  if (loggedIn) renderNav(path.startsWith('/wijn') ? '/kelder' : path);

  if (currentView?.destroy) currentView.destroy();
  clear(main);
  main.scrollTop = 0; window.scrollTo(0, 0);
  const params = path.match(route.pattern).slice(1);
  try {
    currentView = (await route.view.render(main, { params, query, mode: route.mode, navigate })) || null;
  } catch (e) {
    console.error(e);
    main.append(el('div', { class: 'empty' }, el('div', { class: 'big', text: '🍇' }), el('p', { text: e.message || 'Er ging iets mis.' })));
  }
}

function initTheme() {
  const saved = localStorage.getItem('wijnkelder.theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = saved || (prefersDark ? 'dark' : 'light');
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('wijnkelder.theme', next);
  });
}

window.addEventListener('hashchange', render);
window.addEventListener('wk:logout', () => { invalidateWines(); navigate('/login'); });
initTheme();
render();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
