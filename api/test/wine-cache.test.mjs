import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const requests = [];
await mock.module('../../web/js/api.js', { namedExports: { api: {
  get: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
} } });
const { loadWines, invalidateWines } = await import('../../web/js/data.js');

test('wine cache deduplicates requests and ignores responses from before invalidation or refresh', async () => {
  invalidateWines();
  const old = loadWines(), same = loadWines();
  assert.equal(requests.length, 1);
  invalidateWines();
  const fresh = loadWines();
  requests[1].resolve({ wines: ['fresh'] });
  await fresh;
  requests[0].resolve({ wines: ['old'] });
  await Promise.all([old, same]);
  assert.deepEqual(await loadWines(), ['fresh']);
  const force1 = loadWines({ force: true }), force2 = loadWines({ force: true });
  requests[3].resolve({ wines: ['newest'] });
  await force2;
  requests[2].resolve({ wines: ['outdated'] });
  await force1;
  assert.deepEqual(await loadWines(), ['newest']);
  invalidateWines();
  const failed = loadWines();
  requests[4].reject(new Error('offline'));
  await assert.rejects(failed, /offline/);
  const retry = loadWines();
  requests[5].resolve({ wines: ['retry'] });
  assert.deepEqual(await retry, ['retry']);
});
