// Wijnen, flessen, proefnotities, historie, verlanglijst, statistieken, export en foto's.
import {
  HttpError, json, noContent, readJson, uuid, nowIso, str, num, bool, strArray, oneOf, isoDate,
  WINE_TYPES, BOTTLE_REMOVE_REASONS, signPhotoUrl, verifyPhotoSig, isValidPhotoKey, safeHttpsUrl, logActivity, SECURITY_HEADERS,
} from './util.js';

// Fotosleutel uit invoer: alleen exact formaat, en de foto moet echt bestaan in de opslag.
async function photoKeyFromBody(env, v) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (!isValidPhotoKey(v)) throw new HttpError(400, 'Ongeldige fotoverwijzing.');
  if (!(await env.FOTOS.get(v))) throw new HttpError(400, 'Foto niet gevonden. Upload de foto opnieuw.');
  return v;
}

// Prijsbron-informatie wordt opnieuw opgebouwd uit een vaste set velden; links alleen https.
function sanitizePriceSource(src) {
  if (!src || typeof src !== 'object' || Array.isArray(src)) return null;
  const out = {
    at: str(src.at, { max: 40 }),
    confidence: num(src.confidence, { min: 0, max: 1 }),
    reasoning: str(src.reasoning, { max: 1000 }),
    method: oneOf(src.method, ['web+ai', 'ai', 'manual'], { name: 'method' }) || 'manual',
    sources: (Array.isArray(src.sources) ? src.sources : []).slice(0, 5).map((x) => ({
      title: str(x?.title, { max: 200 }),
      url: safeHttpsUrl(x?.url),
    })).filter((x) => x.url),
  };
  return out;
}

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

function parseJsonField(v, fallback) {
  if (!v) return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}

async function decorateWine(env, w) {
  return {
    ...w,
    grapes: parseJsonField(w.grapes, []),
    food_pairings: parseJsonField(w.food_pairings, []),
    tasting_profile: parseJsonField(w.tasting_profile, null),
    estimated_price_source: parseJsonField(w.estimated_price_source, null),
    aging_wine: !!w.aging_wine,
    favorite: !!w.favorite,
    label_image_url: w.label_image_key ? await signPhotoUrl(env, w.label_image_key) : null,
  };
}

