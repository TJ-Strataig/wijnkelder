// Passkey-login (WebAuthn) en sessiebeheer.
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import {
  HttpError, json, readJson, uuid, randomToken, sha256Hex, b64url, b64urlDecode,
  nowIso, plusIso, str, oneOf, rateLimit, clientIp, logActivity,
} from './util.js';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_SLIDING_MS = 30 * 24 * 3600 * 1000;
const SESSION_ABSOLUTE_MS = 90 * 24 * 3600 * 1000;

function rp(env) {
  if (!env.RP_ID || !env.ORIGIN) throw new HttpError(500, 'Server is niet volledig geconfigureerd (RP_ID/ORIGIN).');
  return { rpID: env.RP_ID, rpName: env.RP_NAME || 'Wijnkelder', origin: env.ORIGIN.split(',').map((s) => s.trim()) };
}

async function storeChallenge(env, kind, challenge, { userId = null, inviteId = null, payload = null } = {}) {
  const id = uuid();
  await env.DB.prepare('DELETE FROM challenges WHERE expires_at < ?').bind(nowIso()).run();
  await env.DB.prepare('INSERT INTO challenges (id, kind, challenge, user_id, invite_id, payload, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, kind, challenge, userId, inviteId, payload ? JSON.stringify(payload) : null, plusIso(CHALLENGE_TTL_MS))
    .run();
  return id;
}

async function consumeChallenge(env, id, kind) {
  if (!id || typeof id !== 'string') throw new HttpError(400, 'Ontbrekende challenge.');
  const row = await env.DB.prepare('SELECT * FROM challenges WHERE id = ? AND kind = ?').bind(id, kind).first();
  await env.DB.prepare('DELETE FROM challenges WHERE id = ?').bind(id).run();
  if (!row || row.expires_at < nowIso()) throw new HttpError(400, 'De aanmeldpoging is verlopen. Probeer opnieuw.');
  return { ...row, payload: row.payload ? JSON.parse(row.payload) : null };
}

async function createSession(env, req, userId) {
  const token = randomToken(32);
  const hash = await sha256Hex(token);
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, absolute_expires_at, user_agent) VALUES (?, ?, ?, ?, ?)'
  ).bind(hash, userId, plusIso(SESSION_SLIDING_MS), plusIso(SESSION_ABSOLUTE_MS), (req.headers.get('User-Agent') || '').slice(0, 200)).run();
  return token;
}

// Wordt door de router gebruikt om de ingelogde gebruiker te bepalen.
export async function authenticate(env, req) {
  const header = req.headers.get('Authorization') || '';
  const m = header.match(/^Bearer\s+([A-Za-z0-9_-]{20,200})$/);
  if (!m) return null;
  const hash = await sha256Hex(m[1]);
  const row = await env.DB.prepare(
    `SELECT s.token_hash, s.expires_at, s.absolute_expires_at, s.last_seen_at, u.id, u.name, u.role, u.disabled
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`
  ).bind(hash).first();
  if (!row) return null;
  const now = nowIso();
  if (row.disabled || row.expires_at < now || row.absolute_expires_at < now) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run();
    return null;
  }
  // Glijdende verlenging, maximaal 1x per uur schrijven.
  if (Date.now() - Date.parse(row.last_seen_at) > 3600 * 1000) {
    const newExp = new Date(Math.min(Date.now() + SESSION_SLIDING_MS, Date.parse(row.absolute_expires_at))).toISOString();
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?').bind(now, newExp, hash).run();
  }
  return { id: row.id, name: row.name, role: row.role, tokenHash: hash };
}

function credentialRowToDescriptor(c) {
  return { id: c.id, transports: c.transports ? JSON.parse(c.transports) : undefined };
}

// ---- registratie (alleen via uitnodiging of eenmalige bootstrap) -----------

