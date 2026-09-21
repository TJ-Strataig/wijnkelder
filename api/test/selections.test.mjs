import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('selecties schema is present in bootstrap schema and idempotent migration', async () => {
  const [schema, migration] = await Promise.all([
    readFile(new URL('../schema.sql', import.meta.url), 'utf8'),
    readFile(new URL('../migrations/0006_selecties.sql', import.meta.url), 'utf8'),
  ]);
  for (const source of [schema, migration]) {
    assert.match(source, /CREATE TABLE IF NOT EXISTS selections/);
    assert.match(source, /CREATE TABLE IF NOT EXISTS selection_wines/);
    assert.match(source, /PRIMARY KEY \(selection_id, wine_id\)/);
  }
  assert.match(migration, /ON DELETE CASCADE/);
});

test('selection endpoints are registered for CRUD and wine links', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  for (const endpoint of [
    "'/api/selections'", "'/api/selections/:id'", "'/api/selections/:id/wines'",
    "'/api/selections/:id/wines/:wineId'",
  ]) assert.match(source, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('selecties frontend has list/detail routes and reachable navigation link', async () => {
  const [app, view] = await Promise.all([
    readFile(new URL('../../web/js/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../../web/js/views/selections.js', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /selecties/);
  assert.match(app, /views\/selections\.js/);
  for (const action of ['Nieuwe selectie', 'Hernoemen', 'Verwijderen', 'Wijn toevoegen']) assert.match(view, new RegExp(action));
});
