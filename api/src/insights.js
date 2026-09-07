// Inzichten: smaakprofiel per persoon, prijs-kwaliteit, jaaroverzicht, voorraaddoelen, inventarisatie, cadeaus, streepjescodes, kaartlaag "gedronken".
import { HttpError, json, readJson, uuid, nowIso, str, num, oneOf, bool, WINE_TYPES, logActivity } from './util.js';

const parse = (v, fb) => { try { return v ? JSON.parse(v) : fb; } catch { return fb; } };
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const round1 = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);

// ---- Smaakprofiel per persoon -----------------------------------------------
// Voor elk huishoudlid: gemiddelde score per type, druif, land en streek, sterke voorkeuren en verschillen tussen personen.
export async function tasteProfiles(req, env) {
  const rows = (await env.DB.prepare(
    `SELECT t.user_id, u.name AS user_name, t.rating, t.tasted_at, t.would_buy_again,
            w.id AS wine_id, w.name, w.producer, w.vintage, w.type, w.grapes, w.country, w.region, w.body, w.sweetness
     FROM tasting_notes t JOIN users u ON u.id = t.user_id JOIN wines w ON w.id = t.wine_id WHERE t.rating IS NOT NULL`
  ).all()).results;
  const users = (await env.DB.prepare('SELECT id, name FROM users WHERE disabled = 0 ORDER BY created_at').all()).results;

  function profile(list) {
    const dims = { type: {}, grape: {}, country: {}, region: {}, body: {}, sweetness: {} };
    const push = (dim, key, r) => { if (!key) return; (dims[dim][key] ||= []).push(r); };
    for (const r of list) {
      push('type', r.type, r.rating); push('country', r.country, r.rating); push('region', r.region, r.rating); push('body', r.body, r.rating); push('sweetness', r.sweetness, r.rating);
      for (const g of parse(r.grapes, [])) push('grape', g, r.rating);
    }
    const summarize = (obj) => Object.entries(obj).map(([label, ratings]) => ({ label, avg: round1(avg(ratings)), n: ratings.length })).filter((x) => x.n >= 1).sort((a, b) => b.avg - a.avg || b.n - a.n);
    const all = list.map((r) => r.rating);
    return {
      tastings: list.length, avg: round1(avg(all)),
      byType: summarize(dims.type), byGrape: summarize(dims.grape).slice(0, 15), byCountry: summarize(dims.country).slice(0, 12), byRegion: summarize(dims.region).slice(0, 12), byBody: summarize(dims.body), bySweetness: summarize(dims.sweetness),
      top: [...list].sort((a, b) => b.rating - a.rating).slice(0, 5).map((r) => ({ wine_id: r.wine_id, name: r.name, producer: r.producer, vintage: r.vintage, type: r.type, rating: r.rating })),
      buyAgainRate: list.filter((r) => r.would_buy_again !== null).length ? round1(100 * list.filter((r) => r.would_buy_again === 1).length / list.filter((r) => r.would_buy_again !== null).length) : null,
    };
  }
  const perUser = users.map((u) => ({ user: { id: u.id, name: u.name }, ...profile(rows.filter((r) => r.user_id === u.id)) }));
  const household = profile(rows);

  // Verschillen: waar scoren twee personen hetzelfde onderdeel ≥ 8 punten anders (min. 2 proefnotities elk)?
  const differences = [];
  if (perUser.length >= 2) {
    const [a, b] = perUser;
    for (const dim of ['byType', 'byGrape', 'byCountry', 'byRegion']) {
      for (const x of a[dim]) {
        const y = b[dim].find((z) => z.label === x.label);
        if (y && x.n >= 2 && y.n >= 2 && Math.abs(x.avg - y.avg) >= 8) differences.push({ dim, label: x.label, [a.user.name]: x.avg, [b.user.name]: y.avg, diff: round1(x.avg - y.avg) });
      }
    }
    differences.sort((p, q) => Math.abs(q.diff) - Math.abs(p.diff));
  }
  // Gedeelde favorieten: wijnen die beide ≥ 88 gaven
  const shared = [];
  if (perUser.length >= 2) {
    const byWine = new Map();
    for (const r of rows) { (byWine.get(r.wine_id) || byWine.set(r.wine_id, { name: r.name, producer: r.producer, vintage: r.vintage, type: r.type, wine_id: r.wine_id, ratings: {} }).get(r.wine_id)).ratings[r.user_name] = Math.max(r.rating, byWine.get(r.wine_id).ratings[r.user_name] || 0); }
    for (const w of byWine.values()) { const vals = Object.values(w.ratings); if (vals.length >= 2 && Math.min(...vals) >= 88) shared.push(w); }
    shared.sort((p, q) => Math.min(...Object.values(q.ratings)) - Math.min(...Object.values(p.ratings)));
  }
  return json({ perUser, household, differences: differences.slice(0, 12), shared: shared.slice(0, 10) });
}

