import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const schema = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/0009_rekken_vakken.sql', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const wines = fs.readFileSync(new URL('../src/wines.js', import.meta.url), 'utf8');

test('rekken en vakken staan in schema en migration met legacy location behouden', () => {
  for (const name of ['cellar_locations', 'racks', 'slots']) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${name}`));
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${name}`));
  }
  assert.match(schema, /location\s+TEXT/);
  assert.match(schema, /slot_id\s+TEXT/);
  assert.match(migration, /ALTER TABLE bottles ADD COLUMN slot_id/);
});

test('locatie-API routes zijn authenticated en occupancy filtert op in_cellar', () => {
  for (const route of ['/api/locations', '/api/locations/:locationId/racks', '/api/racks/:rackId/slots', '/api/occupancy', '/api/locations/legacy']) {
    assert.match(index, new RegExp(`['"]${route.replaceAll('/', '\\/')}['"]`));
  }
  assert.match(wines, /validateSlot/);
});
