# Project Aegis — UI & Visual Design System (`DESIGN.md`)

> **Changed:** this replaces the earlier "Orbital Defense Command" neon HUD. The UI is now designed for the people
> who would actually use it: **first responders who rescue people from flooded areas and transport them to shelters.**
> Source of truth for the implementation: `frontend/src/components/*` and `frontend/src/index.css`.

## 1. Design principles

1. **Dispatch console, not sci-fi.** Look and feel of real computer-aided dispatch / incident-command software:
   dark neutral surfaces, no neon, no glows, no scanlines, no fake telemetry, no spinning "system online" widgets.
2. **Plain language.** Say what the thing is and what to do: "Detect flood areas", "Find shelters", "Plan rescue route",
   "Start over". No bracket tags (`[01]`, `[SAT-LINK]`), no jargon ("telemetry", "corridor", "orbital").
3. **Standard emergency colours.** Red = flood/danger, blue = shelter, green = rescue route, amber = rescue team,
   grey dashed = blocked road. Colour is never the only signal (legend, labels and text always accompany it).
4. **Honest about the AI and the data.** Detection results are labelled "AI estimate — verify on the ground".
   The scenario is labelled "Simulated scenario". Imagery credits are shown. No model names in the main UI.
5. **North-up, readable at night in a vehicle.** Map stays north-up (crews give directions by compass), moderate tilt,
   high-contrast text, large primary buttons.

## 2. Colour tokens

| Token | Hex | Use |
| :--- | :--- | :--- |
| Base | `#0F1115` | App background, map horizon |
| Panel | `#16191E` | Sidebar, popups, dialogs |
| Raised | `#1C2026` | Cards, current step |
| Border | `#2B3038` (strong `#4A525E`) | Dividers, card outlines, current-step outline |
| Text | `#ECEEF1` | Primary text, primary button fill |
| Text secondary | `#B4BBC5` (8.5:1 on Raised) | Descriptions, labels |
| Text muted | `#8D96A3` (5.5:1 on Raised) | Timestamps, section headings, upcoming steps. Never darker than this |
| Flood | `#E5484D` (text tint `#FF8B8E`) | Flood polygons, "Critical" severity |
| High severity | `#F76B15` (text `#FFB27A`) | "High" severity badge |
| Rescue team / caution | `#F5A524` (text `#F5C451`) | Rescue-team pin, "Elevated" severity, "Simulated scenario" tag, warnings |
| Shelter | `#3B82F6` (text `#8DB8FF`) | Shelter polygons, shelter pin, "Recommended"/"Destination" tag |
| Route | `#30A46C` | Rescue route line, completed-step check |
| Blocked | `#8B95A1` | Dashed blocked direct road |
| Focus ring | `#6EA8FE` | `focus-visible` ring on every interactive element |

Tailwind's old `radar-*` tokens in `tailwind.config.js` are no longer used by Dev 1's components (hex values are used
directly so no shared config change was needed).

## 3. Typography

- **Font:** system UI sans (`ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, …`). Monospace is not used.
- **Numbers:** `tabular-nums` for distances, times, capacities and log timestamps.
- **Scale:** ETA 36px bold (largest thing on screen) · app title 18px · current-step title and primary button 16px ·
  list titles 15px · body 14px · section headings and badges 13px (headings uppercase, `tracking-wide`).
- **Minimum size is 13px.** Nothing in the sidebar, popups or pins may be smaller.
- **Sentence case** everywhere else ("Plan rescue route", not "PLAN RESCUE ROUTE").
- **Time:** local 24-hour time (`14:32:05`), not UTC.

## 4. Layout

```text
+------------------------------------------+---------------------------------------------+
| Sidebar (w-96, #16191E)                  | Map (flex-1)                                 |
|  Flood response        [Simulated tag]   |  ┌ Legend ┐                       [+][-][N]  |
|  Klang River basin, Kuala Lumpur         |  │ ■ Flood area   ■ Shelter │                  |
|  ─────────────────────────────────────── |  │ ━ Rescue route ┅ Blocked │                  |
|  RESPONSE PLAN               1 of 3 done |  │ ● Rescue team            │                  |
|  (✓) Detect flood areas  1 area found    |  └──────────┘                                 |
|  (2) Find shelters                       |        ● Rescue team   red flood polygon      |
|      [ Find shelters ]  ← primary button |                 green route ──▶ ● Shelter     |
|  (3) Plan rescue route   (muted)         |                                              |
|  ↺ Start over                            |                                              |
|  ─────────────────────────────────────── |                                              |
|  RESCUE ROUTE  3.9 km · about 9 min      |                                              |
|  FLOOD AREAS (1) · SHELTERS (3)  (scroll)|                                              |
|  ─────────────────────────────────────── |                                              |
|  ACTIVITY  14:32:05  Route ready: …      |                                              |
+------------------------------------------+---------------------------------------------+
```

