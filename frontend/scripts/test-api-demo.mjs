import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = fs.readFileSync('src/services/api.ts', 'utf8');
function load(env, fetch) {
  const exports = {};
  const compiled = ts.transpileModule(source.replaceAll('import.meta.env', JSON.stringify(env)), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(compiled, { exports, fetch, console, AbortSignal, setTimeout,
    require: name => JSON.parse(fs.readFileSync(name.replace('@shared/', '../shared/'), 'utf8')),
  });
  return exports;
}

let requests = [];
const fetch = async (url, options) => {
  requests.push({ url, options });
  return { ok: true, json: async () => ({ live: true }) };
};
const demo = load({ DEV: false }, fetch);
assert.equal((await demo.runDisasterScan()).metadata.source, 'FALLBACK_GOLDEN_CACHE');
assert((await demo.fetchMissionConfig()).spatial.boundingBox);
assert((await demo.fetchSafeZonesData()).features.length > 0);
assert((await demo.fetchEvacuationRouteData()).features.length > 0);
assert.equal(requests.length, 0, 'Hosted cached demo must not contact visitor localhost');

for (const [env, expected] of [
  [{ DEV: true }, 'http://localhost:8000'],
  [{ DEV: false, VITE_BACKEND_URL: 'https://backend.example.test' }, 'https://backend.example.test'],
]) {
  requests = [];
  assert.equal((await load(env, fetch).runDisasterScan()).live, true);
  assert.equal(requests[0].url, expected + '/api/analyze-disaster');
  assert.equal(requests[0].options.method, 'POST');
}
console.log('API checks passed: hosted cache, local development, configured backend');
