import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRelease, releaseScope, selectTargets } from '../scripts/release-scope.mjs';

const headSha = 'a'.repeat(40);
const baseSha = 'b'.repeat(40);
const push = { eventName: 'push', headSha, mainSha: headSha, baseSha };

test('release: web-only vereist geen API-publicatie', () => {
  assert.deepEqual(releaseScope({ ...push, paths: ['web/js/app.js'] }), { api: false, web: true });
});

test('release: API-only vereist geen Pages-publicatie', () => {
  assert.deepEqual(releaseScope({ ...push, paths: ['api/src/wines.js'] }), { api: true, web: false });
});

test('release: gecombineerde en infrastructuurwijzigingen selecteren beide onderdelen', () => {
  assert.deepEqual(selectTargets(['api/src/wines.js', 'web/js/app.js']), { api: true, web: true });
  assert.deepEqual(selectTargets(['.github/workflows/deploy.yml']), { api: true, web: true });
  assert.deepEqual(selectTargets(['.github/workflows/checks.yml']), { api: true, web: true });
});

test('release: vergelijking begint bij de laatste geslaagde release en negeert de eigen run en andere branches', async () => {
  const requests = [];
  let compared = false;
  const successful = { head_branch: 'main', status: 'completed', conclusion: 'success' };
  const result = await planRelease({ eventName: 'push', headSha, runId: '9' }, {
    github: async (path) => {
      requests.push(path);
      return path === 'git/ref/heads/main' ? { object: { sha: headSha } } : { workflow_runs: [
        { ...successful, id: 9, head_sha: headSha },
        { ...successful, id: 7, head_sha: 'd'.repeat(40), head_branch: 'feature' },
        { ...successful, id: 6, head_sha: baseSha },
      ] };
    },
    changedFiles: (from, to) => {
      compared = true;
      assert.equal(from, baseSha);
      assert.equal(to, headSha);
      return ['api/src/wines.js', 'web/css/app.css'];
    },
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[1], 'actions/workflows/deploy.yml/runs?branch=main&per_page=100');
  assert.ok(compared);
  assert.deepEqual(result, { api: true, web: true });
});

test('release: na een mislukte of geannuleerde release worden beide onderdelen hersteld, ook bij een revert', async () => {
  for (const conclusion of ['failure', 'cancelled']) {
    const result = await planRelease({ eventName: 'push', headSha, runId: '9' }, {
      github: async (path) => path === 'git/ref/heads/main' ? { object: { sha: headSha } } : { workflow_runs: [
        { id: 8, head_branch: 'main', status: 'completed', conclusion, head_sha: 'c'.repeat(40) },
        { id: 7, head_branch: 'main', status: 'completed', conclusion: 'success', head_sha: baseSha },
      ] },
      changedFiles: () => assert.fail('Een netto-diff kan een deels gepubliceerde, daarna teruggedraaide API-wijziging missen'),
    });
    assert.deepEqual(result, { api: true, web: true });
  }
});

test('release: eerste release en handmatige start publiceren beide onderdelen', () => {
  assert.deepEqual(releaseScope({ ...push, baseSha: null, paths: [] }), { api: true, web: true });
  assert.deepEqual(releaseScope({ ...push, eventName: 'workflow_dispatch', paths: [] }), { api: true, web: true });
});

test('release: een oude run of ongeldige commit mag niets publiceren', () => {
  assert.throws(() => releaseScope({ ...push, mainSha: 'c'.repeat(40), paths: [] }), /actuele main/);
  assert.throws(() => releaseScope({ ...push, headSha: '--help', paths: [] }), /actuele main/);
  assert.throws(() => releaseScope({ ...push, baseSha: '--help', paths: [] }), /Ongeldige versie/);
  assert.throws(() => releaseScope({ ...push, eventName: 'workflow_dispatch', mainSha: baseSha }), /actuele main/);
});

test('release: pull requests en onbekende gebeurtenissen mogen niet publiceren', () => {
  assert.throws(() => releaseScope({ ...push, eventName: 'pull_request', paths: [] }), /Alleen een push/);
  assert.throws(() => releaseScope({ ...push, eventName: 'schedule', paths: [] }), /Alleen een push/);
});

test('release: ongewijzigde onderdelen en documentatie worden niet gepubliceerd', () => {
  assert.deepEqual(selectTargets([]), { api: false, web: false });
  assert.deepEqual(selectTargets(['README.md', 'SECURITY.md', 'web-notes.md']), { api: false, web: false });
});

test('release: zonder succesvolle historie is de eerste publicatie volledig', async () => {
  const result = await planRelease({ eventName: 'push', headSha, runId: '1' }, {
    github: async (path) => path === 'git/ref/heads/main' ? { object: { sha: headSha } } : { workflow_runs: [] },
    changedFiles: () => assert.fail('Zonder basiscommit mag geen diff worden uitgevoerd'),
  });
  assert.deepEqual(result, { api: true, web: true });
});

test('release: handmatig publiceren vereist geen oude commit, metadatafouten blokkeren de release', async () => {
  const result = await planRelease({ eventName: 'workflow_dispatch', headSha, runId: '1' }, {
    github: async (path) => {
      assert.equal(path, 'git/ref/heads/main');
      return { object: { sha: headSha } };
    },
    changedFiles: () => assert.fail('Een handmatige release publiceert beide onderdelen zonder diff'),
  });
  assert.deepEqual(result, { api: true, web: true });
  await assert.rejects(planRelease({ eventName: 'push', headSha }, {
    github: async () => { throw new Error('Metadata onbereikbaar'); },
    changedFiles: () => [],
  }), /Metadata onbereikbaar/);
});
