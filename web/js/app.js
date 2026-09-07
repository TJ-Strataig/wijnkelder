// Startpunt van de webapp: routering, navigatie, thema en sessiebewaking.
import { el, clear, toast } from './util.js';
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
import * as producers from './views/producers.js';

const NAV = [
  { path: '/kelder', label: 'Kelder', ico: '🍷' },
  { path: '/toevoegen', label: 'Toevoegen', ico: '＋' },
  { path: '/spijs', label: 'Spijs & wijn', ico: '🍽️' },
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
  const items = [...NAV.filter((n) => n.path !== '/meer'), { path: '/bulk', label: 'Bulk', ico: '📷' }, { path: '/herkomst', label: 'Herkomst', ico: '🗺️' }, { path: '/wijnhuizen', label: 'Wijnhuizen', ico: '🏡' }, { path: '/statistieken', label: 'Statistieken', ico: '📊' }, { path: '/verlanglijst', label: 'Verlanglijst', ico: '📝' }];
  if (user?.role === 'admin') items.push({ path: '/beheer', label: 'Beheer', ico: '👥' });
  items.push({ path: '/instellingen', label: 'Instellingen', ico: '⚙️' });
  for (const n of items) side.append(el('a', { href: `#${n.path}`, class: active === n.path ? 'active' : '' }, el('span', { class: 'ico', text: n.ico }), n.label));
  for (const n of NAV) {
    const isActive = active === n.path || (n.path === '/meer' && ['/bulk', '/herkomst', '/wijnhuizen', '/statistieken', '/verlanglijst', '/beheer', '/instellingen'].includes(active));
    bottom.append(el('a', { href: `#${n.path}`, class: isActive ? 'active' : '' }, el('span', { class: 'ico', text: n.ico }), n.label));
  }
  document.getElementById('user-chip').textContent = user ? user.name : '';
}

function renderMore(main) {
  const user = session.user;
  const links = [
    ['/bulk', '📷', 'Bulk toevoegen', 'Meerdere etiketfoto\'s tegelijk, per fles controleren en goedkeuren'],
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