// Smaakprofiel: alleen bekende velden met korte tekstlijsten.
function sanitizeTastingProfile(tp) {
  if (!tp || typeof tp !== 'object' || Array.isArray(tp)) return null;
  const out = {};
  for (const k of ['aromas', 'flavors']) if (tp[k]) out[k] = strArray(tp[k], { maxItems: 20, maxLen: 60 });
  if (tp.finish) out.finish = str(tp.finish, { max: 200 });
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

// Vertaalt de invoer naar databasevelden; wordt gebruikt bij aanmaken en bewerken.
function wineFields(body) {
  const vintage = num(body.vintage, { min: 1800, max: 2100, int: true, name: 'Jaargang' });
  return {
    name: str(body.name, { max: 200, required: true, name: 'Naam' }),
    producer: str(body.producer, { max: 200 }),
    country: str(body.country, { max: 100 }),
    region: str(body.region, { max: 150 }),
    appellation: str(body.appellation, { max: 150 }),
    type: oneOf(body.type, WINE_TYPES, { name: 'Type', required: true }),
    vintage,
    grapes: JSON.stringify(strArray(body.grapes)),
    alcohol: num(body.alcohol, { min: 0, max: 30, name: 'Alcohol' }),
    volume_ml: num(body.volume_ml, { min: 50, max: 30000, int: true, name: 'Inhoud' }) ?? 750,
    sweetness: str(body.sweetness, { max: 40 }),
    body: str(body.body, { max: 40 }),
    tannin: str(body.tannin, { max: 40 }),
    acidity: str(body.acidity, { max: 40 }),
    aging_wine: bool(body.aging_wine),
    drink_from: num(body.drink_from, { min: 1800, max: 2200, int: true, name: 'Drinken vanaf' }),
    drink_until: num(body.drink_until, { min: 1800, max: 2200, int: true, name: 'Drinken tot' }),
    peak_from: num(body.peak_from, { min: 1800, max: 2200, int: true, name: 'Hoogtepunt vanaf' }),
    peak_until: num(body.peak_until, { min: 1800, max: 2200, int: true, name: 'Hoogtepunt tot' }),
    development: str(body.development, { max: 2000 }),
    serving_temp: str(body.serving_temp, { max: 40 }),
    decant_minutes: num(body.decant_minutes, { min: 0, max: 600, int: true, name: 'Decanteren' }),
    food_pairings: JSON.stringify(strArray(body.food_pairings, { maxItems: 40, maxLen: 80 })),
    description: str(body.description, { max: 4000 }),
    tasting_profile: sanitizeTastingProfile(body.tasting_profile),
    notes: str(body.notes, { max: 4000 }),
    favorite: bool(body.favorite),
    estimated_price: num(body.estimated_price, { min: 0, max: 1e6, name: 'Prijsindicatie' }),
    estimated_price_min: num(body.estimated_price_min, { min: 0, max: 1e6 }),
    estimated_price_max: num(body.estimated_price_max, { min: 0, max: 1e6 }),
    estimated_price_source: body.estimated_price_source ? JSON.stringify(sanitizePriceSource(body.estimated_price_source)) : null,
  };
}

function bottleFields(body) {
  return {
    size_ml: num(body.size_ml, { min: 50, max: 30000, int: true, name: 'Inhoud' }) ?? 750,
    price: num(body.price, { min: 0, max: 1e6, name: 'Prijs' }),
    currency: str(body.currency, { max: 3 }) || 'EUR',
    gifted: bool(body.gifted),
    gifted_from: str(body.gifted_from, { max: 120 }),
    purchase_date: isoDate(body.purchase_date, { name: 'Aankoopdatum' }),
    purchase_place: str(body.purchase_place, { max: 150 }),
    location: str(body.location, { max: 120 }),
  };
}

const WINE_LIST_SQL = `
  SELECT w.*,
    (SELECT COUNT(*) FROM bottles b WHERE b.wine_id = w.id AND b.status = 'in_cellar') AS bottles_in_cellar,
    (SELECT COUNT(*) FROM bottles b WHERE b.wine_id = w.id) AS bottles_total,
    (SELECT AVG(rating) FROM tasting_notes t WHERE t.wine_id = w.id AND t.rating IS NOT NULL) AS avg_rating,
    (SELECT COUNT(*) FROM tasting_notes t WHERE t.wine_id = w.id) AS tasting_count,
    (SELECT SUM(COALESCE(price, 0)) FROM bottles b WHERE b.wine_id = w.id AND b.status = 'in_cellar') AS cellar_value,
    (SELECT SUM(COALESCE(b.price, w.estimated_price, 0)) FROM bottles b WHERE b.wine_id = w.id AND b.status = 'in_cellar') AS estimated_value,
    (SELECT COUNT(*) FROM bottles b WHERE b.wine_id = w.id AND b.status = 'in_cellar' AND b.price IS NULL AND w.estimated_price IS NULL) AS bottles_without_value,
    (SELECT GROUP_CONCAT(DISTINCT location) FROM bottles b WHERE b.wine_id = w.id AND b.status = 'in_cellar' AND location IS NOT NULL) AS locations,
    (SELECT MAX(gifted) FROM bottles b WHERE b.wine_id = w.id) AS any_gifted
  FROM wines w`;

export async function listWines(req, env) {
  const url = new URL(req.url);
  const includeEmpty = url.searchParams.get('all') === '1';
  const rows = (await env.DB.prepare(`${WINE_LIST_SQL} ORDER BY w.updated_at DESC`).all()).results;
  const wines = [];
  for (const r of rows) {
    if (!includeEmpty && r.bottles_in_cellar === 0) continue;
    wines.push(await decorateWine(env, r));
  }
  return json({ wines });
}

export async function getWine(req, env, { params }) {
  const w = await env.DB.prepare(`${WINE_LIST_SQL} WHERE w.id = ?`).bind(params.id).first();
  if (!w) throw new HttpError(404, 'Wijn niet gevonden.');
  const bottles = (await env.DB.prepare(
    `SELECT b.*, ua.name AS added_by_name, ur.name AS removed_by_name
     FROM bottles b LEFT JOIN users ua ON ua.id = b.added_by LEFT JOIN users ur ON ur.id = b.removed_by
     WHERE b.wine_id = ? ORDER BY b.status = 'in_cellar' DESC, b.added_at DESC`
  ).bind(params.id).all()).results;
  const tastings = (await env.DB.prepare(
    `SELECT t.*, u.name AS user_name FROM tasting_notes t JOIN users u ON u.id = t.user_id WHERE t.wine_id = ? ORDER BY t.tasted_at DESC`
  ).bind(params.id).all()).results;
  return json({ wine: await decorateWine(env, w), bottles: bottles.map((b) => ({ ...b, gifted: !!b.gifted })), tastings: tastings.map((t) => ({ ...t, would_buy_again: t.would_buy_again === null ? null : !!t.would_buy_again })) });
}

export async function createWine(req, env, { user }) {
  const body = await readJson(req, 200_000);
  const f = wineFields(body);
  const id = uuid();
  const cols = Object.keys(f);
  const labelKey = (await photoKeyFromBody(env, body.label_image_key)) ?? null;
  await env.DB.prepare(
    `INSERT INTO wines (id, ${cols.join(', ')}, label_image_key, created_by) VALUES (?, ${cols.map(() => '?').join(', ')}, ?, ?)`
  ).bind(id, ...cols.map((c) => f[c]), labelKey, user.id).run();

  // Flessen direct meenemen (aantal + aankoopgegevens), in de kelder of — met "consumed" — direct in de historie.
  const qty = Math.min(Math.max(num(body.quantity, { min: 0, max: 500, int: true }) ?? 1, 0), 500);
  const bf = bottleFields(body.bottle || body);
  const consumed = consumedFields(body.consumed);
  const bottleIds = await insertBottles(env, user, id, qty, bf, consumed);
  if (consumed && body.consumed.tasting && bottleIds.length) await insertTasting(env, user, id, bottleIds[0], { ...body.consumed.tasting, tasted_at: body.consumed.tasting.tasted_at || consumed.date, paired_with: body.consumed.tasting.paired_with, occasion: body.consumed.tasting.occasion || consumed.occasion });
  await logActivity(env, user.id, consumed ? 'wine.created_consumed' : 'wine.created', 'wine', id, { name: f.name, quantity: qty, place: consumed?.place });
  return getWine(req, env, { params: { id } });
}

// Gegevens voor flessen die direct naar de historie gaan (bijv. gedronken in een restaurant of meteen na aankoop).
// { reason, date, place, occasion, note, tasting? }
function consumedFields(c) {
  if (!c || typeof c !== 'object') return null;
  const reason = oneOf(c.reason, BOTTLE_REMOVE_REASONS, { name: 'Reden' }) || 'consumed';
  const date = isoDate(c.date, { name: 'Datum' }) || nowIso().slice(0, 10);
  const place = str(c.place, { max: 150 });
  const occasion = str(c.occasion, { max: 200 });
  const note = str(c.note, { max: 1000 });
  const parts = [place ? `Gedronken bij ${place}` : null, occasion, note].filter(Boolean);
  return { reason, date, place, occasion, note: parts.join(' · ') || null };
}

async function insertBottles(env, user, wineId, qty, bf, consumed) {
  const ids = [];
  const stmts = [];
  for (let i = 0; i < qty; i++) {
    const bid = uuid(); ids.push(bid);
    if (consumed) {
      stmts.push(env.DB.prepare(
        `INSERT INTO bottles (id, wine_id, status, size_ml, price, currency, gifted, gifted_from, purchase_date, purchase_place, location, added_by, removed_by, removed_at, removed_reason, removed_note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`
      ).bind(bid, wineId, consumed.reason, bf.size_ml, bf.price, bf.currency, bf.gifted, bf.gifted_from, bf.purchase_date || consumed.date, bf.purchase_place || consumed.place, user.id, user.id, consumed.date, consumed.reason, consumed.note));
    } else {
      stmts.push(env.DB.prepare(
        'INSERT INTO bottles (id, wine_id, size_ml, price, currency, gifted, gifted_from, purchase_date, purchase_place, location, added_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(bid, wineId, bf.size_ml, bf.price, bf.currency, bf.gifted, bf.gifted_from, bf.purchase_date, bf.purchase_place, bf.location, user.id));
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  return ids;
}

export async function updateWine(req, env, { user, params }) {
  const existing = await env.DB.prepare('SELECT id FROM wines WHERE id = ?').bind(params.id).first();
  if (!existing) throw new HttpError(404, 'Wijn niet gevonden.');
  const body = await readJson(req, 200_000);
  const f = wineFields(body);
  const cols = Object.keys(f);
  const sets = cols.map((c) => `${c} = ?`).join(', ');
  const labelKey = await photoKeyFromBody(env, body.label_image_key);
  await env.DB.prepare(
    `UPDATE wines SET ${sets}${labelKey === undefined ? '' : ', label_image_key = ?'}, updated_at = ? WHERE id = ?`
  ).bind(...cols.map((c) => f[c]), ...(labelKey === undefined ? [] : [labelKey]), nowIso(), params.id).run();
  await logActivity(env, user.id, 'wine.updated', 'wine', params.id, { name: f.name });
  return getWine(req, env, { params });
}

export async function deleteWine(req, env, { user, params }) {
  // Volledig verwijderen mag alleen als er geen flessenhistorie is; anders blijft de wijn in de historie zichtbaar.
  const w = await env.DB.prepare('SELECT id, name, label_image_key FROM wines WHERE id = ?').bind(params.id).first();
  if (!w) throw new HttpError(404, 'Wijn niet gevonden.');
  const consumed = (await env.DB.prepare("SELECT COUNT(*) AS n FROM bottles WHERE wine_id = ? AND status != 'in_cellar'").bind(params.id).first()).n;
  if (consumed > 0) {
    throw new HttpError(409, 'Deze wijn heeft historie. Verwijder de flessen via "fles verwijderen" zodat de historie behouden blijft.');
  }
  if (w.label_image_key) await env.FOTOS.delete(w.label_image_key).catch(() => {});
  await env.DB.prepare('DELETE FROM wines WHERE id = ?').bind(params.id).run();
  await logActivity(env, user.id, 'wine.deleted', 'wine', params.id, { name: w.name });
  return json({ ok: true });
}

export async function toggleFavorite(req, env, { user, params }) {
  const body = await readJson(req, 1000);
  await env.DB.prepare('UPDATE wines SET favorite = ?, updated_at = ? WHERE id = ?').bind(bool(body.favorite), nowIso(), params.id).run();
  return json({ ok: true });
}

// ---- flessen ---------------------------------------------------------------

export async function addBottles(req, env, { user, params }) {
  const w = await env.DB.prepare('SELECT id, name FROM wines WHERE id = ?').bind(params.id).first();
  if (!w) throw new HttpError(404, 'Wijn niet gevonden.');
  const body = await readJson(req, 50_000);
  const qty = num(body.quantity, { min: 1, max: 500, int: true, name: 'Aantal' }) ?? 1;
  const bf = bottleFields(body);
  const consumed = consumedFields(body.consumed);
  const ids = await insertBottles(env, user, w.id, qty, bf, consumed);
  if (consumed && body.consumed.tasting && ids.length) await insertTasting(env, user, w.id, ids[0], { ...body.consumed.tasting, tasted_at: body.consumed.tasting.tasted_at || consumed.date, occasion: body.consumed.tasting.occasion || consumed.occasion });
  await env.DB.prepare('UPDATE wines SET updated_at = ? WHERE id = ?').bind(nowIso(), w.id).run();
  await logActivity(env, user.id, consumed ? 'bottles.added_consumed' : 'bottles.added', 'wine', w.id, { name: w.name, quantity: qty, gifted: !!bf.gifted, place: consumed?.place });
  return getWine(req, env, { params });
}

export async function updateBottle(req, env, { user, params }) {
  const b = await env.DB.prepare('SELECT * FROM bottles WHERE id = ?').bind(params.bottleId).first();
  if (!b) throw new HttpError(404, 'Fles niet gevonden.');
  const body = await readJson(req, 20_000);
  const bf = bottleFields({ ...b, ...body, gifted: body.gifted === undefined ? b.gifted : body.gifted });
  await env.DB.prepare(
    'UPDATE bottles SET size_ml = ?, price = ?, currency = ?, gifted = ?, gifted_from = ?, purchase_date = ?, purchase_place = ?, location = ? WHERE id = ?'
  ).bind(bf.size_ml, bf.price, bf.currency, bf.gifted, bf.gifted_from, bf.purchase_date, bf.purchase_place, bf.location, b.id).run();
  await env.DB.prepare('UPDATE wines SET updated_at = ? WHERE id = ?').bind(nowIso(), b.wine_id).run();
  return getWine(req, env, { params: { id: b.wine_id } });
}

// "Verwijderen" = fles uit de kelder halen met een reden; de fles gaat naar de historie.
export async function removeBottle(req, env, { user, params }) {
  const b = await env.DB.prepare('SELECT b.*, w.name FROM bottles b JOIN wines w ON w.id = b.wine_id WHERE b.id = ?').bind(params.bottleId).first();
  if (!b) throw new HttpError(404, 'Fles niet gevonden.');
  if (b.status !== 'in_cellar') throw new HttpError(409, 'Deze fles is al uit de kelder.');
  const body = await readJson(req, 50_000);
  const reason = oneOf(body.reason, BOTTLE_REMOVE_REASONS, { name: 'Reden', required: true });
  const removedAt = isoDate(body.date) || nowIso().slice(0, 10);
  const note = str(body.note, { max: 1000 });
  await env.DB.batch([
    env.DB.prepare('UPDATE bottles SET status = ?, removed_by = ?, removed_at = ?, removed_reason = ?, removed_note = ? WHERE id = ?')
      .bind(reason, user.id, removedAt, reason, note, b.id),
    env.DB.prepare('UPDATE wines SET updated_at = ? WHERE id = ?').bind(nowIso(), b.wine_id),
  ]);
  // Optioneel direct een proefnotitie vastleggen.
  if (body.tasting && reason === 'consumed') {
    await insertTasting(env, user, b.wine_id, b.id, body.tasting);
  }
  await logActivity(env, user.id, 'bottle.removed', 'wine', b.wine_id, { name: b.name, reason });
  return getWine(req, env, { params: { id: b.wine_id } });
}

export async function restoreBottle(req, env, { user, params }) {
  const b = await env.DB.prepare('SELECT * FROM bottles WHERE id = ?').bind(params.bottleId).first();
  if (!b) throw new HttpError(404, 'Fles niet gevonden.');
  await env.DB.prepare("UPDATE bottles SET status = 'in_cellar', removed_by = NULL, removed_at = NULL, removed_reason = NULL, removed_note = NULL WHERE id = ?").bind(b.id).run();
  await logActivity(env, user.id, 'bottle.restored', 'wine', b.wine_id);
  return getWine(req, env, { params: { id: b.wine_id } });
}

// ---- proefnotities ---------------------------------------------------------

async function insertTasting(env, user, wineId, bottleId, t) {
  const id = uuid();
  await env.DB.prepare(
    `INSERT INTO tasting_notes (id, wine_id, bottle_id, user_id, tasted_at, rating, appearance, nose, palate, finish, notes, occasion, paired_with, would_buy_again)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, wineId, bottleId || null, user.id,
    isoDate(t.tasted_at) || nowIso().slice(0, 10),
    num(t.rating, { min: 1, max: 100, int: true, name: 'Score' }),
    str(t.appearance, { max: 500 }), str(t.nose, { max: 1000 }), str(t.palate, { max: 1000 }), str(t.finish, { max: 500 }),
    str(t.notes, { max: 3000 }), str(t.occasion, { max: 200 }), str(t.paired_with, { max: 200 }),
    t.would_buy_again === undefined || t.would_buy_again === null ? null : bool(t.would_buy_again)
  ).run();
  return id;
}

export async function addTasting(req, env, { user, params }) {
  const w = await env.DB.prepare('SELECT id, name FROM wines WHERE id = ?').bind(params.id).first();
  if (!w) throw new HttpError(404, 'Wijn niet gevonden.');
  const body = await readJson(req, 50_000);
  const id = await insertTasting(env, user, w.id, str(body.bottle_id, { max: 60 }), body);
  await logActivity(env, user.id, 'tasting.added', 'wine', w.id, { name: w.name, rating: body.rating });
  return json({ id }, 201);
}

export async function deleteTasting(req, env, { user, params }) {
  const t = await env.DB.prepare('SELECT * FROM tasting_notes WHERE id = ?').bind(params.tastingId).first();
  if (!t) throw new HttpError(404, 'Proefnotitie niet gevonden.');
  if (t.user_id !== user.id && user.role !== 'admin') throw new HttpError(403, 'Je kunt alleen je eigen notities verwijderen.');
  await env.DB.prepare('DELETE FROM tasting_notes WHERE id = ?').bind(t.id).run();
  return json({ ok: true });
}

export async function listTastings(req, env) {
  const rows = (await env.DB.prepare(
    `SELECT t.*, u.name AS user_name, w.name AS wine_name, w.producer, w.vintage, w.type
     FROM tasting_notes t JOIN users u ON u.id = t.user_id JOIN wines w ON w.id = t.wine_id
     ORDER BY t.tasted_at DESC, t.created_at DESC LIMIT 500`
  ).all()).results;
  return json({ tastings: rows });
}

// ---- historie --------------------------------------------------------------

export async function history(req, env) {
  const bottles = (await env.DB.prepare(
    `SELECT b.id, b.wine_id, b.status, b.size_ml, b.price, b.gifted, b.gifted_from, b.purchase_date, b.purchase_place,
            b.added_at, b.removed_at, b.removed_reason, b.removed_note,
            w.name, w.producer, w.country, w.region, w.type, w.vintage, w.label_image_key,
            ua.name AS added_by_name, ur.name AS removed_by_name,
            (SELECT rating FROM tasting_notes t WHERE t.bottle_id = b.id ORDER BY created_at DESC LIMIT 1) AS rating
     FROM bottles b JOIN wines w ON w.id = b.wine_id
     LEFT JOIN users ua ON ua.id = b.added_by LEFT JOIN users ur ON ur.id = b.removed_by
     WHERE b.status != 'in_cellar' ORDER BY b.removed_at DESC, b.added_at DESC LIMIT 2000`
  ).all()).results;
  const out = [];
  for (const b of bottles) {
    out.push({ ...b, gifted: !!b.gifted, label_image_url: b.label_image_key ? await signPhotoUrl(env, b.label_image_key) : null, label_image_key: undefined });
  }
  const activity = (await env.DB.prepare(
    'SELECT a.id, a.action, a.entity, a.entity_id, a.details, a.at, u.name AS user_name FROM activity a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.at DESC LIMIT 200'
  ).all()).results;
  return json({ bottles: out, activity: activity.map((a) => ({ ...a, details: parseJsonField(a.details, null) })) });
}

// ---- statistieken ----------------------------------------------------------

export async function stats(req, env) {
  const q = async (sql) => (await env.DB.prepare(sql).all()).results;
  const [totals] = await q(`
    SELECT
      (SELECT COUNT(*) FROM bottles WHERE status = 'in_cellar') AS bottles,
      (SELECT COUNT(DISTINCT wine_id) FROM bottles WHERE status = 'in_cellar') AS wines,
      (SELECT COALESCE(SUM(price), 0) FROM bottles WHERE status = 'in_cellar') AS purchase_value,
      (SELECT COALESCE(SUM(COALESCE(b.price, w.estimated_price, 0)), 0) FROM bottles b JOIN wines w ON w.id = b.wine_id WHERE b.status = 'in_cellar') AS estimated_value,
      (SELECT COUNT(*) FROM bottles WHERE status = 'consumed') AS consumed,
      (SELECT COUNT(*) FROM bottles WHERE status = 'in_cellar' AND gifted = 1) AS gifted_bottles,
      (SELECT COUNT(*) FROM tasting_notes) AS tastings`);
  const byType = await q(`SELECT w.type AS label, COUNT(*) AS n FROM bottles b JOIN wines w ON w.id = b.wine_id WHERE b.status = 'in_cellar' GROUP BY w.type ORDER BY n DESC`);
  const byCountry = await q(`SELECT COALESCE(w.country, 'Onbekend') AS label, COUNT(*) AS n FROM bottles b JOIN wines w ON w.id = b.wine_id WHERE b.status = 'in_cellar' GROUP BY w.country ORDER BY n DESC LIMIT 12`);
  const byVintage = await q(`SELECT COALESCE(w.vintage, 0) AS label, COUNT(*) AS n FROM bottles b JOIN wines w ON w.id = b.wine_id WHERE b.status = 'in_cellar' GROUP BY w.vintage ORDER BY w.vintage`);
  const consumedPerMonth = await q(`SELECT substr(removed_at, 1, 7) AS label, COUNT(*) AS n FROM bottles WHERE status = 'consumed' AND removed_at IS NOT NULL GROUP BY label ORDER BY label DESC LIMIT 24`);
  const topRated = await q(`SELECT w.id, w.name, w.producer, w.vintage, w.type, AVG(t.rating) AS avg_rating, COUNT(t.id) AS n FROM tasting_notes t JOIN wines w ON w.id = t.wine_id WHERE t.rating IS NOT NULL GROUP BY w.id ORDER BY avg_rating DESC LIMIT 10`);
  const year = new Date().getFullYear();
  const windows = await q(`
    SELECT w.id, w.name, w.producer, w.vintage, w.type, w.drink_from, w.drink_until, w.peak_from, w.peak_until, COUNT(b.id) AS bottles
    FROM wines w JOIN bottles b ON b.wine_id = w.id AND b.status = 'in_cellar'
    GROUP BY w.id`);
  const drinkNow = windows.filter((w) => (w.peak_from ?? w.drink_from ?? 0) <= year && (w.peak_until ?? w.drink_until ?? 9999) >= year);
  const drinkSoon = windows.filter((w) => w.drink_until && w.drink_until <= year + 1 && w.drink_until >= year);
  const pastPeak = windows.filter((w) => w.drink_until && w.drink_until < year);
  const tooYoung = windows.filter((w) => w.drink_from && w.drink_from > year);
  return json({ totals, byType, byCountry, byVintage, consumedPerMonth, topRated, drinkNow, drinkSoon, pastPeak, tooYoung, year });
}

// ---- verlanglijst ----------------------------------------------------------

export async function listWishlist(req, env) {
  const items = (await env.DB.prepare('SELECT wl.*, u.name AS created_by_name FROM wishlist wl LEFT JOIN users u ON u.id = wl.created_by ORDER BY wl.created_at DESC').all()).results;
  return json({ items });
}

export async function addWishlist(req, env, { user }) {
  const body = await readJson(req, 10_000);
  const id = uuid();
  await env.DB.prepare('INSERT INTO wishlist (id, name, producer, vintage, type, note, max_price, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, str(body.name, { max: 200, required: true, name: 'Naam' }), str(body.producer, { max: 200 }),
      num(body.vintage, { min: 1800, max: 2100, int: true }), oneOf(body.type, WINE_TYPES, { name: 'Type' }),
      str(body.note, { max: 1000 }), num(body.max_price, { min: 0, max: 1e6 }), user.id).run();
  return json({ id }, 201);
}

export async function deleteWishlist(req, env, { params }) {
  await env.DB.prepare('DELETE FROM wishlist WHERE id = ?').bind(params.id).run();
  return json({ ok: true });
}

// ---- export ----------------------------------------------------------------

export async function exportAll(req, env) {
  const q = async (sql) => (await env.DB.prepare(sql).all()).results;
  const data = {
    exported_at: nowIso(),
    wines: (await q('SELECT * FROM wines')).map((w) => ({ ...w, grapes: parseJsonField(w.grapes, []), food_pairings: parseJsonField(w.food_pairings, []) })),
    bottles: await q('SELECT * FROM bottles'),
    tasting_notes: await q('SELECT * FROM tasting_notes'),
    wishlist: await q('SELECT * FROM wishlist'),
    producers: await q('SELECT * FROM producers'),
    users: await q('SELECT id, name, role FROM users'),
  };
  return json(data);
}

export async function exportCsv(req, env) {
  const rows = (await env.DB.prepare(
    `SELECT w.name, w.producer, w.country, w.region, w.appellation, w.type, w.vintage, w.grapes, w.alcohol, w.aging_wine, w.drink_from, w.drink_until, w.peak_from, w.peak_until,
            b.status, b.size_ml, b.price, b.gifted, b.gifted_from, b.purchase_date, b.purchase_place, b.location, b.added_at, b.removed_at, b.removed_reason
     FROM bottles b JOIN wines w ON w.id = b.wine_id ORDER BY w.name, b.added_at`
  ).all()).results;
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // voorkomt formule-uitvoering in Excel/LibreOffice
    return /[",\n;']/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(c === 'grapes' ? parseJsonField(r[c], []).join(', ') : r[c])).join(';'))].join('\r\n');
  return new Response('\uFEFF' + csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="wijnkelder.csv"', ...SECURITY_HEADERS },
  });
}

// ---- foto's (R2) -----------------------------------------------------------

export async function uploadPhoto(req, env, { user }) {
  const ct = (req.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.includes(ct)) throw new HttpError(415, 'Alleen JPEG, PNG, WebP of HEIC-foto\'s zijn toegestaan.');
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > MAX_PHOTO_BYTES) throw new HttpError(413, 'Foto is te groot (max 8 MB).');
  const buf = await req.arrayBuffer();
  if (buf.byteLength > MAX_PHOTO_BYTES) throw new HttpError(413, 'Foto is te groot (max 8 MB).');
  if (buf.byteLength < 100) throw new HttpError(400, 'Lege foto.');
  const ext = ct === 'image/png' ? 'png' : ct === 'image/webp' ? 'webp' : ct.startsWith('image/hei') ? 'heic' : 'jpg';
  const key = `labels/${uuid()}.${ext}`;
  await env.FOTOS.put(key, buf, { httpMetadata: { contentType: ct }, customMetadata: { uploadedBy: user.id } });
  return json({ key, url: await signPhotoUrl(env, key) }, 201);
}

export async function getPhoto(req, env, { params }) {
  const url = new URL(req.url);
  const key = decodeURIComponent(params.key);
  if (!key.startsWith('labels/') || key.includes('..')) throw new HttpError(400, 'Ongeldige sleutel.');
  const ok = await verifyPhotoSig(env, key, url.searchParams.get('exp'), url.searchParams.get('sig'));
  if (!ok) throw new HttpError(403, 'Link verlopen.');
  const obj = await env.FOTOS.get(key);
  if (!obj) throw new HttpError(404, 'Foto niet gevonden.');
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg',
      'Cache-Control': 'private, max-age=3000',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}

export async function deletePhoto(req, env, { params }) {
  const key = decodeURIComponent(params.key);
  if (!key.startsWith('labels/')) throw new HttpError(400, 'Ongeldige sleutel.');
  const inUse = await env.DB.prepare('SELECT id FROM wines WHERE label_image_key = ?').bind(key).first();
  if (inUse) throw new HttpError(409, 'Foto is nog gekoppeld aan een wijn.');
  await env.FOTOS.delete(key);
  return noContent();
}
