// Beoordelingswachtrij: bulk-foto's die (op de telefoon) zijn geüpload en herkend, en later (op de desktop) worden goedgekeurd.
// Niets uit deze wachtrij komt in de kelder zonder expliciete goedkeuring.
import { HttpError, json, readJson, uuid, nowIso, str, num, oneOf, isValidPhotoKey, signPhotoUrl, logActivity, jsonObject, quantity as bottleQuantity } from './util.js';
import { createWine, addBottles } from './wines.js';
import { mutation } from './mutation.js';

const STATUSES = ['pending', 'recognized', 'failed', 'approved', 'skipped'];

function parse(v, fb) { try { return v ? JSON.parse(v) : fb; } catch { return fb; } }

async function decorate(env, row) {
  return {
    ...row,
    wine: parse(row.wine, null),
    bottle: parse(row.bottle, null),
    label_image_url: row.label_image_key ? await signPhotoUrl(env, row.label_image_key) : null,
  };
}

// GET /api/intake — de hele wachtrij (open items eerst), plus tellingen.
export async function listIntake(req, env) {
  const rows = (await env.DB.prepare(
    `SELECT q.*, u.name AS created_by_name FROM intake_queue q LEFT JOIN users u ON u.id = q.created_by
     ORDER BY CASE q.status WHEN 'recognized' THEN 0 WHEN 'pending' THEN 1 WHEN 'failed' THEN 2 ELSE 3 END, q.created_at DESC LIMIT 500`
  ).all()).results;
  const items = [];
  for (const r of rows) items.push(await decorate(env, r));
  const counts = Object.fromEntries(STATUSES.map((s) => [s, items.filter((i) => i.status === s).length]));
  return json({ items, counts });
}

