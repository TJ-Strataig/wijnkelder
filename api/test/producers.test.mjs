import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { makeEnv, seedUser, call } from './harness.mjs';
import { compareProducers, producerKey } from '../src/producers.js';

const addWine = (env, token, producer, name = 'Reserva', extra = {}) =>
  call(worker, env, '/api/wines', { method: 'POST', token, body: { name, producer, type: 'rood', vintage: 2019, quantity: 1, producer_as_typed: true, ...extra } });

test('wijnhuizen: sleutel en vergelijking herkennen schrijfwijzen, afkortingen en rechtsvormen', () => {
  assert.equal(producerKey('Bodegas Muga S.A.'), producerKey('muga'));
  assert.equal(producerKey('Ch. Margaux'), producerKey('Château Margaux'));
  assert.equal(producerKey('Dom. de la Romanée-Conti'), producerKey('Domaine de la Romanee Conti'));
  assert.equal(compareProducers('Muga', 'Bodegas Muga').score, 1);
  assert.equal(compareProducers('Pichon Baron', 'Château Pichon-Longueville Baron').score, 0.85);
  assert.ok(compareProducers('Antinori', 'Antinorri').score >= 0.85, 'typefout');
  assert.equal(compareProducers('Torres', 'Antinori'), null);
  assert.equal(compareProducers('Muga', 'Mugaritz'), null, 'korte namen niet te gretig');
});

test('wijnhuizen: varianten worden gegroepeerd met voorstel; "verschillende huizen" verbergt een groep', async () => {
  const env = makeEnv(); const u = await seedUser(env);
  await addWine(env, u.token, 'Muga', 'Reserva'); await addWine(env, u.token, 'Bodegas Muga', 'Prado Enea'); await addWine(env, u.token, 'Bodegas Muga', 'Selección Especial');
  await addWine(env, u.token, 'Château Margaux', 'Grand Vin'); await addWine(env, u.token, 'Ch. Margaux', 'Pavillon Rouge');
  await addWine(env, u.token, 'Torres', 'Sangre de Toro');
  const r = await call(worker, env, '/api/producers/varianten', { token: u.token });
  assert.equal(r.status, 200); assert.equal(r.json.groups.length, 2);
  const muga = r.json.groups.find((g) => g.variants.some((v) => v.name === 'Muga'));
  assert.equal(muga.suggested, 'Bodegas Muga', 'meeste wijnen wint'); assert.equal(muga.confidence, 'zeker'); assert.equal(muga.wines, 3);
  const marg = r.json.groups.find((g) => g.variants.some((v) => v.name === 'Ch. Margaux'));
  assert.equal(marg.suggested, 'Château Margaux', 'bij gelijk aantal wint de volledige naam');
  // Verschillende huizen → groep verdwijnt; ook uit de suggesties
  const d = await call(worker, env, '/api/producers/distinct', { method: 'POST', token: u.token, body: { names: ['Château Margaux', 'Ch. Margaux'] } });
  assert.equal(d.status, 200);
  assert.equal((await call(worker, env, '/api/producers/varianten', { token: u.token })).json.groups.length, 1);
  assert.equal((await call(worker, env, '/api/producers/suggest?name=Ch.%20Margaux', { token: u.token })).json.matches.length, 0);
  await call(worker, env, '/api/producers/distinct', { method: 'DELETE', token: u.token });
  assert.equal((await call(worker, env, '/api/producers/varianten', { token: u.token })).json.groups.length, 2);
});