export async function registerOptions(req, env) {
  await rateLimit(env, `reg:${clientIp(req)}`, 10, 600);
  const body = await readJson(req, 10_000);
  const { rpID, rpName } = rp(env);

  let name, role, inviteId = null;
  if (body.invite) {
    const hash = await sha256Hex(String(body.invite));
    const inv = await env.DB.prepare('SELECT * FROM invites WHERE token_hash = ?').bind(hash).first();
    if (!inv || inv.used_at || inv.expires_at < nowIso()) throw new HttpError(400, 'Deze uitnodiging is ongeldig of verlopen.');
    name = inv.name;
    role = inv.role;
    inviteId = inv.id;
  } else if (body.bootstrap) {
    const count = (await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n;
    if (count > 0) throw new HttpError(403, 'Er bestaat al een beheerder. Vraag een uitnodiging aan.');
    if (!env.BOOTSTRAP_SECRET || String(body.bootstrap) !== env.BOOTSTRAP_SECRET) {
      throw new HttpError(403, 'Onjuist opstartwachtwoord.');
    }
    name = str(body.name, { max: 60, required: true, name: 'Naam' });
    role = 'admin';
  } else {
    throw new HttpError(400, 'Registreren kan alleen met een uitnodiging.');
  }

  const userId = uuid();
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(userId),
    userName: name,
    userDisplayName: name,
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    timeout: 120_000,
  });
  const challengeId = await storeChallenge(env, 'register', options.challenge, { userId, inviteId, payload: { name, role } });
  return json({ challengeId, options });
}

export async function registerVerify(req, env) {
  await rateLimit(env, `reg:${clientIp(req)}`, 10, 600);
  const body = await readJson(req, 50_000);
  const ch = await consumeChallenge(env, body.challengeId, 'register');
  const { rpID, origin } = rp(env);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: ch.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch (e) {
    throw new HttpError(400, 'Passkey kon niet worden geverifieerd.');
  }
  if (!verification.verified) throw new HttpError(400, 'Passkey kon niet worden geverifieerd.');

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const { name, role } = ch.payload;

  if (ch.invite_id) {
    // Uitnodiging atomisch afboeken: voorkomt dubbel gebruik.
    const upd = await env.DB.prepare('UPDATE invites SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?')
      .bind(nowIso(), ch.invite_id, nowIso()).run();
    if (!upd.meta.changes) throw new HttpError(400, 'Deze uitnodiging is al gebruikt of verlopen.');
  } else {
    const count = (await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n;
    if (count > 0) throw new HttpError(403, 'Er bestaat al een beheerder.');
  }

  const label = str(body.label, { max: 60 }) || 'Passkey';
  await env.DB.batch([
    env.DB.prepare('INSERT INTO users (id, name, role) VALUES (?, ?, ?)').bind(ch.user_id, name, role),
    env.DB.prepare(
      'INSERT INTO credentials (id, user_id, public_key, counter, transports, device_type, backed_up, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(credential.id, ch.user_id, b64url(credential.publicKey), credential.counter, JSON.stringify(credential.transports || []),
      credentialDeviceType, credentialBackedUp ? 1 : 0, label),
  ]);
  await logActivity(env, ch.user_id, 'user.registered', 'user', ch.user_id, { name, role });
  const token = await createSession(env, req, ch.user_id);
  return json({ token, user: { id: ch.user_id, name, role } }, 201);
}

// ---- inloggen (discoverable credentials, geen gebruikersnaam nodig) ---------

export async function loginOptions(req, env) {
  await rateLimit(env, `login:${clientIp(req)}`, 30, 600);
  const { rpID } = rp(env);
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'required', allowCredentials: [], timeout: 120_000 });
  const challengeId = await storeChallenge(env, 'login', options.challenge);
  return json({ challengeId, options });
}

