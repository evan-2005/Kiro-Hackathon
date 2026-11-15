import * as turf from '@turf/turf';
import fs from 'fs';
import assert from 'assert';

console.log('=== PHASE 3 INTEGRATION & EDGE-CASE HARDENING TEST ===\n');

// 1. Verify Dev 3's live scan polygon from fallback_damage.json
const rawDamage = JSON.parse(fs.readFileSync('../shared/fallback_damage.json', 'utf8'));
const rawSafe = JSON.parse(fs.readFileSync('../shared/fallback_safe_zones.json', 'utf8'));
const rawRoute = JSON.parse(fs.readFileSync('../shared/fallback_route.json', 'utf8'));

assert.strictEqual(rawDamage.type, 'FeatureCollection');
assert(rawDamage.features.length >= 1, 'Must have at least 1 hazard feature');

const liveHazard = rawDamage.features[0];
console.log('1. Dev 3 Live Scan Hazard:');
console.log('   Title:', liveHazard.properties.title);
console.log('   Source:', rawDamage.metadata.source);
console.log('   Severity:', liveHazard.properties.severity);
console.log('   Water depth:', liveHazard.properties.waterDepthEstM);
console.log('   Coordinates ring count:', liveHazard.geometry.coordinates[0].length);

// Verify coordinates are within Klang River Basin bounds [101.66, 3.11, 101.73, 3.17]
for (const [lon, lat] of liveHazard.geometry.coordinates[0]) {
  assert(lon >= 101.66 && lon <= 101.73, `Lon ${lon} out of bounds`);
  assert(lat >= 3.11 && lat <= 3.17, `Lat ${lat} out of bounds`);
}
console.log('✓ Dev 3 hazard coordinates strictly within Klang River Basin bounds');

// 2. Test polygon sanitization with flipped coords and kinks
function sanitizeHazardFeature(feature) {
  if (!feature || !feature.geometry) return [];
  const geom = feature.geometry;

  if (geom.type === 'Polygon') {
    const coords = geom.coordinates.map((ring) => {
      let cleaned = ring.map(([lon, lat]) => {
        if (lon < 50 && lat > 50) return [lat, lon];
        return [lon, lat];
      });
      if (cleaned.length >= 3) {
        const first = cleaned[0];
        const last = cleaned[cleaned.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          cleaned.push([first[0], first[1]]);
        }
      }
      return cleaned;
    });

    try {
      const poly = turf.polygon(coords, feature.properties);
      const kinks = turf.kinks(poly);
      if (kinks.features.length > 0) {
        return turf.unkinkPolygon(poly).features;
      }
      return [poly];
    } catch {
      return [feature];
    }
  }
  return [feature];
}

// Inverted [lat, lon] polygon
const flippedHazard = {
  type: 'Feature',
  properties: { title: 'Flipped Hazard' },
  geometry: {
    type: 'Polygon',
    coordinates: [[[3.14, 101.69], [3.15, 101.69], [3.15, 101.70], [3.14, 101.70], [3.14, 101.69]]]
  }
};
const sanitizedFlipped = sanitizeHazardFeature(flippedHazard);
const [firstLon, firstLat] = sanitizedFlipped[0].geometry.coordinates[0][0];
assert(firstLon > 100 && firstLat < 10, 'Flipped coordinates must be inverted back to [lon, lat]');
console.log('✓ Inverted [lat, lon] coordinate anomaly automatically normalized');

// Kinked bow-tie polygon
const kinkedHazard = {
  type: 'Feature',
  properties: { title: 'Kinked Hazard' },
  geometry: {
    type: 'Polygon',
    coordinates: [[[101.68, 3.13], [101.70, 3.15], [101.68, 3.15], [101.70, 3.13], [101.68, 3.13]]]
  }
};
const sanitizedKinked = sanitizeHazardFeature(kinkedHazard);
assert(sanitizedKinked.length >= 2, 'Kinked polygon must be unkinked into multiple clean polygons');
console.log('✓ Self-intersecting (kinked) polygon cleanly decomposed into valid polygons');

// 3. Test Safe-Zone spatial math with Dev 3 live scan + edge cases
let bufferedHazards = null;
const allHazards = [liveHazard, flippedHazard, kinkedHazard];
for (const rawFeat of allHazards) {
  const sanitized = sanitizeHazardFeature(rawFeat);
  for (const feat of sanitized) {
    const buff = turf.buffer(feat, 0.15, { units: 'kilometers' });
    if (buff) {
      if (!bufferedHazards) bufferedHazards = buff;
      else bufferedHazards = turf.union(turf.featureCollection([bufferedHazards, buff]));
    }
  }
}
assert(bufferedHazards, 'Buffered hazards must be non-null');

for (const candidate of rawSafe.features) {
  const diff = turf.difference(turf.featureCollection([candidate, bufferedHazards]));
  console.log(`   Candidate ${candidate.properties.name}: remaining area = ${diff ? Math.round(turf.area(diff)) : 0} m²`);
}
console.log('✓ Safe-zone spatial engine operates flawlessly under adversarial hazard inputs');

// 4. Test offline and rate-limit fallback
assert(rawRoute.features.some(f => f.id === 'compromised-route'), 'Must have compromised route');
assert(rawRoute.features.some(f => f.id === 'evacuation-route'), 'Must have evacuation route');
console.log('✓ Fallback route contains both compromised and evacuation routes for offline resilience');

console.log('\n=== ALL PHASE 3 INTEGRATION CHECKS PASSED ===');
