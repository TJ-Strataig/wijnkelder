// Sommelier-functies: "Wat drinken we vanavond?", restaurant-modus (wijnkaart lezen), en de wekelijkse/dagelijkse push.
import { HttpError, json, readJson, uuid, nowIso, str, num, rateLimit, logActivity } from './util.js';
import { chatJson } from './ai.js';
import { addNotification } from './insights.js';

const parse = (v, fb) => { try { return v ? JSON.parse(v) : fb; } catch { return fb; } };
const DAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const season = (d) => ['winter', 'winter', 'lente', 'lente', 'lente', 'zomer', 'zomer', 'zomer', 'herfst', 'herfst', 'herfst', 'winter'][d.getMonth()];

// Compacte kelderlijst + smaakprofiel voor de AI.
async function cellarContext(env) {
  const year = new Date().getFullYear();
  const wines = (await env.DB.prepare(
    `SELECT w.id, w.name, w.producer, w.country, w.region, w.type, w.vintage, w.grapes, w.body, w.sweetness, w.drink_from, w.drink_until, w.peak_from, w.peak_until, w.food_pairings, w.estimated_price,
            COUNT(b.id) AS bottles, AVG(b.price) AS price,
            (SELECT AVG(rating) FROM tasting_notes t WHERE t.wine_id = w.id) AS avg_rating,
            (SELECT MAX(removed_at) FROM bottles b2 WHERE b2.wine_id = w.id AND b2.status = 'consumed') AS last_drunk
     FROM wines w JOIN bottles b ON b.wine_id = w.id AND b.status = 'in_cellar' GROUP BY w.id LIMIT 400`
  ).all()).results;
  const recent = (await env.DB.prepare(`SELECT w.name, w.type, w.region, b.removed_at FROM bottles b JOIN wines w ON w.id = b.wine_id WHERE b.status = 'consumed' AND b.removed_at >= date('now', '-21 days') ORDER BY b.removed_at DESC LIMIT 10`).all()).results;
  const tastes = (await env.DB.prepare(`SELECT u.name AS user_name, w.type, w.grapes, w.region, AVG(t.rating) AS avg, COUNT(*) AS n FROM tasting_notes t JOIN users u ON u.id = t.user_id JOIN wines w ON w.id = t.wine_id WHERE t.rating IS NOT NULL GROUP BY u.name, w.type, w.region ORDER BY n DESC LIMIT 40`).all()).results;
  const lines = wines.map((w) => {
    const status = (w.peak_from ?? w.drink_from ?? 0) <= year && (w.peak_until ?? w.drink_until ?? 9999) >= year ? 'op dreef' : w.drink_until && w.drink_until < year ? 'OVER hoogtepunt' : w.drink_from && w.drink_from > year ? 'te jong' : 'drinkbaar';
    return `${w.id}|${w.producer || ''} ${w.name}${w.vintage ? ' ' + w.vintage : ''}|${w.type}|${w.region || w.country || ''}|${parse(w.grapes, []).join('/')}|${w.body || ''}|${status}|€${Math.round(w.price || w.estimated_price || 0)}|score ${w.avg_rating ? Math.round(w.avg_rating) : '-'}|${w.bottles} fl${w.last_drunk ? '|laatst ' + w.last_drunk : ''}`;
  });
  return { wines, lines, recent, tastes, year };
}

