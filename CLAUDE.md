# CLAUDE.md

This file provides guidance to Claude Code (and compatible CLI agents) when working with code in this repository.

## Project Overview
**Project Aegis** is a Tactical Disaster Recovery Terminal built for a 3-developer, 5-hour hackathon sprint. It combines:
1. **Local Edge AI Damage Detection** (`backend/`): FastAPI + Ollama (`qwen3-vl:4b`) converting satellite imagery anomalies into GeoJSON hazard polygons.
2. **Client-Side Spatial Math** (`frontend/src/services/turfSafeZone.ts`): Turf.js buffering and polygon difference math to site high-elevation relief camps.
3. **Hazard-Excluded Dynamic Routing** (`frontend/src/services/routing.ts`): Mapbox Directions API routing around flooded/collapsed infrastructure.
4. **3D Tactical HUD** (`frontend/src/components/`): React + Tailwind CSS + Mapbox GL JS 3D terrain canvas.

## Essential Commands

### Frontend (`frontend/`)
- **Install**: `cd frontend && npm install`
- **Dev Server**: `cd frontend && npm run dev` (runs on `http://localhost:5173`)
- **Typecheck & Build**: `cd frontend && npm run build` (`tsc && vite build`)

### Backend (`backend/`)
- **Activate Venv**: `source backend/venv/bin/activate`
- **Install**: `cd backend && ./venv/bin/pip install -r requirements.txt`
- **Dev Server**: `cd backend && ./venv/bin/uvicorn app.main:app --reload --port 8000`
- **Quick Smoke Test**:
  ```bash
  cd backend && ./venv/bin/python -c "from fastapi.testclient import TestClient; from app.main import app; c = TestClient(app); print(c.get('/api/health').json())"
  ```

## Path Aliases (`frontend/`)
- `@/*` resolves to `frontend/src/*`
- `@shared/*` resolves to `shared/*` (e.g., `import missionConfig from '@shared/config.json'`)

## Critical Architectural Invariants
1. **`[longitude, latitude]` Coordinate Order**: All coordinates across `shared/`, `frontend/`, and `backend/` are `[lon, lat]` within the Klang River Basin bounding box (`[101.6600, 3.1100, 101.7300, 3.1700]`). Never use `[lat, lon]`.
2. **Offline Fallback First**: Both frontend (`src/services/api.ts`, `routing.ts`, `turfSafeZone.ts`) and backend (`app/services/vision_analyzer.py`) automatically fall back to `shared/fallback_*.json` when API keys (`VITE_MAPBOX_TOKEN`, `OPENAI_API_KEY`) are absent or network requests fail. Preserve this behavior in all edits.
3. **Mapbox Source & Layer IDs**: `MapView.tsx` manages three primary GeoJSON sources:
   - `hazards-src` (layers: `hazards-fill`, `hazards-line`)
   - `safe-zones-src` (layers: `safe-zones-fill`, `safe-zones-line`)
   - `route-src` (layers: `route-compromised`, `route-safe`, `route-waypoints`)
   Do not rename these source IDs without updating all `useEffect` data-sync hooks in `MapView.tsx`.

## Reference Docs
- See `@SPEC.md` for full data contracts and mathematical formulas.
- See `@DESIGN.md` for the military HUD aesthetic, color palette, and camera choreography.
- See `@SKILLS.md` for copy-paste recipes for Mapbox GL, Turf.js, GPT-4o Vision, and Routing.