// ---- Prijs-kwaliteit ---------------------------------------------------------
export async function priceQuality(req, env) {
  const rows = (await env.DB.prepare(
    `SELECT w.id, w.name, w.producer, w.vintage, w.type, w.country, w.region, w.estimated_price,
            AVG(t.rating) AS avg_rating, COUNT(t.id) AS n,
            (SELECT AVG(b.price) FROM bottles b WHERE b.wine_id = w.id AND b.price IS NOT NULL) AS avg_price
     FROM wines w JOIN tasting_notes t ON t.wine_id = w.id AND t.rating IS NOT NULL GROUP BY w.id`
  ).all()).results.map((r) => ({ ...r, price: r.avg_price ?? r.estimated_price ?? null, avg_rating: round1(r.avg_rating) })).filter((r) => r.price && r.price > 0);
  if (!rows.length) return json({ points: [], bestValue: [], disappointing: [], byBand: [] });
  // Verwachte score op basis van prijs (eenvoudige log-regressie), residu = hoeveel beter dan verwacht
  const xs = rows.map((r) => Math.log(r.price)), ys = rows.map((r) => r.avg_rating);
  const mx = avg(xs), my = avg(ys);
  const slope = rows.length > 1 ? xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / Math.max(1e-9, xs.reduce((s, x) => s + (x - mx) ** 2, 0)) : 0;
  const points = rows.map((r) => { const expected = my + slope * (Math.log(r.price) - mx); return { ...r, expected: round1(expected), value_score: round1(r.avg_rating - expected), points_per_10eur: round1((r.avg_rating - 50) / (r.price / 10)) }; });
  const bands = [[0, 10, '< € 10'], [10, 20, '€ 10 – 20'], [20, 40, '€ 20 – 40'], [40, 80, '€ 40 – 80'], [80, 1e9, '> € 80']];
  const byBand = bands.map(([lo, hi, label]) => { const inBand = points.filter((p) => p.price >= lo && p.price < hi); return { label, n: inBand.length, avg: round1(avg(inBand.map((p) => p.avg_rating))), avg_price: round1(avg(inBand.map((p) => p.price))) }; }).filter((b) => b.n);
  return json({
    points: points.sort((a, b) => a.price - b.price),
    bestValue: [...points].sort((a, b) => b.value_score - a.value_score).slice(0, 8),
    disappointing: [...points].filter((p) => p.value_score < -3).sort((a, b) => a.value_score - b.value_score).slice(0, 8),
    byBand, slope: round1(slope),
  });
}

