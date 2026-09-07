// Gedeelde gegevenscache voor de wijnlijst.
import { api } from './api.js';

const cache = { wines: null, at: 0 };

export async function loadWines({ force = false } = {}) {
  if (!force && cache.wines && Date.now() - cache.at < 60_000) return cache.wines;
  const { wines } = await api.get('/api/wines?all=1');
  cache.wines = wines;
  cache.at = Date.now();
  return wines;
}

export function invalidateWines() { cache.wines = null; }
