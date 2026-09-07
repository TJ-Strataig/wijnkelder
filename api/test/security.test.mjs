// Beveiligingstests voor de Wijnkelder-API. Draaien met: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { makeEnv, seedUser, call, req } from './harness.mjs';
import { signPhotoUrl, encryptSecret, decryptSecret, sha256Hex } from '../src/util.js';

const ORIGIN = 'https://tj-strataig.github.io';

test('publieke routes zonder login; alles anders vereist login', async () => {
  const env = makeEnv();
  assert.equal((await call(worker, env, '/api/health')).status, 200);
  assert.equal((await call(worker, env, '/api/auth/status')).status, 200);
  for (const p of ['/api/wines', '/api/history', '/api/stats', '/api/export.json', '/api/export.csv', '/api/ai/settings', '/api/admin/users', '/api/auth/me', '/api/wishlist', '/api/tastings']) {
    const r = await call(worker, env, p);
    assert.equal(r.status, 401, `${p} zonder token moet 401 geven`);
  }
  for (const p of ['/api/wines', '/api/ai/recognize', '/api/ai/pair', '/api/photos', '/api/admin/invites']) {
    const r = await call(worker, env, p, { method: 'POST', body: {} });
    assert.equal(r.status, 401, `POST ${p} zonder token moet 401 geven`);
  }
});

test('ongeldige, verlopen en uitgeschakelde sessies worden geweigerd', async () => {
  const env = makeEnv();
  const u = await seedUser(env);
  assert.equal((await call(worker, env, '/api/auth/me', { token: u.token })).status, 200);
  assert.equal((await call(worker, env, '/api/auth/me', { token: u.token.slice(0, -1) + 'x' })).status, 401);
  assert.equal((await call(worker, env, '/api/auth/me', { token: 'a'.repeat(64) })).status, 401);
  assert.equal((await call(worker, env, '/api/auth/me', { headers: { Authorization: 'Basic abc' } })).status, 401);
  await env.DB.prepare('UPDATE users SET disabled = 1 WHERE id = ?').bind(u.id).run();
  assert.equal((await call(worker, env, '/api/auth/me', { token: u.token })).status, 401);
  // sessie is bij uitgeschakelde gebruiker ook echt verwijderd
  const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first()).n;
  assert.equal(n, 0);
});

test('lid (member) kan geen beheerfuncties of AI-instellingen gebruiken', async () => {
  const env = makeEnv();
  await seedUser(env, { role: 'admin' });
  const m = await seedUser(env, { name: 'Lid', role: 'member' });
  assert.equal((await call(worker, env, '/api/admin/users', { token: m.token })).status, 403);
  assert.equal((await call(worker, env, '/api/admin/invites', { method: 'POST', token: m.token, body: { name: 'X' } })).status, 403);
  assert.equal((await call(worker, env, '/api/ai/settings', { method: 'PUT', token: m.token, body: { provider: 'anthropic', model: 'claude-sonnet-4-5', api_key: 'sk-ant-' + 'a'.repeat(40) } })).status, 403);
  assert.equal((await call(worker, env, '/api/ai/settings', { method: 'DELETE', token: m.token })).status, 403);
  assert.equal((await call(worker, env, '/api/ai/test', { method: 'POST', token: m.token })).status, 403);
  // lezen van AI-status mag wel, maar bevat nooit de sleutel
  const r = await call(worker, env, '/api/ai/settings', { token: m.token });
  assert.equal(r.status, 200);
  assert.ok(!r.text.includes('key_enc'));
});

