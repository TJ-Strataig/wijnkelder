// Herkomst: coördinaten van wijnen (geocoding via OpenStreetMap Nominatim) en producentprofielen (AI).
import { HttpError, json, readJson, uuid, nowIso, str, num, strArray, rateLimit, logActivity, safeHttpsUrl } from './util.js';
import { chatJson } from './ai.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'Wijnkelder-huishoudapp/1.0 (persoonlijk gebruik)';

export function nameKey(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\b(chateau|domaine|domain|bodega|bodegas|cantina|tenuta|weingut|estate|winery|vineyards?|maison|azienda agricola|quinta)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

// Eén poging bij Nominatim; geeft {lat, lon, label} of null.
async function geocodeOnce(query) {
  const url = `${NOMINATIM}?format=jsonv2&limit=1&accept-language=nl&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' } });
  if (!res.ok) return null;
  const data = await res.json().catch(() => []);
  const hit = Array.isArray(data) && data[0];
  if (!hit) return null;
  const lat = Number(hit.lat), lon = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, label: String(hit.display_name || query).slice(0, 200) };
}

// Van precies naar grof: producent → appellatie → streek → land.
async function geocodeWine(w) {
  const attempts = [];
  if (w.producer && (w.region || w.country)) attempts.push({ precision: 'producer', q: [w.producer, w.appellation || w.region, w.country].filter(Boolean).join(', ') });
  if (w.appellation) attempts.push({ precision: 'appellation', q: [w.appellation, w.region, w.country].filter(Boolean).join(', ') });
  if (w.region) attempts.push({ precision: 'region', q: [w.region, w.country].filter(Boolean).join(', ') });
  if (w.country) attempts.push({ precision: 'country', q: w.country });
  for (const a of attempts) {
    const hit = await geocodeOnce(a.q);
    if (hit) return { ...hit, precision: a.precision };
    await new Promise((r) => setTimeout(r, 1100)); // Nominatim: max 1 verzoek per seconde
  }
  return null;
}

// GET /api/map — alle wijnen in de kelder met coördinaten, gegroepeerd per locatie.
export async function mapData(req, env) {
  const rows = (await env.DB.prepare(
    `SELECT w.id, w.name, w.producer, w.country, w.region, w.appellation, w.type, w.vintage, w.latitude, w.longitude, w.geo_label, w.geo_precision, w.label_image_key,
            COUNT(b.id) AS bottles
     FROM wines w JOIN bottles b ON b.wine_id = w.id AND b.status = 'in_cellar'
     GROUP BY w.id`
  ).all()).results;
  const producers = (await env.DB.prepare('SELECT id, name, name_key, latitude, longitude, region, country FROM producers').all()).results;
  const byKey = new Map(producers.map((p) => [p.name_key, p]));
  const located = [], missing = [];
  for (const w of rows) {
    const p = w.producer ? byKey.get(nameKey(w.producer)) : null;
    const lat = w.latitude ?? p?.latitude, lon = w.longitude ?? p?.longitude;
    const item = { id: w.id, name: w.name, producer: w.producer, producer_id: p?.id || null, country: w.country, region: w.region, appellation: w.appellation, type: w.type, vintage: w.vintage, bottles: w.bottles };
    if (lat !== null && lat !== undefined && lon !== null && lon !== undefined) located.push({ ...item, lat, lon, precision: w.geo_precision || (p ? 'producer' : null), label: w.geo_label });
    else missing.push(item);
  }
  return json({ located, missing });
}

// POST /api/map/geocode { wine_id? } — geocodeert één wijn, of (zonder id) maximaal 5 wijnen zonder coördinaten.
export async function geocode(req, env, { user }) {
  await rateLimit(env, `geo:${user.id}`, 30, 3600);
  const body = await readJson(req, 5000);
  let wines;
  if (body.wine_id) {
    const w = await env.DB.prepare('SELECT * FROM wines WHERE id = ?').bind(str(body.wine_id, { max: 60, required: true })).first();
    if (!w) throw new HttpError(404, 'Wijn niet gevonden.');
    wines = [w];
  } else {
    wines = (await env.DB.prepare(
      `SELECT w.* FROM wines w WHERE w.latitude IS NULL AND (w.country IS NOT NULL OR w.region IS NOT NULL)
       AND EXISTS (SELECT 1 FROM bottles b WHERE b.wine_id = w.id AND b.status = 'in_cellar') LIMIT 5`
    ).all()).results;
  }
  const results = [];
  for (const w of wines) {
    const hit = await geocodeWine(w);
    if (hit) {
      await env.DB.prepare('UPDATE wines SET latitude = ?, longitude = ?, geo_label = ?, geo_precision = ? WHERE id = ?').bind(hit.lat, hit.lon, hit.label, hit.precision, w.id).run();
      results.push({ wine_id: w.id, ok: true, precision: hit.precision, label: hit.label });
    } else {
      results.push({ wine_id: w.id, ok: false });
    }
  }
  const remaining = (await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM wines w WHERE w.latitude IS NULL AND (w.country IS NOT NULL OR w.region IS NOT NULL)
     AND EXISTS (SELECT 1 FROM bottles b WHERE b.wine_id = w.id AND b.status = 'in_cellar')`
  ).first()).n;
  return json({ results, remaining });
}

