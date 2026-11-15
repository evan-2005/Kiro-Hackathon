# Dev 2: Spatial Math (Turf.js) & Dynamic Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Turf.js safe-zone calculation engine and Mapbox dynamic hazard-avoidance routing for Dev 2 as specified in `CHECKLIST.md` and `SPEC.md`.

**Architecture:** 
- In `turfSafeZone.ts`: buffer AI hazard polygons by 150m-200m using `@turf/turf`, compute `turf.difference` against candidate relief sites from `fallback_safe_zones.json`, discard submerged zones, and calculate dynamic centroid and area for surviving zones.
- In `routing.ts`: extract avoidance coordinates from hazard polygons, query Mapbox Directions API to generate both the direct compromised route and the hazard-avoiding evacuation route, falling back to `fallback_route.json` on error or missing token.

**Tech Stack:** TypeScript, `@turf/turf` v7.1.0, Mapbox Directions API v5, GeoJSON (RFC 7946), Vite.

## Global Constraints

- **Strict coordinate order:** `[longitude, latitude]` everywhere (WGS-84 decimal degrees).
- **Bounding Box:** Klang River Basin `[101.6600, 3.1100, 101.7300, 3.1700]`.
- **Zero-Crash Fallback:** Always degrade gracefully to `shared/fallback_*.json` if API calls fail or tokens are missing.
- **File Boundaries:** Dev 2 strictly modifies `frontend/src/services/turfSafeZone.ts`, `frontend/src/services/routing.ts`, and fallback JSON files in `shared/`.

---

### Task 1: Safe-Zone Spatial Calculation Engine Hardening

**Files:**
- Modify: `frontend/src/services/turfSafeZone.ts`
- Test: `frontend/src/services/__tests__/turfSafeZone.test.ts`

**Interfaces:**
- Consumes: `dangerZones: GeoJsonFeatureCollection`, `criteria?: SafeZoneCriteria`
- Produces: `computeSafeReliefZones(dangerZones, criteria): GeoJsonFeatureCollection` where each feature has `properties.centroid`, `properties.computedAreaSqM`, and `properties.status: 'VALIDATED_CLEAR'`.

- [ ] **Step 1: Write a test script for safe-zone computation**
Create a test script verifying that:
1. Buffering expands hazards by 150m.
2. Safe zones overlapping hazards get clipped via `turf.difference`.
3. If a candidate is completely inside a hazard buffer, it is dropped.
4. Surviving zones have valid `[lon, lat]` centroids and `computedAreaSqM > 0`.

- [ ] **Step 2: Run test script to verify current behavior and failures**
Run: `node --loader ts-node/esm ...` or node with stripped types to verify baseline.

- [ ] **Step 3: Implement refined `computeSafeReliefZones` in `turfSafeZone.ts`**
- Fix the `difference === null` handling so submerged candidates are not mistakenly pushed.
- Filter candidates by `minElevationMeters`.
- Ensure features adhere to strict GeoJSON `Polygon` format with closed rings.

- [ ] **Step 4: Run test script to verify it passes**
Run verification script and confirm all assertions pass.

- [ ] **Step 5: Verify frontend build**
Run: `cd frontend && npm run build`

---

### Task 2: Dual-Route Hazard Avoidance Routing Engine

**Files:**
- Modify: `frontend/src/services/routing.ts`
- Test: `frontend/src/services/__tests__/routing.test.ts`

**Interfaces:**
- Consumes: `startCoord: [number, number]`, `destinationCoord: [number, number]`, `hazardZones?: GeoJsonFeatureCollection | Array<[number, number]>`
- Produces: `calculateRescueRoute(...): Promise<GeoJsonFeatureCollection>` containing:
  - `start-point` (`Point`)
  - `destination-point` (`Point`)
  - `compromised-route` (`LineString`, `status: 'IMPASSABLE'`, dashed)
  - `evacuation-route` (`LineString`, `status: 'ACTIVE_SECURE'`, glowing green)

- [ ] **Step 1: Write a test script for routing**
Create test verifying that:
1. Without token or on fetch failure, returns `fallback_route.json` containing both `compromised-route` and `evacuation-route`.
2. `extractHazardAvoidancePoints()` extracts valid `[lon, lat]` points from hazard polygons.
3. Live Directions API fetches both direct route and excluded route when token is available.

- [ ] **Step 2: Run test to check failures**
Run test script and verify gaps.

- [ ] **Step 3: Implement route generator & avoidance point extractor in `routing.ts`**
- Implement `extractHazardAvoidancePoints(hazards: GeoJsonFeatureCollection): Array<[number, number]>`.
- Query direct route for `compromised-route` and excluded route for `evacuation-route`.
- If avoidance query fails to find a detour, fall back to cached avoidance path while preserving start/destination.

- [ ] **Step 4: Run test to confirm it passes**
Run verification script and confirm.

- [ ] **Step 5: Verify frontend build**
Run: `cd frontend && npm run build`

---

### Task 3: Full End-to-End Verification & Dev 1 Compatibility

**Files:**
- Verify: `frontend/src/services/turfSafeZone.ts`
- Verify: `frontend/src/services/routing.ts`
- Verify: `frontend/src/App.tsx`

- [ ] **Step 1: Verify seamless compatibility with `App.tsx` calls**
Confirm `calculateRescueRoute()` can be called without parameters (as `App.tsx` currently does) OR with `(startCoord, destinationCoord, hazardData)` gracefully.

- [ ] **Step 2: Run full production build**
Run: `cd frontend && npm run build` (must exit 0).

- [ ] **Step 3: Commit changes to `dev-2` branch**
Commit with clear commit message outlining Phase 1 and Phase 2 completion.