test('CORS: vreemde Origin wordt geweigerd, ook met geldige token; zonder Origin blijft bearer-auth vereist', async () => {
  const env = makeEnv();
  const u = await seedUser(env);
  const bad = await call(worker, env, '/api/wines', { token: u.token, origin: 'https://evil.example' });
  assert.equal(bad.status, 403);
  assert.equal(bad.headers.get('Access-Control-Allow-Origin'), null);
  const sub = await call(worker, env, '/api/wines', { token: u.token, origin: 'https://tj-strataig.github.io.evil.example' });
  assert.equal(sub.status, 403);
  const nul = await call(worker, env, '/api/wines', { token: u.token, origin: 'null' });
  assert.equal(nul.status, 403);
  const noOrigin = await call(worker, env, '/api/wines', { origin: null });
  assert.equal(noOrigin.status, 401);
  const good = await call(worker, env, '/api/wines', { token: u.token });
  assert.equal(good.status, 200);
  assert.equal(good.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(good.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(good.headers.get('Cache-Control'), 'no-store');
});

test('bootstrap: fout wachtwoord geweigerd; na eerste gebruiker definitief dicht', async () => {
  const env = makeEnv();
  let r = await call(worker, env, '/api/auth/register/options', { method: 'POST', body: { bootstrap: 'verkeerd', name: 'Hacker' } });
  assert.equal(r.status, 403);
  r = await call(worker, env, '/api/auth/register/options', { method: 'POST', body: { name: 'Hacker' } });
  assert.equal(r.status, 400);
  r = await call(worker, env, '/api/auth/register/options', { method: 'POST', body: { bootstrap: 'boot-1234', name: 'Tije' } });
  assert.equal(r.status, 200);
  const v = await call(worker, env, '/api/auth/register/verify', { method: 'POST', body: { challengeId: r.json.challengeId, response: { id: 'cred1', fakeChallenge: r.json.options.challenge } } });
  assert.equal(v.status, 201);
  assert.equal(v.json.user.role, 'admin');
  // challenge is eenmalig
  const replay = await call(worker, env, '/api/auth/register/verify', { method: 'POST', body: { challengeId: r.json.challengeId, response: { id: 'cred2', fakeChallenge: r.json.options.challenge } } });
  assert.equal(replay.status, 400);
  // bootstrap dicht
  r = await call(worker, env, '/api/auth/register/options', { method: 'POST', body: { bootstrap: 'boot-1234', name: 'Tweede' } });
  assert.equal(r.status, 403);
});

test('uitnodiging: eenmalig, verloopt, verkeerde token faalt, rol komt uit uitnodiging', async () => {
  const env = makeEnv();
  const admin = await seedUser(env);
  const inv = await call(worker, env, '/api/admin/invites', { method: 'POST', token: admin.token, body: { name: 'Angela', role: 'member' } });
  assert.equal(inv.status, 201);
  const tok = inv.json.token;
  // alleen hash in database
  const row = await env.DB.prepare('SELECT token_hash FROM invites').first();
  assert.notEqual(row.token_hash, tok);
  assert.equal(row.token_hash, await sha256Hex(tok));
  assert.equal((await call(worker, env, '/api/auth/register/options', { method: 'POST', body: { invite: tok + 'x' } })).status, 400);
  const o = await call(worker, env, '/api/auth/register/options', { method: 'POST', body: { invite: tok } });
  assert.equal(o.status, 200);
  // tweede challenge met dezelfde uitnodiging (race) — beide options mogen, maar slechts één verify slaagt
  const o2 = await call(worker, env, '/api/auth/register/options', { method: 'POST', body: { invite: tok } });
  const v1 = await call(worker, env, '/api/auth/register/verify', { method: 'POST', body: { challengeId: o.json.challengeId, response: { id: 'c1', fakeChallenge: o.json.options.challenge } } });
  assert.equal(v1.status, 201);
  assert.equal(v1.json.user.role, 'member');
  const v2 = await call(worker, env, '/api/auth/register/verify', { method: 'POST', body: { challengeId: o2.json.challengeId, response: { id: 'c2', fakeChallenge: o2.json.options.challenge } } });
  assert.equal(v2.status, 400, 'uitnodiging mag niet twee keer werken');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n, 2);
  // verlopen uitnodiging
  const inv2 = await call(worker, env, '/api/admin/invites', { method: 'POST', token: admin.token, body: { name: 'Laat', role: 'member' } });
  await env.DB.prepare("UPDATE invites SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").bind(inv2.json.id).run();
  assert.equal((await call(worker, env, '/api/auth/register/options', { method: 'POST', body: { invite: inv2.json.token } })).status, 400);
});

test('admin kan zichzelf niet degraderen/uitschakelen; lid verwijderen wist passkeys en sessies', async () => {
  const env = makeEnv();
  const admin = await seedUser(env);
  const m = await seedUser(env, { name: 'Lid', role: 'member' });
  assert.equal((await call(worker, env, `/api/admin/users/${admin.id}`, { method: 'PATCH', token: admin.token, body: { role: 'member' } })).status, 400);
  assert.equal((await call(worker, env, `/api/admin/users/${admin.id}`, { method: 'PATCH', token: admin.token, body: { disabled: true } })).status, 400);
  assert.equal((await call(worker, env, `/api/admin/users/${admin.id}`, { method: 'DELETE', token: admin.token })).status, 400);
  assert.equal((await call(worker, env, `/api/admin/users/${m.id}`, { method: 'DELETE', token: admin.token })).status, 200);
  assert.equal((await call(worker, env, '/api/auth/me', { token: m.token })).status, 401);
});

test('invoervalidatie: SQL-injectie in velden is onschadelijk, ongeldige types geweigerd, limieten', async () => {
  const env = makeEnv();
  const u = await seedUser(env);
  const evil = "'; DROP TABLE wines; --";
  const r = await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { name: evil, type: 'rood', producer: '<img src=x onerror=alert(1)>', grapes: ['Merlot', evil], quantity: 2, price: 12.5 } });
  assert.equal(r.status, 200);
  assert.equal(r.json.wine.name, evil);
  assert.equal(r.json.bottles.length, 2);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM wines').first()).n, 1);
  assert.equal((await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { name: 'X', type: 'paars' } })).status, 400);
  assert.equal((await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { name: 'X', type: 'rood', vintage: 'abc' } })).status, 400);
  assert.equal((await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { name: 'x'.repeat(201), type: 'rood' } })).status, 400);
  assert.equal((await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { name: 'X', type: 'rood', quantity: 100000 } })).status, 400);
  // niet-JSON body
  const bad = await worker.fetch(req('/api/wines', { method: 'POST', token: u.token, body: 'name=x', headers: { 'Content-Type': 'text/plain' } }), env, {});
  assert.equal(bad.status, 415);
  // onbekende wijn-id
  assert.equal((await call(worker, env, "/api/wines/'%20OR%201=1--", { token: u.token })).status, 404);
});

