import { HttpError, json, readJson, str, num, uuid, logActivity } from './util.js';

const STATUSES = ['draft', 'open', 'revealed', 'cancelled'];

async function tasting(env, id) {
  const row = await env.DB.prepare(
    `SELECT b.*, e.title AS evening_name, s.name AS selection_name, u.name AS created_by_name
     FROM blind_tastings b
     LEFT JOIN evenings e ON e.id = b.evening_id
     LEFT JOIN selections s ON s.id = b.selection_id
     LEFT JOIN users u ON u.id = b.created_by WHERE b.id = ?`
  ).bind(id).first();
  if (!row) throw new HttpError(404, 'Blindproeverij niet gevonden.');
  return row;
}

function canManage(row, user) { return row.created_by === user.id || user.role === 'admin'; }
function code(value) {
  const out = String(value ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,30}$/.test(out)) throw new HttpError(400, 'Ongeldige proefcode.');
  return out;
}
function entryFields(body) {
  return {
    rating: num(body.rating, { min: 1, max: 100, int: true, name: 'Score' }),
    aromas: str(body.aromas, { max: 1000, name: 'Aroma’s' }),
    palate: str(body.palate, { max: 1000, name: 'Smaak' }),
    finish: str(body.finish, { max: 1000, name: 'Afdronk' }),
    notes: str(body.notes, { max: 3000, name: 'Notitie' }),
  };
}

async function winesFor(env, id, reveal) {
  const fields = reveal ? 'btw.*, w.name, w.producer, w.vintage, w.type' : 'btw.id, btw.tasting_id, btw.code, btw.flight_order';
  return (await env.DB.prepare(`SELECT ${fields} FROM blind_tasting_wines btw JOIN wines w ON w.id = btw.wine_id WHERE btw.tasting_id = ? ORDER BY btw.flight_order, btw.code`).bind(id).all()).results;
}

async function entriesForUser(env, id, userId) {
  return (await env.DB.prepare('SELECT code, rating, aromas, palate, finish, notes FROM blind_tasting_entries WHERE tasting_id = ? AND user_id = ?').bind(id, userId).all()).results;
}

async function resultRows(env, id) {
  return (await env.DB.prepare(
    `SELECT btw.code, btw.flight_order, w.id AS wine_id, w.name, w.producer, w.vintage,
       AVG(e.rating) AS average, COUNT(e.id) AS count
     FROM blind_tasting_wines btw JOIN wines w ON w.id = btw.wine_id
     LEFT JOIN blind_tasting_entries e ON e.tasting_id = btw.tasting_id AND e.code = btw.code
     WHERE btw.tasting_id = ? GROUP BY btw.id ORDER BY btw.flight_order`
  ).bind(id).all()).results;
}

export async function listBlindTastings(req, env, { user }) {
  const rows = (await env.DB.prepare(
    `SELECT b.id, b.name, b.status, b.evening_id, b.selection_id, b.created_by, b.created_at,
       e.title AS evening_name, COUNT(btw.id) AS wine_count
     FROM blind_tastings b LEFT JOIN blind_tasting_wines btw ON btw.tasting_id = b.id
     LEFT JOIN evenings e ON e.id = b.evening_id
     GROUP BY b.id ORDER BY b.created_at DESC`
  ).all()).results;
  return json({ blind_tastings: rows.map((r) => ({ ...r, code_count: r.wine_count, created_by_me: r.created_by === user.id })) });
}

export async function createBlindTasting(req, env, { user }) {
  const body = await readJson(req, 20_000);
  const name = str(body.name ?? body.title, { max: 120, required: true, name: 'Naam' });
  const wineIds = Array.isArray(body.wine_ids) ? [...new Set(body.wine_ids.map(String))] : [];
  if (!wineIds.length || wineIds.length > 100) throw new HttpError(400, 'Kies één tot honderd verschillende wijnen.');
  const ids = [body.evening_id, body.selection_id].filter(Boolean);
  for (const id of ids) {
    if (!(await env.DB.prepare('SELECT id FROM ' + (id === body.evening_id ? 'evenings' : 'selections') + ' WHERE id = ?').bind(id).first())) {
      throw new HttpError(400, 'Avond of selectie niet gevonden.');
    }
  }
  const placeholders = wineIds.map(() => '?').join(',');
  const found = (await env.DB.prepare(`SELECT id FROM wines WHERE id IN (${placeholders})`).bind(...wineIds).all()).results;
  if (found.length !== wineIds.length) throw new HttpError(400, 'Een of meer wijnen zijn niet gevonden.');
  const id = uuid();
  const statements = [
    env.DB.prepare('INSERT INTO blind_tastings (id, name, evening_id, selection_id, created_by) VALUES (?, ?, ?, ?, ?)').bind(id, name, body.evening_id || null, body.selection_id || null, user.id),
    ...wineIds.map((wineId, i) => env.DB.prepare('INSERT INTO blind_tasting_wines (id, tasting_id, wine_id, code, flight_order) VALUES (?, ?, ?, ?, ?)')
      .bind(uuid(), id, wineId, `A${String(i + 1).padStart(2, '0')}`, i + 1)),
    env.DB.prepare('INSERT INTO activity (id, user_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)').bind(uuid(), user.id, 'create', 'blind_tasting', id, JSON.stringify({ name, wine_count: wineIds.length })),
  ];
  await env.DB.batch(statements);
  return json({ id }, 201);
}

