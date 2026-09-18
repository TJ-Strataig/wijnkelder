import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, seedUser } from './harness.mjs';
import { createWine, addBottles, removeBottle } from '../src/wines.js';
import { addIntake, updateIntake, approveIntake } from '../src/intake.js';
import { startInventory, finishInventory } from '../src/insights.js';
import { mergeProducers } from '../src/producers.js';
import { priceEstimate } from '../src/ai.js';
import { updateProducer } from '../src/origin.js';

async function fixture(t) {
  const env = makeEnv();
  t.after(() => env.DB.raw.close());
  const user = await seedUser(env);
  const run = async (handler, body = {}, params = {}) => (await handler(new Request('https://example.test/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(handler === createWine ? { type: 'rood', ...body } : handler === addIntake ? { ...body, wine: { type: 'rood', ...body.wine } } : body),
  }), env, { user, params })).json();
  const rows = (table) => env.DB.raw.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
  return { env, user, run, rows };
}
const rejected = (status) => (error) => error.status === status;

test('invalid quantities and consumption data leave no partial wine, bottles or activity', async (t) => {
  const { run, rows } = await fixture(t);
  for (const body of [
    { quantity: -1 }, { quantity: 1.5 }, { quantity: true }, { quantity: [2] }, { quantity: ' ' },
    { bottle: { price: -1 } }, { consumed: { reason: 'invalid' } },
    { consumed: { tasting: { rating: 101 } } }, { consumed: { tasting: 'invalid' } },
    { quantity: 0, consumed: { tasting: { rating: 80 } } },
  ]) {
    await assert.rejects(run(createWine, { name: 'Reserva', ...body }), rejected(400));
    for (const table of ['wines', 'bottles', 'tasting_notes', 'activity']) assert.equal(rows(table).length, 0, table);
  }
  const created = await run(createWine, { name: 'Reserva' });
  const before = rows('bottles');
  await assert.rejects(run(addBottles, { quantity: 2, consumed: { tasting: { rating: 101 } } }, { id: created.wine.id }), rejected(400));
  assert.deepEqual(rows('bottles'), before);
});

test('database failures roll back all wine, bottle and tasting writes', async (t) => {
  const { env, run, rows } = await fixture(t);
  env.DB.raw.exec("CREATE TRIGGER fail_tasting BEFORE INSERT ON tasting_notes BEGIN SELECT RAISE(ABORT, 'forced failure'); END");
  await assert.rejects(run(createWine, { name: 'Reserva', quantity: 2, consumed: { tasting: { rating: 85 } } }), /forced failure/);
  for (const table of ['wines', 'bottles', 'tasting_notes', 'activity']) assert.equal(rows(table).length, 0, table);
});

for (const existing of [false, true]) test(`concurrent intake approval adds stock once (existing=${existing})`, async (t) => {
  const { run, rows } = await fixture(t);
  const wine = existing ? (await run(createWine, { name: 'Reserva', quantity: 0 })).wine : null;
  const item = await run(addIntake, { wine: { name: 'Reserva' }, bottle: { quantity: 2 } });
  const results = await Promise.allSettled([0, 1].map(() => run(approveIntake, { existing_wine_id: wine?.id }, { id: item.id })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.status, 409);
  assert.equal(rows('wines').length, 1);
  assert.equal(rows('bottles').length, 2);
  assert.equal(rows('intake_queue')[0].status, 'approved');
  assert.equal(rows('activity').filter((r) => r.action === 'intake.approved').length, 1);
});

test('intake failure leaves the item retryable and oversized JSON never replaces a draft', async (t) => {
  const { env, run, rows } = await fixture(t);
  const item = await run(addIntake, { wine: { name: 'Reserva' }, bottle: { quantity: 2 } });
  const before = rows('intake_queue');
  await assert.rejects(run(updateIntake, { wine: { name: 'x'.repeat(20000) } }, { id: item.id }), rejected(400));
  await assert.rejects(run(approveIntake, { bottle: { quantity: 1.5 } }, { id: item.id }), rejected(400));
  await assert.rejects(run(approveIntake, { bottle: [] }, { id: item.id }), rejected(400));
  assert.deepEqual(rows('intake_queue'), before);
  env.DB.raw.exec("CREATE TRIGGER fail_approval BEFORE INSERT ON activity WHEN NEW.action = 'intake.approved' BEGIN SELECT RAISE(ABORT, 'forced failure'); END");
  await assert.rejects(run(approveIntake, {}, { id: item.id }), /forced failure/);
  assert.deepEqual(rows('intake_queue'), before);
  assert.equal(rows('wines').length, 0);
  assert.equal(rows('bottles').length, 0);
  env.DB.raw.exec('DROP TRIGGER fail_approval');
  await run(approveIntake, {}, { id: item.id });
  assert.equal(rows('bottles').length, 2);
});

test('concurrent bottle removal creates only one tasting and removal', async (t) => {
  const { run, rows } = await fixture(t);
  const created = await run(createWine, { name: 'Reserva' });
  const params = { id: created.wine.id, bottleId: created.bottles[0].id };
  const results = await Promise.allSettled([0, 1].map(() => run(removeBottle, { reason: 'consumed', tasting: { rating: 85 } }, params)));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.status, 409);
  assert.equal(rows('tasting_notes').length, 1);
  assert.equal(rows('bottles')[0].status, 'consumed');
});

