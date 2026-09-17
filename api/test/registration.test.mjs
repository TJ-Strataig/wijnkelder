import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import * as webauthn from '@simplewebauthn/server';
import { makeEnv, seedUser, call } from './harness.mjs';
import { sha256Hex } from '../src/util.js';

const registrations = new Map();
const verify = mock.fn(async ({ response, expectedChallenge, expectedOrigin, expectedRPID, requireUserVerification }) => {
  assert.ok(registrations.has(response.id), 'Alleen expliciet voorbereide testregistraties mogen slagen');
  assert.equal(expectedChallenge, registrations.get(response.id));
  assert.deepEqual(expectedOrigin, ['https://tj-strataig.github.io']);
  assert.equal(expectedRPID, 'tj-strataig.github.io');
  assert.equal(requireUserVerification, true);
  return {
    verified: true,
    registrationInfo: {
      credential: { id: response.id, publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ['internal'] },
      credentialDeviceType: 'singleDevice',
      credentialBackedUp: false,
    },
  };
});

// Alleen deze testfile simuleert de authenticator; security.test.mjs gebruikt de echte verifier.
const moduleMock = mock.module('@simplewebauthn/server', {
  namedExports: { ...webauthn, verifyRegistrationResponse: verify },
});
const { default: worker } = await import('../src/index.js');
test.beforeEach(() => { registrations.clear(); verify.mock.resetCalls(); });
test.after(() => moduleMock.restore());

function registrationBody(options, id) {
  registrations.set(id, options.options.challenge);
  return { challengeId: options.challengeId, response: { id } };
}

test('bootstrap: fout wachtwoord geweigerd; na eerste gebruiker definitief dicht', async () => {
  const env = makeEnv();
  let r = await call(worker, env, '/api/auth/register/options', { method: 'POST', body: { bootstrap: 'verkeerd', name: 'Hacker' } });
  assert.equal(r.status, 403);
  r = await call(worker, env, '/api/auth/register/options', { method: 'POST', body: { name: 'Hacker' } });
  assert.equal(r.status, 400);
  r = await call(worker, env, '/api/auth/register/options', { method: 'POST', body: { bootstrap: 'boot-1234', name: 'Tije' } });
  assert.equal(r.status, 200);
  const body = registrationBody(r.json, 'cred1');
  const v = await call(worker, env, '/api/auth/register/verify', { method: 'POST', body });
  assert.equal(v.status, 201);
  assert.equal(v.json.user.role, 'admin');
  assert.equal(verify.mock.callCount(), 1);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM credentials').first()).n, 1);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first()).n, 1);
  assert.equal((await call(worker, env, '/api/auth/me', { token: v.json.token })).status, 200);
  const replay = await call(worker, env, '/api/auth/register/verify', { method: 'POST', body });
  assert.equal(replay.status, 400);
  assert.equal(verify.mock.callCount(), 1, 'Een verbruikte challenge bereikt de verifier niet');
  r = await call(worker, env, '/api/auth/register/options', { method: 'POST', body: { bootstrap: 'boot-1234', name: 'Tweede' } });
  assert.equal(r.status, 403);
});

test('uitnodiging: eenmalig, verloopt, verkeerde token faalt, rol komt uit uitnodiging', async () => {
  const env = makeEnv();
  const admin = await seedUser(env);
  const inv = await call(worker, env, '/api/admin/invites', { method: 'POST', token: admin.token, body: { name: 'Angela', role: 'member' } });
  assert.equal(inv.status, 201);
  const tok = inv.json.token;
  const row = await env.DB.prepare('SELECT token_hash FROM invites').first();
  assert.notEqual(row.token_hash, tok);
  assert.equal(row.token_hash, await sha256Hex(tok));
  assert.equal((await call(worker, env, '/api/auth/register/options', { method: 'POST', body: { invite: tok + 'x' } })).status, 400);
  const o = await call(worker, env, '/api/auth/register/options', { method: 'POST', body: { invite: tok, role: 'admin' } });
  assert.equal(o.status, 200);
  const o2 = await call(worker, env, '/api/auth/register/options', { method: 'POST', body: { invite: tok } });
  assert.equal(o2.status, 200);
  const v1 = await call(worker, env, '/api/auth/register/verify', { method: 'POST', body: { ...registrationBody(o.json, 'c1'), role: 'admin' } });
  assert.equal(v1.status, 201);
  assert.equal(v1.json.user.role, 'member');
  const v2 = await call(worker, env, '/api/auth/register/verify', { method: 'POST', body: registrationBody(o2.json, 'c2') });
  assert.equal(v2.status, 400, 'Uitnodiging mag niet twee keer werken');
  assert.equal(verify.mock.callCount(), 2);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n, 2);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM credentials').first()).n, 1);
  const inv2 = await call(worker, env, '/api/admin/invites', { method: 'POST', token: admin.token, body: { name: 'Laat', role: 'member' } });
  await env.DB.prepare("UPDATE invites SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").bind(inv2.json.id).run();
  assert.equal((await call(worker, env, '/api/auth/register/options', { method: 'POST', body: { invite: inv2.json.token } })).status, 400);
});
