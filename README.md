# 🛡️ Project Aegis: Tactical Disaster Recovery Terminal

> **Rapid orbital damage detection (`qwen3-vl:4b`), spatial safe-zone siting (`Turf.js`), and emergency avoidance routing (`Mapbox GL`).**  
> Built for a 3-developer, 5-hour hackathon sprint with zero dependency bottlenecks and 100% offline fallback resilience.

---

## 📋 Repository Summary & System Overview

**Project Aegis** is an automated post-disaster tactical decision terminal designed to compress days of manual GIS emergency planning into a **< 30-second operational workflow**. When severe floods, typhoons, or earthquakes strike, static navigation fails because bridges wash out and low-lying corridors flood, while identifying safe relief camp locations requires complex multi-criteria topographic analysis.

### 🔁 The 3-Stage Tactical Pipeline
1. **`[01] DETECT` — Edge AI Vision-to-GeoJSON (`backend/`)**:
   - Ingests aligned before/after optical or SAR satellite imagery over a locked operational bounding box.
   - Runs local multimodal vision inference via **Ollama (`qwen3-vl:4b` / `qwen3-vl:4b-aegis`)** using structured Pydantic schemas (`VisionAnalysisResult`) to identify flood overtopping, bridge washouts, and structural collapse without requiring cloud internet backhaul.
   - Transforms normalized image bounding boxes (`[min_x, min_y, max_x, max_y]` in `[0.0, 1.0]`) into closed counter-clockwise WGS-84 (`[longitude, latitude]`) GeoJSON `Polygon` features.
2. **`[02] COMPUTE` — Client-Side Spatial Safe-Zone Engine (`frontend/src/services/turfSafeZone.ts`)**:
   - Sanitizes incoming AI hazard geometries (auto-correcting flipped coordinates, closing rings, and unkinking self-intersecting polygons via `turf.unkinkPolygon`).
   - Applies a **+150m safety buffer** (`turf.buffer`) around all detected hazards and subtracts the unified danger zone from high-elevation candidate plateaus (`>= 45m` elevation) using `turf.difference`.
   - Filters surviving plateaus by minimum usable area (`>= 5,000 m²`), dynamically recalculates person capacity (`areaSqM / 8`), and extracts optimal rescue centroids (`turf.centroid`) sorted largest-first.
3. **`[03] ROUTE` — Dynamic Polygon-Excluded Rescue Routing (`frontend/src/services/routing.ts`)**:
   - Connects trapped civilians / emergency units (`[101.6865, 3.1340]` at KL Sentral) to the primary validated Safe Zone centroid.
   - Computes both the **Standard Direct Route (`IMPASSABLE`)** and an **Active Avoidance Corridor (`ACTIVE_SECURE`)** by extracting line-polygon intersections (`turf.lineIntersect`) and hazard centroids to pass as `exclude=point(lon lat)` parameters to the Mapbox Directions API, verifying the final geometry against the 150m hazard buffer.

---

## 🏗️ Architecture & Tech Stack

| Layer | Technology Stack | Key Capabilities |
| :--- | :--- | :--- |
| **Frontend UI & 3D GIS** | React 18, TypeScript, Vite, Tailwind CSS, `mapbox-gl` v3.8, `lucide-react` | "Orbital Defense Command" dark HUD (`#070B12`), 1.5x exaggerated 3D DEM terrain, extruded 3D buildings, animated dash-flow rescue corridors, before/after split-screen `SatelliteScanModal`, and stage-driven 3D camera choreography. |
| **Spatial Math Engine** | `@turf/turf` v7.1 | Polygon sanitization (`kinks`/`unkinkPolygon`), hazard buffering (`buffer`), boolean clipping (`difference`/`union`), intersection extraction (`lineIntersect`), and area/centroid calculations. |
| **Edge AI Backend** | Python 3, FastAPI, Uvicorn, OpenAI SDK (Ollama `/v1`), Pydantic v2 | REST API (`/api/analyze-disaster`, `/api/safe-zones`, `/api/evacuation-route`, `/api/config`, `/api/health`), structured vision output parsing, normalized-to-WGS84 coordinate projection, and instant golden-cache fallback. |
| **Shared Contracts & Pitch** | GeoJSON (`EPSG:4326`), Python benchmark & capture scripts | Single-source-of-truth spatial configuration (`shared/config.json`), offline fallback GeoJSONs (`shared/fallback_*.json`), reproducible live Qwen3-VL capture (`pitch/capture_scan.py`), and prompt/model benchmarks (`pitch/`). |

### 📂 Repository Structure

