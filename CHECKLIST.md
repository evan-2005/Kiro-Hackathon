# 📋 Project Aegis — 3-Developer Segregation & 5-Hour Checklist (`CHECKLIST.md`)

> **Team Size**: 3 Developers  
> **AI Vision Model**: `qwen3-vl:4b` (Local Edge Multimodal Vision via Ollama)  
> **Target Area**: Klang River Basin, Kuala Lumpur `[101.6600, 3.1100, 101.7300, 3.1700]`  
> **Coordinate Rule**: Strictly **`[longitude, latitude]`** everywhere!

---

## 🧭 How the Work is Segregated Across 3 Devs (Zero Merge Conflicts)

| Developer | Role Title | Owned Directories & Files | Core Responsibility |
| :--- | :--- | :--- | :--- |
| **Dev 1** | **Tactical UI & 3D Map Lead** | `frontend/src/components/MapView.tsx`<br>`frontend/src/components/TacticalHUD.tsx`<br>`frontend/src/App.tsx`<br>`frontend/src/index.css` | Mapbox 3D terrain & buildings, neon GeoJSON layers, glassmorphic HUD, before/after satellite modal, camera `flyTo` choreography |
| **Dev 2** | **Spatial Math & Routing Lead** | `frontend/src/services/turfSafeZone.ts`<br>`frontend/src/services/routing.ts`<br>`shared/fallback_safe_zones.json`<br>`shared/fallback_route.json` | Turf.js safe-zone calculation (`buffer` + `difference` + `centroid`) AND Mapbox Directions dynamic hazard-avoidance routing |
| **Dev 3** | **AI Vision (`qwen3-vl:4b`) & Pitch Lead** | `backend/app/services/vision_analyzer.py`<br>`backend/app/routers/disaster.py`<br>`shared/fallback_damage.json`<br>`pitch/` | FastAPI + Ollama (`qwen3-vl:4b`) vision prompt tuning, image-ratio to `[lon, lat]` polygon projection, golden cache, and 3-min pitch deck |

---

## 👨‍💻 DEV 1: Tactical UI & 3D Mapbox Lead
**Workspace**: `frontend/src/components/` & `frontend/src/App.tsx`

### Phase 1: Setup & Base 3D Map (Hours 0:00 – 1:00)
- [ ] Run `cd frontend && npm install && npm run dev` and verify `http://localhost:5173` loads.
- [ ] Add `VITE_MAPBOX_TOKEN=pk.eyJ...` to `frontend/.env` to unlock the 3D WebGL canvas.
- [ ] Verify 3D terrain (`mapbox-dem`, exaggeration `1.5`) and 3D dark building extrusions (`3d-buildings`) render cleanly over Kuala Lumpur.

### Phase 2: Tactical Layers & Visual Polish (Hours 1:00 – 2:30)
- [ ] Add interactive Mapbox click popups on `hazards-fill` (showing `title`, `severity`, `waterDepthEstM`, `infrastructureImpact`) and `safe-zones-fill` (showing `name`, `elevationM`, `capacityPersons`).
- [ ] Build a **Before / After Satellite Comparison** overlay or thumbnail preview in `TacticalHUD.tsx` when clicking `[01] INGEST SATELLITE DATA` so judges visually see the raw satellite image that `qwen3-vl:4b` is scanning.
- [ ] Add pulsing markers or animated dash arrays on the active green rescue route (`route-safe`).

### Phase 3: Integration & Camera Choreography (Hours 3:15 – 5:00)
- [ ] Wire Dev 2's `computeSafeReliefZones()` and `calculateRescueRoute()` outputs into `App.tsx` state.
- [ ] Tune the 3 `map.flyTo(...)` camera transitions in `MapView.tsx` so each button click smoothly swoops to the action area.
- [ ] Record a 60-second clean screen capture at **Hour 4:45** as the emergency pitch backup video.

---

## 📐 DEV 2: Spatial Math (Turf.js) & Dynamic Routing Lead
**Workspace**: `frontend/src/services/turfSafeZone.ts` & `frontend/src/services/routing.ts`

### Phase 1: Turf.js Safe-Zone Engine (Hours 0:00 – 1:30)
- [ ] Inspect `frontend/src/services/turfSafeZone.ts` and `shared/fallback_safe_zones.json`.
- [ ] Verify `computeSafeReliefZones(dangerZones)` buffers all incoming AI hazard polygons by `150m–200m` (`turf.buffer(feat, 0.15, { units: 'kilometers' })`).
- [ ] Subtract buffered hazard zones from candidate high-elevation polygons using Turf v7 syntax: `turf.difference(turf.featureCollection([candidate, bufferedHazards]))`.
- [ ] Compute `turf.centroid` and `turf.area` dynamically for each surviving safe zone and attach `centroid: [lon, lat]` and `computedAreaSqM` to its feature properties.

