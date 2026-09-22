import { json, SECURITY_HEADERS } from './util.js';
import { nowIso } from './util.js';

function parseJsonField(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

const COLLECTIONS = ['wines', 'bottles', 'tasting_notes', 'wishlist', 'producers', 'users',
  'selections', 'selection_wines', 'evenings', 'blind_tastings', 'blind_tasting_wines',
  'blind_tasting_entries', 'cellar_locations', 'racks', 'slots', 'occupancy'];

function params(req) {
  const u = new URL(req.url);
  const include = u.searchParams.get('include');
  let selected = include ? include.split(',').map((x) => x.trim()).filter((x) => COLLECTIONS.includes(x)) : COLLECTIONS;
  if (selected.includes('selections')) selected = [...selected, 'selection_wines'];
  if (selected.includes('blind_tastings')) selected = [...selected, 'blind_tasting_wines', 'blind_tasting_entries'];
  if (selected.includes('cellar_locations')) selected = [...selected, 'racks', 'slots'];
  return {
    include: [...new Set(selected)],
    selectionId: u.searchParams.get('selection_id'),
    eveningId: u.searchParams.get('evening_id'),
    blindTastingId: u.searchParams.get('blind_tasting_id'),
    locationId: u.searchParams.get('location_id'),
    rackId: u.searchParams.get('rack_id'),
    slotId: u.searchParams.get('slot_id'),
  };
}

async function all(db, sql, args = []) {
  return (await db.prepare(sql).bind(...args).all()).results;
}

function redact(rows, isAdmin) {
  if (isAdmin) return rows;
  return rows.map((row) => {
    const copy = { ...row };
    // User identifiers and names are not needed to restore cellar data.
    for (const key of ['user_id', 'created_by', 'added_by', 'removed_by', 'updated_by', 'started_by']) delete copy[key];
    return copy;
  });
}

async function collect(req, env, user) {
  const p = params(req);
  const has = (name) => p.include.includes(name);
  const isAdmin = user.role === 'admin';
  const data = { exported_at: nowIso() };
  if (has('wines')) data.wines = (await all(env.DB, 'SELECT * FROM wines')).map((w) => ({
    ...w, grapes: parseJsonField(w.grapes, []), food_pairings: parseJsonField(w.food_pairings, []),
  }));
  if (has('bottles')) {
    const where = [], args = [];
    if (p.locationId) { where.push('l.id = ?'); args.push(p.locationId); }
    if (p.rackId) { where.push('r.id = ?'); args.push(p.rackId); }
    if (p.slotId) { where.push('s.id = ?'); args.push(p.slotId); }
    data.bottles = redact(await all(env.DB, `SELECT b.* FROM bottles b
      LEFT JOIN slots s ON s.id = b.slot_id LEFT JOIN racks r ON r.id = s.rack_id
      LEFT JOIN cellar_locations l ON l.id = r.location_id${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`, args), isAdmin);
  }
  if (has('tasting_notes')) data.tasting_notes = redact(await all(env.DB, 'SELECT * FROM tasting_notes ORDER BY tasted_at DESC'), isAdmin);
  if (has('wishlist')) data.wishlist = await all(env.DB, 'SELECT * FROM wishlist');
  if (has('producers')) data.producers = await all(env.DB, 'SELECT * FROM producers');
  if (has('users') && user.role === 'admin') data.users = await all(env.DB, 'SELECT id, name, role FROM users');
  if (has('selections')) {
    data.selections = redact(await all(env.DB, 'SELECT * FROM selections' + (p.selectionId ? ' WHERE id = ?' : ''), p.selectionId ? [p.selectionId] : []), isAdmin);
  }
  if (has('selection_wines')) {
    data.selection_wines = await all(env.DB, 'SELECT * FROM selection_wines' + (p.selectionId ? ' WHERE selection_id = ?' : ''), p.selectionId ? [p.selectionId] : []);
  }
  if (has('evenings')) {
    data.evenings = redact(await all(env.DB, 'SELECT * FROM evenings' + (p.eveningId ? ' WHERE id = ?' : '') + ' ORDER BY starts_at', p.eveningId ? [p.eveningId] : []), isAdmin);
  }
  if (has('blind_tastings')) data.blind_tastings = redact(await all(env.DB, 'SELECT * FROM blind_tastings' + (p.blindTastingId ? ' WHERE id = ?' : ''), p.blindTastingId ? [p.blindTastingId] : []), isAdmin);
  if (has('blind_tasting_wines')) data.blind_tasting_wines = await all(env.DB, 'SELECT * FROM blind_tasting_wines' + (p.blindTastingId ? ' WHERE tasting_id = ?' : ''), p.blindTastingId ? [p.blindTastingId] : []);
  if (has('blind_tasting_entries')) data.blind_tasting_entries = redact(await all(env.DB, 'SELECT * FROM blind_tasting_entries' + (p.blindTastingId ? ' WHERE tasting_id = ?' : ''), p.blindTastingId ? [p.blindTastingId] : []), user.role === 'admin');
  if (has('cellar_locations')) data.cellar_locations = redact(await all(env.DB, 'SELECT * FROM cellar_locations' + (p.locationId ? ' WHERE id = ?' : ''), p.locationId ? [p.locationId] : []), isAdmin);
  if (has('racks')) data.racks = await all(env.DB, 'SELECT * FROM racks' + (p.rackId ? ' WHERE id = ?' : ''), p.rackId ? [p.rackId] : []);
  if (has('slots')) data.slots = await all(env.DB, 'SELECT * FROM slots' + (p.slotId ? ' WHERE id = ?' : ''), p.slotId ? [p.slotId] : []);
  if (has('occupancy')) data.occupancy = await all(env.DB, `SELECT l.id AS location_id, l.name AS location_name,
    r.id AS rack_id, r.name AS rack_name, s.id AS slot_id, s.name AS slot_name,
    COUNT(b.id) AS bottle_count FROM cellar_locations l
    LEFT JOIN racks r ON r.location_id = l.id LEFT JOIN slots s ON s.rack_id = r.id
    LEFT JOIN bottles b ON b.slot_id = s.id GROUP BY l.id, r.id, s.id ORDER BY l.name, r.name, s.name`);
  return data;
}

export async function exportAll(req, env, { user }) {
  return json(await collect(req, env, user));
}

export async function exportCsv(req, env, { user }) {
  const data = await collect(req, env, user);
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    let s = Array.isArray(v) ? v.join(', ') : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n;']/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const sections = [];
  for (const [type, rows] of Object.entries(data)) {
    if (type === 'exported_at' || !Array.isArray(rows) || !rows.length) continue;
    let csvRows = rows;
    if (type === 'bottles') {
      const filter = params(req);
      const where = [], args = [];
      if (filter.locationId) { where.push('l.id = ?'); args.push(filter.locationId); }
      if (filter.rackId) { where.push('r.id = ?'); args.push(filter.rackId); }
      if (filter.slotId) { where.push('s.id = ?'); args.push(filter.slotId); }
      csvRows = await all(env.DB, `SELECT w.name, w.producer, w.country, w.region, w.appellation, w.type, w.vintage, w.grapes, w.alcohol, w.aging_wine, w.drink_from, w.drink_until, w.peak_from, w.peak_until,
        b.status, b.size_ml, b.price, b.gifted, b.gifted_from, b.purchase_date, b.purchase_place, b.location,
        l.name AS cellar_location, r.name AS rack, s.name AS slot, b.added_at, b.removed_at, b.removed_reason
        FROM bottles b JOIN wines w ON w.id = b.wine_id LEFT JOIN slots s ON s.id = b.slot_id
        LEFT JOIN racks r ON r.id = s.rack_id LEFT JOIN cellar_locations l ON l.id = r.location_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY w.name, b.added_at`, args);
    }
    const cols = Object.keys(csvRows[0]);
    // Keep the original bottle CSV header/columns as the first section for
    // existing spreadsheet imports; all additional collections are typed.
    if (type === 'bottles') {
      sections.push([cols.join(';'), ...csvRows.map((r) => cols.map((c) => esc(c === 'grapes' ? parseJsonField(r[c], []).join(', ') : r[c])).join(';'))].join('\r\n'));
    } else {
      sections.push([['record_type', ...cols].join(';'), ...csvRows.map((r) => [type, ...cols.map((c) => esc(r[c]))].join(';'))].join('\r\n'));
    }
  }
  return new Response('\uFEFF' + sections.join('\r\n\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="wijnkelder.csv"', ...SECURITY_HEADERS },
  });
}
