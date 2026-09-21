import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('avonden schema and idempotent migration define planning fields', async () => {
  const [schema, migration] = await Promise.all([
    readFile(new URL('../schema.sql', import.meta.url), 'utf8'),
    readFile(new URL('../migrations/0007_avonden.sql', import.meta.url), 'utf8'),
  ]);
  for (const source of [schema, migration]) {
    assert.match(source, /CREATE TABLE IF NOT EXISTS evenings/);
    for (const field of ['starts_at', 'ends_at', 'kind', 'status', 'selection_id']) assert.match(source, new RegExp(`\\b${field}\\b`));
  }
  assert.match(migration, /CREATE INDEX IF NOT EXISTS/);
});

test('avonden API endpoints and frontend routes are registered', async () => {
  const [api, app, view] = await Promise.all([
    readFile(new URL('../src/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../../web/js/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../../web/js/views/evenings.js', import.meta.url), 'utf8'),
  ]);
  for (const endpoint of ["'/api/evenings'", "'/api/evenings/:id'"]) assert.match(api, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(app, /\/avonden/);
  for (const action of ['Nieuwe avond', 'Bewerken', 'Verwijderen', 'Selectie']) assert.match(view, new RegExp(action));
});
