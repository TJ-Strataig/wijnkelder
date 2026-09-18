// Gedeelde gegevenscache voor de wijnlijst.
import { api } from './api.js';

const cache = { wines: null, at: 0 };
let generation = 0;
let pending = null;

export async function loadWines({ force = false } = {}) {
  if (!force && cache.wines && Date.now() - cache.at < 60_000) return cache.wines;
  if (!force && pending) return pending;
  const version = ++generation;
  const request = api.get('/api/wines?all=1').then(({ wines }) => {
    if (version === generation) {
      cache.wines = wines;
      cache.at = Date.now();
    }
    return wines;
  });
  pending = request;
  try { return await request; }
  finally { if (pending === request) pending = null; }
}

export function invalidateWines() { generation++; cache.wines = null; pending = null; }