```text
Kiro-Hackathon/
├── README.md                        # Project overview, architecture summary & quickstart
├── SPEC.md                          # Product & technical specification, equations & API schemas
├── DESIGN.md                        # "Orbital Defense Command" UI design system & color tokens
├── SKILLS.md                        # Engineering playbooks (Mapbox 3D, Turf.js v7, Qwen3-VL, Routing)
├── CHECKLIST.md                     # Segregated 3-developer task checklists & hourly sprint milestones
├── AGENT.md / CLAUDE.md             # AI assistant operating rules & architectural invariants
├── shared/                          # Cross-stack GeoJSON contracts & golden fallback cache
│   ├── config.json                  # Locked KL bounding box [101.66, 3.11, 101.73, 3.17] & camera defaults
│   ├── fallback_damage.json         # Cached GeoJSON FeatureCollection of AI-detected flood hazards
│   ├── fallback_safe_zones.json     # Candidate & validated high-elevation relief camp polygons
│   └── fallback_route.json          # Compromised direct route vs. verified hazard-avoidance corridor
├── frontend/                        # React 18 + TypeScript + Vite + Mapbox GL + Turf.js
│   ├── public/imagery/              # Before/After satellite imagery for the HUD scan modal
│   ├── scripts/                     # Node.js verification suites (routing, Turf safe zones, API demo)
│   └── src/
│       ├── App.tsx                  # 4-stage tactical state machine (IDLE -> HAZARDS -> SAFE_ZONES -> ROUTE)
│       ├── components/
│       │   ├── MapView.tsx          # 3D Mapbox WebGL terrain, building extrusions, neon layers & popups
│       │   ├── TacticalHUD.tsx      # Glassmorphic sidebar, 3-step mission controls, telemetry stream
│       │   └── SatelliteScanModal.tsx # Interactive before/after split slider & scanline sweep modal
│       └── services/
│           ├── api.ts               # Backend HTTP client with timeout & automatic golden fallback
│           ├── turfSafeZone.ts      # Turf.js spatial sanitization, buffering & polygon difference engine
│           └── routing.ts           # Mapbox Directions dual-corridor router with hazard exclusion
├── backend/                         # Python FastAPI + Ollama Local Vision Pipeline
│   ├── Modelfile                    # Ollama model definition (qwen3-vl:4b with 8192 context window)
│   ├── requirements.txt             # FastAPI, Uvicorn, OpenAI SDK, Pydantic v2, httpx
│   ├── app/
│   │   ├── main.py                  # FastAPI entry point, CORS middleware & /api/health
│   │   ├── config.py                # Environment configuration & shared JSON path resolver
│   │   ├── routers/disaster.py      # REST endpoints (/api/analyze-disaster, /api/safe-zones, etc.)
│   │   └── services/vision_analyzer.py # Qwen3-VL prompt pipeline, Pydantic schema & bbox-to-GeoJSON scaler
│   └── tests/
│       └── test_vision_analyzer.py  # Unit tests for projection math, polygon winding & fallback resilience
├── pitch/                           # Live AI capture scripts, benchmark suites & satellite assets
│   ├── capture_scan.py              # End-to-end live Qwen3-VL inference capture & GeoJSON verifier
│   ├── benchmark_models.py          # Vision model latency & accuracy benchmarking tool
│   ├── test_vision_prompt.py        # Prompt engineering evaluation harness
│   ├── assets/                      # Esri before imagery, synthetic flood composite & Sentinel-2 reference pair
│   └── evidence/                    # Captured live GeoJSON, timing metrics & SVG projection overlays
└── sites/aegis-kl-demo/             # Standalone static deployment target for the KL tactical demo
```

---

## ⚡ Master Quickstart (< 2 Minutes)