test('fles verwijderen behoudt historie; wijn met historie kan niet hard verwijderd worden; member mag geen andermans proefnotitie wissen', async () => {
  const env = makeEnv();
  const a = await seedUser(env);
  const m = await seedUser(env, { name: 'Lid', role: 'member' });
  const w = (await call(worker, env, '/api/wines', { method: 'POST', token: a.token, body: { name: 'Test', type: 'rood', quantity: 1 } })).json;
  const bid = w.bottles[0].id;
  assert.equal((await call(worker, env, `/api/wines/${w.wine.id}/bottles/${bid}/remove`, { method: 'POST', token: m.token, body: { reason: 'hacked' } })).status, 400);
  const rm = await call(worker, env, `/api/wines/${w.wine.id}/bottles/${bid}/remove`, { method: 'POST', token: m.token, body: { reason: 'consumed', tasting: { rating: 90, notes: 'lekker' } } });
  assert.equal(rm.status, 200);
  assert.equal(rm.json.bottles[0].status, 'consumed');
  assert.equal(rm.json.tastings.length, 1);
  assert.equal((await call(worker, env, `/api/wines/${w.wine.id}`, { method: 'DELETE', token: a.token })).status, 409);
  // admin schrijft notitie; lid mag die niet verwijderen
  const t = await call(worker, env, `/api/wines/${w.wine.id}/tastings`, { method: 'POST', token: a.token, body: { rating: 80 } });
  assert.equal((await call(worker, env, `/api/wines/${w.wine.id}/tastings/${t.json.id}`, { method: 'DELETE', token: m.token })).status, 403);
  assert.equal((await call(worker, env, `/api/wines/${w.wine.id}/tastings/${t.json.id}`, { method: 'DELETE', token: a.token })).status, 200);
});

