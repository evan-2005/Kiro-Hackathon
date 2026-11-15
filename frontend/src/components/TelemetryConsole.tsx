import React, { useState, useEffect, useRef } from 'react';
import { Terminal, ChevronDown, ChevronUp } from 'lucide-react';

export interface TelemetryConsoleProps {
  logs: string[];
  stage: 'IDLE' | 'HAZARDS_DETECTED' | 'SAFE_ZONES_COMPUTED' | 'ROUTE_DISPATCHED';
}

export const TelemetryConsole: React.FC<TelemetryConsoleProps> = ({ logs }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top when new logs arrive (since logs are ordered newest-first)
  useEffect(() => {
    if (!isMinimized && logContainerRef.current) {
      logContainerRef.current.scrollTop = 0;
    }
  }, [logs, isMinimized]);

  return (
    <aside
      aria-label="Tactical Telemetry Stream"
      className={`absolute bottom-6 right-6 z-20 transition-all duration-300 select-none shadow-[0_0_35px_rgba(0,0,0,0.85)] border border-radar-cyan/40 bg-[#070B12]/95 backdrop-blur-md rounded-lg overflow-hidden flex flex-col ${
        isMinimized ? 'w-80 h-10' : 'w-[480px] h-72'
      }`}
    >
      {/* Console Header */}
      <div className="px-3.5 py-2 bg-[#0B111E] border-b border-slate-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-radar-cyan" />
          <span className="text-xs font-bold tracking-wider font-mono text-slate-100 uppercase">
            Aegis Telemetry System
          </span>
          <div className="flex items-center gap-1.5 ml-1.5 px-2 py-0.5 rounded bg-radar-green/10 border border-radar-green/30">
            <span className="w-1.5 h-1.5 rounded-full bg-radar-green animate-pulse shadow-[0_0_8px_#00FF66]" />
            <span className="text-[9px] font-mono text-radar-green font-bold uppercase tracking-widest">
              LIVE
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-400">
            {logs.length} EVENTS
          </span>
          <button
            onClick={() => setIsMinimized((prev) => !prev)}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title={isMinimized ? 'Expand Console' : 'Minimize Console'}
          >
            {isMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Console Body */}
      {!isMinimized && (
        <div
          ref={logContainerRef}
          className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed space-y-1.5 bg-black/70 divide-y divide-slate-900/60"
        >
          {logs.map((log, index) => {
            const isHazard =
              log.includes('CRITICAL') ||
              log.includes('HAZARD') ||
              log.includes('ALERT') ||
              log.includes('ERROR');
            const isSafe =
              log.includes('SAFE') ||
              log.includes('RESOLVED') ||
              log.includes('CAMP') ||
              log.includes('PLATEAU');
            const isCorridor =
              log.includes('CORRIDOR') ||
              log.includes('DEPLOYED') ||
              log.includes('ACTIVE') ||
              log.includes('OPTIMIZED');
            const isWarning =
              log.includes('WARNING') ||
              log.includes('INIT') ||
              log.includes('GRID');

            return (
              <div key={index} className="pt-1.5 first:pt-0 flex items-start gap-2">
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
    </aside>
  );
};
