import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probeApi, probeConfig, probeContext } from '../scripts/cloudflare-deploy-probe.mjs';

const env = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'TJ-Strataig/wijnkelder',
  GITHUB_REF: 'refs/heads/tj-strataig-ontwikkelbasis-herstellen',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_RUN_ID: '12345',
  GITHUB_RUN_ATTEMPT: '1',
  CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
  CLOUDFLARE_API_TOKEN: 'unit-test-token',
};
const context = probeContext(env);
const missing = { status: 404, body: { success: false, errors: [{ code: 10007 }] } };
const success = { status: 200, body: { success: true, result: {} } };

function mockApi(replies) {
  const requests = [];
  const api = probeApi(context, async (url, options) => {
    assert.ok(url.startsWith(`https://api.cloudflare.com/client/v4/accounts/${context.account}/workers/scripts/${context.name}`));
    assert.equal(options.headers.Authorization, 'Bearer unit-test-token');
    requests.push({ method: options.method, suffix: url.split(context.name)[1] });
    const reply = replies.shift();
    assert.ok(reply, 'Geen onverwachte Cloudflare-aanroepen');
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  });
  return { api, requests };
}

test('proef: unieke naam per run en poging, geen productieconfiguratie of publiek adres', () => {
  assert.equal(context.name, 'wijnkelder-probe-12345-1');
  assert.notEqual(probeContext({ ...env, GITHUB_RUN_ATTEMPT: '2' }).name, context.name);
  assert.deepEqual(probeConfig(context.name), {
    name: context.name, main: './worker.mjs', compatibility_date: '2026-09-01',
    workers_dev: false, preview_urls: false, routes: [], triggers: { crons: [] },
    observability: { enabled: false },
  });
});

test('proef: main, andere branches/repos, pull requests en lokale uitvoering worden geweigerd', () => {
  for (const override of [
    { GITHUB_REF: 'refs/heads/main' }, { GITHUB_REF: 'refs/heads/anders' },
    { GITHUB_REPOSITORY: 'ander/repo' }, { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_ACTIONS: 'false' }, { GITHUB_RUN_ID: '../wijnkelder-api' },
    { GITHUB_RUN_ATTEMPT: '' }, { CLOUDFLARE_ACCOUNT_ID: '' }, { CLOUDFLARE_API_TOKEN: '' },
  ]) assert.throws(() => probeContext({ ...env, ...override }));
});

test('proef: productie- en willekeurige workernamen zijn verboden, ook bij cleanup', () => {
  for (const name of ['wijnkelder-api', 'wijnkelder-probe', '../wijnkelder-api']) {
    assert.throws(() => probeConfig(name));
    assert.throws(() => probeApi({ ...context, name }));
  }
});

test('proef: alleen expliciet ontbrekende worker geldt als vrije naam', async () => {
  await mockApi([missing]).api.requireAbsent();
  await assert.rejects(mockApi([success]).api.requireAbsent(), /bestaat al/);
  for (const reply of [
    { status: 403, body: { success: false, errors: [{ code: 10007 }] } },
    { status: 404, body: { success: false, errors: [{ code: 999 }] } },
    { status: 500, body: { success: false } },
  ]) await assert.rejects(mockApi([reply]).api.requireAbsent(), /mislukt/);
});

test('proef: publicatie vereist een bestaande deployment', async () => {
  await mockApi([{ status: 200, body: { success: true, result: { deployments: [{ id: 'test' }] } } }]).api.verify();
  await assert.rejects(mockApi([success]).api.verify(), /Geen deployment/);
  await assert.rejects(mockApi([{ status: 200, body: { success: true, result: { deployments: [] } } }]).api.verify(), /Geen deployment/);
});

test('proef: cleanup verwijdert uitsluitend de testworker en bevestigt afwezigheid', async () => {
  const { api, requests } = mockApi([success, success, missing]);
  await api.cleanup();
  assert.deepEqual(requests, [
    { method: 'GET', suffix: '/settings' },
    { method: 'DELETE', suffix: '' },
    { method: 'GET', suffix: '/settings' },
  ]);
});

test('proef: geen onnodige delete bij al ontbrekende worker', async () => {
  const { api, requests } = mockApi([missing]);
  await api.cleanup();
  assert.equal(requests.length, 1);
});

test('proef: opruimfouten en een achtergebleven worker blijven zichtbaar', async () => {
  await assert.rejects(mockApi([success, { status: 403, body: { success: false } }]).api.cleanup(), /mislukt/);
  await assert.rejects(mockApi([success, success, success]).api.cleanup(), /bestaat al/);
});