// PUT /api/wines/:id/location { latitude, longitude } — handmatig corrigeren (bijv. door een speld te verplaatsen).
export async function setWineLocation(req, env, { user, params }) {
  const body = await readJson(req, 2000);
  const lat = num(body.latitude, { min: -90, max: 90, name: 'Breedtegraad' });
  const lon = num(body.longitude, { min: -180, max: 180, name: 'Lengtegraad' });
  const res = await env.DB.prepare('UPDATE wines SET latitude = ?, longitude = ?, geo_label = ?, geo_precision = ?, updated_at = ? WHERE id = ?')
    .bind(lat, lon, lat === null ? null : 'handmatig geplaatst', lat === null ? null : 'manual', nowIso(), params.id).run();
  if (!res.meta.changes) throw new HttpError(404, 'Wijn niet gevonden.');
  await logActivity(env, user.id, 'wine.located', 'wine', params.id, { lat, lon });
  return json({ ok: true });
}

// ---- producenten ------------------------------------------------------------

function decorateProducer(p) {
  return { ...p, signature_wines: safeParse(p.signature_wines, []), sources: safeParse(p.sources, []) };
}
function safeParse(v, fb) { try { return v ? JSON.parse(v) : fb; } catch { return fb; } }

// GET /api/producers — alle producenten uit de kelder (ook zonder profiel), met aantallen.
export async function listProducers(req, env) {
  const wines = (await env.DB.prepare(
    `SELECT w.producer, w.country, w.region, COUNT(DISTINCT w.id) AS wines, SUM(CASE WHEN b.status = 'in_cellar' THEN 1 ELSE 0 END) AS bottles
     FROM wines w LEFT JOIN bottles b ON b.wine_id = w.id WHERE w.producer IS NOT NULL AND w.producer != '' GROUP BY w.producer`
  ).all()).results;
  const profiles = (await env.DB.prepare('SELECT * FROM producers').all()).results;
  const byKey = new Map(profiles.map((p) => [p.name_key, decorateProducer(p)]));
  const items = wines.map((w) => {
    const p = byKey.get(nameKey(w.producer));
    return { name: w.producer, country: w.country, region: w.region, wines: w.wines, bottles: w.bottles, profile: p || null };
  }).sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  return json({ producers: items });
}

// GET /api/producers/by-name?name=... — profiel + wijnen van één producent.
export async function getProducer(req, env) {
  const name = str(new URL(req.url).searchParams.get('name'), { max: 200, required: true, name: 'Naam' });
  const key = nameKey(name);
  const profile = await env.DB.prepare('SELECT * FROM producers WHERE name_key = ?').bind(key).first();
  const all = (await env.DB.prepare(
    `SELECT w.id, w.name, w.producer, w.vintage, w.type, w.region, w.country, w.appellation, w.latitude, w.longitude,
            (SELECT COUNT(*) FROM bottles b WHERE b.wine_id = w.id AND b.status = 'in_cellar') AS bottles_in_cellar,
            (SELECT COUNT(*) FROM bottles b WHERE b.wine_id = w.id AND b.status != 'in_cellar') AS bottles_history,
            (SELECT AVG(rating) FROM tasting_notes t WHERE t.wine_id = w.id) AS avg_rating
     FROM wines w WHERE w.producer IS NOT NULL ORDER BY w.vintage DESC`
  ).all()).results.filter((w) => nameKey(w.producer) === key);
  return json({ name, profile: profile ? decorateProducer(profile) : null, wines: all });
}