// POST /api/sommelier/tonight { dish?, mood?, guests?, occasion? }
export async function tonight(req, env, { user }) {
  await rateLimit(env, `ai:${user.id}`, 60, 3600);
  const body = await readJson(req, 5000);
  const ctx = await cellarContext(env);
  if (!ctx.wines.length) return json({ picks: [], summary: 'De kelder is leeg.' });
  const now = new Date();
  const wish = [body.dish && `eten: ${str(body.dish, { max: 200 })}`, body.mood && `stemming: ${str(body.mood, { max: 100 })}`, body.guests && `gezelschap: ${str(body.guests, { max: 100 })}`, body.occasion && `gelegenheid: ${str(body.occasion, { max: 100 })}`].filter(Boolean).join('; ');
  const result = await chatJson(env, [
    { role: 'system', content: `Je bent de huissommelier van Angela en Tije. Kies uit HUN kelder drie flessen voor vanavond: "veilig" (een zekere hit, past bij hun smaak), "verrassing" (iets wat ze zelden pakken of nog nooit proefden), en "nu-open" (een fles die nu op dreef is of over zijn hoogtepunt dreigt te gaan). Houd rekening met: dag (${DAYS[now.getDay()]} — doordeweeks geen topfles, weekend mag), seizoen (${season(now)}), wat ze de laatste weken al dronken (vermijd herhaling), hun scores, en de drinkvensters. Antwoord uitsluitend met JSON: {"summary": "1 zin", "picks": [{"role": "veilig|verrassing|nu-open", "wine_id": "id uit lijst", "reason": "max 2 zinnen, Nederlands, persoonlijk", "serve": "korte serveertip"}]}. Gebruik alleen id's uit de lijst.` },
    { role: 'user', content: `Wensen: ${wish || 'geen specifieke'}\n\nRecent gedronken: ${ctx.recent.map((r) => `${r.name} (${r.type}, ${r.removed_at})`).join('; ') || 'niets'}\n\nSmaakprofiel (persoon|type|streek|gem. score|aantal): ${ctx.tastes.map((t) => `${t.user_name}|${t.type}|${t.region || '-'}|${Math.round(t.avg)}|${t.n}`).join('; ') || 'nog geen scores'}\n\nKelder (id|wijn|type|herkomst|druiven|body|status|prijs|score|voorraad):\n${ctx.lines.join('\n')}` },
  ], { maxTokens: 800, temperature: 0.6 });
  const ids = new Map(ctx.wines.map((w) => [w.id, w]));
  const picks = (Array.isArray(result.picks) ? result.picks : []).filter((p) => ids.has(p.wine_id)).slice(0, 3).map((p) => ({ role: ['veilig', 'verrassing', 'nu-open'].includes(p.role) ? p.role : 'veilig', wine: ids.get(p.wine_id), reason: str(p.reason, { max: 400 }), serve: str(p.serve, { max: 200 }) }));
  return json({ summary: str(result.summary, { max: 300 }), picks, day: DAYS[now.getDay()], season: season(now) });
}

// POST /api/sommelier/restaurant { image: dataURL, dish?, budget? } — leest een wijnkaart en adviseert.
export async function restaurant(req, env, { user }) {
  await rateLimit(env, `ai:${user.id}`, 60, 3600);
  const body = await readJson(req, 12_000_000);
  const image = body.image;
  if (typeof image !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) throw new HttpError(400, 'Stuur de foto van de wijnkaart als data-URL.');
  const known = (await env.DB.prepare(`SELECT w.name, w.producer, w.vintage, w.type, w.region, (SELECT AVG(rating) FROM tasting_notes t WHERE t.wine_id = w.id) AS avg_rating, (SELECT COUNT(*) FROM bottles b WHERE b.wine_id = w.id) AS bottles FROM wines w LIMIT 500`).all()).results;
  const tastes = (await env.DB.prepare(`SELECT u.name AS user_name, w.type, w.grapes, w.region, AVG(t.rating) AS avg, COUNT(*) AS n FROM tasting_notes t JOIN users u ON u.id = t.user_id JOIN wines w ON w.id = t.wine_id WHERE t.rating IS NOT NULL GROUP BY u.name, w.type, w.region ORDER BY n DESC LIMIT 40`).all()).results;
  const dish = str(body.dish, { max: 200 }), budget = num(body.budget, { min: 0, max: 10000 });
  const result = await chatJson(env, [
    { role: 'system', content: 'Je bent de persoonlijke sommelier van Angela en Tije en zit met ze in een restaurant. Lees de wijnkaart op de foto. Antwoord uitsluitend met JSON: {"wines": [{"name": "zoals op de kaart", "producer": "", "vintage": 2020, "type": "rood|wit|rose|mousserend|port|dessert|versterkt|oranje|overig", "price": 45, "by_glass": false, "known": false, "known_note": "hun eigen score/ervaring als ze deze wijn (of dit huis) kennen, anders null", "fit": 0-100, "reason": "waarom wel/niet, max 2 zinnen, Nederlands"}], "top3": ["namen"], "summary": "1-2 zinnen advies", "avoid": ["wat niet te doen"]}. "known" is true als de wijn of het wijnhuis voorkomt in hun collectie/historie. "fit" combineert hun smaakprofiel, het gerecht, budget en prijs-kwaliteit op de kaart.' },
    { role: 'user', content: [
      { type: 'text', text: `${dish ? `We eten: ${dish}. ` : ''}${budget ? `Budget ongeveer € ${budget} per fles. ` : ''}\nOnze collectie/historie (naam|producent|jaar|type|streek|onze score|flessen): ${known.map((k) => `${k.name}|${k.producer || ''}|${k.vintage || ''}|${k.type}|${k.region || ''}|${k.avg_rating ? Math.round(k.avg_rating) : '-'}|${k.bottles}`).join('; ')}\nSmaakprofiel: ${tastes.map((t) => `${t.user_name}|${t.type}|${t.region || '-'}|${Math.round(t.avg)}|${t.n}`).join('; ') || 'nog geen scores'}` },
      { type: 'image_url', image_url: { url: image, detail: 'high' } },
    ] },
  ], { maxTokens: 2500, temperature: 0.3 });
  const wines = (Array.isArray(result.wines) ? result.wines : []).slice(0, 60).map((w) => ({
    name: str(w.name, { max: 200 }), producer: str(w.producer, { max: 200 }), vintage: num(w.vintage, { min: 1800, max: 2100, int: true }), type: str(w.type, { max: 20 }), price: num(w.price, { min: 0, max: 100000 }),
    by_glass: !!w.by_glass, known: !!w.known, known_note: str(w.known_note, { max: 300 }), fit: num(w.fit, { min: 0, max: 100, int: true }), reason: str(w.reason, { max: 400 }),
  })).filter((w) => w.name);
  await logActivity(env, user.id, 'ai.restaurant', 'wine', null, { dish, count: wines.length });
  return json({ wines: wines.sort((a, b) => (b.fit || 0) - (a.fit || 0)), top3: Array.isArray(result.top3) ? result.top3.slice(0, 3).map((s) => String(s).slice(0, 200)) : [], summary: str(result.summary, { max: 500 }), avoid: Array.isArray(result.avoid) ? result.avoid.slice(0, 4).map((s) => String(s).slice(0, 200)) : [] });
}