export async function loginVerify(req, env) {
  await rateLimit(env, `login:${clientIp(req)}`, 30, 600);
  const body = await readJson(req, 50_000);
  const ch = await consumeChallenge(env, body.challengeId, 'login');
  const { rpID, origin } = rp(env);
  const credId = body.response?.id;
  if (typeof credId !== 'string') throw new HttpError(400, 'Ongeldig antwoord.');

  const cred = await env.DB.prepare(
    'SELECT c.*, u.disabled FROM credentials c JOIN users u ON u.id = c.user_id WHERE c.id = ?'
  ).bind(credId).first();
  if (!cred || cred.disabled) throw new HttpError(401, 'Deze passkey is niet bekend.');

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: ch.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: cred.id,
        publicKey: b64urlDecode(cred.public_key),
        counter: cred.counter,
        transports: cred.transports ? JSON.parse(cred.transports) : undefined,
      },
    });
  } catch {
    throw new HttpError(401, 'Inloggen mislukt.');
  }
  if (!verification.verified) throw new HttpError(401, 'Inloggen mislukt.');

  await env.DB.prepare('UPDATE credentials SET counter = ?, last_used_at = ? WHERE id = ?')
    .bind(verification.authenticationInfo.newCounter, nowIso(), cred.id).run();
  const user = await env.DB.prepare('SELECT id, name, role FROM users WHERE id = ?').bind(cred.user_id).first();
  const token = await createSession(env, req, user.id);
  await logActivity(env, user.id, 'user.login', 'user', user.id);
  return json({ token, user });
}

// ---- extra passkey toevoegen voor een ingelogde gebruiker -------------------

export async function addPasskeyOptions(req, env, { user }) {
  const { rpID, rpName } = rp(env);
  const existing = (await env.DB.prepare('SELECT id, transports FROM credentials WHERE user_id = ?').bind(user.id).all()).results;
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(user.id),
    userName: user.name,
    userDisplayName: user.name,
    attestationType: 'none',
    excludeCredentials: existing.map(credentialRowToDescriptor),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });
  const challengeId = await storeChallenge(env, 'add-passkey', options.challenge, { userId: user.id });
  return json({ challengeId, options });
}

export async function addPasskeyVerify(req, env, { user }) {
  const body = await readJson(req, 50_000);
  const ch = await consumeChallenge(env, body.challengeId, 'add-passkey');
  if (ch.user_id !== user.id) throw new HttpError(403, 'Challenge hoort niet bij deze gebruiker.');
  const { rpID, origin } = rp(env);
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
    });
  } catch {
    throw new HttpError(400, 'Passkey kon niet worden geverifieerd.');
  }
  if (!verification.verified) throw new HttpError(400, 'Passkey kon niet worden geverifieerd.');
  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  await env.DB.prepare(
    'INSERT INTO credentials (id, user_id, public_key, counter, transports, device_type, backed_up, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(credential.id, user.id, b64url(credential.publicKey), credential.counter, JSON.stringify(credential.transports || []),
    credentialDeviceType, credentialBackedUp ? 1 : 0, str(body.label, { max: 60 }) || 'Passkey').run();
  await logActivity(env, user.id, 'passkey.added', 'credential', credential.id);
  return json({ ok: true }, 201);
}

export async function listMyPasskeys(req, env, { user }) {
  const rows = (await env.DB.prepare(
    'SELECT id, label, device_type, backed_up, created_at, last_used_at FROM credentials WHERE user_id = ? ORDER BY created_at'
  ).bind(user.id).all()).results;
  return json({ passkeys: rows });
}

export async function deleteMyPasskey(req, env, { user, params }) {
  const count = (await env.DB.prepare('SELECT COUNT(*) AS n FROM credentials WHERE user_id = ?').bind(user.id).first()).n;
  if (count <= 1) throw new HttpError(400, 'Je kunt je laatste passkey niet verwijderen.');
  const res = await env.DB.prepare('DELETE FROM credentials WHERE id = ? AND user_id = ?').bind(params.id, user.id).run();
  if (!res.meta.changes) throw new HttpError(404, 'Passkey niet gevonden.');
  await logActivity(env, user.id, 'passkey.removed', 'credential', params.id);
  return json({ ok: true });
}