// POST /api/producers/profile { name } — laat de AI een profiel van de wijnboer schrijven en slaat het op.
export async function buildProducerProfile(req, env, { user }) {
  await rateLimit(env, `ai:${user.id}`, 60, 3600);
  const body = await readJson(req, 5000);
  const name = str(body.name, { max: 200, required: true, name: 'Naam' });
  const key = nameKey(name);
  if (!key) throw new HttpError(400, 'Ongeldige producentnaam.');
  const known = (await env.DB.prepare('SELECT name, vintage, type, region, country, appellation FROM wines WHERE producer = ? LIMIT 20').bind(name).all()).results;
  const hint = { producer: name, country: known[0]?.country || body.country || null, region: known[0]?.region || body.region || null, appellation: known[0]?.appellation || null, wines: known.map((w) => `${w.name} ${w.vintage || ''} (${w.type})`.trim()) };

  const result = await chatJson(env, [
    { role: 'system', content: 'Je bent een wijnjournalist met encyclopedische kennis van wijnhuizen wereldwijd. Schrijf een feitelijk, compact profiel van de gevraagde producent in het Nederlands. Verzin niets: gebruik null voor wat je niet zeker weet en zet "confidence" (0-1) op hoe zeker je bent dat je het juiste wijnhuis beschrijft. Antwoord uitsluitend met JSON: ' +
      '{"description": "3-5 zinnen over geschiedenis, ligging, stijl en reputatie", "founded": "jaar of periode", "owner": "eigenaar/familie", "winemaker": "wijnmaker", "hectares": 0, "philosophy": "bijv. biologisch, biodynamisch, traditioneel, modern", "signature_wines": ["bekendste wijnen"], "website": "https://... of null", "address": "plaats/adres van het wijnhuis", "latitude": 0.0, "longitude": 0.0, "country": "land (Nederlands)", "region": "streek", "confidence": 0.0}' },
    { role: 'user', content: `Producent: ${JSON.stringify(hint)}` },
  ], { maxTokens: 900 });

  const lat = num(result.latitude, { min: -90, max: 90 }), lon = num(result.longitude, { min: -180, max: 180 });
  const conf = num(result.confidence, { min: 0, max: 1 });
  const row = {
    id: uuid(), name, name_key: key,
    country: str(result.country, { max: 100 }) || hint.country, region: str(result.region, { max: 150 }) || hint.region,
    description: str(result.description, { max: 3000 }), founded: str(result.founded, { max: 60 }), owner: str(result.owner, { max: 200 }),
    winemaker: str(result.winemaker, { max: 200 }), hectares: num(result.hectares, { min: 0, max: 100000 }), philosophy: str(result.philosophy, { max: 300 }),
    signature_wines: JSON.stringify(strArray(result.signature_wines, { maxItems: 10, maxLen: 120 })), website: safeHttpsUrl(result.website),
    latitude: conf !== null && conf >= 0.5 ? lat : null, longitude: conf !== null && conf >= 0.5 ? lon : null, address: str(result.address, { max: 300 }),
    sources: JSON.stringify([{ method: 'ai', at: nowIso() }]), confidence: conf,
  };
  // Als de AI geen betrouwbare coördinaten gaf, probeer geocoding op adres/naam.
  if (row.latitude === null && (row.address || row.region)) {
    const hit = await geocodeOnce([name, row.address || row.region, row.country].filter(Boolean).join(', '));
    if (hit) { row.latitude = hit.lat; row.longitude = hit.lon; }
  }
  const existing = await env.DB.prepare('SELECT id, notes FROM producers WHERE name_key = ?').bind(key).first();
  const cols = Object.keys(row).filter((c) => c !== 'id');
  if (existing) {
    await env.DB.prepare(`UPDATE producers SET ${cols.filter((c) => c !== 'name_key').map((c) => `${c} = ?`).join(', ')}, updated_by = ?, updated_at = ? WHERE id = ?`)
      .bind(...cols.filter((c) => c !== 'name_key').map((c) => row[c]), user.id, nowIso(), existing.id).run();
    row.id = existing.id; row.notes = existing.notes;
  } else {
    await env.DB.prepare(`INSERT INTO producers (id, ${cols.join(', ')}, updated_by) VALUES (?, ${cols.map(() => '?').join(', ')}, ?)`).bind(row.id, ...cols.map((c) => row[c]), user.id).run();
  }
  // Wijnen van deze producent zonder eigen coördinaten krijgen die van het wijnhuis.
  if (row.latitude !== null) {
    await env.DB.prepare("UPDATE wines SET latitude = ?, longitude = ?, geo_label = ?, geo_precision = 'producer' WHERE producer = ? AND (latitude IS NULL OR geo_precision IN ('region', 'country', 'appellation'))")
      .bind(row.latitude, row.longitude, `${name}${row.address ? ', ' + row.address : ''}`.slice(0, 200), name).run();
  }
  await logActivity(env, user.id, 'producer.profiled', 'producer', row.id, { name, confidence: conf });
  return json({ profile: decorateProducer({ ...row, updated_at: nowIso() }) });
}

// PATCH /api/producers/:id — eigen notities en handmatige correcties.
export async function updateProducer(req, env, { user, params }) {
  const p = await env.DB.prepare('SELECT id FROM producers WHERE id = ?').bind(params.id).first();
  if (!p) throw new HttpError(404, 'Producent niet gevonden.');
  const body = await readJson(req, 20_000);
  const fields = {
    notes: str(body.notes, { max: 4000 }), website: body.website === undefined ? undefined : safeHttpsUrl(body.website),
    description: body.description === undefined ? undefined : str(body.description, { max: 3000 }),
    latitude: body.latitude === undefined ? undefined : num(body.latitude, { min: -90, max: 90 }),
    longitude: body.longitude === undefined ? undefined : num(body.longitude, { min: -180, max: 180 }),
  };
  const set = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (!set.length) return json({ ok: true });
  await env.DB.prepare(`UPDATE producers SET ${set.map(([k]) => `${k} = ?`).join(', ')}, updated_by = ?, updated_at = ? WHERE id = ?`).bind(...set.map(([, v]) => v), user.id, nowIso(), p.id).run();
  return json({ ok: true });
}