// ---- Meldingen & push --------------------------------------------------------

function hashEndpoint(ep) { let h = 0; for (const c of ep || '') h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(36); }

export async function getNotificationPrefs(req, env, { user }) {
  const p = await env.DB.prepare('SELECT * FROM notification_prefs WHERE user_id = ?').bind(user.id).first();
  const subs = (await env.DB.prepare('SELECT id, label, created_at, last_sent_at, failures, endpoint FROM push_subscriptions WHERE user_id = ?').bind(user.id).all()).results
    .map((s) => ({ ...s, endpoint: undefined, endpoint_hash: hashEndpoint(s.endpoint) })); // alleen een vingerafdruk, nooit het endpoint zelf
  return json({ prefs: p || { weekly_day: 5, weekly_hour: 17, drink_window: 1, low_stock: 1 }, subscriptions: subs, vapid_public_key: env.VAPID_PUBLIC_KEY || null, push_available: !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) });
}
export async function setNotificationPrefs(req, env, { user }) {
  const b = await readJson(req, 2000);
  const day = b.weekly_day === null ? null : num(b.weekly_day, { min: 0, max: 6, int: true });
  await env.DB.prepare('INSERT INTO notification_prefs (user_id, weekly_day, weekly_hour, drink_window, low_stock) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET weekly_day = excluded.weekly_day, weekly_hour = excluded.weekly_hour, drink_window = excluded.drink_window, low_stock = excluded.low_stock')
    .bind(user.id, day, num(b.weekly_hour, { min: 0, max: 23, int: true }) ?? 17, b.drink_window === false ? 0 : 1, b.low_stock === false ? 0 : 1).run();
  return json({ ok: true });
}
export async function subscribePush(req, env, { user }) {
  const b = await readJson(req, 5000);
  const sub = b.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth || !/^https:\/\//.test(sub.endpoint)) throw new HttpError(400, 'Ongeldig pushabonnement.');
  await env.DB.prepare('INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, label) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, failures = 0')
    .bind(uuid(), user.id, String(sub.endpoint).slice(0, 500), String(sub.keys.p256dh).slice(0, 200), String(sub.keys.auth).slice(0, 100), str(b.label, { max: 60 })).run();
  return json({ ok: true }, 201);
}
export async function unsubscribePush(req, env, { user, params }) {
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ? AND user_id = ?').bind(params.id, user.id).run();
  return json({ ok: true });
}

