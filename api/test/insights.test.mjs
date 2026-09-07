import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { makeEnv, seedUser, call } from './harness.mjs';

async function seedCellar(env, tije, angela) {
  const mk = (body) => call(worker, env, '/api/wines', { method: 'POST', token: tije.token, body });
  const a = (await mk({ name: 'Crianza', producer: 'Muga', type: 'rood', vintage: 2020, grapes: ['Tempranillo'], country: 'Spanje', region: 'Rioja', quantity: 6, bottle: { price: 12 }, drink_from: 2023, drink_until: 2028, peak_from: 2026, peak_until: 2027 })).json;
  const b = (await mk({ name: 'Grand Cru', producer: 'Leflaive', type: 'wit', vintage: 2018, grapes: ['Chardonnay'], country: 'Frankrijk', region: 'Bourgogne', quantity: 1, bottle: { price: 180 }, drink_from: 2024, drink_until: 2032 })).json;
  const c = (await mk({ name: 'Prosecco', producer: 'Nino Franco', type: 'mousserend', vintage: null, grapes: ['Glera'], country: 'Italië', region: 'Veneto', quantity: 3, bottle: { price: 14, gifted: true, gifted_from: 'Oma' } })).json;
  // proefnotities: Tije houdt van Rioja, Angela van Bourgogne
  await call(worker, env, `/api/wines/${a.wine.id}/tastings`, { method: 'POST', token: tije.token, body: { rating: 90, tasted_at: '2026-03-01', occasion: 'Zondag' } });
  await call(worker, env, `/api/wines/${a.wine.id}/tastings`, { method: 'POST', token: tije.token, body: { rating: 88, tasted_at: '2026-05-01' } });
  await call(worker, env, `/api/wines/${a.wine.id}/tastings`, { method: 'POST', token: angela.token, body: { rating: 76, tasted_at: '2026-03-01' } });
  await call(worker, env, `/api/wines/${a.wine.id}/tastings`, { method: 'POST', token: angela.token, body: { rating: 78, tasted_at: '2026-05-01' } });
  await call(worker, env, `/api/wines/${b.wine.id}/tastings`, { method: 'POST', token: angela.token, body: { rating: 95, tasted_at: '2026-06-01' } });
  await call(worker, env, `/api/wines/${b.wine.id}/tastings`, { method: 'POST', token: tije.token, body: { rating: 92, tasted_at: '2026-06-01' } });
  // een paar flessen drinken in 2026
  const rio = (await call(worker, env, `/api/wines/${a.wine.id}`, { token: tije.token })).json.bottles;
  await call(worker, env, `/api/wines/${a.wine.id}/bottles/${rio[0].id}/remove`, { method: 'POST', token: tije.token, body: { reason: 'consumed', date: '2026-03-01' } });
  await call(worker, env, `/api/wines/${a.wine.id}/bottles/${rio[1].id}/remove`, { method: 'POST', token: angela.token, body: { reason: 'consumed', date: '2026-05-01', note: 'Gedronken bij Thuis' } });
  return { a, b, c };
}

test('inzichten: smaakprofielen per persoon met verschillen, prijs-kwaliteit, jaaroverzicht', async () => {
  const env = makeEnv(); const tije = await seedUser(env, { name: 'Tije' }); const angela = await seedUser(env, { name: 'Angela', role: 'member' });
  await seedCellar(env, tije, angela);
  const taste = (await call(worker, env, '/api/insights/taste', { token: tije.token })).json;
  assert.equal(taste.perUser.length, 2);
  const t = taste.perUser.find((p) => p.user.name === 'Tije'), an = taste.perUser.find((p) => p.user.name === 'Angela');
  assert.equal(t.byGrape[0].label, 'Chardonnay'); // 92 > 89 gem.
  assert.equal(an.byRegion.find((r) => r.label === 'Rioja').avg, 77);
  assert.ok(taste.differences.some((d) => d.label === 'Rioja' && Math.abs(d.diff) >= 8), 'verschil Rioja moet zichtbaar zijn');
  assert.equal(taste.shared.length, 1); assert.equal(taste.shared[0].name, 'Grand Cru');
  const pq = (await call(worker, env, '/api/insights/price-quality', { token: tije.token })).json;
  assert.equal(pq.points.length, 2); assert.ok(pq.bestValue[0].name === 'Crianza', 'Rioja à € 12 met 83 gem. is de betere deal');
  const yr = (await call(worker, env, '/api/insights/year?year=2026', { token: tije.token })).json;
  assert.equal(yr.totals.consumed, 2); assert.equal(yr.totals.bought, 7); assert.equal(yr.totals.gifts_received, 3);
  assert.equal(yr.best.rating, 95); assert.equal(yr.best.by, 'Angela'); assert.equal(yr.places[0].label, 'Thuis');
  assert.equal(yr.perPerson.length, 2);
});

