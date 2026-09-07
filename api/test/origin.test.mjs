import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { makeEnv, seedUser, call } from './harness.mjs';

// Nep-netwerk: Nominatim en AI-antwoorden simuleren
const realFetch = globalThis.fetch;
function mockNet({ geo = true, ai } = {}) {
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('nominatim')) return new Response(JSON.stringify(geo ? [{ lat: '45.19', lon: '-0.75', display_name: 'Pauillac, Gironde, Frankrijk' }] : []), { headers: { 'Content-Type': 'application/json' } });
    if (u.includes('anthropic')) return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(ai) }] }), { headers: { 'Content-Type': 'application/json' } });
    throw new Error('onverwacht netwerkverzoek: ' + u);
  };
}
test.afterEach(() => { globalThis.fetch = realFetch; });

test('kaart: geocoding vult coördinaten, precisie van precies naar grof, handmatig plaatsen gevalideerd', async () => {
  const env = makeEnv(); const u = await seedUser(env);
  const w = (await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { name: 'Lafite', producer: 'Château Lafite Rothschild', type: 'rood', country: 'Frankrijk', region: 'Bordeaux', appellation: 'Pauillac', quantity: 2 } })).json.wine;
  let m = await call(worker, env, '/api/map', { token: u.token });
  assert.equal(m.json.located.length, 0); assert.equal(m.json.missing.length, 1);
  mockNet({ geo: true });
  const g = await call(worker, env, '/api/map/geocode', { method: 'POST', token: u.token, body: {} });
  assert.equal(g.status, 200); assert.equal(g.json.results[0].ok, true); assert.equal(g.json.results[0].precision, 'producer'); assert.equal(g.json.remaining, 0);
  m = await call(worker, env, '/api/map', { token: u.token });
  assert.equal(m.json.located.length, 1); assert.equal(m.json.located[0].bottles, 2); assert.equal(m.json.located[0].lat, 45.19);
  // handmatig verplaatsen: bereik gecontroleerd
  assert.equal((await call(worker, env, `/api/wines/${w.id}/location`, { method: 'PUT', token: u.token, body: { latitude: 999, longitude: 0 } })).status, 400);
  assert.equal((await call(worker, env, `/api/wines/${w.id}/location`, { method: 'PUT', token: u.token, body: { latitude: 44.8, longitude: -0.6 } })).status, 200);
  m = await call(worker, env, '/api/map', { token: u.token });
  assert.equal(m.json.located[0].precision, 'manual');
  // zonder login niets
  assert.equal((await call(worker, env, '/api/map')).status, 401);
  assert.equal((await call(worker, env, '/api/producers')).status, 401);
});

test('wijnhuizen: lijst, profiel via AI wordt gesaneerd en gekoppeld, notities alleen voor ingelogden', async () => {
  const env = makeEnv(); const u = await seedUser(env);
  const key = 'sk-ant-api03-' + 'A'.repeat(40);
  await call(worker, env, '/api/ai/settings', { method: 'PUT', token: u.token, body: { provider: 'anthropic', model: 'claude-sonnet-4-5', api_key: key } });
  await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { name: 'Rood', producer: 'Domaine Test', type: 'rood', country: 'Frankrijk', region: 'Bourgogne', quantity: 1 } });
  await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { name: 'Wit', producer: 'domaine test', type: 'wit', country: 'Frankrijk', region: 'Bourgogne', quantity: 3 } });
  const list = await call(worker, env, '/api/producers', { token: u.token });
  assert.equal(list.status, 200);
  assert.ok(list.json.producers.length >= 1);
  mockNet({ geo: true, ai: { description: 'Een familiedomein in Bourgogne.', founded: '1850', owner: 'Familie Test', winemaker: 'Jan Test', hectares: 12, philosophy: 'biologisch', signature_wines: ['Grand Cru', 'javascript:alert(1)'], website: 'javascript:alert(1)', address: 'Beaune', latitude: 47.02, longitude: 4.84, country: 'Frankrijk', region: 'Bourgogne', confidence: 0.9 } });
  const prof = await call(worker, env, '/api/producers/profile', { method: 'POST', token: u.token, body: { name: 'Domaine Test' } });
  assert.equal(prof.status, 200);
  assert.equal(prof.json.profile.website, null, 'javascript:-website moet weggegooid worden');
  assert.equal(prof.json.profile.latitude, 47.02);
  assert.equal(prof.json.profile.signature_wines.length, 2); // tekst, geen link — mag blijven
  const get = await call(worker, env, '/api/producers/by-name?name=Domaine%20Test', { token: u.token });
  assert.equal(get.json.wines.length, 2, 'beide wijnen (ook met andere hoofdletters) horen bij dit wijnhuis');
  // wijnen zonder coördinaten kregen die van het wijnhuis
  const m = await call(worker, env, '/api/map', { token: u.token });
  assert.equal(m.json.located.length, 2);
  // notities
  const pid = prof.json.profile.id;
  assert.equal((await call(worker, env, `/api/producers/${pid}`, { method: 'PATCH', token: u.token, body: { notes: 'Bezocht in 2024', website: 'http://onveilig' } })).status, 200);
  const again = await call(worker, env, '/api/producers/by-name?name=Domaine%20Test', { token: u.token });
  assert.equal(again.json.profile.notes, 'Bezocht in 2024');
  assert.equal(again.json.profile.website, null);
  // export bevat producenten
  const ex = await call(worker, env, '/api/export.json', { token: u.token });
  assert.equal(ex.json.producers.length, 1);
});
