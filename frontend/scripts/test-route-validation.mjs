import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import ts from 'typescript';
import * as turf from '@turf/turf';

const require = createRequire(import.meta.url);
const read = name => JSON.parse(fs.readFileSync('../shared/' + name, 'utf8'));
const hazards = read('fallback_damage.json');
const cached = read('fallback_route.json');
const direct = cached.features.find(f => f.id === 'compromised-route').geometry;
const bypass = cached.features.find(f => f.id === 'evacuation-route').geometry;
function load(safeGeometry, token = 'pk.test', fail = false) {
  const source = fs.readFileSync('src/services/routing.ts', 'utf8')
    .replaceAll('import.meta.env', JSON.stringify({ VITE_MAPBOX_TOKEN: token }));
  const exports = {};
  let calls = 0;
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
  } }).outputText, { exports, AbortSignal, console: { info() {}, warn() {} },
    require: name => name.startsWith('@shared/') ? read(name.slice(8)) : require(name),
    fetch: async (_, options) => {
      assert(options.signal, 'Mapbox requests must have a timeout');
      if (fail) throw new Error('network unavailable');
      return { ok: true, json: async () => ({ code: 'Ok', routes: [{
        geometry: calls++ === 0 ? direct : safeGeometry, distance: 3800, duration: 564,
      }] }) };
    },
  });
  return exports;
}

for (const service of [load(direct), load(bypass, ''), load(bypass, 'pk.test', true)]) {
  const result = await service.calculateRescueRoute(undefined, undefined, hazards);
  assert.equal(result.metadata.engine, 'CACHED_DEMO_ROUTE');
  const safe = result.features.find(f => f.id === 'evacuation-route');
  assert(hazards.features.every(h => !turf.booleanIntersects(safe, turf.buffer(h, .15, { units: 'kilometers' }))));
}
assert.equal((await load(bypass).calculateRescueRoute(undefined, undefined, hazards)).metadata.engine,
  'Mapbox Directions API Live Dual-Corridor');

const engulfed = turf.featureCollection([turf.bboxPolygon([101.66, 3.11, 101.73, 3.17])]);
await assert.rejects(load(direct).calculateRescueRoute(undefined, undefined, engulfed), /No validated rescue corridor/);
await assert.rejects(load(bypass, '').calculateRescueRoute(undefined, [101.72, 3.16], hazards), /No validated rescue corridor/);
const empty = { type: 'FeatureCollection', features: [] };
assert.equal(load(bypass).extractHazardAvoidancePoints(empty, direct).length, 0);
assert.equal((await load(bypass).calculateRescueRoute(undefined, undefined, empty)).metadata.engine,
  'Mapbox Directions API Live Dual-Corridor');
console.log('Route checks passed: blocked/live/offline routes, changed hazards, destination mismatch, no hazards');
