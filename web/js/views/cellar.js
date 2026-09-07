// Overzicht van de kelder met zoeken, filters en sorteren.
import { el, clear, select, checkbox, typeLabel, TYPE_LABELS, TYPE_ICONS, stars, drinkStatus, money, uniqSorted, debounce } from '../util.js';
import { photoUrl } from '../api.js';
import { loadWines } from '../data.js';

const FILTER_KEY = 'wijnkelder.filters';
const year = new Date().getFullYear();

function loadFilters() {
  try { return { ...defaultFilters(), ...JSON.parse(sessionStorage.getItem(FILTER_KEY) || '{}') }; } catch { return defaultFilters(); }
}
function defaultFilters() {
  return { q: '', types: [], country: '', region: '', grape: '', vintageMin: '', vintageMax: '', aging: '', status: '', gifted: false, favorite: false, location: '', priceMin: '', priceMax: '', sort: 'recent', showEmpty: false };
}

export function applyFilters(wines, f) {
  const q = f.q.trim().toLowerCase();
  let list = wines.filter((w) => {
    if (!f.showEmpty && w.bottles_in_cellar === 0) return false;
    if (f.types.length && !f.types.includes(w.type)) return false;
    if (f.country && w.country !== f.country) return false;
    if (f.region && w.region !== f.region) return false;
    if (f.grape && !(w.grapes || []).some((g) => g.toLowerCase() === f.grape.toLowerCase())) return false;
    if (f.vintageMin && (!w.vintage || w.vintage < Number(f.vintageMin))) return false;
    if (f.vintageMax && (!w.vintage || w.vintage > Number(f.vintageMax))) return false;
    if (f.aging === 'ja' && !w.aging_wine) return false;
    if (f.aging === 'nee' && w.aging_wine) return false;
    if (f.status) { const s = drinkStatus(w, year); if (!s || s.key !== f.status) return false; }
    if (f.gifted && !w.any_gifted) return false;
    if (f.favorite && !w.favorite) return false;
    if (f.location && !(w.locations || '').split(',').includes(f.location)) return false;
    const price = w.bottles_in_cellar ? (w.cellar_value || 0) / w.bottles_in_cellar : null;
    const refPrice = price || w.estimated_price;
    if (f.priceMin && (refPrice === null || refPrice < Number(f.priceMin))) return false;
    if (f.priceMax && (refPrice === null || refPrice > Number(f.priceMax))) return false;
    if (q) {
      const hay = [w.name, w.producer, w.country, w.region, w.appellation, w.vintage, ...(w.grapes || []), ...(w.food_pairings || []), w.description, w.notes, w.locations].join(' ').toLowerCase();
      if (!q.split(/\s+/).every((part) => hay.includes(part))) return false;
    }
    return true;
  });
  const cmp = {
    recent: (a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''),
    name: (a, b) => (a.name || '').localeCompare(b.name || '', 'nl'),
    producer: (a, b) => (a.producer || '').localeCompare(b.producer || '', 'nl'),
    vintage: (a, b) => (a.vintage || 0) - (b.vintage || 0),
    vintageDesc: (a, b) => (b.vintage || 0) - (a.vintage || 0),
    rating: (a, b) => (b.avg_rating || 0) - (a.avg_rating || 0),
    bottles: (a, b) => b.bottles_in_cellar - a.bottles_in_cellar,
    drink: (a, b) => (a.drink_until || 9999) - (b.drink_until || 9999),
    price: (a, b) => ((b.cellar_value || 0) / (b.bottles_in_cellar || 1)) - ((a.cellar_value || 0) / (a.bottles_in_cellar || 1)),
  }[f.sort] || (() => 0);
  return list.sort(cmp);
}

export function wineCard(w) {
  const status = drinkStatus(w, year);
  const card = el('a', { class: 'wine-card', href: `#/wijn/${w.id}` });
  const thumb = el('div', { class: 'thumb' });
  if (w.label_image_url) thumb.append(el('img', { src: photoUrl(w.label_image_url), alt: '', loading: 'lazy' }));
  else thumb.append(el('span', { class: 'placeholder', text: TYPE_ICONS[w.type] || '🍇' }));
  thumb.append(el('span', { class: `type-stripe type-${w.type}` }));
  thumb.append(el('span', { class: 'count-badge', text: `${w.bottles_in_cellar} ×` }));
  if (w.favorite) thumb.append(el('span', { class: 'fav', text: '★' }));
  card.append(thumb);
  const body = el('div', { class: 'body' });
  body.append(el('h3', { text: w.name + (w.vintage ? ` ${w.vintage}` : '') }));
  if (w.producer) body.append(el('div', { class: 'producer', text: w.producer }));
  body.append(el('div', { class: 'meta', text: [typeLabel(w.type), w.region || w.country, (w.grapes || []).slice(0, 2).join(', ')].filter(Boolean).join(' · ') }));
  const badges = el('div', { class: 'badges' });
  if (status) badges.append(el('span', { class: `badge ${status.cls}`, text: status.label }));
  if (w.aging_wine) badges.append(el('span', { class: 'badge gold', text: 'Bewaarwijn' }));
  if (w.avg_rating) badges.append(el('span', { class: 'badge', title: `${Math.round(w.avg_rating)}/100` }, el('span', { class: 'stars', text: stars(w.avg_rating) })));
  if (w.any_gifted) badges.append(el('span', { class: 'badge', text: '🎁 Gekregen' }));
  body.append(badges);
  card.append(body);
  return card;
}

