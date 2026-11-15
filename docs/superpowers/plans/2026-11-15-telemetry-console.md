# Enlarged Floating Telemetry Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a prominent, high-visibility floating Telemetry Console on the bottom-right of the map to clearly display streaming real-time mission logs during pitch judging.

**Architecture:** 
- Create `frontend/src/components/TelemetryConsole.tsx` as an obsidian glassmorphic HUD console (`w-[480px] h-72`) with autoscroll, semantic color syntax highlighting, and minimize/expand capabilities.
- Mount `TelemetryConsole` in `frontend/src/App.tsx` positioned on top of the main map canvas.
- Remove the cramped `h-28` log footer from `frontend/src/components/TacticalHUD.tsx` so the intelligence cards have full vertical space.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, `lucide-react`.

## Global Constraints
- Coordinate standard: `[longitude, latitude]` everywhere.
- Maintain strict styling palette tokens (`bg-radar-dark`, `border-radar-border`, `text-radar-cyan`, `text-radar-crimson`, `text-radar-green`, `text-radar-amber`).
- Do not break existing stage progressions (`IDLE` -> `HAZARDS_DETECTED` -> `SAFE_ZONES_COMPUTED` -> `ROUTE_DISPATCHED`).

---

### Task 1: Create `TelemetryConsole.tsx` Component

**Files:**
- Create: `frontend/src/components/TelemetryConsole.tsx`

**Interfaces:**
- Consumes: `logs: string[]`, `stage: string`
- Produces: `TelemetryConsole` component with minimize toggle, auto-scroll, and semantic highlighting.

- [ ] **Step 1: Write `TelemetryConsole.tsx`**

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { Terminal, ChevronDown, ChevronUp, Activity } from 'lucide-react';

export interface TelemetryConsoleProps {
  logs: string[];
  stage: 'IDLE' | 'HAZARDS_DETECTED' | 'SAFE_ZONES_COMPUTED' | 'ROUTE_DISPATCHED';
}

export const TelemetryConsole: React.FC<TelemetryConsoleProps> = ({ logs, stage }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest log entries
  useEffect(() => {
    if (!isMinimized && logContainerRef.current) {
      logContainerRef.current.scrollTop = 0; // Logs are unshifted (newest first)
    }
  }, [logs, isMinimized]);

  return (
    <div
      className={`absolute bottom-6 right-6 z-20 transition-all duration-300 select-none shadow-[0_0_35px_rgba(0,0,0,0.85)] border border-radar-cyan/40 bg-[#070B12]/92 backdrop-blur-md rounded-lg overflow-hidden flex flex-col ${
        isMinimized ? 'w-80 h-10' : 'w-[480px] h-72'
      }`}
    >
      {/* Console Header */}
      <div className="px-3 py-2 bg-[#0B111E] border-b border-slate-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-radar-cyan" />
          <span className="text-[11px] font-bold tracking-wider font-mono text-slate-100 uppercase">
            Aegis Telemetry Stream
          </span>
          <div className="flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded bg-radar-green/10 border border-radar-green/30">
            <span className="w-1.5 h-1.5 rounded-full bg-radar-green animate-pulse" />
            <span className="text-[9px] font-mono text-radar-green font-bold uppercase tracking-widest">
              LIVE
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-400">
            {logs.length} ENTRIES
          </span>
          <button
            onClick={() => setIsMinimized((prev) => !prev)}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title={isMinimized ? 'Expand Console' : 'Minimize Console'}
          >
            {isMinimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Console Body */}
      {!isMinimized && (
        <div
          ref={logContainerRef}
          className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed space-y-1.5 bg-black/60 divide-y divide-slate-900/60"
        >
          {logs.map((log, index) => {
            const isHazard = log.includes('CRITICAL') || log.includes('HAZARD') || log.includes('ALERT') || log.includes('ERROR');
            const isSafe = log.includes('SAFE') || log.includes('RESOLVED') || log.includes('CAMP') || log.includes('PLATEAU');
            const isCorridor = log.includes('CORRIDOR') || log.includes('DEPLOYED') || log.includes('ACTIVE') || log.includes('OPTIMIZED');
            const isWarning = log.includes('WARNING') || log.includes('INIT') || log.includes('GRID');

            return (
              <div key={index} className="pt-1 first:pt-0 flex items-start gap-2">
                <span className="text-slate-600 select-none flex-shrink-0">&gt;</span>
                <span
                  className={
                    isHazard
                      ? 'text-radar-crimson font-medium'
                      : isSafe
                      ? 'text-radar-cyan font-medium'
                      : isCorridor
                      ? 'text-radar-green font-medium'
                      : isWarning
                      ? 'text-radar-amber font-medium'
                      : 'text-slate-300'
                  }
                >
                  {log}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
```

---

### Task 2: Mount `TelemetryConsole` in `App.tsx` and Clean Up `TacticalHUD.tsx`

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/TacticalHUD.tsx`

- [ ] **Step 1: Mount `TelemetryConsole` in `App.tsx`**
Import and place `<TelemetryConsole logs={logs} stage={stage} />` inside `<main>` next to `<MapView>` and `<SatelliteScanModal>`.

- [ ] **Step 2: Clean up bottom log box in `TacticalHUD.tsx`**
Remove the cramped `h-28` log footer from `TacticalHUD.tsx` so the intelligence cards section expands to `flex-1`.

---

### Task 3: Build Verification & Testing

- [ ] **Step 1: Run production build**
`cd frontend && npm run build` (must exit code 0).

- [ ] **Step 2: Verify in browser**
Check `http://localhost:5173` to confirm the floating telemetry console displays prominently on the bottom-right and updates cleanly during all 3 mission steps.