export async function me(req, env, { user }) {
  return json({ user: { id: user.id, name: user.name, role: user.role } });
}

export async function logout(req, env, { user }) {
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(user.tokenHash).run();
  return json({ ok: true });
}

export async function logoutEverywhere(req, env, { user }) {
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
  return json({ ok: true });
}

export async function bootstrapStatus(req, env) {
  const count = (await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n;
  return json({ needsBootstrap: count === 0 });
}

// ---- beheer van huishoudleden (alleen admin) --------------------------------

export async function listUsers(req, env) {
  const users = (await env.DB.prepare(
    `SELECT u.id, u.name, u.role, u.disabled, u.created_at,
            (SELECT COUNT(*) FROM credentials c WHERE c.user_id = u.id) AS passkeys,
            (SELECT MAX(last_used_at) FROM credentials c WHERE c.user_id = u.id) AS last_login
     FROM users u ORDER BY u.created_at`
  ).all()).results;
  const invites = (await env.DB.prepare(
    'SELECT id, name, role, created_at, expires_at, used_at FROM invites WHERE used_at IS NULL AND expires_at > ? ORDER BY created_at DESC'
  ).bind(nowIso()).all()).results;
  return json({ users, invites });
}

export async function createInvite(req, env, { user }) {
  const body = await readJson(req, 10_000);
  const name = str(body.name, { max: 60, required: true, name: 'Naam' });
  const role = oneOf(body.role, ['admin', 'member'], { name: 'Rol' }) || 'member';
  const token = randomToken(32);
  const id = uuid();
  await env.DB.prepare('INSERT INTO invites (id, token_hash, name, role, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, await sha256Hex(token), name, role, user.id, plusIso(48 * 3600 * 1000)).run();
  await logActivity(env, user.id, 'invite.created', 'invite', id, { name, role });
  // Het token wordt maar één keer getoond; in de database staat alleen de hash.
  return json({ id, token, name, role, expiresInHours: 48 }, 201);
}

export async function revokeInvite(req, env, { user, params }) {
  await env.DB.prepare('DELETE FROM invites WHERE id = ?').bind(params.id).run();
  await logActivity(env, user.id, 'invite.revoked', 'invite', params.id);
  return json({ ok: true });
}

export async function updateUser(req, env, { user, params }) {
  const body = await readJson(req, 10_000);
  const target = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(params.id).first();
  if (!target) throw new HttpError(404, 'Gebruiker niet gevonden.');
  const role = oneOf(body.role, ['admin', 'member'], { name: 'Rol' }) || target.role;
  const disabled = body.disabled === undefined ? target.disabled : (body.disabled ? 1 : 0);
  const name = str(body.name, { max: 60 }) || target.name;
  if (target.id === user.id && (role !== 'admin' || disabled)) {
    throw new HttpError(400, 'Je kunt jezelf niet degraderen of uitschakelen.');
  }
  await env.DB.prepare('UPDATE users SET role = ?, disabled = ?, name = ? WHERE id = ?').bind(role, disabled, name, target.id).run();
  if (disabled) await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id).run();
  await logActivity(env, user.id, 'user.updated', 'user', target.id, { role, disabled, name });
  return json({ ok: true });
}

export async function deleteUser(req, env, { user, params }) {
  if (params.id === user.id) throw new HttpError(400, 'Je kunt jezelf niet verwijderen.');
  const target = await env.DB.prepare('SELECT id, name FROM users WHERE id = ?').bind(params.id).first();
  if (!target) throw new HttpError(404, 'Gebruiker niet gevonden.');
  // Historie bewaren: verwijzingen naar deze gebruiker blijven staan, account wordt uitgeschakeld en passkeys verwijderd.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM credentials WHERE user_id = ?').bind(target.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id),
    env.DB.prepare('UPDATE users SET disabled = 1 WHERE id = ?').bind(target.id),
  ]);
  await logActivity(env, user.id, 'user.removed', 'user', target.id, { name: target.name });
  return json({ ok: true });
}
