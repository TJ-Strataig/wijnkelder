// Algemene hulpfuncties: antwoorden, CORS, beveiligingsheaders, validatie, hashing.

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

export function corsHeaders(env, req) {
  const origin = req.headers.get('Origin');
  const allowed = (env.ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const headers = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '600',
  };
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, ...extraHeaders },
  });
}

export function noContent(extraHeaders = {}) {
  return new Response(null, { status: 204, headers: { ...SECURITY_HEADERS, ...extraHeaders } });
}

export async function readJson(req, maxBytes = 1_000_000) {
  const ct = req.headers.get('Content-Type') || '';
  if (!ct.includes('application/json')) throw new HttpError(415, 'Verwacht JSON.');
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > maxBytes) throw new HttpError(413, 'Bericht te groot.');
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Bericht te groot.');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, 'Ongeldige JSON.');
  }
}

export function uuid() {
  return crypto.randomUUID();
}

export function randomToken(bytes = 32) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return b64url(buf);
}

export async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function nowIso() {
  return new Date().toISOString();
}

export function plusIso(ms) {
  return new Date(Date.now() + ms).toISOString();
}

// ---- validatie -------------------------------------------------------------

export const WINE_TYPES = ['rood', 'wit', 'rose', 'mousserend', 'port', 'dessert', 'versterkt', 'oranje', 'overig'];
export const BOTTLE_REMOVE_REASONS = ['consumed', 'gifted_away', 'sold', 'damaged', 'other'];

export function str(v, { max = 500, required = false, name = 'veld' } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, `${name} is verplicht.`);
    return null;
  }
  if (typeof v !== 'string') throw new HttpError(400, `${name} moet tekst zijn.`);
  const t = v.trim();
  if (t.length > max) throw new HttpError(400, `${name} is te lang (max ${max}).`);
  return t || null;
}

export function num(v, { min = -1e12, max = 1e12, int = false, name = 'getal' } = {}) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new HttpError(400, `${name} moet een getal zijn.`);
  if (n < min || n > max) throw new HttpError(400, `${name} valt buiten het toegestane bereik.`);
  return int ? Math.round(n) : n;
}

export function bool(v) {
  return v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
}

export function strArray(v, { maxItems = 30, maxLen = 80 } = {}) {
  if (!v) return [];
  if (typeof v === 'string') v = v.split(/[,;]/);
  if (!Array.isArray(v)) throw new HttpError(400, 'Verwacht een lijst.');
  return v
    .map((x) => String(x).trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((x) => x.slice(0, maxLen));
}

export function oneOf(v, allowed, { name = 'veld', required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, `${name} is verplicht.`);
    return null;
  }
  if (!allowed.includes(v)) throw new HttpError(400, `${name} heeft een ongeldige waarde.`);
  return v;
}

export function isoDate(v, { name = 'datum' } = {}) {
  if (!v) return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v) || Number.isNaN(Date.parse(v))) {
    throw new HttpError(400, `${name} is geen geldige datum.`);
  }
  return v.slice(0, 10);
}

// ---- rate limiting (eenvoudig, in D1) --------------------------------------

export async function rateLimit(env, key, limit, windowSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare('SELECT window_start, count FROM rate_limits WHERE key = ?').bind(key).first();
  if (!row || now - row.window_start >= windowSeconds) {
    await env.DB.prepare(
      'INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = 1'
    ).bind(key, now).run();
    return;
  }
  if (row.count >= limit) throw new HttpError(429, 'Te veel verzoeken. Probeer het later opnieuw.');
  await env.DB.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').bind(key).run();
}

export function clientIp(req) {
  return req.headers.get('CF-Connecting-IP') || 'unknown';
}

// ---- ondertekende foto-links ----------------------------------------------

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

// Alleen sleutels van dit exacte formaat worden ondertekend, opgeslagen of geserveerd.
export const PHOTO_KEY_RE = /^labels\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|heic)$/;

export function isValidPhotoKey(key) {
  return typeof key === 'string' && PHOTO_KEY_RE.test(key);
}

// Bericht met ondubbelzinnige scheiding (newline komt nooit in sleutel of exp voor), exp als geheel getal.
function photoMessage(key, exp) {
  return new TextEncoder().encode(`${exp}\n${key}`);
}

export async function signPhotoUrl(env, key, ttlSeconds = 3600) {
  if (!isValidPhotoKey(key)) return null;
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const k = await hmacKey(env.SESSION_SECRET);
  const sig = await crypto.subtle.sign('HMAC', k, photoMessage(key, exp));
  return `/api/photos/${encodeURIComponent(key)}?exp=${exp}&sig=${b64url(new Uint8Array(sig))}`;
}

export async function verifyPhotoSig(env, key, exp, sig) {
  if (!isValidPhotoKey(key)) return false;
  if (typeof exp !== 'string' || !/^\d{1,12}$/.test(exp) || typeof sig !== 'string' || !/^[A-Za-z0-9_-]{40,50}$/.test(sig)) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const k = await hmacKey(env.SESSION_SECRET);
  try {
    return await crypto.subtle.verify('HMAC', k, b64urlDecode(sig), photoMessage(key, exp));
  } catch {
    return false;
  }
}

// Alleen https-adressen mogen als link worden opgeslagen/getoond.
export function safeHttpsUrl(u) {
  try {
    const url = new URL(String(u));
    return url.protocol === 'https:' && url.href.length <= 500 ? url.href : null;
  } catch {
    return null;
  }
}

export async function logActivity(env, userId, action, entity, entityId, details) {
  await env.DB.prepare('INSERT INTO activity (id, user_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(uuid(), userId || null, action, entity || null, entityId || null, details ? JSON.stringify(details).slice(0, 2000) : null)
    .run();
}

// ---- versleutelde instellingen (AES-256-GCM, sleutel afgeleid van SESSION_SECRET) ----

async function aesKey(secret) {
  if (!secret || secret.length < 32) throw new HttpError(500, 'SESSION_SECRET ontbreekt of is te kort (minimaal 32 tekens).');
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${secret}:wijnkelder-settings`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(env, plain) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aesKey(env.SESSION_SECRET);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  return `${b64url(iv)}.${b64url(new Uint8Array(ct))}`;
}

export async function decryptSecret(env, blob) {
  const [ivS, ctS] = String(blob).split('.');
  const key = await aesKey(env.SESSION_SECRET);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64urlDecode(ivS) }, key, b64urlDecode(ctS));
  return new TextDecoder().decode(pt);
}

export async function getSetting(env, key) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

export async function setSetting(env, key, value, userId) {
  await env.DB.prepare(
    'INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at'
  ).bind(key, JSON.stringify(value), userId || null, nowIso()).run();
}
