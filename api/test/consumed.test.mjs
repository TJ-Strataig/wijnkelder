import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { makeEnv, seedUser, call } from './harness.mjs';

test('direct naar historie: restaurantfles, met plaats/datum/proefnotitie; niet in kelder; via wachtrij en bij bestaande wijn', async () => {
  const env = makeEnv(); const u = await seedUser(env);
  // 1. Nieuwe wijn, gedronken in een restaurant, met proefnotitie
  const r = await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: {
    name: 'Barolo', producer: 'Test', type: 'rood', vintage: 2018, quantity: 1, bottle: { price: 85 },
    consumed: { reason: 'consumed', date: '2026-09-05', place: 'Restaurant De Librije', occasion: 'Verjaardag Angela', tasting: { rating: 92, notes: 'Prachtig', paired_with: 'Ree' } } } });
  assert.equal(r.status, 200);
  assert.equal(r.json.wine.bottles_in_cellar, 0, 'niet in de kelder');
  assert.equal(r.json.bottles.length, 1);
  const b = r.json.bottles[0];
  assert.equal(b.status, 'consumed'); assert.equal(b.removed_at, '2026-09-05'); assert.equal(b.price, 85);
  assert.match(b.removed_note, /Restaurant De Librije/); assert.match(b.removed_note, /Verjaardag Angela/);
  assert.equal(r.json.tastings.length, 1); assert.equal(r.json.tastings[0].rating, 92); assert.equal(r.json.tastings[0].tasted_at, '2026-09-05'); assert.equal(r.json.tastings[0].occasion, 'Verjaardag Angela');
  // historie toont hem, kelder niet
  const hist = await call(worker, env, '/api/history', { token: u.token });
  assert.equal(hist.json.bottles.length, 1); assert.equal(hist.json.bottles[0].removed_reason, 'consumed');
  const cellar = await call(worker, env, '/api/wines', { token: u.token });
  assert.equal(cellar.json.wines.length, 0, 'standaardlijst toont alleen wijnen met voorraad');
  // 2. Meteen weggegeven cadeau
  const g = await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { name: 'Cava', type: 'mousserend', quantity: 2, bottle: { gifted: true, gifted_from: 'Oma' }, consumed: { reason: 'gifted_away', place: 'Buren', date: '2026-09-06' } } });
  assert.equal(g.json.bottles.filter((x) => x.status === 'gifted_away').length, 2);
  // 3. Bestaande wijn: extra fles die elders is gedronken
  const w2 = await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { name: 'Rioja', type: 'rood', quantity: 3, bottle: { price: 12 } } });
  const add = await call(worker, env, `/api/wines/${w2.json.wine.id}/bottles`, { method: 'POST', token: u.token, body: { quantity: 1, price: 40, consumed: { reason: 'consumed', place: 'Tapasbar', date: '2026-09-01' } } });
  assert.equal(add.status, 200);
  assert.equal(add.json.wine.bottles_in_cellar, 3, 'kelder blijft 3');
  assert.equal(add.json.bottles.filter((x) => x.status === 'consumed').length, 1);
  // 4. Ongeldige reden geweigerd, ongeldige datum geweigerd
  assert.equal((await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { name: 'Validatie1', type: 'rood', consumed: { reason: 'hacked' } } })).status, 400);
  assert.equal((await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { name: 'Validatie2', type: 'rood', consumed: { date: 'gisteren' } } })).status, 400);
  // 5. Via de beoordelingswachtrij
  const q = await call(worker, env, '/api/intake', { method: 'POST', token: u.token, body: { label_image_key: null, wine: { name: 'Champagne', type: 'mousserend' } } });
  const ap = await call(worker, env, `/api/intake/${q.json.id}/approve`, { method: 'POST', token: u.token, body: { bottle: { quantity: 1, price: 60 }, consumed: { reason: 'consumed', place: 'Thuis', date: '2026-09-07' } } });
  assert.equal(ap.status, 200);
  const ch = await call(worker, env, `/api/wines/${ap.json.wine_id}`, { token: u.token });
  assert.equal(ch.json.wine.bottles_in_cellar, 0); assert.equal(ch.json.bottles[0].status, 'consumed');
  // statistieken tellen gedronken flessen
  const st = await call(worker, env, '/api/stats', { token: u.token });
  assert.equal(st.json.totals.consumed, 3); assert.equal(st.json.totals.bottles, 3);
});
