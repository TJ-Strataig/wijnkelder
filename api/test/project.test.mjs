import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
function filesIn(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const file = join(path, entry.name);
    return entry.isDirectory() ? filesIn(file) : [file];
  });
}
const sources = ['web', 'api/src', 'api/scripts'].flatMap((path) => filesIn(join(root, path))).filter((path) => /\.(js|mjs)$/.test(path));

test('project: JavaScript heeft geldige syntax en lokale imports bestaan', () => {
  for (const file of sources) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${file}: ${result.error?.message || result.stderr}`);
    for (const match of readFileSync(file, 'utf8').matchAll(/(?:from\s*|import\s*\(\s*)['"](\.[^'"]+)['"]/g)) {
      assert.ok(existsSync(resolve(dirname(file), match[1])), `${file}: ontbrekende import ${match[1]}`);
    }
  }
});

test('project: alle offline-shellbestanden bestaan en cacheversies sluiten aan', () => {
  const sw = read('web/sw.js');
  const shell = sw.match(/const SHELL = \[([\s\S]*?)\];/);
  assert.ok(shell);
  for (const match of shell[1].matchAll(/'([^']+)'/g)) {
    assert.ok(existsSync(resolve(root, 'web', match[1].split('?')[0])), `Ontbrekend shellbestand: ${match[1]}`);
  }
  const cache = sw.match(/const CACHE = 'wijnkelder-shell-v(\d+)'/);
  const stylesheet = read('web/index.html').match(/css\/app\.css\?v=(\d+)/);
  assert.ok(cache && stylesheet);
  assert.equal(cache[1], stylesheet[1]);
  assert.ok(shell[1].includes(`'./css/app.css?v=${cache[1]}'`));
});

test('project: Wrangler-configuratie bevat geen BOM en Node-versie is vastgelegd', () => {
  assert.notEqual(read('api/wrangler.toml').charCodeAt(0), 0xfeff);
  const pkg = JSON.parse(read('api/package.json'));
  const lock = JSON.parse(read('api/package-lock.json'));
  assert.equal(pkg.engines.node, '>=24.0.0');
  assert.deepEqual(lock.packages[''].engines, pkg.engines);
});