// Web Push versturen (RFC 8291 aes128gcm + VAPID) zonder externe bibliotheek.
async function sendPush(env, sub, payload) {
  const enc = new TextEncoder();
  const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64d = (s) => { const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : ''; const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); };
  // VAPID JWT
  const aud = new URL(sub.endpoint).origin;
  const header = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:wijnkelder@example.com' })));
  const privJwk = { kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE_KEY, x: b64u(b64d(env.VAPID_PUBLIC_KEY).slice(1, 33)), y: b64u(b64d(env.VAPID_PUBLIC_KEY).slice(33, 65)) };
  const vapidKey = await crypto.subtle.importKey('jwk', privJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sigDer = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, vapidKey, enc.encode(`${header}.${claims}`)));
  const jwt = `${header}.${claims}.${b64u(sigDer)}`;
  // Payload-encryptie (aes128gcm)
  const ua = b64d(sub.p256dh), authSecret = b64d(sub.auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const localPub = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const hkdf = async (salt, ikm, info, len) => { const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']); return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8)); };
  const concat = (...arrs) => { const out = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0)); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; };
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), ua, localPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const plain = concat(enc.encode(JSON.stringify(payload)), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plain));
  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096);
  const bodyBytes = concat(salt, rs, new Uint8Array([localPub.length]), localPub, cipher);
  const res = await fetch(sub.endpoint, { method: 'POST', headers: { 'TTL': '86400', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', 'Authorization': `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`, 'Urgency': 'normal' }, body: bodyBytes });
  return res.status;
}

async function broadcast(env, payload, { kind, onlyUsersWith } = {}) {
  await addNotification(env, kind, payload.title, payload.body, payload.link);
  if (!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)) return { sent: 0 };
  let subs = (await env.DB.prepare('SELECT s.* FROM push_subscriptions s JOIN users u ON u.id = s.user_id WHERE u.disabled = 0 AND s.failures < 5').all()).results;
  if (onlyUsersWith) subs = subs.filter((s) => onlyUsersWith.has(s.user_id));
  let sent = 0;
  for (const s of subs) {
    try {
      const status = await sendPush(env, s, payload);
      if (status === 404 || status === 410) await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(s.id).run();
      else if (status >= 400) await env.DB.prepare('UPDATE push_subscriptions SET failures = failures + 1 WHERE id = ?').bind(s.id).run();
      else { sent++; await env.DB.prepare('UPDATE push_subscriptions SET last_sent_at = ?, failures = 0 WHERE id = ?').bind(nowIso(), s.id).run(); }
    } catch (e) { console.error('push', e.message); await env.DB.prepare('UPDATE push_subscriptions SET failures = failures + 1 WHERE id = ?').bind(s.id).run(); }
  }
  return { sent };
}

// Wordt door de cron (elk uur) aangeroepen: wekelijkse sommelier-push, drinkvenster-meldingen, voorraadtekorten.
export async function runScheduledNotifications(env, now = new Date()) {
  const year = now.getFullYear();
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/Amsterdam' }).format(now)) % 24;
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Europe/Amsterdam' }).format(now));
  const prefs = (await env.DB.prepare('SELECT p.*, u.disabled FROM notification_prefs p JOIN users u ON u.id = p.user_id').all()).results.filter((p) => !p.disabled);
  const results = { weekly: 0, window: 0, low_stock: 0 };

  // 1. Wekelijkse sommelier-push (per gebruiker op zijn dag/uur; één bericht per week)
  const dueWeekly = prefs.filter((p) => p.weekly_day !== null && p.weekly_day === dow && (p.weekly_hour ?? 17) === hour && (!p.last_weekly_at || Date.now() - Date.parse(p.last_weekly_at) > 6 * 86400e3));
  if (dueWeekly.length) {
    try {
      const fake = new Request('https://x/api/sommelier/tonight', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ occasion: 'weekend' }) });
      const res = await tonight(fake, env, { user: { id: dueWeekly[0].user_id } });
      const data = await res.json();
      if (data.picks?.length) {
        const p = data.picks[0];
        const title = '🍷 Sommelier-tip voor het weekend';
        const body = `${p.wine.producer ? p.wine.producer + ' · ' : ''}${p.wine.name}${p.wine.vintage ? ' ' + p.wine.vintage : ''} — ${p.reason}`;
        await broadcast(env, { title, body, link: '#/vanavond' }, { kind: 'weekly', onlyUsersWith: new Set(dueWeekly.map((p) => p.user_id)) });
        for (const p2 of dueWeekly) await env.DB.prepare('UPDATE notification_prefs SET last_weekly_at = ? WHERE user_id = ?').bind(nowIso(), p2.user_id).run();
        results.weekly = 1;
      }
    } catch (e) { console.error('weekly', e.message); }
  }

  // 2. Drinkvenster: eens per week (maandagochtend 9u) wijnen die dit jaar hun venster binnenlopen of het volgend jaar verlaten
  const dueWindow = prefs.filter((p) => p.drink_window && dow === 1 && hour === 9 && (!p.last_window_at || Date.now() - Date.parse(p.last_window_at) > 6 * 86400e3));
  if (dueWindow.length) {
    const ws = (await env.DB.prepare(`SELECT w.id, w.name, w.producer, w.vintage, w.drink_from, w.drink_until, w.peak_from, w.peak_until, COUNT(b.id) AS n FROM wines w JOIN bottles b ON b.wine_id = w.id AND b.status = 'in_cellar' GROUP BY w.id`).all()).results;
    const entering = ws.filter((w) => (w.peak_from || w.drink_from) === year);
    const leaving = ws.filter((w) => w.drink_until && w.drink_until <= year + 1 && w.drink_until >= year);
    if (entering.length || leaving.length) {
      const fmt = (w) => `${w.producer ? w.producer + ' ' : ''}${w.name}${w.vintage ? ' ' + w.vintage : ''} (${w.n}×)`;
      const body = [entering.length ? `Nu op dreef: ${entering.slice(0, 3).map(fmt).join(', ')}${entering.length > 3 ? ` +${entering.length - 3}` : ''}.` : null, leaving.length ? `Snel drinken: ${leaving.slice(0, 3).map(fmt).join(', ')}${leaving.length > 3 ? ` +${leaving.length - 3}` : ''}.` : null].filter(Boolean).join(' ');
      await broadcast(env, { title: '⏳ Drinkvensters deze week', body, link: '#/statistieken' }, { kind: 'drink_window', onlyUsersWith: new Set(dueWindow.map((p) => p.user_id)) });
      results.window = entering.length + leaving.length;
    }
    for (const p of dueWindow) await env.DB.prepare('UPDATE notification_prefs SET last_window_at = ? WHERE user_id = ?').bind(nowIso(), p.user_id).run();
  }

  // 3. Voorraadtekorten: zaterdagochtend 10u, alleen als er tekorten zijn
  if (prefs.some((p) => p.low_stock) && dow === 6 && hour === 10) {
    const { listTargets } = await import('./insights.js');
    const data = await (await listTargets(new Request('https://x/api/targets'), env)).json();
    const short = data.targets.filter((t) => t.shortage > 0);
    if (short.length) {
      await broadcast(env, { title: '🛒 Voorraad aanvullen', body: short.map((t) => `${t.label}: nog ${t.shortage} nodig`).join(' · '), link: '#/voorraad' }, { kind: 'low_stock', onlyUsersWith: new Set(prefs.filter((p) => p.low_stock).map((p) => p.user_id)) });
      results.low_stock = short.length;
    }
  }
  return results;
}

