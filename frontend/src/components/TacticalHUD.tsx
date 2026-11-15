import React from 'react';
import {
  Satellite,
  ShieldCheck,
  Navigation,
  AlertTriangle,
  RotateCcw,
  Terminal,
  Activity,
  MapPin,
} from 'lucide-react';
import { GeoJsonFeatureCollection } from '../services/api';

interface TacticalHUDProps {
  stage: 'IDLE' | 'HAZARDS_DETECTED' | 'SAFE_ZONES_COMPUTED' | 'ROUTE_DISPATCHED';
  isLoading: boolean;
  logs: string[];
  hazardData: GeoJsonFeatureCollection | null;
  safeZoneData: GeoJsonFeatureCollection | null;
  onScanTelemetry: () => void;
  onComputeSafeZones: () => void;
  onDispatchRoute: () => void;
  onReset: () => void;
}

export const TacticalHUD: React.FC<TacticalHUDProps> = ({
  stage,
  isLoading,
  logs,
  hazardData,
  safeZoneData,
  onScanTelemetry,
  onComputeSafeZones,
  onDispatchRoute,
  onReset,
}) => {
  return (
    <aside className="w-96 h-full flex flex-col bg-[#0B111E]/95 border-r border-slate-800 backdrop-blur-md z-30 select-none shadow-2xl">
      {/* HUD Header */}
      <div className="p-4 border-b border-slate-800 bg-[#070B12]/80">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-radar-cyan animate-pulse shadow-[0_0_8px_#00F0FF]" />
            <span className="text-xs font-bold tracking-widest text-radar-cyan uppercase">
              PROJECT AEGIS
            </span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-radar-cyan/10 text-radar-cyan border border-radar-cyan/30 font-mono">
            SEC-DEF v1.0
          </span>
        </div>
        <h1 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">
          Tactical Disaster Recovery
        </h1>
        <p className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-radar-green" />
          TARGET: KLANG RIVER BASIN [KL]
        </p>
      </div>

      {/* Main Execution Controls */}
      <div className="p-4 space-y-3 flex-shrink-0">
        <div className="text-[10px] font-mono uppercase text-slate-400 tracking-wider flex items-center justify-between">
          <span>Mission Operations</span>
          <span className="text-slate-500">STAGE {stage === 'IDLE' ? '0/3' : stage === 'HAZARDS_DETECTED' ? '1/3' : stage === 'SAFE_ZONES_COMPUTED' ? '2/3' : '3/3'}</span>
        </div>

        {/* Action 1: Ingest Satellite Telemetry */}
        <button
          onClick={onScanTelemetry}
          disabled={isLoading || stage !== 'IDLE'}
          className={`w-full text-left p-3 rounded-lg border transition-all flex items-start gap-3 relative overflow-hidden ${
            stage === 'IDLE'
              ? 'bg-slate-900/90 border-radar-crimson/50 hover:border-radar-crimson hover:shadow-[0_0_15px_rgba(255,0,85,0.25)] text-slate-100 cursor-pointer'
              : stage === 'HAZARDS_DETECTED' || stage === 'SAFE_ZONES_COMPUTED' || stage === 'ROUTE_DISPATCHED'
              ? 'bg-slate-900/40 border-slate-800 text-slate-400 opacity-80 cursor-default'
              : 'opacity-50 cursor-not-allowed border-slate-800'
          }`}
        >
          <div className="p-2 rounded bg-radar-crimson/10 text-radar-crimson border border-radar-crimson/30">
            <Satellite className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-bold tracking-wide flex items-center justify-between">
              <span>[01] INGEST SATELLITE DATA</span>
              {stage !== 'IDLE' && <span className="text-[10px] text-radar-crimson font-mono">COMPLETE</span>}
            </div>
            <p className="text-[11px] text-slate-400 font-mono mt-1">
              Run Qwen3-VL (4B) vision to detect breached corridors &amp; flood polygons
            </p>
          </div>
        </button>

        {/* Action 2: Compute Safe Relief Zones */}
        <button
          onClick={onComputeSafeZones}
          disabled={isLoading || stage !== 'HAZARDS_DETECTED'}
          className={`w-full text-left p-3 rounded-lg border transition-all flex items-start gap-3 relative overflow-hidden ${
            stage === 'HAZARDS_DETECTED'
              ? 'bg-slate-900/90 border-radar-cyan/60 hover:border-radar-cyan hover:shadow-[0_0_15px_rgba(0,240,255,0.25)] text-slate-100 cursor-pointer animate-pulse'
              : stage === 'SAFE_ZONES_COMPUTED' || stage === 'ROUTE_DISPATCHED'
              ? 'bg-slate-900/40 border-slate-800 text-slate-400 opacity-80 cursor-default'
              : 'opacity-40 cursor-not-allowed border-slate-800 text-slate-500'
          }`}
        >
          <div className="p-2 rounded bg-radar-cyan/10 text-radar-cyan border border-radar-cyan/30">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-bold tracking-wide flex items-center justify-between">
              <span>[02] COMPUTE RELIEF CAMPS</span>
              {stage === 'SAFE_ZONES_COMPUTED' || stage === 'ROUTE_DISPATCHED' ? (
                <span className="text-[10px] text-radar-cyan font-mono">RESOLVED</span>
              ) : null}
            </div>
            <p className="text-[11px] text-slate-400 font-mono mt-1">
              Turf.js elevation buffer & hazard exclusion spatial math
            </p>
          </div>
        </button>

        {/* Action 3: Dispatch Rescue Route */}
        <button
          onClick={onDispatchRoute}
          disabled={isLoading || stage !== 'SAFE_ZONES_COMPUTED'}
          className={`w-full text-left p-3 rounded-lg border transition-all flex items-start gap-3 relative overflow-hidden ${
            stage === 'SAFE_ZONES_COMPUTED'
              ? 'bg-slate-900/90 border-radar-green/60 hover:border-radar-green hover:shadow-[0_0_15px_rgba(0,255,102,0.25)] text-slate-100 cursor-pointer animate-pulse'
              : stage === 'ROUTE_DISPATCHED'
              ? 'bg-slate-900/40 border-slate-800 text-slate-400 opacity-80 cursor-default'
              : 'opacity-40 cursor-not-allowed border-slate-800 text-slate-500'
          }`}
        >
          <div className="p-2 rounded bg-radar-green/10 text-radar-green border border-radar-green/30">
            <Navigation className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-bold tracking-wide flex items-center justify-between">
              <span>[03] DISPATCH RESCUE CORRIDOR</span>
              {stage === 'ROUTE_DISPATCHED' && (
                <span className="text-[10px] text-radar-green font-mono">DEPLOYED</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 font-mono mt-1">
              Calculate dynamic route bypassing AI hazard polygons
            </p>
          </div>
        </button>

        {/* Reset / Replay Demo */}
        <button
          onClick={onReset}
          className="w-full py-2 px-3 rounded bg-slate-900 border border-slate-800 hover:border-slate-600 text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Terminal State</span>
        </button>
      </div>

      {/* Intelligence Cards Section */}
      <div className="px-4 py-2 flex-1 overflow-y-auto space-y-3">
        {hazardData && hazardData.features.length > 0 && (
          <div className="p-3 rounded-lg bg-radar-crimson/5 border border-radar-crimson/30">
            <div className="flex items-center gap-2 text-radar-crimson text-xs font-bold mb-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>DETECTED HAZARD CORRIDORS ({hazardData.features.length})</span>
            </div>
            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
              {hazardData.features.map((feat, i) => (
                <div key={i} className="text-[11px] font-mono bg-black/40 p-1.5 rounded border border-radar-crimson/20">
                  <span className="text-radar-crimson font-bold">{feat.properties?.title || 'Hazard Polygon'}</span>
                  <p className="text-slate-400 text-[10px] leading-tight mt-0.5">
                    {feat.properties?.infrastructureImpact || 'Submerged infrastructure'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {safeZoneData && safeZoneData.features.length > 0 && (
          <div className="p-3 rounded-lg bg-radar-cyan/5 border border-radar-cyan/30">
            <div className="flex items-center gap-2 text-radar-cyan text-xs font-bold mb-1.5">
              <MapPin className="w-3.5 h-3.5" />
              <span>OPTIMAL RELIEF CAMPS ({safeZoneData.features.length})</span>
            </div>
            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
              {safeZoneData.features.map((feat, i) => (
                <div key={i} className="text-[11px] font-mono bg-black/40 p-1.5 rounded border border-radar-cyan/20">
                  <div className="flex justify-between items-center">
                    <span className="text-radar-cyan font-bold">{feat.properties?.name || 'Safe Camp Site'}</span>
                    <span className="text-[10px] text-slate-300">
                      {feat.properties?.elevationM != null ? `+${feat.properties.elevationM}m` : '—'}
                    </span>
                  </div>
                  <p className="text-slate-400 text-[10px] leading-tight mt-0.5">
                    Cap: {feat.properties?.capacityPersons != null
                      ? `${Number(feat.properties.capacityPersons).toLocaleString()} persons`
                      : '—'} • {feat.properties?.roadAccess || '—'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Real-time Tactical Terminal Logs */}
      <div className="p-3 border-t border-slate-800 bg-[#070B12]/90 flex-shrink-0">
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 mb-1.5">
          <Terminal className="w-3 h-3 text-radar-cyan" />
          <span>AEGIS TELEMETRY STREAM</span>
        </div>
        <div className="h-28 overflow-y-auto bg-black/60 rounded p-2 border border-slate-800/80 font-mono text-[10px] space-y-1 text-slate-300">
          {logs.map((log, index) => (
            <div key={index} className="leading-snug">
              <span className="text-slate-500 mr-1.5">&gt;</span>
              {log.includes('CRITICAL') || log.includes('HAZARD') ? (
                <span className="text-radar-crimson">{log}</span>
              ) : log.includes('SAFE') || log.includes('RESOLVED') ? (
                <span className="text-radar-cyan">{log}</span>
              ) : log.includes('CORRIDOR') || log.includes('DEPLOYED') ? (
                <span className="text-radar-green">{log}</span>
              ) : (
                <span>{log}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
};