test('foto: alleen afbeeldingen, sleutelvalidatie, ondertekende link verplicht en verloopt', async () => {
  const env = makeEnv();
  const u = await seedUser(env);
  const png = new Uint8Array(200); png.set([0x89, 0x50, 0x4e, 0x47]);
  const html = new TextEncoder().encode('<script>alert(1)</script>'.padEnd(200, ' '));
  const badType = await worker.fetch(req('/api/photos', { method: 'POST', token: u.token, body: html.buffer, headers: { 'Content-Type': 'text/html' } }), env, {});
  assert.equal(badType.status, 415);
  const up = await worker.fetch(req('/api/photos', { method: 'POST', token: u.token, body: png.buffer, headers: { 'Content-Type': 'image/png' } }), env, {});
  assert.equal(up.status, 201);
  const { key, url } = await up.json();
  assert.ok(key.startsWith('labels/'));
  // zonder handtekening
  assert.equal((await call(worker, env, `/api/photos/${encodeURIComponent(key)}`, { origin: null })).status, 403);
  // met handtekening, vanaf willekeurige origin (img-tag) ok
  const ok = await worker.fetch(req(url, { origin: null }), env, {});
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('Content-Type'), 'image/png');
  assert.equal(ok.headers.get('X-Content-Type-Options'), 'nosniff');
  // vervalste handtekening / vervalste sleutel / verlopen
  const tampered = url.replace(/sig=([A-Za-z0-9_-]{5})/, 'sig=AAAAA');
  assert.equal((await worker.fetch(req(tampered, { origin: null }), env, {})).status, 403);
  const other = url.replace(encodeURIComponent(key), encodeURIComponent('labels/andere.png'));
  assert.equal((await worker.fetch(req(other, { origin: null }), env, {})).status, 403);
  const expired = await signPhotoUrl(env, key, -10);
  assert.equal((await worker.fetch(req(expired, { origin: null }), env, {})).status, 403);
  // path traversal
  assert.equal((await call(worker, env, '/api/photos/..%2F..%2Fetc%2Fpasswd?exp=1&sig=a', { origin: null })).status, 400);
  // upload met image/svg+xml (kan script bevatten) mag niet
  const svg = await worker.fetch(req('/api/photos', { method: 'POST', token: u.token, body: html.buffer, headers: { 'Content-Type': 'image/svg+xml' } }), env, {});
  assert.equal(svg.status, 415);
});

test('AI-instellingen: sleutel versleuteld opgeslagen, nooit teruggegeven, formaat gecontroleerd, alleen https', async () => {
  const env = makeEnv();
  const a = await seedUser(env);
  const key = 'sk-ant-api03-' + 'A'.repeat(40);
  assert.equal((await call(worker, env, '/api/ai/settings', { method: 'PUT', token: a.token, body: { provider: 'anthropic', model: 'claude-sonnet-4-5', api_key: 'niet-een-sleutel' } })).status, 400);
  assert.equal((await call(worker, env, '/api/ai/settings', { method: 'PUT', token: a.token, body: { provider: 'anthropic', model: 'x; rm -rf', api_key: key } })).status, 400);
  assert.equal((await call(worker, env, '/api/ai/settings', { method: 'PUT', token: a.token, body: { provider: 'anthropic', model: 'claude-sonnet-4-5', api_key: key, base_url: 'http://evil.example' } })).status, 400);
  const ok = await call(worker, env, '/api/ai/settings', { method: 'PUT', token: a.token, body: { provider: 'anthropic', model: 'claude-sonnet-4-5', api_key: key } });
  assert.equal(ok.status, 200);
  assert.ok(!ok.text.includes(key));
  assert.match(ok.json.active.key_hint, /^sk-ant-…A{4}$/u);
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'ai'").first();
  assert.ok(!row.value.includes(key), 'sleutel mag niet in klare tekst in de database staan');
  const saved = JSON.parse(row.value);
  assert.equal(await decryptSecret(env, saved.key_enc), key);
  // ander SESSION_SECRET kan niet ontsleutelen
  await assert.rejects(decryptSecret({ SESSION_SECRET: 'y'.repeat(48) }, saved.key_enc));
  // export bevat geen instellingen/sleutels
  const ex = await call(worker, env, '/api/export.json', { token: a.token });
  assert.ok(!ex.text.includes('key_enc') && !ex.text.includes(key));
  // activiteitenlog bevat de sleutel niet
  const hist = await call(worker, env, '/api/history', { token: a.token });
  assert.ok(!hist.text.includes(key));
});

test('versleuteling: unieke IV per keer, geen deterministische ciphertext', async () => {
  const env = makeEnv();
  const a = await encryptSecret(env, 'geheim');
  const b = await encryptSecret(env, 'geheim');
  assert.notEqual(a, b);
  assert.equal(await decryptSecret(env, a), 'geheim');
});

test('rate limiting op inloggen werkt per IP', async () => {
  const env = makeEnv();
  let last;
  for (let i = 0; i < 31; i++) last = await call(worker, env, '/api/auth/login/options', { method: 'POST', body: {}, headers: { 'CF-Connecting-IP': '1.2.3.4' } });
  assert.equal(last.status, 429);
  const other = await call(worker, env, '/api/auth/login/options', { method: 'POST', body: {}, headers: { 'CF-Connecting-IP': '5.6.7.8' } });
  assert.equal(other.status, 200);
});

