// Package contract tests: node --test (no dependencies).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../scripts/serve.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFile(join(ROOT, p));
const sha = (b) => createHash('sha256').update(b).digest('hex');

async function files(dir = '') {
  const out = [];
  for (const e of await readdir(join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await files(p)); else out.push(p);
  }
  return out;
}

test('every sha-pinned load in play.js matches the file on disk', async () => {
  const play = (await read('play.js')).toString();
  const pins = [...play.matchAll(/\['(\.\/[^']+)', '([0-9a-f]{64})'\]/g)];
  assert.ok(pins.length >= 6, `expected the 5 assets + module to be pinned, found ${pins.length}`);
  for (const [, path, want] of pins) assert.equal(sha(await read(path)), want, path);
});

test('the import map and the three.js bundle resolve inside the repository', async () => {
  const html = (await read('index.html')).toString();
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  assert.equal(map.imports.three, './vendor/three/three.module.js');
  const mod = (await read('vendor/three/three.module.js')).toString();
  const deps = new Set([...mod.matchAll(/from '([^']+)'/g)].map((m) => m[1]));
  assert.deepEqual([...deps], ['./three.core.js']);
  await read('vendor/three/three.core.js');
  for (const src of [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1])) await read(src);
  for (const font of [...html.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1])) await read(font);
});

test('no private paths, workspace references, internal agent names or secrets in shipped text', async () => {
  const bad = [/\/home\//, /\.\.\/\.\.\//, /:8899/, /contained-collision/, /frontend-integration/, /\bN[1-5]\b(?!_)/, /VANTA/,
    /BEGIN [A-Z ]*PRIVATE KEY/, /api[_-]?key\s*[:=]/i, new RegExp('[\\u23AF\\u2014]')];   // venture-name residue is enforced by the Ferdon preflight, not repeated here
  const exempt = new Set(['interactive-response.js', join('vendor', 'three', 'three.module.js'), join('vendor', 'three', 'three.core.js'), join('test', 'package.test.mjs')]);
  for (const f of await files()) {
    if (!/\.(js|mjs|html|md|json|txt)$/.test(f) || exempt.has(f)) continue;   // includes assets/*.json
    const text = (await read(f)).toString();
    for (const re of bad) assert.ok(!re.test(text), `${f} matches ${re}`);
  }
});

test('the response module runs headless: rest stays apart, a push makes contact, release recovers', async () => {
  const { createResponse } = await import('../interactive-response.js');
  const E = JSON.parse((await read('assets/model/rest_ideal_v1.json')).toString());
  const rest = Float32Array.from(E.vertices.flat()), tris = Uint32Array.from(E.triangles.flat());
  const api = createResponse({ rest, tris, init: [{ x: -0.2, y: 0, theta: 0 }, { x: 0.2, y: 0, theta: 0 }], bounds: { xlo: -0.6, xhi: 0.6, ylo: -0.34, yhi: 0.34 } });
  for (let i = 0; i < 120; i++) api.step(1 / 60);
  assert.equal(api.contact().active, false, 'resting cushions must not touch');
  assert.ok(api.grab(0, -0.2, 0));
  let touched = false;
  for (let i = 0; i < 90; i++) { api.drag(0.1, 0); api.step(1 / 60); touched ||= api.contact().active; }
  assert.ok(touched, 'pushing A into B must produce contact');
  api.release();
  for (let i = 0; i < 180; i++) api.step(1 / 60);
  assert.equal(api.contact().active, false, 'contact must clear within 3 s of release');
  assert.ok(api.finite());
  const out = new Float32Array(rest.length); api.writeVerts(0, out);
  assert.ok(out.every(Number.isFinite));
});

test('the local server serves the page and its modules with the right types', async () => {
  const server = await startServer(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [path, type] of [['/', 'text/html'], ['/play.js', 'text/javascript'], ['/vendor/three/three.core.js', 'text/javascript'],
      ['/assets/fabric/weave_normal_512.png', 'image/png'], ['/fonts/texgyreheros-regular.otf', 'font/otf']]) {
      const r = await fetch(base + path);
      assert.equal(r.status, 200, path);
      assert.ok(r.headers.get('content-type').startsWith(type), `${path}: ${r.headers.get('content-type')}`);
    }
    // path traversal: encoded slashes survive URL parsing, the server decodes them and must refuse anything outside the root
    assert.equal((await fetch(base + '/..%2f..%2fetc%2fpasswd')).status, 403);
    assert.equal((await fetch(base + '/no-such-file.js')).status, 404);
  } finally { server.close(); }
});
