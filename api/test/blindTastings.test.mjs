import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import worker from '../src/index.js';
import { call, makeEnv, req, seedUser } from './harness.mjs';

async function setup() {
  const env = makeEnv();
  const maker = await seedUser(env, { name: 'Maker', role: 'member' });
  const participant = await seedUser(env, { name: 'Deelnemer', role: 'member' });
  const wine1 = crypto.randomUUID(), wine2 = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO wines (id, name, type, producer, vintage) VALUES (?, ?, ?, ?, ?)').bind(wine1, 'Geheime wijn', 'rood', 'Verborgen huis', 2020),
    env.DB.prepare('INSERT INTO wines (id, name, type, producer, vintage) VALUES (?, ?, ?, ?, ?)').bind(wine2, 'Tweede wijn', 'wit', 'Ander huis', 2021),
  ]);
  return { env, maker, participant, wine1, wine2 };
}

test('blindproeven schema, routes, anonimiteit en autorisatie', async () => {
  const [schema, migration, index] = await Promise.all([
    readFile(new URL('../schema.sql', import.meta.url), 'utf8'),
    readFile(new URL('../migrations/0008_blindproeven.sql', import.meta.url), 'utf8'),
    readFile(new URL('../src/index.js', import.meta.url), 'utf8'),
  ]);
  for (const source of [schema, migration]) {
    for (const table of ['blind_tastings', 'blind_tasting_wines', 'blind_tasting_entries']) assert.match(source, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
    assert.match(source, /UNIQUE \(tasting_id, code\)/);
  }
  for (const endpoint of ['/api/blind-tastings', '/open', '/reveal', '/cancel', '/flight', '/results']) assert.match(index, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const { env, maker, participant, wine1, wine2 } = await setup();
  const created = await call(worker, env, '/api/blind-tastings', { method: 'POST', token: maker.token, body: { name: 'Test', wine_ids: [wine1, wine2] } });
  assert.equal(created.status, 201);
  const id = created.json.id;
  assert.equal((await call(worker, env, `/api/blind-tastings/${id}`, { token: participant.token })).json.codes[0].name, undefined);
  assert.equal((await call(worker, env, `/api/blind-tastings/${id}/open`, { method: 'POST', token: participant.token })).status, 403);
  assert.equal((await call(worker, env, `/api/blind-tastings/${id}/open`, { method: 'POST', token: maker.token })).status, 200);
  assert.equal((await call(worker, env, `/api/blind-tastings/${id}/codes/A01/tasting`, { method: 'POST', token: participant.token, body: { rating: 80 } })).status, 200);
  assert.equal((await call(worker, env, `/api/blind-tastings/${id}/codes/A01/tasting`, { method: 'POST', token: participant.token, body: { rating: 90 } })).status, 200);
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM blind_tasting_entries').first();
  assert.equal(count.n, 1);
  assert.equal((await call(worker, env, `/api/blind-tastings/${id}/reveal`, { method: 'POST', token: maker.token })).status, 200);
  assert.equal((await call(worker, env, `/api/blind-tastings/${id}/reveal`, { method: 'POST', token: maker.token })).json.idempotent, true);
  const detail = await call(worker, env, `/api/blind-tastings/${id}`, { token: participant.token });
  assert.equal(detail.json.codes[0].name, 'Geheime wijn');
  assert.equal(detail.json.results[0].average, 90);
});
