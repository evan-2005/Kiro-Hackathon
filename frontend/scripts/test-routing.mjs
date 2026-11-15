import * as turf from '@turf/turf';
import fs from 'fs';
import assert from 'assert';

console.log('--- TEST 2: Hazard Avoidance Routing Logic ---');

const rawDamage = JSON.parse(fs.readFileSync('../shared/fallback_damage.json', 'utf8'));
const rawRoute = JSON.parse(fs.readFileSync('../shared/fallback_route.json', 'utf8'));

// Verify fallback structure
const compromised = rawRoute.features.find(f => f.id === 'compromised-route');
const evacuation = rawRoute.features.find(f => f.id === 'evacuation-route');
const startPt = rawRoute.features.find(f => f.id === 'start-point');
const destPt = rawRoute.features.find(f => f.id === 'destination-point');

assert(compromised, 'Fallback must have compromised-route');
assert(evacuation, 'Fallback must have evacuation-route');
assert(startPt, 'Fallback must have start-point');
assert(destPt, 'Fallback must have destination-point');

assert.strictEqual(compromised.properties.status, 'IMPASSABLE');
assert.strictEqual(evacuation.properties.status, 'ACTIVE_SECURE');
console.log('✓ Fallback route features validated');

// Test extraction of collision points
const directLine = compromised;
const points = [];

for (const feat of rawDamage.features) {
  try {
    const intersects = turf.lineIntersect(directLine, feat);
    for (const pt of intersects.features) {
      const [lon, lat] = pt.geometry.coordinates;
      points.push([Number(lon.toFixed(4)), Number(lat.toFixed(4))]);
    }
  } catch (err) {
    console.warn('Intersect err:', err);
  }
}

console.log('Extracted intersection points:', points);
assert(points.length > 0, 'Should find intersection points with damage zones');

// Test Mapbox exclude query formatting
const excludeParam = points
  .slice(0, 5)
  .map(([lon, lat]) => `point(${lon.toFixed(4)} ${lat.toFixed(4)})`)
  .join(',');

assert(excludeParam.includes('point('), 'Exclude param must format as point(lon lat)');
assert(!excludeParam.includes(',' + ' '), 'No commas inside point coordinates');
console.log('Formatted exclude param:', excludeParam);
console.log('--- ALL ROUTING LOGIC TESTS PASSED ---');
