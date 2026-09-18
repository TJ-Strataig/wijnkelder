import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function selectTargets(paths) {
  const infrastructure = paths.some((path) => path.startsWith('.github/workflows/'));
  return {
    api: infrastructure || paths.some((path) => path.startsWith('api/')),
    web: infrastructure || paths.some((path) => path.startsWith('web/')),
  };
}

export function releaseScope({ eventName, headSha, mainSha, baseSha, paths }) {
  if (!/^[a-f0-9]{40}$/.test(headSha) || headSha !== mainSha) {
    throw new Error('Deze run hoort niet bij de actuele main-versie. Publiceer alleen de nieuwste main.');
  }
  if (eventName === 'workflow_dispatch') return { api: true, web: true };
  if (eventName !== 'push') throw new Error('Alleen een push naar main of een handmatige release is toegestaan.');
  if (baseSha === null) return { api: true, web: true };
  if (!/^[a-f0-9]{40}$/.test(baseSha)) throw new Error('Ongeldige versie van de laatste geslaagde release.');
  return selectTargets(paths);
}

export async function planRelease({ eventName, headSha, runId }, { github, changedFiles }) {
  const branch = await github('git/ref/heads/main');
  const input = { eventName, headSha, mainSha: branch.object.sha, baseSha: null, paths: [] };
  const firstRelease = releaseScope(input);
  if (eventName === 'workflow_dispatch') return firstRelease;
  const runs = await github('actions/workflows/deploy.yml/runs?branch=main&per_page=100');
  const history = runs.workflow_runs.filter((run) => String(run.id) !== String(runId) && run.head_branch === 'main');
  const previous = history.find((run) => run.status === 'completed' && run.conclusion === 'success');
  // Een mislukte release kan de API al hebben vervangen, ook als een volgende commit die wijziging terugdraait.
  if (!previous || history[0] !== previous) return firstRelease;
  input.baseSha = previous.head_sha;
  releaseScope(input);
  input.paths = changedFiles(input.baseSha, headSha);
  return releaseScope(input);
}

async function main() {
  const { GITHUB_REF, GITHUB_SHA, GITHUB_EVENT_NAME, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_OUTPUT, GH_TOKEN } = process.env;
  if (GITHUB_REF !== 'refs/heads/main') throw new Error('Publiceren vanaf een andere branch dan main is niet toegestaan.');
  if (!GH_TOKEN || !GITHUB_REPOSITORY || !GITHUB_OUTPUT) throw new Error('De GitHub Actions-context ontbreekt.');
  async function github(path) {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/${path}`, {
      headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!response.ok) throw new Error(`GitHub-metadata kon niet worden gelezen (HTTP ${response.status}).`);
    return response.json();
  }
  const targets = await planRelease({ eventName: GITHUB_EVENT_NAME, headSha: GITHUB_SHA, runId: GITHUB_RUN_ID }, {
    github,
    changedFiles: (baseSha, headSha) => execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', baseSha, headSha, '--'], { encoding: 'utf8' }).split('\0').filter(Boolean),
  });
  appendFileSync(GITHUB_OUTPUT, `api=${targets.api}\nweb=${targets.web}\n`);
  console.log(`Publicatiekeuze: API=${targets.api}, website=${targets.web}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