// ---- Jaaroverzicht -----------------------------------------------------------
export async function yearReview(req, env) {
  const url = new URL(req.url);
  const year = num(url.searchParams.get('year'), { min: 2000, max: 2100, int: true }) || new Date().getFullYear();
  const from = `${year}-01-01`, to = `${year}-12-31`;
  const q = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).all()).results;
  const consumed = await q(`SELECT b.*, w.name, w.producer, w.vintage, w.type, w.country, w.region, w.grapes, w.estimated_price, ur.name AS by_name FROM bottles b JOIN wines w ON w.id = b.wine_id LEFT JOIN users ur ON ur.id = b.removed_by WHERE b.status = 'consumed' AND b.removed_at BETWEEN ? AND ?`, from, to);
  const bought = await q(`SELECT b.*, w.name, w.type FROM bottles b JOIN wines w ON w.id = b.wine_id WHERE b.added_at BETWEEN ? AND ? AND b.gifted = 0`, from, to + 'T23:59:59');
  const gifts = await q(`SELECT b.*, w.name FROM bottles b JOIN wines w ON w.id = b.wine_id WHERE b.added_at BETWEEN ? AND ? AND b.gifted = 1`, from, to + 'T23:59:59');
  const tastings = await q(`SELECT t.*, u.name AS user_name, w.name, w.producer, w.vintage, w.type, w.country, w.region FROM tasting_notes t JOIN users u ON u.id = t.user_id JOIN wines w ON w.id = t.wine_id WHERE t.tasted_at BETWEEN ? AND ?`, from, to);
  const years = (await q(`SELECT DISTINCT substr(removed_at, 1, 4) AS y FROM bottles WHERE removed_at IS NOT NULL UNION SELECT DISTINCT substr(added_at, 1, 4) FROM bottles ORDER BY y DESC`)).map((r) => r.y).filter(Boolean);
  const count = (arr, key) => { const m = {}; for (const x of arr) { const k = key(x); if (k) m[k] = (m[k] || 0) + 1; } return Object.entries(m).map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n); };
  const spent = bought.reduce((s, b) => s + (b.price || 0), 0);
  const drunkValue = consumed.reduce((s, b) => s + (b.price ?? b.estimated_price ?? 0), 0);
  const rated = tastings.filter((t) => t.rating);
  const best = rated.length ? [...rated].sort((a, b) => b.rating - a.rating)[0] : null;
  const byMonth = Array.from({ length: 12 }, (_, i) => ({ label: `${year}-${String(i + 1).padStart(2, '0')}`, n: consumed.filter((b) => (b.removed_at || '').startsWith(`${year}-${String(i + 1).padStart(2, '0')}`)).length }));
  const occasions = count(tastings, (t) => t.occasion);
  const places = count(consumed, (b) => { const m = /Gedronken bij ([^·]+)/.exec(b.removed_note || ''); return m ? m[1].trim() : null; });
  const oldest = consumed.filter((b) => b.vintage).sort((a, b) => a.vintage - b.vintage)[0] || null;
  const perPerson = count(consumed, (b) => b.by_name);
  const newCountries = [...new Set(consumed.map((b) => b.country).filter(Boolean))];
  return json({
    year, years,
    totals: { consumed: consumed.length, bought: bought.length, gifts_received: gifts.length, spent: Math.round(spent * 100) / 100, drunk_value: Math.round(drunkValue * 100) / 100, tastings: tastings.length, avg_rating: round1(avg(rated.map((t) => t.rating))) },
    byType: count(consumed, (b) => b.type), byCountry: count(consumed, (b) => b.country).slice(0, 8), byRegion: count(consumed, (b) => b.region).slice(0, 8),
    byGrape: count(consumed.flatMap((b) => parse(b.grapes, []).map((g) => ({ g }))), (x) => x.g).slice(0, 8),
    byMonth, occasions: occasions.slice(0, 6), places: places.slice(0, 6), perPerson,
    best: best ? { name: best.name, producer: best.producer, vintage: best.vintage, rating: best.rating, by: best.user_name, wine_id: best.wine_id } : null,
    oldest: oldest ? { name: oldest.name, producer: oldest.producer, vintage: oldest.vintage, age: year - oldest.vintage } : null,
    mostDrunk: count(consumed, (b) => `${b.producer ? b.producer + ' · ' : ''}${b.name}${b.vintage ? ' ' + b.vintage : ''}`).slice(0, 5),
    countries: newCountries,
  });
}

// ---- Voorraaddoelen (aankooplijst met budget) --------------------------------
function targetMatches(t, w, price) {
  if (t.type && w.type !== t.type) return false;
  if (t.country && (w.country || '').toLowerCase() !== t.country.toLowerCase()) return false;
  if (t.region && !(w.region || '').toLowerCase().includes(t.region.toLowerCase())) return false;
  if (t.grape && !parse(w.grapes, []).some((g) => g.toLowerCase().includes(t.grape.toLowerCase()))) return false;
  if (t.max_price !== null && t.max_price !== undefined && price !== null && price > t.max_price) return false;
  if (t.min_price !== null && t.min_price !== undefined && price !== null && price < t.min_price) return false;
  return true;
}

