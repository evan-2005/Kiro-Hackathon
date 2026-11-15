# Aegis Enlarged Telemetry Console Design Spec

**Date:** 2026-11-15  
**Topic:** Tactical UI - Floating Enlarged Telemetry Console  
**Status:** Approved  

---

## 1. Problem Statement
During hackathon pitch demonstrations, judges and audience members need immediate, prominent visual evidence that:
1. Operations (`[01] Ingest Satellite Data`, `[02] Compute Relief Camps`, `[03] Dispatch Rescue Corridor`) execute real-time AI and geospatial calculations rather than displaying hard-coded static data.
2. The previous log terminal was constrained inside the bottom of the left sidebar (`w-96`, `h-28`), with `text-[10px]`, making it difficult to read on presentation displays and squishing the intelligence cards above it.

## 2. Proposed Architecture & Component Design

### 2.1 Component: `TelemetryConsole.tsx`
Create a dedicated component `frontend/src/components/TelemetryConsole.tsx` mounted inside `App.tsx` (overlaid on top of `MapView.tsx`).

### 2.2 Layout & Geometry
- **Positioning**: Anchored at `absolute bottom-6 right-6 z-20` on top of the map canvas.
- **Dimensions**:
  - Expanded: `w-[480px] h-72` (288px height, 480px width).
  - Minimized: `w-[480px] h-10` (compact bar showing live indicator and expand button).
- **Surface**: `bg-[#070B12]/92 backdrop-blur-md border border-radar-cyan/40 rounded-lg shadow-[0_0_35px_rgba(0,0,0,0.85)]`.

### 2.3 Visual Elements & Typography
- **Header**:
  - Left: Terminal icon, pulsating green beacon (`[LIVE-STREAM]`), and title `AEGIS TELEMETRY SYSTEM`.
  - Right: Log count badge, minimize/expand toggle button (`ChevronDown` / `ChevronUp`).
- **Log Stream Body**:
  - Auto-scroll container (`overflow-y-auto font-mono text-xs leading-relaxed space-y-1.5 p-3.5`).
  - Auto-scrolls to the newest log entries on state updates.
  - Semantic syntax color-coding:
    - `CRITICAL` / `HAZARD` / `ALERT` / `ERROR` $\rightarrow$ `text-radar-crimson` (`#FF0055`)
    - `SAFE` / `RESOLVED` / `PLATEAU` / `CAMP` $\rightarrow$ `text-radar-cyan` (`#00F0FF`)
    - `CORRIDOR` / `DEPLOYED` / `OPTIMIZED` / `ACTIVE` $\rightarrow$ `text-radar-green` (`#00FF66`)
    - `WARNING` / `INIT` / `GRID` $\rightarrow$ `text-radar-amber` (`#FFB800`)
    - Standard telemetry timestamp prefix: `[HH:MM:SS]`.

### 2.4 Left Sidebar Adjustment (`TacticalHUD.tsx`)
- Remove the cramped `h-28` bottom log box from `TacticalHUD.tsx`.
- The intelligence cards container now takes `flex-1` full available vertical height, giving cards (`Detected Hazard Corridors` and `Optimal Relief Camps`) ample space to display detailed metadata without scrollbar truncation.

## 3. Data Contracts & Props

```typescript
export interface TelemetryConsoleProps {
  logs: string[];
  stage: 'IDLE' | 'HAZARDS_DETECTED' | 'SAFE_ZONES_COMPUTED' | 'ROUTE_DISPATCHED';
  onClearLogs?: () => void;
}
```

## 4. Testing & Verification Plan
1. **Component Rendering**: Verify `TelemetryConsole` renders on bottom-right of the screen over the 3D map.
2. **Dynamic Log Updates**: Click through Stage 1, Stage 2, and Stage 3 in the UI; verify auto-scroll keeps the newest logs in view.
3. **Minimize / Restore**: Click the toggle button in the header; verify it cleanly collapses to the bottom-right and restores to full size without layout shift.
4. **Build Verification**: Run `npm run build` (`tsc && vite build`) to confirm zero TypeScript and bundling errors.
