import { HttpError, json, noContent, readJson, str, uuid, logActivity } from './util.js';

const cleanName = (v, label) => str(v, { required: true, max: 120, name: label });
async function one(db, sql, ...args) { return db.prepare(sql).bind(...args).first(); }
function duplicate(e) { return /unique constraint|UNIQUE constraint/i.test(e?.message || ''); }
async function ensure(db, table, id, label) {
  const row = await one(db, `SELECT id FROM ${table} WHERE id = ?`, id);
  if (!row) throw new HttpError(404, `${label} niet gevonden.`);
  return row;
}

export async function listLocations(req, env) {
  const locations = (await env.DB.prepare(`
    SELECT l.*, (SELECT COUNT(*) FROM racks r WHERE r.location_id=l.id) rack_count
    FROM cellar_locations l ORDER BY l.name COLLATE NOCASE`).all()).results;
  const racks = (await env.DB.prepare(`
    SELECT r.*, l.name location_name, (SELECT COUNT(*) FROM slots s WHERE s.rack_id=r.id) slot_count
    FROM racks r JOIN cellar_locations l ON l.id=r.location_id ORDER BY l.name COLLATE NOCASE,r.name COLLATE NOCASE`).all()).results;
  const slots = (await env.DB.prepare(`
    SELECT s.*, r.name rack_name, l.id location_id, l.name location_name,
      (SELECT COUNT(*) FROM bottles b WHERE b.slot_id=s.id AND b.status='in_cellar') occupancy
    FROM slots s JOIN racks r ON r.id=s.rack_id JOIN cellar_locations l ON l.id=r.location_id
    ORDER BY l.name COLLATE NOCASE,r.name COLLATE NOCASE,s.name COLLATE NOCASE`).all()).results;
  return json({ locations, racks, slots });
}

export async function createLocation(req, env, { user }) {
  const b = await readJson(req); const name = cleanName(b.name, 'Naam');
  try { const id = uuid(); await env.DB.prepare('INSERT INTO cellar_locations (id,name,created_by) VALUES (?,?,?)').bind(id,name,user.id).run(); return json({ id,name }, 201); }
  catch (e) { if (duplicate(e)) throw new HttpError(409, 'Deze locatienaam bestaat al.'); throw e; }
}
export async function updateLocation(req, env, { params }) {
  const b = await readJson(req); const name = cleanName(b.name, 'Naam'); await ensure(env.DB,'cellar_locations',params.id,'Locatie');
  try { await env.DB.prepare('UPDATE cellar_locations SET name=? WHERE id=?').bind(name,params.id).run(); return json({ id:params.id,name }); }
  catch (e) { if (duplicate(e)) throw new HttpError(409, 'Deze locatienaam bestaat al.'); throw e; }
}
export async function deleteLocation(req, env, { params }) { await ensure(env.DB,'cellar_locations',params.id,'Locatie'); await env.DB.prepare('DELETE FROM cellar_locations WHERE id=?').bind(params.id).run(); return noContent(); }

export async function createRack(req, env, { params }) {
  await ensure(env.DB,'cellar_locations',params.locationId,'Locatie'); const name=cleanName((await readJson(req)).name,'Naam');
  try { const id=uuid(); await env.DB.prepare('INSERT INTO racks (id,location_id,name) VALUES (?,?,?)').bind(id,params.locationId,name).run(); return json({id,location_id:params.locationId,name},201); }
  catch(e){if(duplicate(e))throw new HttpError(409,'Deze reknaam bestaat al op deze locatie.');throw e;}
}
export async function updateRack(req, env, { params }) { const name=cleanName((await readJson(req)).name,'Naam'); await ensure(env.DB,'racks',params.id,'Rek'); try { await env.DB.prepare('UPDATE racks SET name=? WHERE id=?').bind(name,params.id).run(); return json({id:params.id,name}); } catch(e){if(duplicate(e))throw new HttpError(409,'Deze reknaam bestaat al op deze locatie.');throw e;} }
export async function deleteRack(req, env, { params }) { await ensure(env.DB,'racks',params.id,'Rek'); await env.DB.prepare('DELETE FROM racks WHERE id=?').bind(params.id).run(); return noContent(); }

export async function createSlot(req, env, { params }) {
  await ensure(env.DB,'racks',params.rackId,'Rek'); const name=cleanName((await readJson(req)).name,'Naam');
  try { const id=uuid(); await env.DB.prepare('INSERT INTO slots (id,rack_id,name) VALUES (?,?,?)').bind(id,params.rackId,name).run(); return json({id,rack_id:params.rackId,name},201); }
  catch(e){if(duplicate(e))throw new HttpError(409,'Dit vak bestaat al op dit rek.');throw e;}
}
export async function updateSlot(req, env, { params }) { const name=cleanName((await readJson(req)).name,'Naam'); await ensure(env.DB,'slots',params.id,'Vak'); try { await env.DB.prepare('UPDATE slots SET name=? WHERE id=?').bind(name,params.id).run(); return json({id:params.id,name}); } catch(e){if(duplicate(e))throw new HttpError(409,'Dit vak bestaat al op dit rek.');throw e;} }
export async function deleteSlot(req, env, { params }) {
  await ensure(env.DB,'slots',params.id,'Vak');
  const used=await one(env.DB,"SELECT COUNT(*) n FROM bottles WHERE slot_id=? AND status='in_cellar'",params.id);
  if (used?.n) throw new HttpError(409,'Dit vak bevat nog flessen; verplaats die eerst.');
  await env.DB.prepare('DELETE FROM slots WHERE id=?').bind(params.id).run(); return noContent();
}

export async function occupancy(req, env) {
  const u=new URL(req.url); const status=u.searchParams.get('status') || 'in_cellar';
  if(status!=='in_cellar') return json({ slots:[], status });
  const slots=(await env.DB.prepare(`SELECT s.id,s.name,r.id rack_id,r.name rack_name,l.id location_id,l.name location_name,
    COUNT(CASE WHEN b.status='in_cellar' THEN 1 END) occupancy
    FROM slots s JOIN racks r ON r.id=s.rack_id JOIN cellar_locations l ON l.id=r.location_id
    LEFT JOIN bottles b ON b.slot_id=s.id GROUP BY s.id ORDER BY l.name,r.name,s.name`).all()).results;
  return json({ slots, status });
}
export async function legacyLocations(req, env) {
  const rows=(await env.DB.prepare("SELECT location,COUNT(*) count FROM bottles WHERE location IS NOT NULL AND trim(location)<>'' GROUP BY location ORDER BY location COLLATE NOCASE").all()).results;
  return json({ locations: rows });
}

export async function validateSlot(env, slotId) {
  if (slotId === undefined) return undefined;
  if (slotId === null || slotId === '') return null;
  const row=await one(env.DB,'SELECT id FROM slots WHERE id=?',slotId);
  if(!row) throw new HttpError(400,'Ongeldig vak.');
  return slotId;
}
