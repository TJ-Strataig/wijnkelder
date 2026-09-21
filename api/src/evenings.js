import { HttpError, json, noContent, readJson, str, oneOf, uuid, logActivity } from './util.js';

const KINDS = ['home', 'restaurant'];
const STATUSES = ['planned', 'completed', 'cancelled'];
const FIELDS = ['title', 'starts_at', 'ends_at', 'kind', 'status', 'selection_id', 'restaurant_name', 'restaurant_address', 'restaurant_url', 'dish', 'mood', 'guests', 'notes'];

function dateTime(value, name, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, `${name} is verplicht.`);
    return null;
  }
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new HttpError(400, `${name} is geen geldige datum/tijd.`);
  return value.trim();
}

function eveningFields(body, partial = false) {
  const out = {};
  if (!partial || body.starts_at !== undefined) out.starts_at = dateTime(body.starts_at, 'Starttijd', !partial);
  if (!partial || body.ends_at !== undefined) out.ends_at = dateTime(body.ends_at, 'Eindtijd', !partial);
  if (out.starts_at && out.ends_at && new Date(out.ends_at) <= new Date(out.starts_at)) throw new HttpError(400, 'Eindtijd moet na de starttijd liggen.');
  if (!partial || body.kind !== undefined) out.kind = oneOf(body.kind ?? 'home', KINDS, { name: 'Type' });
  if (!partial || body.status !== undefined) out.status = oneOf(body.status ?? 'planned', STATUSES, { name: 'Status' });
  for (const name of ['title', 'restaurant_name', 'restaurant_address', 'restaurant_url', 'dish', 'mood', 'guests', 'notes']) {
    if (!partial || body[name] !== undefined) out[name] = str(body[name], { max: name === 'notes' ? 2000 : 300, name });
  }
  if (!partial || body.selection_id !== undefined) out.selection_id = str(body.selection_id, { max: 100, name: 'Selectie' });
  if (out.kind === 'home' && (out.restaurant_name || out.restaurant_address || out.restaurant_url)) {
    throw new HttpError(400, 'Restaurantvelden zijn alleen toegestaan voor een restaurantavond.');
  }
  return out;
}

async function getEvening(env, id) {
  const row = await env.DB.prepare(
    `SELECT e.*, s.name AS selection_name, u.name AS created_by_name
     FROM evenings e LEFT JOIN selections s ON s.id = e.selection_id
     LEFT JOIN users u ON u.id = e.created_by WHERE e.id = ?`
  ).bind(id).first();
  if (!row) throw new HttpError(404, 'Avond niet gevonden.');
  return row;
}

async function checkSelection(env, id) {
  if (id && !(await env.DB.prepare('SELECT id FROM selections WHERE id = ?').bind(id).first())) {
    throw new HttpError(400, 'Selectie niet gevonden.');
  }
}

export async function listEvenings(req, env) {
  const url = new URL(req.url);
  const q = [];
  const binds = [];
  if (url.searchParams.get('from')) { q.push('e.starts_at >= ?'); binds.push(dateTime(url.searchParams.get('from'), 'Vanaf')); }
  if (url.searchParams.get('to')) { q.push('e.starts_at <= ?'); binds.push(dateTime(url.searchParams.get('to'), 'Tot')); }
  if (url.searchParams.get('status')) { q.push('e.status = ?'); binds.push(oneOf(url.searchParams.get('status'), STATUSES, { name: 'Status' })); }
  const where = q.length ? `WHERE ${q.join(' AND ')}` : '';
  const rows = (await env.DB.prepare(
    `SELECT e.*, s.name AS selection_name, u.name AS created_by_name FROM evenings e
     LEFT JOIN selections s ON s.id = e.selection_id LEFT JOIN users u ON u.id = e.created_by
     ${where} ORDER BY e.starts_at ASC, e.created_at DESC`
  ).bind(...binds).all()).results;
  return json({ evenings: rows });
}

export async function getEveningDetail(req, env, { params }) { return json({ evening: await getEvening(env, params.id) }); }

export async function createEvening(req, env, { user }) {
  const fields = eveningFields(await readJson(req, 10000));
  await checkSelection(env, fields.selection_id);
  const id = uuid();
  const names = ['id', ...FIELDS, 'created_by'];
  const values = [id, ...FIELDS.map((name) => fields[name] ?? null), user.id];
  await env.DB.prepare(`INSERT INTO evenings (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`).bind(...values).run();
  await logActivity(env, user.id, 'create', 'evening', id, fields);
  return json({ id }, 201);
}

export async function updateEvening(req, env, { params, user }) {
  const old = await getEvening(env, params.id);
  const fields = eveningFields(await readJson(req, 10000), true);
  if (fields.starts_at && fields.ends_at && new Date(fields.ends_at) <= new Date(fields.starts_at)) throw new HttpError(400, 'Eindtijd moet na de starttijd liggen.');
  await checkSelection(env, fields.selection_id);
  if (fields.kind === 'home') {
    for (const key of ['restaurant_name', 'restaurant_address', 'restaurant_url']) if (fields[key]) throw new HttpError(400, 'Restaurantvelden zijn alleen toegestaan voor een restaurantavond.');
  }
  const merged = { ...old, ...fields };
  if (merged.ends_at && new Date(merged.ends_at) <= new Date(merged.starts_at)) throw new HttpError(400, 'Eindtijd moet na de starttijd liggen.');
  if (merged.kind === 'home') {
    for (const key of ['restaurant_name', 'restaurant_address', 'restaurant_url']) {
      if (fields[key] === undefined && old[key]) fields[key] = null;
    }
  }
  const sets = FIELDS.filter((name) => fields[name] !== undefined).map((name) => `${name} = ?`);
  if (!sets.length) return json({ ok: true });
  await env.DB.prepare(`UPDATE evenings SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`)
    .bind(...FIELDS.filter((name) => fields[name] !== undefined).map((name) => fields[name]), params.id).run();
  await logActivity(env, user.id, 'update', 'evening', params.id, fields);
  return json({ ok: true });
}

export async function deleteEvening(req, env, { params, user }) {
  const result = await env.DB.prepare('DELETE FROM evenings WHERE id = ?').bind(params.id).run();
  if (!result.meta.changes) throw new HttpError(404, 'Avond niet gevonden.');
  await logActivity(env, user.id, 'delete', 'evening', params.id);
  return noContent();
}
