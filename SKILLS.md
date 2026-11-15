# Project Aegis — Engineering Playbooks & Domain Skills (`SKILLS.md`)

This guide contains tactical, copy-pasteable engineering patterns for the 4 specialized domains in Project Aegis. Both human teammates and AI coding agents should reference these playbooks when extending their modules.

---

## Skill 1: Mapbox GL JS 3D Tactical Rendering (Dev 1)

### Key Principles
- Always guard `map.getSource(...)` calls behind `if (!mapRef.current || !mapLoaded) return;`.
- Update existing GeoJSON sources via `(map.getSource('id') as mapboxgl.GeoJSONSource).setData(newGeoJson)` rather than removing and re-adding layers.
- Use cinematic `map.flyTo({ center, zoom, pitch, bearing, duration })` when transitioning between mission stages.

### Recipe: Adding a Pulsing Hazard Halo or Custom Popup
```tsx
// Inside MapView.tsx on('load')
map.on('click', 'hazards-fill', (e) => {
  if (!e.features?.[0]) return;
  const props = e.features[0].properties;
  new mapboxgl.Popup({ className: 'tactical-popup' })
    .setLngLat(e.lngLat)
    .setHTML(`
      <div class="font-mono text-xs bg-[#0B111E] text-slate-100 p-2 border border-[#FF0055]">
        <div class="text-[#FF0055] font-bold">${props?.title}</div>
        <div class="text-slate-400 mt-1">${props?.infrastructureImpact}</div>
        <div class="text-amber-400 mt-1">Est. Depth: ${props?.waterDepthEstM}m</div>
      </div>
    `)
    .addTo(map);
});
```

---

## Skill 2: Turf.js v7 Client-Side Spatial Math (Dev 2)

### Key Principles
- **Turf v7 Breaking Change**: In `@turf/turf` v7+, `turf.union()` and `turf.difference()` accept a single `FeatureCollection` argument (`turf.difference(turf.featureCollection([polyA, polyB]))`), **NOT** two separate polygon arguments (`turf.difference(polyA, polyB)`).
- Always wrap `turf.difference` and `turf.union` in `try / catch` blocks in case self-intersecting polygons occur.

### Recipe: Safe-Zone Multi-Criteria Intersection
```ts
import * as turf from '@turf/turf';

// 1. Buffer a hazard polygon by 150 meters (0.15 km)
const bufferedHazard = turf.buffer(hazardFeature, 0.15, { units: 'kilometers' });

// 2. Subtract buffered hazard from candidate high-ground polygon (Turf v7 syntax!)
const safeDifference = turf.difference(
  turf.featureCollection([candidatePolygon, bufferedHazard])
);

// 3. Extract optimal Relief Camp centroid [lon, lat] & area in m²
if (safeDifference) {
  const centroidPt = turf.centroid(safeDifference);
  const [lon, lat] = centroidPt.geometry.coordinates;
  const areaSqM = Math.round(turf.area(safeDifference));
}
```

### Recipe: Finding Road-Hazard Intersection Points for Routing Exclusion
```ts
// Find where a road LineString crosses a flood Polygon boundary
const intersections = turf.lineIntersect(roadFeatureCollection, hazardPolygonFeature);
const excludeCoords: Array<[number, number]> = intersections.features.map(
  (pt) => pt.geometry.coordinates as [number, number]
);
```

---

## Skill 3: Local `qwen3-vl:4b` Vision-to-GeoJSON Pipeline (Dev 3)

### Key Principles
- Run `qwen3-vl:4b` locally via Ollama (`ollama pull qwen3-vl:4b && ollama serve`), which exposes an OpenAI-compatible endpoint at `http://localhost:11434/v1`.
- Do not ask the VLM to guess raw latitude/longitude decimals directly—VLMs hallucinate exact map coordinates.
- Instead, instruct `qwen3-vl:4b` to return **normalized image bounding boxes** (`min_x, min_y, max_x, max_y` in `[0.0, 1.0]`) via Pydantic Structured Outputs (`client.beta.chat.completions.parse`), and deterministically project them into `shared/config.json`'s `boundingBox` in Python.

### Recipe: Image Ratio to WGS-84 `[lon, lat]` Projection
```python
# Image origin (0,0) is Top-Left (North-West: minLon, maxLat)
# Image (1,1) is Bottom-Right (South-East: maxLon, minLat)
def ratio_to_lon_lat(x_ratio: float, y_ratio: float, bbox: dict) -> list[float]:
    lon = bbox["minLon"] + x_ratio * (bbox["maxLon"] - bbox["minLon"])
    lat = bbox["maxLat"] - y_ratio * (bbox["maxLat"] - bbox["minLat"])
    return [round(lon, 6), round(lat, 6)]
```

---

## Skill 4: Hazard-Excluded Dynamic Routing & Pitch Choreography (Dev 4)

### Key Principles
- Mapbox Directions API (`https://api.mapbox.com/directions/v5/mapbox/driving/...`) supports excluding up to 50 road coordinates via `exclude=point(lon lat),point(lon2 lat2)`. Note that inside `point(lon lat)`, coordinates are separated by a **space**, not a comma!
- Always display **both** the `IMPASSABLE` standard route (dashed grey line cutting through the crimson flood zone) and the `ACTIVE_SECURE` rescue route (glowing green line swerving around the flood zone). Visual contrast wins judge points.

### Recipe: Mapbox Exclusion URL Builder
```ts
const start = [101.6865, 3.1340]; // Trapped civilians (KL Sentral)
const dest = [101.7015, 3.1418];  // Relief Camp Alpha (Stadium Merdeka)
const hazardRoadPoints: Array<[number, number]> = [
  [101.6908, 3.1355], // Flooded Federal Highway underpass
  [101.6952, 3.1465], // Submerged Lebuh Pasar Besar Bridge
];

const excludeQuery = hazardRoadPoints
  .map(([lon, lat]) => `point(${lon.toFixed(4)} ${lat.toFixed(4)})`)
  .join(',');

const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start[0]},${start[1]};${dest[0]},${dest[1]}?geometries=geojson&overview=full&exclude=${encodeURIComponent(excludeQuery)}&access_token=${MAPBOX_TOKEN}`;
```
