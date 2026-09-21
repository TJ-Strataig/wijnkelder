// Selecties: bewaarde lijsten van wijnen voor een gelegenheid, thema of menu.
import { HttpError, json, noContent, readJson, str, uuid, logActivity } from './util.js';

function selectionFields(body) {
  return { name: str(body.name, { max: 120, required: true, name: 'Naam' }) };
}

async function getSelection(env, id) {
  const selection = await env.DB.prepare(
    `SELECT s.*, u.name AS created_by_name,
       (SELECT COUNT(*) FROM selection_wines sw WHERE sw.selection_id = s.id) AS wine_count
     FROM selections s LEFT JOIN users u ON u.id = s.created_by WHERE s.id = ?`
  ).bind(id).first();
  if (!selection) throw new HttpError(404, 'Selectie niet gevonden.');
  return selection;
}

export async function listSelections(req, env) {
  const selections = (await env.DB.prepare(
    `SELECT s.*, u.name AS created_by_name,
       (SELECT COUNT(*) FROM selection_wines sw WHERE sw.selection_id = s.id) AS wine_count
     FROM selections s LEFT JOIN users u ON u.id = s.created_by
     ORDER BY s.updated_at DESC, s.name COLLATE NOCASE`
  ).all()).results;
  return json({ selections });
}

export async function getSelectionDetail(req, env, { params }) {
  const selection = await getSelection(env, params.id);
  const wines = (await env.DB.prepare(
    `SELECT w.*, sw.added_at, u.name AS added_by_name
     FROM selection_wines sw JOIN wines w ON w.id = sw.wine_id
     LEFT JOIN users u ON u.id = sw.added_by
     WHERE sw.selection_id = ? ORDER BY sw.added_at DESC, w.name COLLATE NOCASE`
  ).bind(params.id).all()).results;
  return json({ selection, wines });
}

export async function createSelection(req, env, { user }) {
  const fields = selectionFields(await readJson(req, 5000));
  const id = uuid();
  await env.DB.prepare('INSERT INTO selections (id, name, created_by) VALUES (?, ?, ?)')
    .bind(id, fields.name, user.id).run();
  await logActivity(env, user.id, 'create', 'selection', id, { name: fields.name });
  return json({ id }, 201);
}

export async function renameSelection(req, env, { params, user }) {
  const fields = selectionFields(await readJson(req, 5000));
  const result = await env.DB.prepare('UPDATE selections SET name = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .bind(fields.name, params.id).run();
  if (!result.meta.changes) throw new HttpError(404, 'Selectie niet gevonden.');
  await logActivity(env, user.id, 'update', 'selection', params.id, { name: fields.name });
  return json({ ok: true });
}

export async function deleteSelection(req, env, { params, user }) {
  const result = await env.DB.prepare('DELETE FROM selections WHERE id = ?').bind(params.id).run();
  if (!result.meta.changes) throw new HttpError(404, 'Selectie niet gevonden.');
  await logActivity(env, user.id, 'delete', 'selection', params.id);
  return noContent();
}

export async function addWine(req, env, { params, user }) {
  await getSelection(env, params.id);
  const body = await readJson(req, 5000);
  const wineId = str(body.wine_id, { max: 100, required: true, name: 'Wijn' });
  const wine = await env.DB.prepare('SELECT id FROM wines WHERE id = ?').bind(wineId).first();
  if (!wine) throw new HttpError(404, 'Wijn niet gevonden.');
  try {
    await env.DB.prepare('INSERT INTO selection_wines (selection_id, wine_id, added_by) VALUES (?, ?, ?)')
      .bind(params.id, wineId, user.id).run();
  } catch (e) {
    if (String(e.message).toLowerCase().includes('unique')) throw new HttpError(409, 'Deze wijn staat al in de selectie.');
    throw e;
  }
  await env.DB.prepare('UPDATE selections SET updated_at = datetime(\'now\') WHERE id = ?').bind(params.id).run();
  return json({ ok: true }, 201);
}

export async function removeWine(req, env, { params, user }) {
  const result = await env.DB.prepare('DELETE FROM selection_wines WHERE selection_id = ? AND wine_id = ?')
    .bind(params.id, params.wineId).run();
  if (!result.meta.changes) throw new HttpError(404, 'Wijn staat niet in deze selectie.');
  await env.DB.prepare('UPDATE selections SET updated_at = datetime(\'now\') WHERE id = ?').bind(params.id).run();
  await logActivity(env, user.id, 'remove', 'selection_wine', params.wineId, { selection_id: params.id });
  return noContent();
}
