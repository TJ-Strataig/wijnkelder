import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { makeEnv, seedUser, call } from './harness.mjs';

test('JSON export bevat nieuwe entiteiten en relatiegegevens', async () => {
  const env = makeEnv();
  const admin = await seedUser(env, { role: 'admin' });
  await env.DB.prepare('INSERT INTO selections (id,name,created_by) VALUES (?,?,?)').bind('sel-1', 'Zomer', admin.id).run();
  await env.DB.prepare('INSERT INTO cellar_locations (id,name,created_by) VALUES (?,?,?)').bind('loc-1', 'Kelder', admin.id).run();
  await env.DB.prepare('INSERT INTO racks (id,location_id,name) VALUES (?,?,?)').bind('rack-1', 'loc-1', 'A').run();
  await env.DB.prepare('INSERT INTO slots (id,rack_id,name) VALUES (?,?,?)').bind('slot-1', 'rack-1', '1').run();
  const r = await call(worker, env, '/api/export.json?include=selections,cellar_locations,occupancy', { token: admin.token });
  assert.equal(r.status, 200);
  assert.equal(r.json.selections[0].name, 'Zomer');
  assert.equal(r.json.racks[0].name, 'A');
  assert.equal(r.json.slots[0].name, '1');
  assert.equal(r.json.occupancy[0].bottle_count, 0);
});

test('niet-beheerder exporteert geen gebruikersidentiteiten', async () => {
  const env = makeEnv();
  const member = await seedUser(env, { role: 'member', name: 'Privé lid' });
  const r = await call(worker, env, '/api/export.json?include=users,tasting_notes,bottles,selections,evenings,blind_tastings,cellar_locations', { token: member.token });
  assert.equal(r.status, 200);
  assert.equal(r.json.users, undefined);
  assert.deepEqual(r.json.tasting_notes, []);
  for (const collection of ['tasting_notes', 'bottles', 'selections', 'evenings', 'blind_tastings', 'cellar_locations']) {
    for (const row of r.json[collection] || []) {
      for (const key of ['user_id', 'created_by', 'added_by', 'removed_by', 'updated_by', 'started_by']) assert.equal(row[key], undefined);
    }
  }
});

test('CSV behoudt downloadformaat en bevat recordtypes', async () => {
  const env = makeEnv();
  const admin = await seedUser(env, { role: 'admin' });
  await env.DB.prepare('INSERT INTO cellar_locations (id,name,created_by) VALUES (?,?,?)').bind('loc-1', 'Kelder', admin.id).run();
  const r = await call(worker, env, '/api/export.csv?include=cellar_locations', { token: admin.token });
  assert.equal(r.status, 200);
  assert.match(r.text, /record_type;id;name/);
  assert.match(r.text, /cellar_locations;loc-1;Kelder/);
});
