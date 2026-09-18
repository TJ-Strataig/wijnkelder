// Wijnhuizen: varianten van dezelfde producent herkennen ("Muga" / "Bodegas Muga" / "Bodegas Muga S.A."),
// overzichtelijk voorstellen om samen te voegen, en bij nieuwe wijnen meteen de juiste spelling voorstellen.
import { HttpError, json, readJson, str, nowIso, logActivity, getSetting, setSetting, uuid } from './util.js';
import { nameKey } from './origin.js';
import { mutation } from './mutation.js';

// Strengere sleutel dan nameKey: afkortingen uitschrijven, rechtsvormen en voegwoorden weglaten.
export function producerKey(s) {
  let t = String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  t = t.replace(/\bch\.?\s/g, 'chateau ').replace(/\bdom\.?\s/g, 'domaine ').replace(/\bbod\.?\s/g, 'bodegas ').replace(/\bcant\.?\s/g, 'cantina ').replace(/\bten\.?\s/g, 'tenuta ').replace(/\bwg\.?\s/g, 'weingut ');
  t = t.replace(/\b(s\.?a\.?|s\.?l\.?|s\.?r\.?l\.?|s\.?p\.?a\.?|s\.?a\.?s\.?|s\.?a\.?r\.?l\.?|gmbh|ltd|inc|cie|co|et fils|e figli|y hijos|& sons|and sons|sons|freres|brothers|hermanos|fratelli|vignerons|viticultores|viticoltori|winzer|wines|wein|vins|vini|vinos|the|de|di|del|della|des|du|la|le|les|los|las|el|il|of|and|et|y|&)\b/g, ' ');
  return nameKey(t).replace(/\s+/g, ' ').trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

// Vergelijkt twee producenten; geeft { score, reason } of null als ze niet op elkaar lijken.
export function compareProducers(a, b) {
  const ka = producerKey(a), kb = producerKey(b);
  if (!ka || !kb) return null;
  if (ka === kb) return { score: 1, reason: 'zelfde naam, andere schrijfwijze' };
  const ta = ka.split(' ').filter((t) => t.length > 1), tb = kb.split(' ').filter((t) => t.length > 1);
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const distinctive = short.some((t) => t.length >= 4 && !/^\d+$/.test(t));
  if (short.length && distinctive && short.every((t) => long.includes(t))) return { score: 0.85, reason: `"${short.join(' ')}" komt volledig terug in de langere naam` };
  const maxLen = Math.max(ka.length, kb.length);
  if (maxLen >= 5) {
    const ratio = 1 - levenshtein(ka, kb) / maxLen;
    if (ratio >= 0.85) return { score: Math.round(ratio * 100) / 100, reason: 'bijna dezelfde naam (typefout of variant)' };
  }
  // Zelfde eerste, onderscheidende woord (bijv. "Antinori Chianti" vs "Antinori Tignanello")
  if (ta[0] && ta[0] === tb[0] && ta[0].length >= 6) return { score: 0.6, reason: `zelfde kernnaam "${ta[0]}"` };
  return null;
}

const pairKey = (a, b) => [producerKey(a), producerKey(b)].sort().join('|');

async function distinctSet(env) { return new Set((await getSetting(env, 'producer_distinct')) || []); }

// Alle producenten uit kelder + historie met aantallen en eventueel profiel.
async function producerRows(env) {
  const rows = (await env.DB.prepare(
    `SELECT w.producer AS name, MIN(w.country) AS country, MIN(w.region) AS region, COUNT(DISTINCT w.id) AS wines,
            SUM(CASE WHEN b.status = 'in_cellar' THEN 1 ELSE 0 END) AS bottles
     FROM wines w LEFT JOIN bottles b ON b.wine_id = w.id WHERE w.producer IS NOT NULL AND TRIM(w.producer) != '' GROUP BY w.producer`
  ).all()).results;
  const profiles = new Map((await env.DB.prepare('SELECT id, name, name_key FROM producers').all()).results.map((p) => [p.name_key, p]));
  return rows.map((r) => ({ ...r, bottles: r.bottles || 0, has_profile: !!profiles.get(nameKey(r.name)), profile_id: profiles.get(nameKey(r.name))?.id || null }));
}

// Voorkeursnaam binnen een groep: met profiel > meeste wijnen > langste (meest complete) naam.
function pickCanonical(variants) {
  return [...variants].sort((a, b) => (b.has_profile - a.has_profile) || (b.wines - a.wines) || (b.name.length - a.name.length))[0].name;
}

// GET /api/producers/varianten — groepen producenten die waarschijnlijk hetzelfde wijnhuis zijn.
export async function listVariants(req, env) {
  const rows = await producerRows(env);
  const dismissed = await distinctSet(env);
  const parent = rows.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const pairs = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    if (dismissed.has(pairKey(rows[i].name, rows[j].name))) continue;
    const c = compareProducers(rows[i].name, rows[j].name);
    if (c) { pairs.push({ i, j, ...c }); parent[find(i)] = find(j); }
  }
  const groups = new Map();
  for (let i = 0; i < rows.length; i++) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }
  const out = [];
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    const variants = idx.map((i) => rows[i]).sort((a, b) => b.wines - a.wines);
    const gp = pairs.filter((p) => idx.includes(p.i) && idx.includes(p.j));
    const score = Math.min(...gp.map((p) => p.score));
    out.push({
      variants, suggested: pickCanonical(variants), score,
      confidence: score >= 1 ? 'zeker' : score >= 0.8 ? 'waarschijnlijk' : 'mogelijk',
      reasons: [...new Set(gp.map((p) => p.reason))],
      wines: variants.reduce((s, v) => s + v.wines, 0), bottles: variants.reduce((s, v) => s + v.bottles, 0),
    });
  }
  out.sort((a, b) => b.score - a.score || b.wines - a.wines);
  return json({ groups: out, dismissed: dismissed.size });
}

