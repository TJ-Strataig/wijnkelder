// Wijnkelder API — Cloudflare Worker
// Router met authenticatie (passkeys), autorisatie (admin/member), CORS en beveiligingsheaders.
import { HttpError, json, corsHeaders, SECURITY_HEADERS } from './util.js';
import * as auth from './auth.js';
import * as wines from './wines.js';
import * as ai from './ai.js';
import * as origin from './origin.js';
import * as intake from './intake.js';
import * as insights from './insights.js';
import * as som from './sommelier.js';

const routes = [];
function route(method, pattern, handler, { auth: needsAuth = true, admin = false } = {}) {
  routes.push({ method, pattern: new URLPattern({ pathname: pattern }), handler, needsAuth, admin });
}

// --- publiek (alleen voor inloggen/registreren) ---
route('GET',  '/api/health', () => json({ ok: true }), { auth: false });
route('GET',  '/api/auth/status', auth.bootstrapStatus, { auth: false });
route('POST', '/api/auth/register/options', auth.registerOptions, { auth: false });
route('POST', '/api/auth/register/verify', auth.registerVerify, { auth: false });
route('POST', '/api/auth/login/options', auth.loginOptions, { auth: false });
route('POST', '/api/auth/login/verify', auth.loginVerify, { auth: false });
route('GET',  '/api/photos/:key+', wines.getPhoto, { auth: false }); // beveiligd met ondertekende, verlopende link

// --- ingelogd ---
route('GET',    '/api/auth/me', auth.me);
route('POST',   '/api/auth/logout', auth.logout);
route('POST',   '/api/auth/logout-everywhere', auth.logoutEverywhere);
route('GET',    '/api/auth/passkeys', auth.listMyPasskeys);
route('POST',   '/api/auth/passkeys/options', auth.addPasskeyOptions);
route('POST',   '/api/auth/passkeys/verify', auth.addPasskeyVerify);
route('DELETE', '/api/auth/passkeys/:id', auth.deleteMyPasskey);

route('GET',    '/api/wines', wines.listWines);
route('POST',   '/api/wines', wines.createWine);
route('POST',   '/api/wines/check-duplicate', wines.checkDuplicate);
route('GET',    '/api/wines/:id', wines.getWine);
route('PUT',    '/api/wines/:id', wines.updateWine);
route('DELETE', '/api/wines/:id', wines.deleteWine);
route('POST',   '/api/wines/:id/favorite', wines.toggleFavorite);
route('POST',   '/api/wines/:id/bottles', wines.addBottles);
route('PUT',    '/api/wines/:id/bottles/:bottleId', wines.updateBottle);
route('POST',   '/api/wines/:id/bottles/:bottleId/remove', wines.removeBottle);
route('POST',   '/api/wines/:id/bottles/:bottleId/restore', wines.restoreBottle);
route('POST',   '/api/wines/:id/tastings', wines.addTasting);
route('DELETE', '/api/wines/:id/tastings/:tastingId', wines.deleteTasting);
route('GET',    '/api/tastings', wines.listTastings);
route('GET',    '/api/history', wines.history);
route('GET',    '/api/stats', wines.stats);
route('GET',    '/api/wishlist', wines.listWishlist);
route('POST',   '/api/wishlist', wines.addWishlist);
route('DELETE', '/api/wishlist/:id', wines.deleteWishlist);
route('GET',    '/api/export.json', wines.exportAll);
route('GET',    '/api/export.csv', wines.exportCsv);
route('POST',   '/api/photos', wines.uploadPhoto);
route('DELETE', '/api/photos/:key+', wines.deletePhoto);

route('POST',   '/api/ai/recognize', ai.recognize);
route('POST',   '/api/ai/enrich', ai.enrich);
route('POST',   '/api/ai/price', ai.priceEstimate);
route('POST',   '/api/ai/pair', ai.pairFromCellar);
route('POST',   '/api/ai/dishes', ai.dishesForWine);
route('GET',    '/api/ai/settings', ai.getAiSettings);

route('GET',    '/api/intake', intake.listIntake);
route('POST',   '/api/intake', intake.addIntake);
route('POST',   '/api/intake/cleanup', intake.cleanupIntake);
route('PATCH',  '/api/intake/:id', intake.updateIntake);
route('POST',   '/api/intake/:id/approve', intake.approveIntake);
route('DELETE', '/api/intake/:id', intake.deleteIntake);