test('intake JSON at the size boundary remains parseable, larger values are rejected', async (t) => {
  const { run, rows } = await fixture(t);
  const wine = { name: 'Reserva', type: 'rood', data: '' };
  wine.data = 'x'.repeat(20000 - JSON.stringify(wine).length);
  const bottle = { data: '' };
  bottle.data = 'x'.repeat(4000 - JSON.stringify(bottle).length);
  await run(addIntake, { wine, bottle });
  assert.deepEqual(JSON.parse(rows('intake_queue')[0].wine), wine);
  assert.deepEqual(JSON.parse(rows('intake_queue')[0].bottle), bottle);
  await assert.rejects(run(addIntake, { wine: { ...wine, data: wine.data + 'x' } }), rejected(400));
  await assert.rejects(run(addIntake, { wine, bottle: { data: bottle.data + 'x' } }), rejected(400));
  assert.equal(rows('intake_queue').length, 1);
});

for (const change of ['added', 'removed', 'replaced']) test(`inventory rejects ${change} stock without changing any bottles`, async (t) => {
  const { env, run, rows } = await fixture(t);
  const created = await run(createWine, { name: 'Reserva', quantity: 2 });
  const round = await run(startInventory);
  if (change === 'added') await run(addBottles, { quantity: 1 }, { id: created.wine.id });
  if (change === 'removed') env.DB.raw.prepare("UPDATE bottles SET status = 'consumed' WHERE id = ?").run(created.bottles[0].id);
  if (change === 'replaced') env.DB.raw.prepare("UPDATE bottles SET id = 'replacement' WHERE id = ?").run(created.bottles[0].id);
  const before = rows('bottles');
  await assert.rejects(run(finishInventory, { counts: { [created.wine.id]: 0 }, resolve: 'remove_missing' }, { id: round.session_id }), rejected(409));
  assert.deepEqual(rows('bottles'), before);
  assert.equal(rows('inventory_sessions')[0].finished_at, null);
});

test('inventory validates counts and finishes only once, including parallel calls and replay', async (t) => {
  const { run, rows } = await fixture(t);
  const created = await run(createWine, { name: 'Reserva', quantity: 2 });
  const round = await run(startInventory);
  await assert.rejects(run(finishInventory, { counts: null }, { id: round.session_id }), rejected(400));
  for (const value of [-1, 1.5, true, null, '', [], {}]) {
    await assert.rejects(run(finishInventory, { counts: { [created.wine.id]: value } }, { id: round.session_id }), rejected(400));
  }
  await assert.rejects(run(finishInventory, { counts: { unknown: 0 } }, { id: round.session_id }), rejected(400));
  const finish = () => run(finishInventory, { counts: { [created.wine.id]: 1 }, resolve: 'remove_missing' }, { id: round.session_id });
  const results = await Promise.allSettled([finish(), finish()]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.status, 409);
  const before = rows('bottles');
  await assert.rejects(finish(), rejected(409));
  assert.deepEqual(rows('bottles'), before);
  assert.equal(before.filter((r) => r.status === 'in_cellar').length, 1);
});

test('inventory rejects old sessions and rolls back all bottle changes on database failure', async (t) => {
  const { env, user, run, rows } = await fixture(t);
  const created = await run(createWine, { name: 'Reserva', quantity: 2 });
  env.DB.raw.prepare("INSERT INTO inventory_sessions (id, started_by, expected, missing) VALUES ('legacy', ?, 2, '[]')").run(user.id);
  await assert.rejects(run(finishInventory, {}, { id: 'legacy' }), rejected(409));
  const round = await run(startInventory), before = rows('bottles');
  env.DB.raw.exec("CREATE TRIGGER fail_inventory BEFORE INSERT ON activity WHEN NEW.action = 'inventory.finished' BEGIN SELECT RAISE(ABORT, 'forced failure'); END");
  const finish = () => run(finishInventory, { counts: { [created.wine.id]: 1 }, resolve: 'remove_missing' }, { id: round.session_id });
  await assert.rejects(finish(), /forced failure/);
  assert.deepEqual(rows('bottles'), before);
  assert.equal(rows('inventory_sessions').find((r) => r.id === round.session_id).finished_at, null);
  env.DB.raw.exec('DROP TRIGGER fail_inventory');
  assert.equal((await finish()).missing, 1);
});