// POST /api/producers/merge { names: [...], target: "Bodegas Muga" } — registreert alle wijnen onder één naam.
export async function mergeProducers(req, env, { user }) {
  const body = await readJson(req, 20_000);
  const target = str(body.target, { max: 200, required: true, name: 'Doelnaam' });
  const names = [...new Set((Array.isArray(body.names) ? body.names : []).map((n) => str(n, { max: 200 })).filter(Boolean))];
  if (names.length < 1) throw new HttpError(400, 'Geef minstens één te hernoemen wijnhuis op.');
  if (names.length > 50) throw new HttpError(400, 'Te veel namen tegelijk.');
  const from = names.filter((n) => n !== target);
  const targetKey = nameKey(target);
  const keys = JSON.stringify([...new Set([targetKey, ...from.map(nameKey)])]);
  const profiles = (await env.DB.prepare('SELECT * FROM producers WHERE name_key IN (SELECT value FROM json_each(?)) ORDER BY id').bind(keys).all()).results;
  const keep = profiles.find((p) => p.name_key === targetKey) || profiles[0];
  const notes = profiles.filter((p) => p.notes);
  const combinedNotes = notes.length < 2 ? notes[0]?.notes || null : notes.map((p) => `${p.name}:\n${p.notes}`).join('\n\n');
  if (combinedNotes?.length > 4000) throw new HttpError(409, 'De gezamenlijke notities zijn te lang. Bewaar en verkort ze eerst; er is niets samengevoegd.');
  let writes = mutation(env);
  if (keep) {
    const token = uuid();
    const differs = Object.keys(keep).map((column) => `p.${column} IS NOT json_extract(x.value, '$.${column}')`).join(' OR ');
    writes = mutation(env, {
      claim: env.DB.prepare(`UPDATE producers SET updated_at = ? WHERE id = ?
        AND (SELECT COUNT(*) FROM producers WHERE name_key IN (SELECT value FROM json_each(?))) = ?
        AND NOT EXISTS (SELECT 1 FROM json_each(?) x LEFT JOIN producers p ON p.id = json_extract(x.value, '$.id') WHERE p.id IS NULL OR ${differs})`)
        .bind(token, keep.id, keys, profiles.length, JSON.stringify(profiles)),
      guard: 'EXISTS (SELECT 1 FROM producers WHERE id = ? AND updated_at = ?)',
      bindings: [keep.id, token], conflict: 'Een wijnhuisprofiel is intussen gewijzigd. Vernieuw de pagina voordat je samenvoegt.',
    });
  }
  const wineWrites = [], wishlistWrites = [];
  for (const name of from) {
    wineWrites.push(writes.update('wines', { producer: target, updated_at: nowIso() }, 'producer = ?', [name]));
    wishlistWrites.push(writes.update('wishlist', { producer: target }, 'producer = ?', [name]));
  }
  // Preserve the full original profiles in the same transaction for recovery.
  writes.activity(user, 'producer.merged', 'producer', keep?.id || null, { target, from, profiles });
  for (const profile of profiles) if (profile.id !== keep.id) writes.delete('producers', 'id = ?', [profile.id]);
  if (keep) writes.update('producers', { name: target, name_key: targetKey, notes: combinedNotes, updated_by: user.id, updated_at: nowIso() }, 'id = ?', [keep.id]);
  const results = await writes.commit();
  const wines = wineWrites.reduce((n, index) => n + results[index].meta.changes, 0);
  const wishlist = wishlistWrites.reduce((n, index) => n + results[index].meta.changes, 0);
  return json({ ok: true, target, wines, wishlist });
}