route('GET',    '/api/insights/taste', insights.tasteProfiles);
route('GET',    '/api/insights/price-quality', insights.priceQuality);
route('GET',    '/api/insights/year', insights.yearReview);
route('GET',    '/api/targets', insights.listTargets);
route('POST',   '/api/targets', insights.createTarget);
route('DELETE', '/api/targets/:id', insights.deleteTarget);
route('POST',   '/api/inventory/start', insights.startInventory);
route('POST',   '/api/inventory/:id/finish', insights.finishInventory);
route('GET',    '/api/inventory', insights.inventoryHistory);
route('GET',    '/api/gifts', insights.gifts);
route('PATCH',  '/api/gifts/:bottleId', insights.updateGift);
route('GET',    '/api/barcode', insights.lookupBarcode);
route('PUT',    '/api/wines/:id/barcode', insights.setBarcode);
route('GET',    '/api/map/consumed', insights.mapConsumed);
route('GET',    '/api/notifications', insights.listNotifications);
route('POST',   '/api/notifications/read', insights.markNotificationsRead);
route('GET',    '/api/notifications/prefs', som.getNotificationPrefs);
route('PUT',    '/api/notifications/prefs', som.setNotificationPrefs);
route('POST',   '/api/notifications/subscribe', som.subscribePush);
route('DELETE', '/api/notifications/subscribe/:id', som.unsubscribePush);
route('POST',   '/api/notifications/test', som.testPush);
route('POST',   '/api/sommelier/tonight', som.tonight);
route('POST',   '/api/sommelier/restaurant', som.restaurant);

route('GET',    '/api/map', origin.mapData);
route('POST',   '/api/map/geocode', origin.geocode);
route('PUT',    '/api/wines/:id/location', origin.setWineLocation);
route('GET',    '/api/producers', origin.listProducers);
route('GET',    '/api/producers/by-name', origin.getProducer);
route('POST',   '/api/producers/profile', origin.buildProducerProfile);
route('PATCH',  '/api/producers/:id', origin.updateProducer);

// --- alleen beheerder ---
route('GET',    '/api/admin/users', auth.listUsers, { admin: true });
route('POST',   '/api/admin/invites', auth.createInvite, { admin: true });
route('DELETE', '/api/admin/invites/:id', auth.revokeInvite, { admin: true });
route('PATCH',  '/api/admin/users/:id', auth.updateUser, { admin: true });
route('DELETE', '/api/admin/users/:id', auth.deleteUser, { admin: true });
route('PUT',    '/api/ai/settings', ai.saveAiSettings, { admin: true });
route('DELETE', '/api/ai/settings', ai.deleteAiSettings, { admin: true });
route('POST',   '/api/ai/test', ai.testAi, { admin: true });

export default {
  async fetch(req, env, ctx) {
    const cors = corsHeaders(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, ...SECURITY_HEADERS } });

    const url = new URL(req.url);
    try {
      // CORS-afdwinging: verzoeken met een Origin-header moeten van de webapp komen.
      const origin = req.headers.get('Origin');
      if (origin && !cors['Access-Control-Allow-Origin'] && !url.pathname.startsWith('/api/photos/')) {
        throw new HttpError(403, 'Oorsprong niet toegestaan.');
      }

      let match = null;
      let methodMismatch = false;
      for (const r of routes) {
        const m = r.pattern.exec(url);
        if (!m) continue;
        if (r.method !== req.method) { methodMismatch = true; continue; }
        match = { r, params: m.pathname.groups };
        break;
      }
      if (!match) throw new HttpError(methodMismatch ? 405 : 404, methodMismatch ? 'Methode niet toegestaan.' : 'Niet gevonden.');

      let user = null;
      if (match.r.needsAuth) {
        user = await auth.authenticate(env, req);
        if (!user) throw new HttpError(401, 'Niet ingelogd.');
        if (match.r.admin && user.role !== 'admin') throw new HttpError(403, 'Alleen voor beheerders.');
      }

      const res = await match.r.handler(req, env, { params: match.params, user, ctx });
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(cors)) headers.set(k, v);
      return new Response(res.body, { status: res.status, headers });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status >= 500) console.error(e);
      const message = e instanceof HttpError ? e.message : 'Er ging iets mis op de server.';
      return json({ error: message, ...(e instanceof HttpError && e.extra ? e.extra : {}) }, status, cors);
    }
  },

  // Elk uur: meldingen (wekelijkse sommelier-push, drinkvensters, voorraad); dagelijks opruimen.
  async scheduled(event, env, ctx) {
    try { await som.runScheduledNotifications(env); } catch (e) { console.error('notifications', e); }
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at < ? OR absolute_expires_at < ?').bind(now, now),
      env.DB.prepare('DELETE FROM challenges WHERE expires_at < ?').bind(now),
      env.DB.prepare('DELETE FROM invites WHERE used_at IS NULL AND expires_at < ?').bind(now),
      env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(Math.floor(Date.now() / 1000) - 86400),
    ]);
  },
};