export async function listTargets(req, env) {
  const targets = (await env.DB.prepare('SELECT * FROM stock_targets ORDER BY created_at').all()).results;
  const bottles = (await env.DB.prepare(`SELECT b.price, w.id AS wine_id, w.name, w.producer, w.vintage, w.type, w.country, w.region, w.grapes, w.estimated_price, (SELECT AVG(rating) FROM tasting_notes t WHERE t.wine_id = w.id) AS avg_rating FROM bottles b JOIN wines w ON w.id = b.wine_id WHERE b.status = 'in_cellar'`).all()).results;
  const history = (await env.DB.prepare(`SELECT w.id AS wine_id, w.name, w.producer, w.vintage, w.type, w.country, w.region, w.grapes, AVG(b.price) AS price, (SELECT AVG(rating) FROM tasting_notes t WHERE t.wine_id = w.id) AS avg_rating, COUNT(*) AS times FROM bottles b JOIN wines w ON w.id = b.wine_id WHERE b.status = 'consumed' GROUP BY w.id`).all()).results;
  const out = targets.map((t) => {
    const matching = bottles.filter((b) => targetMatches(t, b, b.price ?? b.estimated_price ?? null));
    const shortage = Math.max(0, t.min_bottles - matching.length);
    // Suggesties: eerder goed gescoorde wijnen die in deze categorie passen en niet (meer) op voorraad zijn
    const inStock = new Set(matching.map((b) => b.wine_id));
    const suggestions = history.filter((h) => targetMatches(t, h, h.price) && !inStock.has(h.wine_id) && (h.avg_rating || 0) >= 80).sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0)).slice(0, 4);
    return { ...t, in_stock: matching.length, shortage, ok: shortage === 0, estimated_cost: shortage * (t.max_price || (matching.length ? avg(matching.map((b) => b.price || 0)) : 15) || 15), suggestions };
  });
  return json({ targets: out, total_shortage_cost: Math.round(out.reduce((s, t) => s + (t.estimated_cost || 0), 0) * 100) / 100 });
}

