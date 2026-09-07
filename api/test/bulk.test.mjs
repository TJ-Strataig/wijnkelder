import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { makeEnv, seedUser, call, req } from './harness.mjs';

// Simuleert wat de bulk-invoer doet bij "Goedkeuren": foto uploaden, wijn aanmaken met flessen; bij duplicaat flessen bijboeken.
test('bulk-goedkeuring: nieuwe wijn met foto en flessen; duplicaat voegt flessen toe; niets zonder goedkeuring', async () => {
  const env = makeEnv(); const u = await seedUser(env);
  // Herkenning alleen → er verandert niets in de kelder (geen AI geconfigureerd → 503, maar ook geen writes)
  const rec = await call(worker, env, '/api/ai/recognize', { method: 'POST', token: u.token, body: { image: 'data:image/jpeg;base64,' + 'A'.repeat(200) } });
  assert.equal(rec.status, 503);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM wines').first()).n, 0);

  // Goedkeuring fles 1: foto + nieuwe wijn, 3 flessen, gedeelde aankoopgegevens
  const png = new Uint8Array(200); png.set([0x89, 0x50, 0x4e, 0x47]);
  const up = await worker.fetch(req('/api/photos', { method: 'POST', token: u.token, body: png.buffer, headers: { 'Content-Type': 'image/png' } }), env, {});
  const { key } = await up.json();
  const bottle = { quantity: 3, price: 14.95, purchase_date: '2026-09-07', purchase_place: 'Gall & Gall', location: 'Rek B' };
  const r1 = await call(worker, env, '/api/wines', { method: 'POST', token: u.token, body: { name: 'Crianza', producer: 'Bodega Test', type: 'rood', vintage: 2021, grapes: ['Tempranillo'], label_image_key: key, quantity: 3, bottle } });
  assert.equal(r1.status, 200);
  assert.equal(r1.json.bottles.length, 3);
  assert.equal(r1.json.bottles[0].location, 'Rek B');
  assert.equal(r1.json.bottles[0].price, 14.95);
  assert.ok(r1.json.wine.label_image_url);

  // Goedkeuring fles 2 = zelfde wijn (duplicaat herkend door de app) → flessen bijboeken
  const r2 = await call(worker, env, `/api/wines/${r1.json.wine.id}/bottles`, { method: 'POST', token: u.token, body: { ...bottle, quantity: 2 } });
  assert.equal(r2.status, 200);
  assert.equal(r2.json.bottles.filter((b) => b.status === 'in_cellar').length, 5);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM wines').first()).n, 1, 'geen dubbele wijn aangemaakt');

  // Overgeslagen fles: niets gebeurt (er is geen server-actie) → nog steeds 1 wijn, 5 flessen
  const list = await call(worker, env, '/api/wines', { token: u.token });
  assert.equal(list.json.wines.length, 1);
  assert.equal(list.json.wines[0].bottles_in_cellar, 5);
});