test('wijnhuizen: samenvoegen hernoemt wijnen en verlanglijst en neemt het profiel mee', async () => {
  const env = makeEnv(); const u = await seedUser(env);
  await addWine(env, u.token, 'Muga', 'Reserva'); await addWine(env, u.token, 'Bodegas Muga', 'Prado Enea');
  await call(worker, env, '/api/wishlist', { method: 'POST', token: u.token, body: { name: 'Torre Muga', producer: 'Muga' } });
  await env.DB.prepare("INSERT INTO producers (id, name, name_key, description) VALUES ('p1', 'Muga', 'muga', 'Familiebedrijf in Haro.')").run();
  const r = await call(worker, env, '/api/producers/merge', { method: 'POST', token: u.token, body: { names: ['Muga', 'Bodegas Muga'], target: 'Bodegas Muga' } });
  assert.equal(r.status, 200); assert.equal(r.json.wines, 1); assert.equal(r.json.wishlist, 1);
  const names = (await env.DB.prepare('SELECT DISTINCT producer FROM wines').all()).results.map((x) => x.producer);
  assert.deepEqual(names, ['Bodegas Muga']);
  const p = await env.DB.prepare('SELECT name, name_key, description FROM producers').all();
  assert.equal(p.results.length, 1); assert.equal(p.results[0].name, 'Bodegas Muga'); assert.equal(p.results[0].description, 'Familiebedrijf in Haro.');
  assert.equal((await call(worker, env, '/api/producers/varianten', { token: u.token })).json.groups.length, 0);
  // Validatie
  assert.equal((await call(worker, env, '/api/producers/merge', { method: 'POST', token: u.token, body: { names: [], target: 'X' } })).status, 400);
  assert.equal((await call(worker, env, '/api/producers/merge', { method: 'POST', body: { names: ['a'], target: 'X' } })).status, 401);
});

test('wijnhuizen: nieuwe wijn krijgt automatisch de bestaande schrijfwijze; suggest toont twijfelgevallen; producer_as_typed respecteert de typing', async () => {
  const env = makeEnv(); const u = await seedUser(env);
  await addWine(env, u.token, 'Bodegas Muga', 'Prado Enea'); await addWine(env, u.token, 'Bodegas Muga', 'Reserva');
  // Exacte sleutel ("muga") → overgenomen en gemeld
  const r = await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { name: 'Torre Muga', producer: 'muga', type: 'rood', vintage: 2018, quantity: 1 } });
  assert.equal(r.status, 200); assert.equal(r.json.wine.producer, 'Bodegas Muga'); assert.deepEqual(r.json.producer_adjusted, { from: 'muga', to: 'Bodegas Muga' });
  // Twijfelgeval → niet automatisch, wel als suggestie
  const s = await call(worker, env, '/api/producers/suggest?name=Muga%20Rioja%20Alta', { token: u.token });
  assert.equal(s.json.canonical, null); assert.equal(s.json.matches[0].name, 'Bodegas Muga'); assert.equal(s.json.matches[0].wines, 3);
  const r2 = await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { name: 'Aro', producer: 'Muga Rioja Alta', type: 'rood', vintage: 2016, quantity: 1 } });
  assert.equal(r2.json.wine.producer, 'Muga Rioja Alta'); assert.equal(r2.json.producer_adjusted, undefined);
  // Bewust anders getypt blijft staan
  const r3 = await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { name: 'Flor de Muga', producer: 'MUGA', type: 'rose', vintage: 2023, quantity: 1, producer_as_typed: true } });
  assert.equal(r3.json.wine.producer, 'MUGA');
});

test('wijnhuizen: zondag 11u komt er één melding in de app zolang de situatie niet verandert', async () => {
  const env = makeEnv(); const u = await seedUser(env);
  await addWine(env, u.token, 'Muga', 'Reserva'); await addWine(env, u.token, 'Bodegas Muga', 'Prado Enea');
  const { runScheduledNotifications } = await import('../src/sommelier.js');
  const sunday11 = new Date('2026-09-13T09:00:00Z'); // 11:00 in Amsterdam (zomertijd)
  let r = await runScheduledNotifications(env, sunday11);
  assert.equal(r.producers, 1);
  r = await runScheduledNotifications(env, sunday11);
  assert.equal(r.producers, undefined, 'geen herhaling zonder verandering');
  const n = (await env.DB.prepare("SELECT title, link FROM notifications WHERE kind = 'producers'").all()).results;
  assert.equal(n.length, 1); assert.equal(n[0].link, '#/wijnhuizen');
  // Na samenvoegen geen melding meer
  await call(worker, env, '/api/producers/merge', { method: 'POST', token: u.token, body: { names: ['Muga', 'Bodegas Muga'], target: 'Bodegas Muga' } });
  r = await runScheduledNotifications(env, sunday11);
  assert.equal(r.producers, undefined);
});