test('te grote JSON-body wordt geweigerd', async () => {
  const env = makeEnv();
  const u = await seedUser(env);
  const big = JSON.stringify({ name: 'x'.repeat(1_100_000), type: 'rood' });
  const r = await worker.fetch(req('/api/wines', { method: 'POST', token: u.token, body: big, headers: { 'Content-Type': 'application/json' } }), env, {});
  assert.equal(r.status, 413);
});

test('onbekende route 404, verkeerde methode 405, foutmeldingen lekken geen stacktrace', async () => {
  const env = makeEnv();
  const u = await seedUser(env);
  assert.equal((await call(worker, env, '/api/nope', { token: u.token })).status, 404);
  const m = await call(worker, env, '/api/wines', { method: 'PATCH', token: u.token, body: {} });
  assert.equal(m.status, 405);
  // geforceerde interne fout: DB kapot
  const broken = makeEnv(); broken.DB = { prepare: () => { throw new Error('secret internal path /var/db'); } };
  const r = await call(worker, broken, '/api/auth/status');
  assert.equal(r.status, 500);
  assert.ok(!r.text.includes('/var/db'));
});

// ---- regressietests voor de bevindingen uit de beveiligingsreview ----

test('foto-links: geen signing-oracle via label_image_key, exp moet geheel getal zijn', async () => {
  const env = makeEnv();
  const u = await seedUser(env);
  const png = new Uint8Array(200); png.set([0x89, 0x50, 0x4e, 0x47]);
  const up = await worker.fetch(req('/api/photos', { method: 'POST', token: u.token, body: png.buffer, headers: { 'Content-Type': 'image/png' } }), env, {});
  const { key } = await up.json();
  // willekeurige sleutels worden geweigerd bij aanmaken/bewerken
  for (const bad of [key + '.9999999999', 'labels/../x.jpg', 'labels/abc.jpg', 'x'.repeat(50), 'labels/' + '0'.repeat(8) + '-0000-0000-0000-' + '0'.repeat(12) + '.html']) {
    const r = await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { name: 'X', type: 'rood', label_image_key: bad } });
    assert.equal(r.status, 400, `sleutel "${bad}" moet geweigerd worden`);
  }
  // niet-bestaande maar goed gevormde sleutel: ook geweigerd
  const ghost = await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { name: 'X', type: 'rood', label_image_key: 'labels/' + crypto.randomUUID() + '.jpg' } });
  assert.equal(ghost.status, 400);
  // echte sleutel werkt en levert een geldige link op
  const ok = await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { name: 'X', type: 'rood', label_image_key: key } });
  assert.equal(ok.status, 200);
  const url = ok.json.wine.label_image_url;
  assert.equal((await worker.fetch(req(url, { origin: null }), env, {})).status, 200);
  // exp met decimalen of niet-numeriek → geweigerd
  assert.equal((await worker.fetch(req(url.replace(/exp=\d+/, 'exp=9999999999.5'), { origin: null }), env, {})).status, 403);
  assert.equal((await worker.fetch(req(url.replace(/exp=\d+/, 'exp=1e12'), { origin: null }), env, {})).status, 403);
});

test('prijsbronnen: alleen https-links worden opgeslagen (geen javascript:/data:)', async () => {
  const env = makeEnv();
  const u = await seedUser(env);
  const r = await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { name: 'X', type: 'rood',
    estimated_price_source: { method: 'web+ai', evil: 'x', sources: [{ title: 'kwaad', url: 'javascript:alert(1)' }, { title: 'data', url: 'data:text/html,hi' }, { title: 'http', url: 'http://x.nl' }, { title: 'goed', url: 'https://wijn.nl/fles' }] } } });
  assert.equal(r.status, 200);
  const src = r.json.wine.estimated_price_source;
  assert.deepEqual(src.sources.map((s) => s.url), ['https://wijn.nl/fles']);
  assert.equal(src.evil, undefined);
});

test('CSV-export neutraliseert formules', async () => {
  const env = makeEnv();
  const u = await seedUser(env);
  await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { name: '=HYPERLINK("http://x")', producer: '+cmd|calc', type: 'rood', purchase_place: '@SUM(1)' } });
  const csv = await call(worker, env, '/api/export.csv', { token: u.token });
  assert.equal(csv.status, 200);
  assert.ok(!/(^|;)=HYPERLINK/m.test(csv.text), 'formule mag niet aan het begin van een cel staan');
  assert.ok(csv.text.includes(`"'=HYPERLINK`));
  assert.ok(csv.text.includes(`"'+cmd|calc"`));
  assert.ok(csv.text.includes(`"'@SUM(1)"`));
});