### Phase 2: Hazard-Avoidance Routing Engine (Hours 1:30 – 2:30)
- [ ] Inspect `frontend/src/services/routing.ts` and `shared/fallback_route.json`.
- [ ] Extract road-hazard intersection coordinates (using `turf.lineIntersect` or polygon centroids) to pass into Mapbox Directions API `exclude=point(lon lat)`.
- [ ] Ensure `calculateRescueRoute()` returns **both**:
  1. `compromised-route` (`status: 'IMPASSABLE'`, dashed grey) cutting straight through the flood zone.
  2. `evacuation-route` (`status: 'ACTIVE_SECURE'`, glowing green) routing safely around the hazard polygon to the optimal Safe Zone's `centroid`.

### Phase 3: Integration & Edge-Case Hardening (Hours 3:15 – 5:00)
- [ ] Test with Dev 3's live `qwen3-vl:4b` output polygons to ensure no coordinate order flips (`[lon, lat]`) or self-intersecting polygon crashes occur.
- [ ] Verify that if Mapbox Directions API rate-limits or lacks a token, `shared/fallback_route.json` renders seamlessly.

---

## 🤖 DEV 3: Local AI Vision (`qwen3-vl:4b`) & Pitch Lead
**Workspace**: `backend/` & `shared/fallback_damage.json`

### Phase 1: Local `qwen3-vl:4b` & FastAPI Setup (Hours 0:00 – 1:15)
- [ ] Pull and start `qwen3-vl:4b` locally via Ollama:
  ```bash
  ollama pull qwen3-vl:4b
  ollama serve
  ```
- [ ] Start the FastAPI backend:
  ```bash
  cd backend
  source venv/bin/activate
  uvicorn app.main:app --reload --port 8000
  ```
- [ ] Verify `http://localhost:8000/docs` loads and test `POST /api/analyze-disaster`.

### Phase 2: Vision Prompt Tuning & Golden Cache (Hours 1:15 – 2:30)
- [ ] Select 1 pair of before/after satellite flood images of Kuala Lumpur (or composite flood water onto a satellite screenshot of the Klang-Gombak river confluence).
- [ ] Tune the system prompt in `backend/app/services/vision_analyzer.py` so `qwen3-vl:4b` outputs clean normalized bounding boxes (`min_x, min_y, max_x, max_y` in `0.0–1.0`).
- [ ] **THE GOLDEN CACHE RULE (Before Lunch at 2:30)**: Run a successful `qwen3-vl:4b` inference, verify the projected `[lon, lat]` polygons land accurately over the river/bridges in Kuala Lumpur, and save that exact output into `shared/fallback_damage.json`.

### Phase 3: 3-Minute Pitch Deck & Storyboard (Hours 3:15 – 6:00)
- [ ] Flip `USE_FALLBACK_MOCK=true` in `backend/.env` if `qwen3-vl:4b` inference takes > 3 seconds on laptop hardware during the live demo so the UI responds in `< 1 second`.
- [ ] Build the 4-slide pitch deck emphasizing the **Edge AI angle**:
  - **Slide 1 (Problem)**: Static maps route ambulances onto flooded bridges; cloud AI fails when disaster knocks out internet backhaul.
  - **Slide 2 (Live Demo — 90s)**: Click `[01] Scan` -> `[02] Compute Safe Camps` -> `[03] Dispatch Route`.
  - **Slide 3 (Architecture)**: Edge `qwen3-vl:4b` Vision-to-GeoJSON -> Client-side Turf.js Spatial Math -> Polygon-Excluded Dynamic Routing.
  - **Slide 4 (Impact)**: Compresses 48 hours of manual GIS disaster triage into 30 seconds, running 100% locally at the tactical edge.

---

## ⏰ Master 6-Hour Synchronization Checkpoints

- [ ] **0:30 — Schema & Coordinate Lock**: All 3 devs confirm `[lon, lat]` order and run their local servers.
- [ ] **2:30 — Working Lunch & Golden Cache Lock**: Dev 3 saves `qwen3-vl:4b` output to `shared/fallback_damage.json`.
- [ ] **3:15 — Integration Crucible**: Merge Dev 1, Dev 2, and Dev 3 branches into `main` on the presentation laptop.
- [ ] **4:15 — Hard Feature Cutoff**: Stop writing new backend/math logic; focus 100% on camera transitions and UI polish.
- [ ] **5:00 — Code Freeze**: Final `git push` + record 60s backup demo video.
- [ ] **6:00 — Finalist Pitch**: 1 person drives the mouse, 1 person pitches, all 3 handle Q&A (UI, GIS/Turf, Edge `qwen3-vl:4b`).