// POST /api/notifications/test — stuurt direct een testmelding naar de eigen apparaten.
export async function testPush(req, env, { user }) {
  await rateLimit(env, `pushtest:${user.id}`, 5, 600);
  const r = await broadcast(env, { title: '🍷 Wijnkelder', body: 'Meldingen werken! Proost.', link: '#/kelder' }, { kind: 'weekly', onlyUsersWith: new Set([user.id]) });
  return json(r);
}

// "Laatste fles"-melding: wordt aangeroepen bij het verwijderen van een fles (vanuit wines.js).
export async function maybeLastBottle(env, wineId) {
  const w = await env.DB.prepare(`SELECT w.id, w.name, w.producer, w.vintage, w.favorite, (SELECT COUNT(*) FROM bottles b WHERE b.wine_id = w.id AND b.status = 'in_cellar') AS left_, (SELECT AVG(rating) FROM tasting_notes t WHERE t.wine_id = w.id) AS avg_rating FROM wines w WHERE w.id = ?`).bind(wineId).first();
  if (!w || w.left_ > 0) return null;
  const loved = w.favorite || (w.avg_rating && w.avg_rating >= 85);
  if (!loved) return null;
  const onList = await env.DB.prepare('SELECT id FROM wishlist WHERE lower(name) = lower(?) AND (producer IS NULL OR lower(producer) = lower(?))').bind(w.name, w.producer || '').first();
  return { wine_id: w.id, name: w.name, producer: w.producer, vintage: w.vintage, avg_rating: w.avg_rating, favorite: !!w.favorite, on_wishlist: !!onList };
}