test('voorraaddoelen, inventarisatie, cadeaus, streepjescode, meldingen, laatste fles', async () => {
  const env = makeEnv(); const tije = await seedUser(env, { name: 'Tije' }); const angela = await seedUser(env, { name: 'Angela', role: 'member' });
  const { a, b, c } = await seedCellar(env, tije, angela);
  // Voorraaddoel: minimaal 6 witte wijnen onder € 15 → tekort 6 (de Leflaive is te duur)
  await call(worker, env, '/api/targets', { method: 'POST', token: tije.token, body: { label: 'Doordeweeks wit', type: 'wit', max_price: 15, min_bottles: 6 } });
  await call(worker, env, '/api/targets', { method: 'POST', token: tije.token, body: { label: 'Rioja voorraad', region: 'Rioja', min_bottles: 3 } });
  const tg = (await call(worker, env, '/api/targets', { token: tije.token })).json;
  assert.equal(tg.targets[0].shortage, 6); assert.equal(tg.targets[1].ok, true); assert.equal(tg.targets[1].in_stock, 4);
  assert.equal((await call(worker, env, '/api/targets', { method: 'POST', token: tije.token, body: { label: 'X', type: 'paars' } })).status, 400);
  // Inventarisatie: 1 Rioja niet gevonden
  const inv = (await call(worker, env, '/api/inventory/start', { method: 'POST', token: tije.token, body: {} })).json;
  assert.equal(inv.expected, 8);
  const counts = {}; counts[a.wine.id] = 3; // er zouden 4 moeten zijn
  const fin = (await call(worker, env, `/api/inventory/${inv.session_id}/finish`, { method: 'POST', token: tije.token, body: { counts, resolve: 'remove_missing' } })).json;
  assert.equal(fin.missing, 1); assert.equal(fin.seen, 7);
  assert.equal((await call(worker, env, `/api/wines/${a.wine.id}`, { token: tije.token })).json.wine.bottles_in_cellar, 3);
  const hist = (await call(worker, env, '/api/history', { token: tije.token })).json;
  assert.ok(hist.bottles.some((x) => /inventarisatie/i.test(x.removed_note || '')));
  // Cadeaus
  const gifts = (await call(worker, env, '/api/gifts', { token: tije.token })).json;
  assert.equal(gifts.givers[0].giver, 'Oma'); assert.equal(gifts.givers[0].bottles, 3);
  const pros = (await call(worker, env, `/api/wines/${c.wine.id}`, { token: tije.token })).json.bottles;
  await call(worker, env, `/api/gifts/${pros[0].id}`, { method: 'PATCH', token: tije.token, body: { gift_occasion: 'Kerst 2025' } });
  await call(worker, env, `/api/wines/${c.wine.id}/bottles/${pros[0].id}/remove`, { method: 'POST', token: tije.token, body: { reason: 'consumed' } });
  const g2 = (await call(worker, env, '/api/gifts', { token: tije.token })).json;
  assert.equal(g2.to_thank.length, 1); assert.equal(g2.to_thank[0].gift_occasion, 'Kerst 2025');
  await call(worker, env, `/api/gifts/${pros[0].id}`, { method: 'PATCH', token: tije.token, body: { gift_thanked: true } });
  assert.equal((await call(worker, env, '/api/gifts', { token: tije.token })).json.to_thank.length, 0);
  // Streepjescode
  assert.equal((await call(worker, env, `/api/wines/${a.wine.id}/barcode`, { method: 'PUT', token: tije.token, body: { barcode: '8410123456789' } })).status, 200);
  assert.equal((await call(worker, env, `/api/wines/${b.wine.id}/barcode`, { method: 'PUT', token: tije.token, body: { barcode: '8410123456789' } })).status, 409, 'zelfde code op andere wijn geweigerd');
  assert.equal((await call(worker, env, `/api/wines/${b.wine.id}/barcode`, { method: 'PUT', token: tije.token, body: { barcode: '123' } })).status, 400);
  const found = (await call(worker, env, '/api/barcode?code=8410123456789', { token: tije.token })).json;
  assert.equal(found.found, true); assert.equal(found.wine.id, a.wine.id);
  // Laatste fles van een favoriet: Leflaive (score 93,5) heeft 1 fles
  const lef = (await call(worker, env, `/api/wines/${b.wine.id}`, { token: tije.token })).json.bottles[0];
  const rm = (await call(worker, env, `/api/wines/${b.wine.id}/bottles/${lef.id}/remove`, { method: 'POST', token: tije.token, body: { reason: 'consumed' } })).json;
  assert.ok(rm.last_bottle, 'laatste-fles-melding verwacht'); assert.equal(rm.last_bottle.on_wishlist, false);
  // Meldingsvoorkeuren + in-app meldingen + push-abonnement validatie
  assert.equal((await call(worker, env, '/api/notifications/prefs', { method: 'PUT', token: tije.token, body: { weekly_day: 5, weekly_hour: 17 } })).status, 200);
  assert.equal((await call(worker, env, '/api/notifications/subscribe', { method: 'POST', token: tije.token, body: { subscription: { endpoint: 'http://onveilig', keys: { p256dh: 'a', auth: 'b' } } } })).status, 400);
  const prefs = (await call(worker, env, '/api/notifications/prefs', { token: tije.token })).json;
  assert.equal(prefs.prefs.weekly_day, 5); assert.equal(prefs.push_available, false);
  // Kaartlaag gedronken (geen coördinaten → leeg, maar landen wel)
  const mc = (await call(worker, env, '/api/map/consumed', { token: tije.token })).json;
  assert.ok(mc.countries.find((x) => x.country === 'Spanje').consumed >= 2);
  // alles vereist login
  for (const p of ['/api/insights/taste', '/api/targets', '/api/gifts', '/api/notifications', '/api/map/consumed']) assert.equal((await call(worker, env, p)).status, 401);
});