export async function createTarget(req, env, { user }) {
  const b = await readJson(req, 5000);
  const id = uuid();
  await env.DB.prepare('INSERT INTO stock_targets (id, label, type, max_price, min_price, country, region, grape, min_bottles, budget, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, str(b.label, { max: 120, required: true, name: 'Naam' }), oneOf(b.type, WINE_TYPES, { name: 'Type' }), num(b.max_price, { min: 0, max: 1e5 }), num(b.min_price, { min: 0, max: 1e5 }), str(b.country, { max: 100 }), str(b.region, { max: 150 }), str(b.grape, { max: 80 }), num(b.min_bottles, { min: 1, max: 1000, int: true }) ?? 6, num(b.budget, { min: 0, max: 1e6 }), user.id).run();
  return json({ id }, 201);
}
export async function deleteTarget(req, env, { params }) {
  await env.DB.prepare('DELETE FROM stock_targets WHERE id = ?').bind(params.id).run();
  return json({ ok: true });
}

// ---- Inventarisatie ----------------------------------------------------------
export async function startInventory(req, env, { user }) {
  const expected = (await env.DB.prepare("SELECT COUNT(*) AS n FROM bottles WHERE status = 'in_cellar'").first()).n;
  const id = uuid();
  await env.DB.prepare('INSERT INTO inventory_sessions (id, started_by, expected) VALUES (?, ?, ?)').bind(id, user.id, expected).run();
  const wines = (await env.DB.prepare(
    `SELECT w.id, w.name, w.producer, w.vintage, w.type, w.barcode, w.label_image_key,
            GROUP_CONCAT(b.id) AS bottle_ids, COUNT(b.id) AS expected, GROUP_CONCAT(DISTINCT b.location) AS locations
     FROM wines w JOIN bottles b ON b.wine_id = w.id AND b.status = 'in_cellar' GROUP BY w.id ORDER BY b.location, w.name`
  ).all()).results.map((w) => ({ ...w, bottle_ids: (w.bottle_ids || '').split(',').filter(Boolean) }));
  return json({ session_id: id, expected, wines });
}

// POST /api/inventory/:id/finish { counts: { wine_id: n } , resolve: 'report' | 'remove_missing' }
export async function finishInventory(req, env, { user, params }) {
  const s = await env.DB.prepare('SELECT * FROM inventory_sessions WHERE id = ?').bind(params.id).first();
  if (!s) throw new HttpError(404, 'Inventarisatie niet gevonden.');
  const body = await readJson(req, 100_000);
  const counts = body.counts && typeof body.counts === 'object' ? body.counts : {};
  const resolve = oneOf(body.resolve, ['report', 'remove_missing'], { name: 'Afhandeling' }) || 'report';
  const rows = (await env.DB.prepare("SELECT b.id, b.wine_id FROM bottles b WHERE b.status = 'in_cellar' ORDER BY b.added_at").all()).results;
  const byWine = {};
  for (const r of rows) (byWine[r.wine_id] ||= []).push(r.id);
  const missing = [], extra = [], seen = [];
  for (const [wineId, ids] of Object.entries(byWine)) {
    const counted = Math.max(0, Math.min(1000, Number(counts[wineId] ?? ids.length)));
    seen.push(...ids.slice(0, counted));
    if (counted < ids.length) missing.push(...ids.slice(counted));
    if (counted > ids.length) extra.push({ wine_id: wineId, extra: counted - ids.length });
  }
  const now = nowIso();
  if (seen.length) for (let i = 0; i < seen.length; i += 50) await env.DB.prepare(`UPDATE bottles SET last_seen_at = ? WHERE id IN (${seen.slice(i, i + 50).map(() => '?').join(',')})`).bind(now, ...seen.slice(i, i + 50)).run();
  if (resolve === 'remove_missing' && missing.length) {
    for (let i = 0; i < missing.length; i += 50) await env.DB.prepare(`UPDATE bottles SET status = 'other', removed_by = ?, removed_at = ?, removed_reason = 'other', removed_note = 'Niet aangetroffen bij inventarisatie' WHERE id IN (${missing.slice(i, i + 50).map(() => '?').join(',')})`).bind(user.id, now.slice(0, 10), ...missing.slice(i, i + 50)).run();
  }
  await env.DB.prepare('UPDATE inventory_sessions SET finished_at = ?, seen = ?, missing = ? WHERE id = ?').bind(now, seen.length, JSON.stringify(missing), s.id).run();
  await logActivity(env, user.id, 'inventory.finished', 'inventory', s.id, { expected: s.expected, seen: seen.length, missing: missing.length, resolved: resolve });
  return json({ expected: s.expected, seen: seen.length, missing: missing.length, extra, resolved: resolve });
}

export async function inventoryHistory(req, env) {
  const rows = (await env.DB.prepare('SELECT s.*, u.name AS started_by_name FROM inventory_sessions s LEFT JOIN users u ON u.id = s.started_by ORDER BY s.started_at DESC LIMIT 20').all()).results;
  return json({ sessions: rows.map((r) => ({ ...r, missing: parse(r.missing, []).length })) });
}

// ---- Cadeau-register ---------------------------------------------------------
export async function gifts(req, env) {
  const rows = (await env.DB.prepare(
    `SELECT b.id, b.wine_id, b.status, b.gifted_from, b.gift_occasion, b.gift_thanked, b.purchase_date, b.removed_at, b.removed_note, w.name, w.producer, w.vintage, w.type, w.estimated_price,
            (SELECT rating FROM tasting_notes t WHERE t.bottle_id = b.id ORDER BY created_at DESC LIMIT 1) AS rating
     FROM bottles b JOIN wines w ON w.id = b.wine_id WHERE b.gifted = 1 ORDER BY b.purchase_date DESC, b.added_at DESC`
  ).all()).results;
  const byGiver = {};
  for (const r of rows) { const k = r.gifted_from || 'Onbekend'; (byGiver[k] ||= { giver: k, bottles: 0, in_cellar: 0, consumed: 0, value: 0, items: [] }); const g = byGiver[k]; g.bottles++; if (r.status === 'in_cellar') g.in_cellar++; if (r.status === 'consumed') g.consumed++; g.value += r.estimated_price || 0; g.items.push(r); }
  const toThank = rows.filter((r) => r.status === 'consumed' && !r.gift_thanked && r.gifted_from);
  return json({ givers: Object.values(byGiver).sort((a, b) => b.bottles - a.bottles), to_thank: toThank, total: rows.length });
}
export async function updateGift(req, env, { params }) {
  const b = await readJson(req, 5000);
  const sets = [], vals = [];
  if (b.gift_occasion !== undefined) { sets.push('gift_occasion = ?'); vals.push(str(b.gift_occasion, { max: 200 })); }
  if (b.gift_thanked !== undefined) { sets.push('gift_thanked = ?'); vals.push(bool(b.gift_thanked)); }
  if (b.gifted_from !== undefined) { sets.push('gifted_from = ?'); vals.push(str(b.gifted_from, { max: 120 })); }
  if (!sets.length) return json({ ok: true });
  await env.DB.prepare(`UPDATE bottles SET ${sets.join(', ')} WHERE id = ? AND gifted = 1`).bind(...vals, params.bottleId).run();
  return json({ ok: true });
}

// ---- Streepjescode -----------------------------------------------------------
export async function lookupBarcode(req, env) {
  const code = str(new URL(req.url).searchParams.get('code'), { max: 20, required: true, name: 'Code' }).replace(/\D/g, '');
  if (code.length < 8) throw new HttpError(400, 'Ongeldige streepjescode.');
  const w = await env.DB.prepare(`SELECT w.id, w.name, w.producer, w.vintage, w.type, (SELECT COUNT(*) FROM bottles b WHERE b.wine_id = w.id AND b.status = 'in_cellar') AS bottles_in_cellar FROM wines w WHERE w.barcode = ?`).bind(code).first();
  if (w) return json({ found: true, wine: w });
  // Open Food Facts kent veel wijnen (gratis, geen sleutel nodig)
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,quantity,countries_tags,categories_tags`, { headers: { 'User-Agent': 'Wijnkelder-huishoudapp/1.0' } });
    const data = res.ok ? await res.json() : null;
    if (data?.status === 1 && data.product) {
      const p = data.product;
      return json({ found: false, hint: { name: str(p.product_name, { max: 200 }), producer: str(p.brands, { max: 200 }), volume: str(p.quantity, { max: 40 }), country: (p.countries_tags || [])[0]?.replace(/^en:/, '') || null } });
    }
  } catch { /* geen hint */ }
  return json({ found: false, hint: null });
}
export async function setBarcode(req, env, { params }) {
  const b = await readJson(req, 2000);
  const code = b.barcode === null ? null : String(b.barcode || '').replace(/\D/g, '');
  if (code !== null && code.length < 8) throw new HttpError(400, 'Ongeldige streepjescode.');
  if (code) { const other = await env.DB.prepare('SELECT id, name FROM wines WHERE barcode = ? AND id != ?').bind(code, params.id).first(); if (other) throw new HttpError(409, `Deze streepjescode hoort al bij "${other.name}".`); }
  await env.DB.prepare('UPDATE wines SET barcode = ? WHERE id = ?').bind(code, params.id).run();
  return json({ ok: true });
}

// ---- Kaartlaag "gedronken" ---------------------------------------------------
export async function mapConsumed(req, env) {
  const rows = (await env.DB.prepare(
    `SELECT w.id, w.name, w.producer, w.country, w.region, w.appellation, w.type, w.vintage, w.latitude AS lat, w.longitude AS lon, COUNT(b.id) AS bottles, MAX(b.removed_at) AS last,
            (SELECT AVG(rating) FROM tasting_notes t WHERE t.wine_id = w.id) AS avg_rating
     FROM wines w JOIN bottles b ON b.wine_id = w.id AND b.status = 'consumed' WHERE w.latitude IS NOT NULL GROUP BY w.id`
  ).all()).results;
  const countries = (await env.DB.prepare(`SELECT w.country, SUM(CASE WHEN b.status = 'in_cellar' THEN 1 ELSE 0 END) AS in_cellar, SUM(CASE WHEN b.status = 'consumed' THEN 1 ELSE 0 END) AS consumed FROM wines w JOIN bottles b ON b.wine_id = w.id WHERE w.country IS NOT NULL GROUP BY w.country ORDER BY consumed DESC`).all()).results;
  return json({ consumed: rows, countries });
}

// ---- "Laatste fles" & meldingen in de app ------------------------------------
export async function listNotifications(req, env) {
  const rows = (await env.DB.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50').all()).results;
  return json({ notifications: rows, unread: rows.filter((r) => !r.read_at).length });
}
export async function markNotificationsRead(req, env) {
  await env.DB.prepare('UPDATE notifications SET read_at = ? WHERE read_at IS NULL').bind(nowIso()).run();
  return json({ ok: true });
}
export async function addNotification(env, kind, title, body, link) {
  await env.DB.prepare('INSERT INTO notifications (id, kind, title, body, link) VALUES (?, ?, ?, ?, ?)').bind(uuid(), kind, title.slice(0, 120), (body || '').slice(0, 500), link || null).run();
}