- **Response plan — one step in focus.** Only the current step is expanded (title, one-line description and a
  48px primary button). Done steps collapse to one line: green check, title, short result ("1 found", "3.9 km").
  Upcoming steps are one muted line. While a step runs, its button shows a spinner and "Scanning…/Searching…/Planning…".
- **Alert banner.** Any failure or warning appears as an amber `role="alert"` banner under the plan, never only in the log.
- **Details — answer first.** Order is: Rescue route (ETA in 36px, then To/From) → Shelters (destination first) →
  Flood areas. Rows show only what a crew needs at a glance (name, capacity, elevation); the rest is in the map popup.
- **Activity log (separate panel).** The log is the proof that each step uses real data, so it is its own large panel,
  not part of the sidebar. Docked **right** by default; header buttons dock it left, bottom, or detach it as a floating
  window (drag by the header, resize from the corner). It can be hidden ("Show activity log" button brings it back).
  The chosen position is remembered in the browser. Entries run oldest → newest (auto-scroll), 15px text, and each
  result lists its evidence: data source (AI backend vs cached file, Turf.js engine, live Mapbox vs cached route),
  response time, coordinates, areas, rules applied and flood points avoided. Warnings and cached fallbacks are amber.
- **Satellite image comparison** (step 1): dialog over the map only, before/after slider, indeterminate progress bar,
  result "N flood areas found — AI estimate", imagery attribution footer.

## 5. Map layers (`MapView.tsx`) — IDs unchanged

| Layer ID | Type | Source | Style |
| :--- | :--- | :--- | :--- |
| `3d-buildings` | `fill-extrusion` | `composite` | `#262B33`, opacity 0.7 |
| `hazards-fill` / `hazards-line` | fill / line | `hazards-src` | `#E5484D`, fill 0.30, line 2px |
| `safe-zones-fill` / `safe-zones-line` | fill / line | `safe-zones-src` | `#3B82F6`, fill 0.28, line 2px |
| `route-compromised` | line | `route-src` | `#8B95A1`, 3px, dash `[2, 2]` |
| `route-safe-glow` | line | `route-src` | Dark casing `#0B1A12`, 9px, under the route (ID kept for compatibility) |
| `route-safe` | line | `route-src` | `#30A46C`, 5px, round caps/joins |
| `route-safe-flow` | line | `route-src` | White 1.5px at 55%, slow direction-of-travel dashes (off with reduced motion) |
| `route-waypoints` | circle | `route-src` | 4px anchor dot under the HTML pins |

**Pins:** 22px HTML markers with a 14px text label — amber **Rescue team** and blue **Destination**.
**Direct labels:** layer `safe-zones-label` writes each shelter's short name on the map (text before " - ").
**Decluttered base map:** POI, transit, airport and natural-point labels are hidden; roads, districts and water names stay.
**Legend:** hidden while the map is empty; each entry appears only once that thing is on the map.
**Controls:** zoom/compass buttons are 44px (touch-sized).
**Popups:** neutral panel, small coloured kind label ("Flood area" / "Shelter"), title, label/value rows,
"AI estimate — verify on the ground" on flood areas. Built with `textContent` only (AI text is untrusted).
**Fog:** plain dark horizon, no stars.

## 6. Camera

North-up everywhere (`bearing: 0`). Each step frames the actual data with `fitBounds` (padding 80, max zoom 15.5);
fixed fallbacks are used only when there is no data.

| Trigger | Framing | Pitch | Duration |
| :--- | :--- | :--- | :--- |
| Boot / Start over | `shared/config.json` center + zoom | 40° | instant / 1500 ms |
| Flood areas detected | Flood areas | 40° | 1800 ms |
| Shelters found | Flood areas + shelters | 40° | 1800 ms |
| Route planned | Route + flood areas | 45° | 2000 ms |

> Note for the team: `shared/config.json` still says pitch 52° / bearing −18°. The map deliberately overrides those two
> values for north-up; center and zoom still come from the shared config.

## 7. Rescue flow semantics

- **Start** = the rescue team's own location, so it is **outside** the flood area. For the demo it is hard-coded to
  KL Sentral `[101.6865, 3.1340]` (SPEC.md). Planned: use the device's real location (`navigator.geolocation`).
- **Destination** = the recommended shelter (first zone from `computeSafeReliefZones`, i.e. largest usable area).
- The **blocked road** (grey dashed) is the direct route the router reports as impassable.

## 8. Motion & accessibility

- Motion is minimal: step camera moves, a slow route-direction dash, and the scan progress bar. All decorative motion
  is disabled under `prefers-reduced-motion: reduce`.
- Every button has a visible `focus-visible` ring (`#6EA8FE`). The scan dialog is `role="dialog"`, `aria-modal`,
  focuses its close button, and closes on Escape. The activity log is an `aria-live` region.
- All text meets WCAG AA (4.5:1) on its background; the lowest is muted `#8D96A3` at 5.5:1.
- Touch targets: primary buttons 48px, map controls 44px, dialog/popup close buttons 36–40px, "Start over" 40px.
