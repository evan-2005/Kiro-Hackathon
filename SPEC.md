# Project Aegis — Technical & Product Specification (`SPEC.md`)

## 1. Executive Summary
**Project Aegis** is a rapid-assessment Tactical Disaster Recovery Terminal designed to organize post-disaster rescue operations in under 30 seconds. When typhoons, floods, or earthquakes strike, static road maps become dangerous because bridges collapse and underpasses flood, while relief camp siting traditionally takes days of manual GIS work.

Aegis solves this through a 3-stage automated pipeline:
1. **Detect (Edge AI Vision-to-GeoJSON)**: Local Multimodal AI (`qwen3-vl:4b` via Ollama) analyzes before/after satellite/aerial imagery to identify submerged corridors and collapsed infrastructure, outputting strict GeoJSON hazard polygons without needing cloud internet backhaul.
2. **Compute (Turf.js Spatial Math)**: Client-side geospatial analysis intersects high-elevation terrain with primary road proximity buffers and subtracts buffered hazard polygons to identify optimal **Safe Relief Camp** plateaus.
3. **Route (Polygon-Excluded Navigation)**: Dynamic routing calculates an emergency rescue corridor from trapped civilians to the nearest Safe Zone while actively swerving around AI-detected hazard polygons.

---

## 2. Locked Target Scenario & Spatial Bounds
To ensure zero GIS projection mismatches across the 3-developer team, all modules are locked to the **Klang River Basin (Kuala Lumpur, Malaysia)** flood scenario (`shared/config.json`).

| Parameter | Value | Notes |
| :--- | :--- | :--- |
| **Coordinate Standard** | `[longitude, latitude]` | Strictly enforced across GeoJSON, Turf.js, Mapbox, and FastAPI |
| **Datum / Projection** | `WGS-84 (EPSG:4326)` | Standard decimal degrees |
| **Map Center** | `[101.6938, 3.1408]` | Merdeka 118 / Klang-Gombak Confluence |
| **Bounding Box (`minLon, minLat, maxLon, maxLat`)** | `[101.6600, 3.1100, 101.7300, 3.1700]` | ~7.7 km × 6.6 km tactical operational box |
| **Default Camera** | `zoom: 13.8, pitch: 52°, bearing: -18°` | 3D oblique tactical view |

---

## 3. System Architecture & Data Contracts

### 3.1 Sequential State Machine
The frontend application (`frontend/src/App.tsx`) operates as a strict 4-state tactical machine:
1. `IDLE`: Base 3D dark terrain map loaded; standing by for satellite ingestion.
2. `HAZARDS_DETECTED`: Step `[01]` complete. Crimson hazard polygons rendered on map (`hazards-src`); camera flies to confluence breach.
3. `SAFE_ZONES_COMPUTED`: Step `[02]` complete. Cyan relief camp polygons rendered (`safe-zones-src`); camera pans to highland plateaus.
4. `ROUTE_DISPATCHED`: Step `[03]` complete. Compromised route rendered in dashed grey; active avoidance corridor rendered in glowing neon green (`route-src`).

### 3.2 API Endpoints (`backend/`)

#### `GET /api/health`
Returns operational heartbeat of the FastAPI server.

#### `GET /api/config`
Returns the contents of `shared/config.json`.

#### `POST /api/analyze-disaster`
- **Request Body**:
  ```json
  {
    "before_image_url": "optional_url_or_base64",
    "after_image_url": "optional_url_or_base64",
    "force_mock": false
  }
  ```
- **Response (`200 OK`)**: Standard GeoJSON `FeatureCollection` of `Polygon` features (matches `shared/fallback_damage.json`).
  - Required Feature Properties:
    - `title` (`string`): Human-readable name of hazard
    - `type` (`string`): `RIVER_OVERTOPPING` | `STRUCTURAL_COLLAPSE` | `RETENTION_BREACH`
    - `severity` (`string`): `CRITICAL` | `HIGH` | `ELEVATED`
    - `waterDepthEstM` (`number`): Estimated flood depth in meters
    - `infrastructureImpact` (`string`): Tactical impact description for HUD
    - `color` (`string`): Hex color code (`#FF0055`)

#### `GET /api/safe-zones`
Returns GeoJSON `FeatureCollection` of validated relief camp polygons (`shared/fallback_safe_zones.json`).
- Required Feature Properties:
  - `name` (`string`), `status` (`string`), `elevationM` (`number`), `capacityPersons` (`number`), `roadAccess` (`string`), `centroid` (`[lon, lat]`).

#### `GET /api/evacuation-route`
Returns GeoJSON `FeatureCollection` containing:
- `start-point` (`Point`): Trapped civilians / ambulance origin `[101.6865, 3.1340]`
- `destination-point` (`Point`): Primary Safe Camp centroid `[101.7015, 3.1418]`
- `compromised-route` (`LineString`, `status: "IMPASSABLE"`): Standard shortest path cutting into flood zone
- `evacuation-route` (`LineString`, `status: "ACTIVE_SECURE"`): Hazard-avoiding rescue route

---

## 4. Core Algorithms

### 4.1 Normalized Vision-to-GeoJSON Scaling (`backend/app/services/vision_analyzer.py`)
`qwen3-vl:4b` (via Ollama's OpenAI-compatible `/v1` endpoint) returns normalized bounding box coordinates `[min_x, min_y, max_x, max_y]` in range `[0.0, 1.0]` where `(0,0)` is top-left.
Conversion to WGS-84 `[lon, lat]`:
```python
poly_min_lon = minLon + (min_x * (maxLon - minLon))
poly_max_lon = minLon + (max_x * (maxLon - minLon))
poly_max_lat = maxLat - (min_y * (maxLat - minLat)) # Y=0 is North (maxLat)
poly_min_lat = maxLat - (max_y * (maxLat - minLat)) # Y=1 is South (minLat)
```

### 4.2 Safe-Zone Spatial Equation (`frontend/src/services/turfSafeZone.ts`)
$$\text{Safe Zone} = (\text{Candidate Highland Polygon}) \setminus \bigcup_{i} \text{Buffer}(\text{Hazard}_i, 150\text{m})$$
1. Each AI-detected hazard polygon is expanded by `0.15 km` via `turf.buffer`.
2. Candidate high-elevation polygons are clipped against the buffered hazards via `turf.difference`.
3. `turf.centroid` and `turf.area` compute the exact rescue destination point and usable camp square meterage.

### 4.3 Dynamic Hazard-Excluded Routing (`frontend/src/services/routing.ts`)
- **Primary**: Queries Mapbox Directions API (`mapbox/driving`) with `exclude=point(lon lat)` derived from hazard-road intersections.
- **Fallback**: Serves `shared/fallback_route.json` containing both the compromised direct path and the verified avoidance corridor.

---

## 5. Non-Functional Requirements & Hackathon Guardrails
- **Zero-Crash Offline Resilience**: Every external call (OpenAI GPT-4o, Mapbox Directions, FastAPI backend) wraps errors and falls back to `shared/fallback_*.json`. The demo must work even if venue Wi-Fi drops completely.
- **5-Hour Scope Discipline**:
  - No database (PostgreSQL/PostGIS is strictly out-of-scope; all spatial state lives in memory and static GeoJSON).
  - No live Sentinel SAR gigabyte TIFF downloads (pre-staged imagery + golden cache).
  - Hard feature cutoff at **Hour 4:15** to reserve 45 minutes for camera polish and pitch rehearsal.
