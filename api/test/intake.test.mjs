import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { makeEnv, seedUser, call, req } from './harness.mjs';

async function uploadPng(env, token) {
  const png = new Uint8Array(200); png.set([0x89, 0x50, 0x4e, 0x47]);
  const up = await worker.fetch(req('/api/photos', { method: 'POST', token, body: png.buffer, headers: { 'Content-Type': 'image/png' } }), env, {});
  return (await up.json()).key;
}
const cellarCount = async (env) => (await env.DB.prepare("SELECT COUNT(*) AS n FROM bottles WHERE status = 'in_cellar'").first()).n;

test('beoordelingswachtrij: niets in de kelder zonder goedkeuring; goedkeuren met eigen prijs per fles; duplicaat; overslaan; opruimen', async () => {
  const env = makeEnv(); const tije = await seedUser(env, { name: 'Tije' }); const angela = await seedUser(env, { name: 'Angela', role: 'member' });
  // Telefoon: drie foto's in de wachtrij, met gedeelde partijgegevens (geen prijs)
  const batch = { purchase_date: '2026-09-07', purchase_place: 'Gall & Gall', location: 'Rek C', gifted: false };
  const k1 = await uploadPng(env, tije.token), k2 = await uploadPng(env, tije.token), k3 = await uploadPng(env, tije.token);
  const a = await call(worker, env, '/api/intake', { method: 'POST', token: tije.token, body: { label_image_key: k1, batch_label: 'Gall & Gall · 2026-09-07', bottle: { ...batch, quantity: 1 }, wine: { name: 'Crianza', producer: 'Bodega Test', type: 'rood', vintage: 2021 }, confidence: 0.9 } });
  const b = await call(worker, env, '/api/intake', { method: 'POST', token: tije.token, body: { label_image_key: k2, batch_label: 'Gall & Gall · 2026-09-07', bottle: { ...batch, quantity: 1 }, wine: { name: 'Crianza', producer: 'Bodega Test', type: 'rood', vintage: 2021 }, confidence: 0.8 } });
  const c = await call(worker, env, '/api/intake', { method: 'POST', token: tije.token, body: { label_image_key: k3, batch_label: 'Gall & Gall · 2026-09-07', bottle: { ...batch, quantity: 1 } } }); // herkenning mislukt → pending
  assert.equal(a.status, 201); assert.equal(a.json.status, 'recognized'); assert.equal(c.json.status, 'pending');
  assert.equal(await cellarCount(env), 0, 'wachtrij mag niets in de kelder zetten');
  // ongeldige fotosleutel geweigerd
  assert.equal((await call(worker, env, '/api/intake', { method: 'POST', token: tije.token, body: { label_image_key: 'labels/x.jpg' } })).status, 400);

  // Desktop (ander huishoudlid): wachtrij zien
  const list = await call(worker, env, '/api/intake', { token: angela.token });
  assert.equal(list.json.counts.recognized, 2); assert.equal(list.json.counts.pending, 1);
  assert.ok(list.json.items[0].label_image_url);

  // Goedkeuren #1 met gecontroleerde gegevens en EIGEN prijs (partij had geen prijs), 6 flessen
  const ap1 = await call(worker, env, `/api/intake/${a.json.id}/approve`, { method: 'POST', token: angela.token, body: { wine: { name: 'Crianza', producer: 'Bodega Test', type: 'rood', vintage: 2021, grapes: ['Tempranillo'] }, bottle: { ...batch, quantity: 6, price: 9.95 } } });
  assert.equal(ap1.status, 200);
  assert.equal(await cellarCount(env), 6);
  const w = await call(worker, env, `/api/wines/${ap1.json.wine_id}`, { token: tije.token });
  assert.equal(w.json.bottles[0].price, 9.95); assert.equal(w.json.bottles[0].location, 'Rek C'); assert.equal(w.json.bottles[0].purchase_place, 'Gall & Gall');
  assert.ok(w.json.wine.label_image_url, 'foto uit de wachtrij hangt aan de wijn');
  // nog eens goedkeuren → geweigerd
  assert.equal((await call(worker, env, `/api/intake/${a.json.id}/approve`, { method: 'POST', token: tije.token, body: {} })).status, 409);

  // #2 is een duplicaat → flessen bijboeken op bestaande wijn met andere prijs
  const ap2 = await call(worker, env, `/api/intake/${b.json.id}/approve`, { method: 'POST', token: tije.token, body: { bottle: { ...batch, quantity: 2, price: 11.5 }, existing_wine_id: ap1.json.wine_id } });
  assert.equal(ap2.status, 200); assert.equal(ap2.json.wine_id, ap1.json.wine_id);
  assert.equal(await cellarCount(env), 8);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM wines').first()).n, 1);

  // #3: handmatig invullen + bewaren zonder goed te keuren → nog steeds 8 flessen
  assert.equal((await call(worker, env, `/api/intake/${c.json.id}`, { method: 'PATCH', token: tije.token, body: { wine: { name: 'Onbekende wit', type: 'wit' }, status: 'recognized' } })).status, 200);
  assert.equal(await cellarCount(env), 8);
  // ongeldige status geweigerd; 'approved' mag niet via PATCH
  assert.equal((await call(worker, env, `/api/intake/${c.json.id}`, { method: 'PATCH', token: tije.token, body: { status: 'approved' } })).status, 400);
  // overslaan
  assert.equal((await call(worker, env, `/api/intake/${c.json.id}`, { method: 'PATCH', token: tije.token, body: { status: 'skipped' } })).status, 200);
  // goedkeuren zonder naam → 400
  const d = await call(worker, env, '/api/intake', { method: 'POST', token: tije.token, body: { label_image_key: null } });
  assert.equal((await call(worker, env, `/api/intake/${d.json.id}/approve`, { method: 'POST', token: tije.token, body: {} })).status, 400);
  // opruimen verwijdert approved+skipped, laat pending staan
  const cl = await call(worker, env, '/api/intake/cleanup', { method: 'POST', token: tije.token });
  assert.equal(cl.json.removed, 3);
  const after = await call(worker, env, '/api/intake', { token: tije.token });
  assert.equal(after.json.items.length, 1); assert.equal(after.json.items[0].status, 'pending');
  // verwijderen ruimt losse foto op
  await call(worker, env, `/api/intake/${d.json.id}`, { method: 'DELETE', token: tije.token });
  assert.equal((await call(worker, env, '/api/intake', { token: tije.token })).json.items.length, 0);
  // zonder login niets
  assert.equal((await call(worker, env, '/api/intake')).status, 401);
  assert.equal(await cellarCount(env), 8, 'eindstand ongewijzigd');
});
