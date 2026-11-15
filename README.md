# 🛡️ Project Aegis: Tactical Disaster Recovery Terminal

> **Rapid orbital damage detection (`qwen3-vl:4b`), spatial safe-zone siting (`Turf.js`), and emergency avoidance routing (`Mapbox GL`).**  
> Built for a 3-developer, 5-hour hackathon sprint with zero dependency bottlenecks and 100% offline fallback resilience.
<img width="581" height="814" alt="image" src="https://github.com/user-attachments/assets/b9c660c8-1816-49e0-a640-d4fa01256cf2" />

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
# 1. Ensure Ollama is running with qwen3-vl:4b
ollama pull qwen3-vl:4b
ollama serve

# 2. Start the FastAPI server
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```
Backend runs at **[http://localhost:8000](http://localhost:8000)** (Interactive Swagger docs at **`/docs`**).

---

## 👥 The 3-Developer Division of Labor

See **[CHECKLIST.md](file:///Users/jaedenting/Dev/Kiro-Hackathon/CHECKLIST.md)** for the step-by-step hourly task breakdown for each teammate.

| Teammate | Role | Primary Files Owned | Responsibilities |
| :--- | :--- | :--- | :--- |
| **Dev 1** | **Tactical UI & 3D Map Lead** | `frontend/src/components/MapView.tsx`<br>`frontend/src/components/TacticalHUD.tsx`<br>`frontend/src/App.tsx` | Dark military HUD, 3D terrain & building extrusions, glowing neon layers, before/after satellite modal, camera `flyTo` choreography |
| **Dev 2** | **Spatial Math & Routing Lead** | `frontend/src/services/turfSafeZone.ts`<br>`frontend/src/services/routing.ts`<br>`shared/fallback_safe_zones.json`<br>`shared/fallback_route.json` | Turf.js safe-zone intersection (`turf.buffer` + `turf.difference` + `turf.centroid`) AND Mapbox Directions dynamic hazard-avoidance routing |
| **Dev 3** | **Edge AI (`qwen3-vl:4b`) & Pitch Lead** | `backend/app/services/vision_analyzer.py`<br>`backend/app/routers/disaster.py`<br>`shared/fallback_damage.json` | FastAPI + local `qwen3-vl:4b` vision prompt tuning, image-ratio to `[lon, lat]` bounding box conversion, golden cache, and 3-min pitch deck |

---

## 🚨 Two Critical Rules for the Entire Team

1. **Strict Coordinate Order: `[longitude, latitude]`**  
   GeoJSON, Turf.js, and Mapbox GL JS strictly require **`[lon, lat]`** (e.g. `[101.6938, 3.1408]`).  
   *Never pass `[lat, lon]`, or your polygons will render in the middle of the Indian Ocean!*

2. **The Golden Cache Guarantee (Offline-Safe Demo)**  
   If `qwen3-vl:4b` inference is slow on laptop hardware or venue Wi-Fi drops during judging, both the frontend and backend automatically fall back to pre-baked golden GeoJSON files in `shared/`:
   - `shared/fallback_damage.json` (3 critical hazard polygons)
   - `shared/fallback_safe_zones.json` (3 high-elevation relief camp sites)
   - `shared/fallback_route.json` (compromised direct route vs. active bypass route)

---

## 🗺️ Locked Target Scenario: Klang River Basin (Kuala Lumpur)

Spatial bounds are hard-locked in `shared/config.json`:
- **Center**: `[101.6938, 3.1408]` (Merdeka 118 / Klang-Gombak Confluence)
- **Bounding Box**: `[101.6600, 3.1100, 101.7300, 3.1700]` (~7.7 km × 6.6 km tactical area)
- **Primary Hazards**: Lebuh Pasar Besar bridge washout, Federal Highway underpass flooding
- **Relief Camp Alpha**: Stadium Merdeka Plateau (+68m elevation, direct highway access)

---

## 📚 Documentation Index

- **[CHECKLIST.md](file:///Users/jaedenting/Dev/Kiro-Hackathon/CHECKLIST.md)** — Segregated 3-developer task checklists & hourly sprint milestones
- **[SPEC.md](file:///Users/jaedenting/Dev/Kiro-Hackathon/SPEC.md)** — Full product & technical specification, API schemas & spatial equations
- **[DESIGN.md](file:///Users/jaedenting/Dev/Kiro-Hackathon/DESIGN.md)** — "Orbital Defense Command" UI design system, color tokens & camera choreography
- **[SKILLS.md](file:///Users/jaedenting/Dev/Kiro-Hackathon/SKILLS.md)** — Copy-paste engineering playbooks (Mapbox 3D, Turf.js v7, `qwen3-vl:4b`, Routing)
- **[AGENT.md](file:///Users/jaedenting/Dev/Kiro-Hackathon/AGENT.md)** & **[CLAUDE.md](file:///Users/jaedenting/Dev/Kiro-Hackathon/CLAUDE.md)** — AI coding assistant rules & invariants