// POST /api/producers/distinct { names: [...] } — markeer deze namen als verschillende wijnhuizen (niet meer voorstellen).
export async function markDistinct(req, env, { user }) {
  const body = await readJson(req, 20_000);
  const names = [...new Set((Array.isArray(body.names) ? body.names : []).map((n) => str(n, { max: 200 })).filter(Boolean))];
  if (names.length < 2) throw new HttpError(400, 'Geef minstens twee wijnhuizen op.');
  const set = await distinctSet(env);
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) set.add(pairKey(names[i], names[j]));
  await setSetting(env, 'producer_distinct', [...set].slice(-2000), user.id);
  await logActivity(env, user.id, 'producer.distinct', 'producer', null, { names });
  return json({ ok: true, dismissed: set.size });
}

// DELETE /api/producers/distinct — vergeet alle "dit zijn verschillende huizen"-keuzes.
export async function resetDistinct(req, env, { user }) {
  await setSetting(env, 'producer_distinct', [], user.id);
  return json({ ok: true });
}

// Zoekt bestaande producenten die (waarschijnlijk) hetzelfde wijnhuis zijn als `name`.
export async function suggestFor(env, name) {
  const key = producerKey(name);
  if (!key) return { matches: [], canonical: null };
  const rows = await producerRows(env);
  const dismissed = await distinctSet(env);
  const matches = rows.map((r) => ({ r, c: compareProducers(name, r.name) }))
    .filter(({ r, c }) => c && r.name !== name && !dismissed.has(pairKey(name, r.name)))
    .sort((a, b) => b.c.score - a.c.score || b.r.wines - a.r.wines)
    .slice(0, 5)
    .map(({ r, c }) => ({ name: r.name, wines: r.wines, bottles: r.bottles, has_profile: r.has_profile, region: r.region, country: r.country, score: c.score, reason: c.reason }));
  const exact = matches.filter((m) => m.score >= 1);
  const canonical = exact.length ? pickCanonical(exact.map((m) => ({ ...m }))) : null;
  return { matches, canonical };
}

// GET /api/producers/suggest?name=... — voor het toevoegformulier.
export async function suggest(req, env) {
  const name = str(new URL(req.url).searchParams.get('name'), { max: 200 });
  if (!name) return json({ matches: [], canonical: null });
  return json(await suggestFor(env, name));
}

// Bij het aanmaken van een wijn: dezelfde naam in een andere schrijfwijze → neem de bestaande schrijfwijze over.
// Alleen bij een exacte sleutelovereenkomst (dus nooit bij twijfel); de app kan dit uitzetten met producer_as_typed.
export async function canonicalProducer(env, producer) {
  if (!producer) return { producer, adjusted_from: null };
  const { canonical } = await suggestFor(env, producer);
  if (canonical && canonical !== producer) return { producer: canonical, adjusted_from: producer };
  return { producer, adjusted_from: null };
}