### 1. Frontend (Tactical UI & Spatial Engine — Dev 1 & Dev 2)
```bash
cd frontend
npm install
npm run dev
```
Open **[http://localhost:5173](http://localhost:5173)** in your browser.

> [!TIP]
> **Mapbox Token**: Add your public Mapbox token to `frontend/.env` (`VITE_MAPBOX_TOKEN=pk.eyJ...`, see `frontend/.env.example`).
> Even without a token or internet connection, all spatial math, fallback GeoJSON mocks, and terminal logs execute cleanly!

### 2. Backend + Local `qwen3-vl:4b` AI Vision Pipeline (Dev 3)
```bash
# 1. Ensure Ollama is running with qwen3-vl:4b (and optional 8k context alias)
ollama pull qwen3-vl:4b
ollama create qwen3-vl:4b-aegis -f backend/Modelfile
ollama serve

# 2. Start the FastAPI server
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```
Backend runs at **[http://localhost:8000](http://localhost:8000)** (Interactive Swagger docs at **`/docs`**).

---

## 🧪 Verification & Testing Suite

Both the frontend and backend include automated verification scripts to guarantee zero regressions during rapid iteration:

```bash
# Frontend TypeScript & Vite production build check
cd frontend && npm run build

# Frontend spatial math, routing & API integration scripts
node frontend/scripts/test-turfSafeZone.mjs
node frontend/scripts/test-routing.mjs
node frontend/scripts/test-phase3-hardening.mjs

# Backend unit & API smoke tests (projection, winding order, fallback handling)
cd backend && ./venv/bin/python -m unittest discover -s tests -v
```

---

## 👥 The 3-Developer Division of Labor

See **[CHECKLIST.md](file:///Users/jaedenting/Dev/Kiro-Hackathon/CHECKLIST.md)** for the step-by-step hourly task breakdown for each teammate.

| Teammate | Role | Primary Files Owned | Responsibilities |
| :--- | :--- | :--- | :--- |
| **Dev 1** | **Tactical UI & 3D Map Lead** | `frontend/src/components/MapView.tsx`<br>`frontend/src/components/TacticalHUD.tsx`<br>`frontend/src/components/SatelliteScanModal.tsx`<br>`frontend/src/App.tsx` | Dark military HUD, 3D terrain & building extrusions, glowing neon layers, before/after satellite modal, camera `flyTo`/`fitBounds` choreography |
| **Dev 2** | **Spatial Math & Routing Lead** | `frontend/src/services/turfSafeZone.ts`<br>`frontend/src/services/routing.ts`<br>`shared/fallback_safe_zones.json`<br>`shared/fallback_route.json` | Turf.js safe-zone intersection (`turf.buffer` + `turf.difference` + `turf.centroid`) AND Mapbox Directions dynamic hazard-avoidance routing |
| **Dev 3** | **Edge AI (`qwen3-vl:4b`) & Pitch Lead** | `backend/app/services/vision_analyzer.py`<br>`backend/app/routers/disaster.py`<br>`shared/fallback_damage.json`<br>`pitch/` | FastAPI + local `qwen3-vl:4b` vision prompt tuning, image-ratio to `[lon, lat]` bounding box conversion, golden cache, and live capture evidence |

---

## 🚨 Two Critical Rules for the Entire Team

1. **Strict Coordinate Order: `[longitude, latitude]`**  
   GeoJSON, Turf.js, and Mapbox GL JS strictly require **`[lon, lat]`** (e.g. `[101.6938, 3.1408]`).  
   *Never pass `[lat, lon]`, or your polygons will render in the middle of the Indian Ocean!*

2. **The Golden Cache Guarantee (Offline-Safe Demo)**  
   If `qwen3-vl:4b` inference is slow on laptop hardware (`~188s` for dual-image 8k-context local inference vs. `0.014s` cached) or venue Wi-Fi drops during judging, both the frontend and backend automatically fall back to pre-baked golden GeoJSON files in `shared/`:
   - `shared/fallback_damage.json` (captured live Qwen3-VL flood hazard polygon; 3-hazard preset preserved in `pitch/evidence/previous-fallback-damage.json`)
   - `shared/fallback_safe_zones.json` (3 high-elevation relief camp sites)
   - `shared/fallback_route.json` (compromised direct route vs. active bypass route)

---

## 🗺️ Locked Target Scenario: Klang River Basin (Kuala Lumpur)

Spatial bounds are hard-locked in `shared/config.json`:
- **Center**: `[101.6938, 3.1408]` (Merdeka 118 / Klang-Gombak Confluence)
- **Bounding Box**: `[101.6600, 3.1100, 101.7300, 3.1700]` (~7.7 km × 6.6 km tactical area)
- **Evacuation Origin**: `[101.6865, 3.1340]` (KL Sentral — trapped civilians / ambulance dispatch)
- **Primary Relief Camp Alpha**: `[101.7015, 3.1418]` (Stadium Merdeka Plateau, +68m elevation, direct highway access)

---

## 📚 Documentation Index

- **[CHECKLIST.md](file:///Users/jaedenting/Dev/Kiro-Hackathon/CHECKLIST.md)** — Segregated 3-developer task checklists & hourly sprint milestones
- **[SPEC.md](file:///Users/jaedenting/Dev/Kiro-Hackathon/SPEC.md)** — Full product & technical specification, API schemas & spatial equations
- **[DESIGN.md](file:///Users/jaedenting/Dev/Kiro-Hackathon/DESIGN.md)** — "Orbital Defense Command" UI design system, color tokens & camera choreography
- **[SKILLS.md](file:///Users/jaedenting/Dev/Kiro-Hackathon/SKILLS.md)** — Copy-paste engineering playbooks (Mapbox 3D, Turf.js v7, `qwen3-vl:4b`, Routing)
- **[pitch/README.md](file:///Users/jaedenting/Dev/Kiro-Hackathon/pitch/README.md)** — Dev 3 live Qwen3-VL capture methodology, timings, and satellite imagery attribution
- **[AGENT.md](file:///Users/jaedenting/Dev/Kiro-Hackathon/AGENT.md)** & **[CLAUDE.md](file:///Users/jaedenting/Dev/Kiro-Hackathon/CLAUDE.md)** — AI coding assistant rules & invariants
