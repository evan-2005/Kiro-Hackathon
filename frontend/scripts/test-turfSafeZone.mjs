import * as turf from '@turf/turf';
import fs from 'fs';
import assert from 'assert';

console.log('--- TEST 1: Turf v7 Difference & Buffer Engine ---');

// Load shared data
const rawDamage = JSON.parse(fs.readFileSync('../shared/fallback_damage.json', 'utf8'));
const rawSafe = JSON.parse(fs.readFileSync('../shared/fallback_safe_zones.json', 'utf8'));

let bufferedHazards = null;
for (const feat of rawDamage.features) {
  const buffered = turf.buffer(feat, 0.15, { units: 'kilometers' });
  if (!bufferedHazards) bufferedHazards = buffered;
  else bufferedHazards = turf.union(turf.featureCollection([bufferedHazards, buffered]));
}

assert(bufferedHazards, 'Buffered hazards should be created');
console.log('✓ Buffered hazards unified successfully');

// Find any candidate safe camp that intersects buffered hazards (e.g. Bravo with new cache, Alpha with old cache)
const overlappingCandidate = rawSafe.features.find(f => turf.booleanIntersects(f, bufferedHazards));
assert(overlappingCandidate, 'At least one candidate safe camp must intersect the buffered hazard zone');

const diff = turf.difference(turf.featureCollection([overlappingCandidate, bufferedHazards]));
assert(diff, `${overlappingCandidate.properties.name} difference must exist`);
const diffArea = turf.area(diff);
const origArea = turf.area(overlappingCandidate);
assert(diffArea < origArea, 'Surviving area must be smaller than original area');
console.log(`✓ ${overlappingCandidate.properties.name} carved from ${Math.round(origArea)}m² down to ${Math.round(diffArea)}m²`);

// Test engulfed polygon (completely inside hazard)
const hazardFeat = rawDamage.features[0];
const centroidPt = turf.centroid(hazardFeat);
const tinyInside = turf.buffer(centroidPt, 0.01, { units: 'kilometers' }); // 10m circle inside hazard
const engulfedDiff = turf.difference(turf.featureCollection([tinyInside, bufferedHazards]));
assert(engulfedDiff === null, 'Completely engulfed polygon must return null difference');
console.log('✓ Engulfed polygon correctly produces null difference');

console.log('--- ALL TURF SPATIAL TESTS PASSED ---');
