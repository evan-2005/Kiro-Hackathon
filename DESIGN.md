# Project Aegis — Tactical UI & Visual Design System (`DESIGN.md`)

## 1. Aesthetic Direction: "Orbital Defense Command"
Project Aegis avoids flat consumer map styling in favor of a high-contrast, dark-mode **Military & Aerospace Tactical Terminal** inspired by Palantir Gotham, Anduril Lattice, and NASA Mission Control HUDs.

### Core Visual Pillars
1. **Deep Obsidian Canvas**: Dark terrain (`mapbox://styles/mapbox/dark-v11`) with 1.5x exaggerated 3D elevation and extruded dark slate buildings (`#0F172A`) so neon tactical overlays pop with maximum contrast.
2. **Semantic Neon Chromatics**: Every color on screen carries strict operational meaning—never use decorative colors that compete with hazard crimson, safe-zone cyan, or route emerald.
3. **Monospaced Telemetry Precision**: All coordinates, elevation readouts, timestamps, and streaming logs use `JetBrains Mono` with uppercase tracking and bracketed status tags (`[01]`, `[SAT-LINK]`, `[VALIDATED]`).
4. **Cinematic Camera Choreography**: Every mission step triggers a smooth 3D camera transition (`pitch: 50°–62°`) so the map feels alive during the 90-second live demo.

---

## 2. Color Tokens & Semantic Palette

Configured in `frontend/tailwind.config.js` under `theme.extend.colors.radar`:

| Token / Hex | Tailwind Class | Operational Meaning | Usage |
| :--- | :--- | :--- | :--- |
| **`#070B12`** | `bg-radar-dark` | Deep Space / Base Background | Root viewport background, terminal log well |
| **`#0B111E`** | `bg-[#0B111E]/95` | Glassmorphic HUD Surface | Sidebar backdrop with `backdrop-blur-md` |
| **`#1E2A42`** | `border-radar-border` | Structural Grid Lines | Panel borders, dividers, inactive cards |
| **`#00F0FF`** | `text-radar-cyan` | **Safe Zone / Orbital Telemetry** | Safe camp polygons, primary HUD accents, active radar indicators |
| **`#FF0055`** | `text-radar-crimson` | **Critical Hazard / Breach** | Flood/collapse polygons, danger alerts, step `[01]` accents |
| **`#00FF66`** | `text-radar-green` | **Active Rescue Corridor** | Optimized avoidance route polyline, step `[03]` accents, online status |
| **`#FFB800`** | `text-radar-amber` | **Warning / Evacuation Origin** | Trapped civilian markers, caution banners |
| **`#94A3B8`** | `text-slate-400` | Compromised / Secondary | Dashed impassable route line, secondary metadata labels |

---

## 3. Typography & Hierarchy

- **Primary Font**: `'JetBrains Mono', Menlo, Monaco, Consolas, monospace`
- **HUD Section Headers**: `text-[10px] font-mono uppercase tracking-wider text-slate-400`
- **Action Button Titles**: `text-xs font-bold tracking-wide uppercase`
- **Telemetry Log Stream**: `text-[10px] font-mono leading-snug` with semantic syntax highlighting:
  - Logs containing `CRITICAL` or `HAZARD` render in `text-radar-crimson`.
  - Logs containing `SAFE` or `RESOLVED` render in `text-radar-cyan`.
  - Logs containing `CORRIDOR` or `DEPLOYED` render in `text-radar-green`.

---

## 4. Layout & Component Architecture

```text
+-----------------------------------------------------------------------+
| [TacticalHUD: w-96 (384px) fixed left] | [MapView: flex-1 3D Canvas]  |
|                                        |                              |
|  • Header: PROJECT AEGIS [SEC-DEF v1]  |  • Top-Left: WGS-84 Grid Bar |
|  • Mission Controls (Steps 01, 02, 03) |    [101.6938°E, 3.1408°N]    |
|  • Intelligence Cards (Scrollable)     |                              |
|    - Detected Hazard Corridors (Red)   |  • Center: 3D Extruded Map   |
|    - Optimal Relief Camps (Cyan)       |    - Crimson Hazard Polygons |
|  • Live Telemetry Stream (Bottom h-28) |    - Cyan Relief Camp Zones  |
|    > [SAT-LINK] Ingesting...           |    - Green Rescue Polyline   |
|    > [TURF-ENGINE] Resolved...         |                              |
|                                        |  • Bottom-Right: 3D Compass  |
+-----------------------------------------------------------------------+
```

---

## 5. Mapbox GL Layer Specifications (`MapView.tsx`)

| Layer ID | Type | Source | Paint Properties |
| :--- | :--- | :--- | :--- |
| `3d-buildings` | `fill-extrusion` | `composite` | `color: #0F172A`, `opacity: 0.6`, dynamic `height` |
| `hazards-fill` | `fill` | `hazards-src` | `fill-color: #FF0055`, `fill-opacity: 0.45` |
| `hazards-line` | `line` | `hazards-src` | `line-color: #FF0055`, `line-width: 2.5`, `line-opacity: 0.9` |
| `safe-zones-fill` | `fill` | `safe-zones-src` | `fill-color: #00F0FF`, `fill-opacity: 0.35` |
| `safe-zones-line` | `line` | `safe-zones-src` | `line-color: #00F0FF`, `line-width: 2.5`, `line-opacity: 0.9` |
| `route-compromised` | `line` | `route-src` | `line-color: #94A3B8`, `line-width: 3`, `line-dasharray: [2, 2]` |
| `route-safe` | `line` | `route-src` | `line-color: #00FF66`, `line-width: 5`, `line-opacity: 0.95` |
| `route-waypoints` | `circle` | `route-src` | `circle-radius: 8`, `circle-stroke-width: 2`, `circle-stroke-color: #FFF` |

---

## 6. Camera Choreography & Micro-Interactions

| Transition Trigger | Target Center `[lon, lat]` | Zoom | Pitch | Bearing | Duration |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Initial Boot (`IDLE`)** | `[101.6938, 3.1408]` | `13.8` | `52°` | `-18°` | Instant |
| **Step 01 (`HAZARDS_DETECTED`)** | `[101.6935, 3.1420]` | `14.8` | `58°` | `-10°` | `2500ms` |
| **Step 02 (`SAFE_ZONES_COMPUTED`)** | `[101.6980, 3.1360]` | `14.2` | `50°` | `+15°` | `2500ms` |
| **Step 03 (`ROUTE_DISPATCHED`)** | `[101.6940, 3.1360]` | `14.5` | `62°` | `+45°` | `3000ms` |

### Button Progression UX
- Only the current next logical step is illuminated with an active neon border and hover glow (`hover:shadow-[0_0_15px_...]`).
- Completed steps display a monospaced status badge (`COMPLETE`, `RESOLVED`, `DEPLOYED`) and dim to `opacity-80` so the operator's eye is guided strictly down the 1-2-3 tactical workflow.