export async function render(main) {
  const f = loadFilters();
  const wines = await loadWines();
  const inCellar = wines.filter((w) => w.bottles_in_cellar > 0);
  const totalBottles = inCellar.reduce((s, w) => s + w.bottles_in_cellar, 0);
  const totalPaid = inCellar.reduce((s, w) => s + (w.cellar_value || 0), 0);
  const totalEstimated = inCellar.reduce((s, w) => s + (w.estimated_value || 0), 0);
  const withoutValue = inCellar.reduce((s, w) => s + (w.bottles_without_value || 0), 0);

  const head = el('div', { class: 'row between' },
    el('div', {}, el('h1', { text: 'Onze kelder' }), el('div', { class: 'muted small', text: `${totalBottles} flessen · ${inCellar.length} verschillende wijnen` })),
    el('a', { class: 'btn gold', href: '#/toevoegen', text: '＋ Wijn toevoegen' }));
  main.append(head);

  // Waarde van de collectie: betaald én geschat (incl. prijsindicatie voor gekregen flessen)
  if (totalBottles > 0) {
    main.append(el('div', { class: 'kpis', style: { marginBottom: '1rem' } },
      el('div', { class: 'kpi' }, el('div', { class: 'v', text: money(totalPaid) }), el('div', { class: 'l', text: 'aankoopwaarde (betaald)' })),
      el('div', { class: 'kpi', title: 'Betaalde prijs waar bekend; anders de prijsindicatie van de wijn' },
        el('div', { class: 'v', text: money(totalEstimated) }),
        el('div', { class: 'l', text: withoutValue ? `indicatie totale waarde · ${withoutValue} fles${withoutValue === 1 ? '' : 'sen'} zonder prijs` : 'indicatie totale waarde' })),
      totalEstimated > totalPaid && totalPaid > 0
        ? el('div', { class: 'kpi' }, el('div', { class: 'v', text: `+${money(totalEstimated - totalPaid)}` }), el('div', { class: 'l', text: 'waarde gekregen flessen / waardestijging' }))
        : null));
  }

  // Zoekbalk en filterknop
  const search = el('input', { type: 'search', placeholder: 'Zoek op naam, producent, druif, streek, gerecht…', value: f.q, 'aria-label': 'Zoeken' });
  const filterBtn = el('button', { class: 'btn ghost', type: 'button', text: 'Filters' });
  const sortSel = select([
    ['recent', 'Laatst gewijzigd'], ['name', 'Naam A-Z'], ['producer', 'Producent A-Z'], ['vintage', 'Jaargang oud → jong'], ['vintageDesc', 'Jaargang jong → oud'],
    ['rating', 'Beoordeling'], ['bottles', 'Aantal flessen'], ['drink', 'Drinken vóór'], ['price', 'Prijs hoog → laag'],
  ], { value: f.sort, 'aria-label': 'Sorteren' });
  main.append(el('div', { class: 'toolbar' }, search, sortSel, filterBtn));

  // Type-chips
  const chips = el('div', { class: 'chips', style: { marginBottom: '0.8rem' } });
  for (const [t, label] of Object.entries(TYPE_LABELS)) {
    if (!wines.some((w) => w.type === t)) continue;
    const c = el('button', { class: `chip ${f.types.includes(t) ? 'active' : ''}`, type: 'button', text: `${TYPE_ICONS[t]} ${label}` });
    c.addEventListener('click', () => {
      f.types = f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t];
      c.classList.toggle('active');
      update();
    });
    chips.append(c);
  }
  main.append(chips);

  // Uitgebreide filters
  const filters = el('div', { class: 'filters', hidden: !(f.country || f.region || f.grape || f.vintageMin || f.vintageMax || f.aging || f.status || f.gifted || f.favorite || f.location || f.priceMin || f.priceMax) });
  const opt = (arr, label) => [['', label], ...arr.map((v) => [v, v])];
  const country = select(opt(uniqSorted(wines.map((w) => w.country)), 'Alle landen'), { value: f.country });
  const region = select(opt(uniqSorted(wines.map((w) => w.region)), 'Alle streken'), { value: f.region });
  const grape = select(opt(uniqSorted(wines.flatMap((w) => w.grapes || [])), 'Alle druiven'), { value: f.grape });
  const location = select(opt(uniqSorted(wines.flatMap((w) => (w.locations || '').split(',').filter(Boolean))), 'Alle locaties'), { value: f.location });
  const vMin = el('input', { type: 'number', placeholder: 'Jaargang vanaf', value: f.vintageMin, min: 1900, max: 2100 });
  const vMax = el('input', { type: 'number', placeholder: 'Jaargang tot', value: f.vintageMax, min: 1900, max: 2100 });
  const pMin = el('input', { type: 'number', placeholder: 'Prijs vanaf €', value: f.priceMin, min: 0 });
  const pMax = el('input', { type: 'number', placeholder: 'Prijs tot €', value: f.priceMax, min: 0 });
  const aging = select([['', 'Bewaarwijn: alles'], ['ja', 'Alleen bewaarwijnen'], ['nee', 'Geen bewaarwijnen']], { value: f.aging });
  const status = select([['', 'Drinkvenster: alles'], ['peak', 'Nu op z\'n best'], ['ok', 'Kan nu gedronken worden'], ['soon', 'Snel drinken'], ['young', 'Te jong'], ['past', 'Over hoogtepunt']], { value: f.status });
  const gifted = checkbox('Alleen gekregen flessen', { checked: f.gifted });
  const fav = checkbox('Alleen favorieten', { checked: f.favorite });
  const showEmpty = checkbox('Ook wijnen zonder voorraad', { checked: f.showEmpty });
  const reset = el('button', { class: 'btn ghost sm', type: 'button', text: 'Filters wissen' });
  filters.append(country, region, grape, location, vMin, vMax, pMin, pMax, aging, status, gifted.wrap, fav.wrap, showEmpty.wrap, reset);
  main.append(filters);
  filterBtn.addEventListener('click', () => { filters.hidden = !filters.hidden; });

  const summary = el('div', { class: 'muted small', style: { marginBottom: '0.6rem' } });
  const grid = el('div', { class: 'grid' });
  main.append(summary, grid);

  function readInputs() {
    f.q = search.value; f.sort = sortSel.value; f.country = country.value; f.region = region.value; f.grape = grape.value; f.location = location.value;
    f.vintageMin = vMin.value; f.vintageMax = vMax.value; f.priceMin = pMin.value; f.priceMax = pMax.value; f.aging = aging.value; f.status = status.value;
    f.gifted = gifted.input.checked; f.favorite = fav.input.checked; f.showEmpty = showEmpty.input.checked;
  }
  function update() {
    readInputs();
    sessionStorage.setItem(FILTER_KEY, JSON.stringify(f));
    const list = applyFilters(wines, f);
    clear(grid);
    const bottles = list.reduce((s, w) => s + w.bottles_in_cellar, 0);
    const value = list.reduce((s, w) => s + (w.cellar_value || 0), 0);
    const est = list.reduce((s, w) => s + (w.estimated_value || 0), 0);
    summary.textContent = `${list.length} wijnen · ${bottles} flessen${value ? ` · betaald ${money(value)}` : ''}${est ? ` · indicatie ${money(est)}` : ''}`;
    if (!list.length) {
      grid.append(el('div', { class: 'empty', style: { gridColumn: '1 / -1' } }, el('div', { class: 'big', text: '🍇' }), el('p', { text: wines.length ? 'Geen wijnen gevonden met deze filters.' : 'De kelder is nog leeg. Voeg je eerste wijn toe!' })));
      return;
    }
    for (const w of list) grid.append(wineCard(w));
  }
  const debounced = debounce(update, 150);
  search.addEventListener('input', debounced);
  for (const c of [sortSel, country, region, grape, location, vMin, vMax, pMin, pMax, aging, status, gifted.input, fav.input, showEmpty.input]) c.addEventListener('change', update);
  reset.addEventListener('click', () => {
    Object.assign(f, defaultFilters());
    search.value = ''; sortSel.value = 'recent';
    for (const s of [country, region, grape, location, aging, status]) s.value = '';
    for (const i of [vMin, vMax, pMin, pMax]) i.value = '';
    gifted.input.checked = fav.input.checked = showEmpty.input.checked = false;
    chips.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    update();
  });
  update();
}