export async function getBlindTasting(req, env, { params, user }) {
  const row = await tasting(env, params.id);
  const revealed = row.status === 'revealed';
  const wines = await winesFor(env, row.id, revealed);
  const own = await entriesForUser(env, row.id, user.id);
  const ownByCode = Object.fromEntries(own.map((e) => [e.code, e]));
  const codes = wines.map((w) => ({ ...w, wine_id: undefined, tasting: ownByCode[w.code] || null }));
  return json({ blind_tasting: { ...row, created_by_me: canManage(row, user), revealed }, codes, ...(revealed ? { results: await resultRows(env, row.id) } : {}) });
}

export async function flight(req, env, { params, user }) {
  const row = await tasting(env, params.id);
  const wines = await winesFor(env, row.id, false);
  const own = await entriesForUser(env, row.id, user.id);
  const ownByCode = Object.fromEntries(own.map((e) => [e.code, e]));
  return json({ flight: wines.map((w) => ({ id: w.id, code: w.code, flight_order: w.flight_order, tasting: ownByCode[w.code] || null })) });
}

export async function openBlindTasting(req, env, { params, user }) {
  const row = await tasting(env, params.id);
  if (!canManage(row, user)) throw new HttpError(403, 'Alleen de maker of beheerder kan openen.');
  if (row.status === 'open') return json({ ok: true, status: 'open' });
  if (row.status !== 'draft') throw new HttpError(409, 'Deze blindproeverij kan niet meer worden geopend.');
  const result = await env.DB.prepare("UPDATE blind_tastings SET status = 'open', opened_at = datetime('now') WHERE id = ? AND status = 'draft'").bind(row.id).run();
  if (result.meta.changes) await logActivity(env, user.id, 'open', 'blind_tasting', row.id);
  return json({ ok: true, status: 'open' });
}

export async function revealBlindTasting(req, env, { params, user }) {
  const row = await tasting(env, params.id);
  if (!canManage(row, user)) throw new HttpError(403, 'Alleen de maker of beheerder kan onthullen.');
  if (row.status === 'revealed') return json({ ok: true, status: 'revealed', idempotent: true });
  if (row.status !== 'open') throw new HttpError(409, 'Alleen een geopende blindproeverij kan worden onthuld.');
  const result = await env.DB.prepare("UPDATE blind_tastings SET status = 'revealed', revealed_at = datetime('now') WHERE id = ? AND status = 'open'").bind(row.id).run();
  if (result.meta.changes) await logActivity(env, user.id, 'reveal', 'blind_tasting', row.id);
  return json({ ok: true, status: 'revealed' });
}

export async function cancelBlindTasting(req, env, { params, user }) {
  const row = await tasting(env, params.id);
  if (!canManage(row, user)) throw new HttpError(403, 'Alleen de maker of beheerder kan annuleren.');
  if (row.status === 'cancelled') return json({ ok: true, status: 'cancelled', idempotent: true });
  if (row.status === 'revealed') throw new HttpError(409, 'Een onthulde proeverij kan niet worden geannuleerd.');
  await env.DB.prepare("UPDATE blind_tastings SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ? AND status IN ('draft','open')").bind(row.id).run();
  await logActivity(env, user.id, 'cancel', 'blind_tasting', row.id);
  return json({ ok: true, status: 'cancelled' });
}

export async function upsertEntry(req, env, { params, user }) {
  const row = await tasting(env, params.id);
  if (row.status !== 'open') throw new HttpError(409, 'Proefnotities kunnen alleen tijdens een actieve proeverij worden opgeslagen.');
  const tastingCode = code(params.code);
  if (!(await env.DB.prepare('SELECT id FROM blind_tasting_wines WHERE tasting_id = ? AND code = ?').bind(row.id, tastingCode).first())) throw new HttpError(404, 'Proefcode niet gevonden.');
  const fields = entryFields(await readJson(req, 10_000));
  await env.DB.prepare(
    `INSERT INTO blind_tasting_entries (id, tasting_id, code, user_id, rating, aromas, palate, finish, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tasting_id, code, user_id) DO UPDATE SET rating=excluded.rating, aromas=excluded.aromas, palate=excluded.palate, finish=excluded.finish, notes=excluded.notes, updated_at=datetime('now')`
  ).bind(uuid(), row.id, tastingCode, user.id, fields.rating, fields.aromas, fields.palate, fields.finish, fields.notes).run();
  return json({ ok: true });
}

export async function results(req, env, { params, user }) {
  const row = await tasting(env, params.id);
  if (row.status !== 'revealed') throw new HttpError(409, 'Resultaten zijn pas na onthullen beschikbaar.');
  return json({ results: await resultRows(env, row.id) });
}
