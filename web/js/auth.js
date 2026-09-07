// Passkeys (WebAuthn) in de browser. Werkt zonder externe bibliotheken.
import { api, session } from './api.js';

export function passkeysSupported() {
  return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
}

function b64urlToBuf(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function bufToB64url(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toCreationOptions(o) {
  if (PublicKeyCredential.parseCreationOptionsFromJSON) return PublicKeyCredential.parseCreationOptionsFromJSON(o);
  return {
    ...o,
    challenge: b64urlToBuf(o.challenge),
    user: { ...o.user, id: b64urlToBuf(o.user.id) },
    excludeCredentials: (o.excludeCredentials || []).map((c) => ({ ...c, id: b64urlToBuf(c.id) })),
  };
}

function toRequestOptions(o) {
  if (PublicKeyCredential.parseRequestOptionsFromJSON) return PublicKeyCredential.parseRequestOptionsFromJSON(o);
  return { ...o, challenge: b64urlToBuf(o.challenge), allowCredentials: (o.allowCredentials || []).map((c) => ({ ...c, id: b64urlToBuf(c.id) })) };
}

function credentialToJSON(cred) {
  if (typeof cred.toJSON === 'function') return cred.toJSON();
  const r = cred.response;
  const out = {
    id: cred.id,
    rawId: bufToB64url(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment || undefined,
    clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
    response: { clientDataJSON: bufToB64url(r.clientDataJSON) },
  };
  if (r.attestationObject) {
    out.response.attestationObject = bufToB64url(r.attestationObject);
    out.response.transports = r.getTransports ? r.getTransports() : [];
  }
  if (r.authenticatorData) {
    out.response.authenticatorData = bufToB64url(r.authenticatorData);
    out.response.signature = bufToB64url(r.signature);
    out.response.userHandle = r.userHandle ? bufToB64url(r.userHandle) : undefined;
  }
  return out;
}

function friendlyError(e) {
  if (e && e.name === 'NotAllowedError') return new Error('De passkey-aanvraag is geannuleerd of verlopen.');
  if (e && e.name === 'InvalidStateError') return new Error('Op dit apparaat bestaat al een passkey voor dit account.');
  if (e && e.name === 'SecurityError') return new Error('Passkeys werken alleen op het geconfigureerde adres (RP_ID) via https.');
  return e instanceof Error ? e : new Error('Passkey mislukt.');
}

export function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'iPhone/iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Apparaat';
}

// Registreren met een uitnodiging (of eenmalig als eerste beheerder).
export async function registerPasskey({ invite, bootstrap, name }) {
  const { challengeId, options } = await api.post('/api/auth/register/options', invite ? { invite } : { bootstrap, name });
  let cred;
  try {
    cred = await navigator.credentials.create({ publicKey: toCreationOptions(options) });
  } catch (e) {
    throw friendlyError(e);
  }
  const result = await api.post('/api/auth/register/verify', { challengeId, response: credentialToJSON(cred), label: deviceLabel() });
  session.set(result);
  return result.user;
}

export async function loginWithPasskey() {
  const { challengeId, options } = await api.post('/api/auth/login/options');
  let cred;
  try {
    cred = await navigator.credentials.get({ publicKey: toRequestOptions(options) });
  } catch (e) {
    throw friendlyError(e);
  }
  const result = await api.post('/api/auth/login/verify', { challengeId, response: credentialToJSON(cred) });
  session.set(result);
  return result.user;
}

export async function addPasskey(label) {
  const { challengeId, options } = await api.post('/api/auth/passkeys/options');
  let cred;
  try {
    cred = await navigator.credentials.create({ publicKey: toCreationOptions(options) });
  } catch (e) {
    throw friendlyError(e);
  }
  return api.post('/api/auth/passkeys/verify', { challengeId, response: credentialToJSON(cred), label: label || deviceLabel() });
}

export async function logout(everywhere = false) {
  try {
    await api.post(everywhere ? '/api/auth/logout-everywhere' : '/api/auth/logout');
  } catch { /* lokaal altijd uitloggen */ }
  session.clear();
}