test('producer merge preserves notes and full source profiles, with conflict and rollback protection', async (t) => {
  const { env, user, run, rows } = await fixture(t);
  await run(createWine, { name: 'Reserva', producer: 'Beta', producer_as_typed: true });
  env.DB.raw.prepare('INSERT INTO producers (id, name, name_key, notes, description, latitude, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run('a', 'Alpha', 'alpha', 'Notitie A', 'Profiel A', 1, user.id);
  env.DB.raw.prepare('INSERT INTO producers (id, name, name_key, notes, description, latitude, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run('b', 'Beta', 'beta', 'Notitie B', 'Profiel B', 2, user.id);
  const before = rows('producers');
  env.DB.raw.exec("CREATE TRIGGER fail_merge BEFORE DELETE ON producers BEGIN SELECT RAISE(ABORT, 'forced failure'); END");
  await assert.rejects(run(mergeProducers, { target: 'Alpha', names: ['Alpha', 'Beta'] }), /forced failure/);
  assert.deepEqual(rows('producers'), before);
  assert.equal(rows('wines')[0].producer, 'Beta');
  env.DB.raw.exec('DROP TRIGGER fail_merge');
  const batch = env.DB.batch;
  env.DB.batch = (statements) => {
    env.DB.raw.exec("UPDATE producers SET notes = 'Nieuwe notitie B' WHERE id = 'b'");
    return batch(statements);
  };
  await assert.rejects(run(mergeProducers, { target: 'Alpha', names: ['Alpha', 'Beta'] }), rejected(409));
  assert.equal(rows('producers').length, 2);
  env.DB.batch = batch;
  await run(mergeProducers, { target: 'Alpha', names: ['Alpha', 'Beta'] });
  assert.equal(rows('producers').length, 1);
  assert.match(rows('producers')[0].notes, /Notitie A/);
  assert.match(rows('producers')[0].notes, /Nieuwe notitie B/);
  const archived = JSON.parse(rows('activity').find((r) => r.action === 'producer.merged').details).profiles;
  assert.equal(archived.find((p) => p.id === 'b').description, 'Profiel B');
  const notes = rows('producers')[0].notes;
  await run(updateProducer, { description: 'Aangepast profiel' }, { id: 'a' });
  assert.equal(rows('producers')[0].notes, notes);
});

test('producer merge refuses notes that would exceed the editable limit without changing profiles', async (t) => {
  const { env, run, rows } = await fixture(t);
  for (const name of ['Alpha', 'Beta']) env.DB.raw.prepare('INSERT INTO producers (id, name, name_key, notes) VALUES (?, ?, ?, ?)').run(name, name, name.toLowerCase(), 'x'.repeat(3000));
  const before = rows('producers');
  await assert.rejects(run(mergeProducers, { target: 'Alpha', names: ['Alpha', 'Beta'] }), rejected(409));
  assert.deepEqual(rows('producers'), before);
});

test('empty and invalid AI prices retain previous estimates; a valid result still updates them', async (t) => {
  const { env, run, rows } = await fixture(t);
  env.AI_API_KEY = 'synthetic-test-key';
  const created = await run(createWine, { name: 'Reserva', estimated_price: 25, estimated_price_min: 20, estimated_price_max: 30 });
  const before = rows('wines');
  let content;
  t.mock.method(globalThis, 'fetch', async () => Response.json({ choices: [{ message: { content } }] }));
  for (content of [null, '', '{}', 'null', '[]', '{"price_eur":25}', '{"price_eur":true,"min_eur":0,"max_eur":30}', '{"price_eur":25,"min_eur":30,"max_eur":20}']) {
    await assert.rejects(run(priceEstimate, { wine_id: created.wine.id }), rejected(502));
    assert.deepEqual(rows('wines'), before);
  }
  content = '{"price_eur":28,"min_eur":24,"max_eur":32,"confidence":0.5}';
  await run(priceEstimate, { wine_id: created.wine.id });
  assert.equal(rows('wines')[0].estimated_price, 28);
});
