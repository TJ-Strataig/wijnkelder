// Testharnas: draait de Worker lokaal met een in-memory SQLite (node:sqlite) als D1 en een Map als R2.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const wrap = (sql) => {
    let bound = [];
    const api = {
      bind: (...a) => { bound = a.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v)); return api; },
      first: async () => db.prepare(sql).get(...bound) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...bound) }),
      run: async () => { const r = db.prepare(sql).run(...bound); return { meta: { changes: r.changes } }; },
    };
    return api;
  };
  return { prepare: wrap, batch: async (stmts) => Promise.all(stmts.map((s) => s.run())), raw: db };
}

export function makeR2() {
  const store = new Map();
  return {
    put: async (k, body, opts) => { store.set(k, { body, ...opts }); },
    get: async (k) => (store.has(k) ? { body: store.get(k).body, httpMetadata: store.get(k).httpMetadata } : null),
    delete: async (k) => { store.delete(k); },
    store,
  };
}

export function makeEnv(overrides = {}) {
  return {
    DB: makeDb(), FOTOS: makeR2(),
    ORIGIN: 'https://tj-strataig.github.io', RP_ID: 'tj-strataig.github.io', RP_NAME: 'Test',
    SESSION_SECRET: 'x'.repeat(48), BOOTSTRAP_SECRET: 'boot-1234',
    ...overrides,
  };
}

export async function seedUser(env, { name = 'Tije', role = 'admin', id = crypto.randomUUID() } = {}) {
  await env.DB.prepare('INSERT INTO users (id, name, role) VALUES (?, ?, ?)').bind(id, name, role).run();
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const exp = new Date(Date.now() + 86400e3).toISOString();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, absolute_expires_at) VALUES (?, ?, ?, ?)').bind(hash, id, exp, exp).run();
  return { id, name, role, token };
}

export function req(path, { method = 'GET', body, token, origin = 'https://tj-strataig.github.io', headers = {} } = {}) {
  const h = new Headers(headers);
  if (origin !== null) h.set('Origin', origin);
  if (token) h.set('Authorization', `Bearer ${token}`);
  let payload;
  if (body !== undefined) {
    if (body instanceof ArrayBuffer || typeof body === 'string') payload = body;
    else { payload = JSON.stringify(body); h.set('Content-Type', 'application/json'); }
  }
  return new Request(`https://wijnkelder-api.example.workers.dev${path}`, { method, headers: h, body: payload });
}

export async function call(worker, env, ...args) {
  const res = await worker.fetch(req(...args), env, {});
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, json, text };
}
