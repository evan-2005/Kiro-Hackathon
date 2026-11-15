import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import ts from 'typescript';
import * as turf from '@turf/turf';

const require = createRequire(import.meta.url);
const safeZones = JSON.parse(fs.readFileSync('../shared/fallback_safe_zones.json', 'utf8'));
const hazards = JSON.parse(fs.readFileSync('../shared/fallback_damage.json', 'utf8'));
const source = fs.readFileSync('src/services/turfSafeZone.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports, console,
  require: name => name === '@shared/fallback_safe_zones.json' ? safeZones : require(name),
});
const { computeSafeReliefZones } = exports;

const normal = computeSafeReliefZones(hazards);
assert.equal(normal.metadata.activeZones, normal.features.length);
assert(normal.features.some(feature => feature.id === 'safe-alpha'));

const engulfed = computeSafeReliefZones(turf.featureCollection([
  turf.bboxPolygon([101.66, 3.11, 101.73, 3.17]),
]));
assert.equal(engulfed.metadata.activeZones, 0);
assert.equal(engulfed.features.length, 0, 'Blocked camps must not reappear through the fallback');

const tooLow = computeSafeReliefZones(hazards, { minElevationMeters: 500, hazardBufferKm: 0.15 });
assert.equal(tooLow.features.length, 0, 'Camps below the elevation requirement must remain excluded');
console.log('Safe-zone result checks passed: current cache, all camps blocked, all camps below minimum elevation');