// POST /api/intake — foto in de wachtrij zetten (herkenning volgt apart), met optioneel al herkende gegevens.
// { label_image_key, batch_label?, bottle?, wine?, confidence?, status? }
export async function addIntake(req, env, { user }) {
  const body = await readJson(req, 200_000);
  const key = body.label_image_key === undefined || body.label_image_key === null ? null : String(body.label_image_key);
  if (key !== null) {
    if (!isValidPhotoKey(key)) throw new HttpError(400, 'Ongeldige fotoverwijzing.');
    if (!(await env.FOTOS.get(key))) throw new HttpError(400, 'Foto niet gevonden.');
  }
  const wine = jsonObject(body.wine, { max: 20_000, name: 'Wijngegevens' });
  const bottle = jsonObject(body.bottle, { max: 4000, name: 'Flesgegevens' });
  const status = wine ? 'recognized' : 'pending';
  const id = uuid();
  await env.DB.prepare(
    'INSERT INTO intake_queue (id, status, label_image_key, wine, bottle, confidence, batch_label, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, status, key, wine, bottle, num(body.confidence, { min: 0, max: 1 }), str(body.batch_label, { max: 120 }), user.id).run();
  await logActivity(env, user.id, 'intake.added', 'intake', id, { batch: body.batch_label || null });
  return json({ id, status }, 201);
}

// PATCH /api/intake/:id — herkenningsresultaat of aangepaste gegevens opslaan; status wijzigen (recognized/failed/skipped/pending).
export async function updateIntake(req, env, { user, params }) {
  const row = await env.DB.prepare('SELECT * FROM intake_queue WHERE id = ?').bind(params.id).first();
  if (!row) throw new HttpError(404, 'Item niet gevonden.');
  if (row.status === 'approved') throw new HttpError(409, 'Dit item is al goedgekeurd.');
  const body = await readJson(req, 200_000);
  const sets = [], vals = [];
  if (body.wine !== undefined) { sets.push('wine = ?'); vals.push(jsonObject(body.wine, { max: 20_000, name: 'Wijngegevens' })); }
  if (body.bottle !== undefined) { sets.push('bottle = ?'); vals.push(jsonObject(body.bottle, { max: 4000, name: 'Flesgegevens' })); }
  if (body.confidence !== undefined) { sets.push('confidence = ?'); vals.push(num(body.confidence, { min: 0, max: 1 })); }
  if (body.error !== undefined) { sets.push('error = ?'); vals.push(str(body.error, { max: 500 })); }
  if (body.status !== undefined) { sets.push('status = ?'); vals.push(oneOf(body.status, ['pending', 'recognized', 'failed', 'skipped'], { name: 'Status' })); }
  if (!sets.length) return json({ ok: true });
  sets.push('updated_at = ?'); vals.push(nowIso());
  const result = await env.DB.prepare(`UPDATE intake_queue SET ${sets.join(', ')} WHERE id = ? AND status = ? AND updated_at = ? AND wine IS ? AND bottle IS ?`)
    .bind(...vals, row.id, row.status, row.updated_at, row.wine, row.bottle).run();
  if (result.meta.changes !== 1) throw new HttpError(409, 'Dit item is intussen gewijzigd of goedgekeurd. Vernieuw de wachtrij.');
  return json({ ok: true });
}

// POST /api/intake/:id/approve — DE goedkeuring: maakt de wijn aan (of boekt flessen bij op een bestaande) en markeert het item.
// Body mag de definitieve (gecontroleerde) gegevens bevatten: { wine, bottle, existing_wine_id? }
export async function approveIntake(req, env, { user, params }) {
  const row = await env.DB.prepare('SELECT * FROM intake_queue WHERE id = ?').bind(params.id).first();
  if (!row) throw new HttpError(404, 'Item niet gevonden.');
  if (row.status === 'approved') throw new HttpError(409, 'Dit item is al goedgekeurd.');
  const body = await readJson(req, 200_000);
  const wine = body.wine === undefined ? parse(row.wine, null) : body.wine;
  const bottle = body.bottle === undefined ? parse(row.bottle, {}) || {} : body.bottle;
  jsonObject(bottle, { max: 4000, name: 'Flesgegevens' });
  if (!bottle) throw new HttpError(400, 'Flesgegevens ontbreken.');
  if (!wine || !wine.name) throw new HttpError(400, 'Geen wijngegevens om goed te keuren; vul minimaal een naam in.');
  const quantity = bottleQuantity(bottle.quantity, { min: 1 }) ?? 1;
  const wineJson = jsonObject(wine, { max: 20_000, name: 'Wijngegevens' });
  const bottleJson = jsonObject({ ...bottle, quantity }, { max: 4000, name: 'Flesgegevens' });
  const token = uuid();
  const writes = mutation(env, {
    claim: env.DB.prepare("UPDATE intake_queue SET approved_wine_id = ? WHERE id = ? AND status = ? AND updated_at = ? AND wine IS ? AND bottle IS ?")
      .bind(token, row.id, row.status, row.updated_at, row.wine, row.bottle),
    guard: 'EXISTS (SELECT 1 FROM intake_queue WHERE id = ? AND approved_wine_id = ?)',
    bindings: [row.id, token], conflict: 'Dit item is intussen gewijzigd of goedgekeurd. Vernieuw de wachtrij.',
  });
  const complete = (wineId) => {
    writes.activity(user, 'intake.approved', 'wine', wineId, { name: wine.name, quantity });
    writes.update('intake_queue', { status: 'approved', wine: wineJson, bottle: bottleJson, approved_wine_id: wineId, updated_at: nowIso() }, 'id = ?', [row.id]);
  };

  let result;
  const consumed = body.consumed;
  const existingId = str(body.existing_wine_id, { max: 60 });
  if (existingId) {
    // Flessen bijboeken op een bestaande wijn (duplicaat)
    const fakeReq = new Request(req.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...bottle, quantity, consumed }) });
    result = await addBottles(fakeReq, env, { user, params: { id: existingId }, writes, complete });
  } else {
    const payload = { ...wine, label_image_key: row.label_image_key || null, quantity, bottle, consumed, allow_duplicate: body.allow_duplicate === true };
    const fakeReq = new Request(req.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    result = await createWine(fakeReq, env, { user, writes, complete }); // gooit HttpError 409 met duplicate-info als de wijn al bestaat
  }
  const data = await result.json();
  return json({ ok: true, wine_id: data.wine.id, wine: data.wine });
}

// DELETE /api/intake/:id — item (en losse foto) verwijderen. Goedgekeurde items houden hun foto (die hangt aan de wijn).
export async function deleteIntake(req, env, { user, params }) {
  const row = await env.DB.prepare('SELECT * FROM intake_queue WHERE id = ?').bind(params.id).first();
  if (!row) throw new HttpError(404, 'Item niet gevonden.');
  if (row.status !== 'approved' && row.label_image_key) {
    const inUse = await env.DB.prepare('SELECT id FROM wines WHERE label_image_key = ?').bind(row.label_image_key).first();
    if (!inUse) await env.FOTOS.delete(row.label_image_key).catch(() => {});
  }
  await env.DB.prepare('DELETE FROM intake_queue WHERE id = ?').bind(row.id).run();
  await logActivity(env, user.id, 'intake.removed', 'intake', row.id);
  return json({ ok: true });
}

// POST /api/intake/cleanup — afgehandelde items (approved/skipped) opruimen.
export async function cleanupIntake(req, env, { user }) {
  const res = await env.DB.prepare("DELETE FROM intake_queue WHERE status IN ('approved', 'skipped')").run();
  await logActivity(env, user.id, 'intake.cleanup', 'intake', null, { removed: res.meta.changes });
  return json({ removed: res.meta.changes });
}
