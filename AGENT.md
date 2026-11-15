# AI Agent Operating Manual (`AGENT.md`)

This document defines the strict rules, architectural boundaries, and operational instructions for any autonomous AI coding agent (Antigravity, Kiro, Cursor, Windsurf, Copilot, Claude Code) working in this repository.

---

## 1. Golden Rules (NEVER Violate)

1. **Coordinate Order is ALWAYS `[longitude, latitude]`**:
   - Valid Kuala Lumpur coordinate: `[101.6938, 3.1408]`.
   - NEVER swap to `[lat, lon]`. Every GeoJSON file, Turf.js helper, Mapbox camera call, and FastAPI serializer must use `[lon, lat]`.
2. **Never Break the Offline Golden Fallback**:
   - The files in `shared/` (`config.json`, `fallback_damage.json`, `fallback_safe_zones.json`, `fallback_route.json`) are the source-of-truth safety net for the live hackathon pitch.
   - Any new API call or AI integration **must** degrade gracefully to these fallback JSONs inside a `try / catch` block if an API key is missing, rate-limited, or times out.
3. **Respect the 3-Developer File Ownership Boundaries**:
   - When asked to work on a specific developer's track, only modify files belonging to that track unless explicitly performing final integration (see `CHECKLIST.md`):
     - **Dev 1 (Tactical UI & 3D Map Lead)**: `frontend/src/components/`, `frontend/src/App.tsx`, `frontend/src/index.css`
     - **Dev 2 (Spatial Math & Routing Lead)**: `frontend/src/services/turfSafeZone.ts`, `frontend/src/services/routing.ts`, `shared/fallback_safe_zones.json`, `shared/fallback_route.json`
     - **Dev 3 (Edge AI `qwen3-vl:4b` & Pitch Lead)**: `backend/app/services/vision_analyzer.py`, `backend/app/routers/disaster.py`, `shared/fallback_damage.json`
4. **No Heavy Infrastructure**:
   - Do NOT introduce Docker, PostgreSQL, PostGIS, Redis, Celery, or authentication middleware. Keep the stack lightweight and instant-booting.

---

## 2. Repository Map

```text
Kiro-Hackathon/
├── SPEC.md                     # Product & technical specification
├── DESIGN.md                   # UI/UX tactical design system & tokens
├── SKILLS.md                   # Implementation playbooks (Mapbox, Turf, Vision, Routing)
├── AGENT.md / CLAUDE.md        # Agent instructions
├── shared/                     # Shared JSON contracts & golden fallback cache
│   ├── config.json             # Locked bbox [101.66, 3.11, 101.73, 3.17] & camera defaults
│   ├── fallback_damage.json    # GeoJSON FeatureCollection of flood/collapse polygons
│   ├── fallback_safe_zones.json# GeoJSON FeatureCollection of relief camp polygons
│   └── fallback_route.json     # GeoJSON FeatureCollection of compromised & safe routes
├── frontend/                   # Vite + React 18 + TypeScript + Tailwind + Mapbox GL + Turf.js
│   ├── src/
│   │   ├── components/
│   │   │   ├── MapView.tsx     # 3D Mapbox WebGL canvas & GeoJSON layer manager
│   │   │   └── TacticalHUD.tsx # Glassmorphic sidebar, 3 mission buttons, log terminal
│   │   ├── services/
│   │   │   ├── api.ts          # Backend HTTP client with automatic fallback
│   │   │   ├── turfSafeZone.ts # Turf.js spatial buffer/difference engine
│   │   │   └── routing.ts      # Mapbox Directions API client with hazard exclusion
│   │   └── App.tsx             # 4-stage sequential state machine
└── backend/                    # Python 3 FastAPI + OpenAI GPT-4o Vision
    └── app/
        ├── main.py             # FastAPI app + CORS
        ├── config.py           # Env & shared config loader
        ├── routers/disaster.py # REST routes (/api/analyze-disaster, /api/safe-zones, etc.)
        └── services/vision_analyzer.py # GPT-4o structured output & bbox coordinate scaler
```

---

## 3. Build & Verification Commands

Before completing any task, always run the relevant verification command:

### Frontend Verification
```bash
cd frontend
npm run build
```
*Must exit with code `0` (`tsc && vite build`).*

### Backend Verification
```bash
cd backend
./venv/bin/python -c "
from fastapi.testclient import TestClient
from app.main import app
client = TestClient(app)
assert client.get('/api/health').status_code == 200
assert client.post('/api/analyze-disaster', json={'force_mock': True}).status_code == 200
print('BACKEND OK')
"
```

---

## 4. Coding Conventions
- **TypeScript / React**: Functional components, strict typing (`GeoJsonFeatureCollection`), Tailwind utility classes using custom `radar-*` tokens (`radar-cyan`, `radar-crimson`, `radar-green`, `radar-amber`), `lucide-react` for iconography.
- **Python / FastAPI**: Pydantic v2 models for request/response validation, `pathlib.Path` for file resolution, structured logging, explicit HTTP status codes.
- **GeoJSON Integrity**: Every `Polygon` geometry's outer ring must be closed (first `[lon, lat]` pair must strictly equal the last `[lon, lat]` pair).
