import * as turf from '@turf/turf';
import fs from 'fs';
import assert from 'assert';

// Load shared data
const rawDamage = JSON.parse(fs.readFileSync('../shared/fallback_damage.json', 'utf8'));
const rawSafe = JSON.parse(fs.readFileSync('../shared/fallback_safe_zones.json', 'utf8'));

console.log('--- TEST 1: Turf v7 Difference & Buffer Engine ---');

let bufferedHazards = null;
for (const feat of rawDamage.features) {
  const buffered = turf.buffer(feat, 0.15, { units: 'kilometers' });
  if (!bufferedHazards) bufferedHazards = buffered;
  else bufferedHazards = turf.union(turf.featureCollection([bufferedHazards, buffered]));
}

assert(bufferedHazards, 'Buffered hazards should be created');
console.log('✓ Buffered hazards unified successfully');

// Test Relief Camp Alpha (which overlaps hazard)
const alpha = rawSafe.features.find(f => f.id === 'safe-alpha');
assert(alpha, 'Alpha must exist');

const diff = turf.difference(turf.featureCollection([alpha, bufferedHazards]));
assert(diff, 'Alpha difference must exist');
const diffArea = turf.area(diff);
const origArea = turf.area(alpha);
assert(diffArea < origArea, 'Surviving area must be smaller than original area');
console.log(`✓ Alpha area carved from ${Math.round(origArea)}m² down to ${Math.round(diffArea)}m²`);

// Test engulfed polygon (completely inside hazard)
const hazardAlpha = rawDamage.features[0];
const centroidPt = turf.centroid(hazardAlpha);
const tinyInside = turf.buffer(centroidPt, 0.01, { units: 'kilometers' }); // 10m circle inside hazard
const engulfedDiff = turf.difference(turf.featureCollection([tinyInside, bufferedHazards]));
assert(engulfedDiff === null, 'Completely engulfed polygon must return null difference');
console.log('✓ Engulfed polygon correctly produces null difference');

console.log('--- ALL TURF SPATIAL TESTS PASSED ---');
