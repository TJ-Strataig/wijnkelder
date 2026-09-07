import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { makeEnv, seedUser, call } from './harness.mjs';

const wines = async (env) => (await env.DB.prepare('SELECT COUNT(*) AS n FROM wines').first()).n;

test('duplicaten: server weigert dubbel record, bijboeken werkt, andere jaargang mag, hoofdletters/accenten genegeerd', async () => {
  const env = makeEnv(); const u = await seedUser(env);
  const base = { name: 'Château Margaux', producer: 'Château Margaux', type: 'rood', vintage: 2015, grapes: ['Cabernet Sauvignon', 'Merlot'], quantity: 2, bottle: { price: 600 } };
  const first = await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: base });
  assert.equal(first.status, 200);
  // Exact dezelfde fles nogmaals (andere hoofdletters, zonder accent, druiven in andere volgorde) → 409 met info
  const dup = await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { ...base, name: 'chateau margaux', producer: 'CHATEAU MARGAUX', grapes: ['merlot', 'cabernet sauvignon'], quantity: 1 } });
  assert.equal(dup.status, 409);
  assert.equal(dup.json.duplicate.id, first.json.wine.id);
  assert.equal(dup.json.duplicate.bottles_in_cellar, 2);
  assert.equal(await wines(env), 1, 'geen tweede record');
  // Vooraf-controle geeft hetzelfde
  const chk = await call(worker, env, '/api/wines/check-duplicate', { method: 'POST', token: u.token, body: { name: 'Chateau Margaux', producer: 'Château Margaux', vintage: 2015, type: 'rood' } });
  assert.equal(chk.json.exact.id, first.json.wine.id);
  // Bijboeken op bestaande wijn → 3 flessen, nog steeds 1 record, prijs van de nieuwe fles bewaard
  const merge = await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { ...base, quantity: 1, bottle: { price: 650 }, merge_into: first.json.wine.id } });
  assert.equal(merge.status, 200);
  assert.equal(merge.json.wine.id, first.json.wine.id);
  assert.equal(merge.json.wine.bottles_in_cellar, 3);
  assert.ok(merge.json.bottles.some((b) => b.price === 650));
  assert.equal(await wines(env), 1);
  // Bewust apart toevoegen → wel een tweede record
  const sep = await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { ...base, quantity: 1, allow_duplicate: true } });
  assert.equal(sep.status, 200); assert.equal(await wines(env), 2);
  // Andere jaargang = andere wijn: mag zonder melding, maar check-duplicate meldt "vergelijkbaar"
  const other = await call(worker, env, '/api/wines/check-duplicate', { method: 'POST', token: u.token, body: { ...base, vintage: 2016 } });
  assert.equal(other.json.exact, null); assert.ok(other.json.near.length >= 1); assert.match(other.json.near[0].differences[0], /jaargang/);
  assert.equal((await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { ...base, vintage: 2016 } })).status, 200);
  // Magnum van dezelfde wijn = andere fles
  assert.equal((await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { ...base, volume_ml: 1500 } })).status, 200);
  // Druiven onbekend bij nieuwe invoer blokkeert match niet (herkenning weet niet altijd de druiven)
  const nog = await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { ...base, grapes: [], quantity: 1 } });
  assert.equal(nog.status, 409);
  // merge_into met verkeerd id wordt genegeerd → 409 (geen stille bijboeking op een andere wijn)
  assert.equal((await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { ...base, merge_into: 'iets-anders' } })).status, 409);
});

test('duplicaten via de beoordelingswachtrij: 409 met info, daarna bijboeken of bewust apart', async () => {
  const env = makeEnv(); const u = await seedUser(env);
  const w = await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { name: 'Rioja Reserva', producer: 'Muga', type: 'rood', vintage: 2019, quantity: 1 } });
  const q = await call(worker, env, '/api/intake', { method: 'POST', token: u.token, body: { label_image_key: null, wine: { name: 'Rioja Reserva', producer: 'Muga', type: 'rood', vintage: 2019 } } });
  const a1 = await call(worker, env, `/api/intake/${q.json.id}/approve`, { method: 'POST', token: u.token, body: { bottle: { quantity: 2 } } });
  assert.equal(a1.status, 409); assert.equal(a1.json.duplicate.id, w.json.wine.id);
  // item nog niet goedgekeurd
  assert.equal((await call(worker, env, '/api/intake', { token: u.token })).json.counts.recognized, 1);
  const a2 = await call(worker, env, `/api/intake/${q.json.id}/approve`, { method: 'POST', token: u.token, body: { bottle: { quantity: 2 }, existing_wine_id: w.json.wine.id } });
  assert.equal(a2.status, 200); assert.equal(a2.json.wine_id, w.json.wine.id);
  assert.equal(a2.json.wine.bottles_in_cellar, 3);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM wines').first()).n, 1);
});
