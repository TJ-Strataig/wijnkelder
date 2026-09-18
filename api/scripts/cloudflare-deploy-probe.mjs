import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function probeContext(env) {
  if (env.GITHUB_ACTIONS !== 'true' ||
      env.GITHUB_REPOSITORY !== 'TJ-Strataig/wijnkelder' ||
      env.GITHUB_REF !== 'refs/heads/tj-strataig-ontwikkelbasis-herstellen' ||
      !['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)) {
    throw new Error('Deze proef is uitsluitend toegestaan op de goedgekeurde GitHub-werkbranch.');
  }
  if (!/^[1-9]\d{0,19}$/.test(env.GITHUB_RUN_ID || '') ||
      !/^[1-9]\d{0,5}$/.test(env.GITHUB_RUN_ATTEMPT || '')) {
    throw new Error('Ongeldige GitHub-runidentiteit.');
  }
  if (!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID || '') || !env.CLOUDFLARE_API_TOKEN) {
    throw new Error('Cloudflare-instellingen ontbreken of zijn ongeldig.');
  }
  return {
    name: `wijnkelder-probe-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`,
    account: env.CLOUDFLARE_ACCOUNT_ID,
    token: env.CLOUDFLARE_API_TOKEN,
  };
}

function assertProbeName(name) {
  if (!/^wijnkelder-probe-[1-9]\d{0,19}-[1-9]\d{0,5}$/.test(name)) {
    throw new Error('Alleen een uniek benoemde testworker mag worden benaderd.');
  }
}

export function probeConfig(name) {
  assertProbeName(name);
  return {
    name,
    main: './worker.mjs',
    compatibility_date: '2026-09-01',
    workers_dev: false,
    preview_urls: false,
    routes: [],
    triggers: { crons: [] },
    observability: { enabled: false },
  };
}

export function probeApi({ name, account, token }, fetchImpl = fetch) {
  assertProbeName(name);
  const base = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${name}`;
  async function request(method, suffix, allowMissing = false) {
    const response = await fetchImpl(`${base}${suffix}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000),
    });
    const body = await response.json();
    if (allowMissing && response.status === 404 && body.success === false &&
        body.errors?.some((error) => error.code === 10007)) return null;
    if (!response.ok || body.success !== true) {
      throw new Error(`Cloudflare-testworker: ${method} mislukt (HTTP ${response.status}).`);
    }
    return body;
  }
  return {
    async requireAbsent() {
      if (await request('GET', '/settings', true) !== null) {
        throw new Error('Testnaam bestaat al; niets overschrijven of verwijderen.');
      }
    },
    async verify() {
      const body = await request('GET', '/deployments');
      if (!Array.isArray(body.result?.deployments) || body.result.deployments.length === 0) {
        throw new Error('Geen deployment voor de testworker gevonden.');
      }
    },
    async cleanup() {
      if (await request('GET', '/settings', true) === null) {
        console.log('Geen testworker aanwezig; opruimen is niet nodig.');
        return;
      }
      await request('DELETE', '');
      await this.requireAbsent();
      console.log('Testworker verwijderd; afwezigheid bevestigd.');
    },
  };
}

async function main() {
  const action = process.argv[2];
  if (!['prepare', 'verify', 'cleanup'].includes(action)) throw new Error('Onbekende proefactie.');
  const context = probeContext(process.env);
  const { RUNNER_TEMP, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY } = process.env;
  if (!RUNNER_TEMP || !GITHUB_OUTPUT || !GITHUB_STEP_SUMMARY) throw new Error('Runnerpaden ontbreken.');
  const directory = join(RUNNER_TEMP, 'wijnkelder-probe');
  const ownership = join(directory, 'ownership.json');
  const identity = { name: context.name, account: context.account };
  const api = probeApi(context);

  if (action === 'prepare') {
    await api.requireAbsent();
    mkdirSync(directory);
    writeFileSync(join(directory, 'wrangler.json'), JSON.stringify(probeConfig(context.name)), { flag: 'wx' });
    writeFileSync(join(directory, 'worker.mjs'), 'export default { fetch() { return new Response(null, { status: 204 }); } };\n', { flag: 'wx' });
    writeFileSync(ownership, JSON.stringify(identity), { flag: 'wx' });
    // Alleen na bewezen afwezigheid mag de always()-stap deze unieke testnaam opruimen.
    appendFileSync(GITHUB_OUTPUT, 'cleanup_allowed=true\n');
    console.log(`Afzonderlijke testworker voorbereid: ${context.name}`);
    return;
  }
  const owner = JSON.parse(readFileSync(ownership, 'utf8'));
  if (owner.name !== identity.name || owner.account !== identity.account) {
    throw new Error('Testworker hoort niet bij deze run; geen actie uitgevoerd.');
  }
  if (action === 'verify') {
    await api.verify();
    appendFileSync(GITHUB_STEP_SUMMARY, 'Publicatie van de geisoleerde testworker bevestigd. Geen productiebindings of routes gebruikt.\n');
  } else {
    await api.cleanup();
    appendFileSync(GITHUB_STEP_SUMMARY, 'Opruimen voltooid: de tijdelijke testworker is afwezig.\n');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
