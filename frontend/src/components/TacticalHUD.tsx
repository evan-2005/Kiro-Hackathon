import React from 'react';
import { Check, Loader2, RotateCcw } from 'lucide-react';
import { GeoJsonFeatureCollection } from '../services/api';

type Stage = 'IDLE' | 'HAZARDS_DETECTED' | 'SAFE_ZONES_COMPUTED' | 'ROUTE_DISPATCHED';

export interface RouteSummary {
  distanceKm: number | null;
  durationMin: number | null;
  from: string;
  to: string;
  hasBlockedRoute: boolean;
}

interface TacticalHUDProps {
  stage: Stage;
  isLoading: boolean;
  logs: string[];
  hazardData: GeoJsonFeatureCollection | null;
  safeZoneData: GeoJsonFeatureCollection | null;
  primaryZoneName: string | null;
  routeSummary: RouteSummary | null;
  onScanTelemetry: () => void;
  onComputeSafeZones: () => void;
  onDispatchRoute: () => void;
  onReset: () => void;
}

const STAGE_ORDER: Stage[] = ['IDLE', 'HAZARDS_DETECTED', 'SAFE_ZONES_COMPUTED', 'ROUTE_DISPATCHED'];

const isMissing = (v: unknown) => v === undefined || v === null || v === '';

/** "RIVER_OVERTOPPING" → "River overtopping" */
const humanize = (v: unknown): string => {
  if (isMissing(v)) return '—';
  const s = String(v).replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: 'text-[#FF8B8E] bg-[#E5484D]/15 border-[#E5484D]/40',
  HIGH: 'text-[#FFB27A] bg-[#F76B15]/15 border-[#F76B15]/40',
  ELEVATED: 'text-[#F5C451] bg-[#F5A524]/15 border-[#F5A524]/40',
};

interface StepProps {
  index: number;
  title: string;
  description: string;
  doneSummary: string;
  actionLabel: string;
  busyLabel: string;
  state: 'done' | 'current' | 'upcoming';
  busy: boolean;
  onAction: () => void;
}

const Step: React.FC<StepProps> = ({ index, title, description, doneSummary, actionLabel, busyLabel, state, busy, onAction }) => (
  <li
    className={`rounded-lg border p-3 ${
      state === 'current' ? 'border-[#3A414B] bg-[#1C2026]' : 'border-[#2B3038] bg-transparent'
    }`}
  >
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-semibold ${
          state === 'done'
            ? 'bg-[#30A46C] text-[#0F1115]'
            : state === 'current'
              ? 'bg-[#ECEEF1] text-[#0F1115]'
              : 'border border-[#3A414B] text-[#6B7380]'
        }`}
      >
        {state === 'done' ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${state === 'upcoming' ? 'text-[#6B7380]' : 'text-[#ECEEF1]'}`}>{title}</p>
        <p className={`mt-0.5 text-xs leading-relaxed ${state === 'done' ? 'text-[#A1A8B3]' : 'text-[#6B7380]'}`}>
          {state === 'done' ? doneSummary : description}
        </p>
      </div>
      {state === 'done' && <span className="sr-only">Completed</span>}
    </div>
    {state === 'current' && (
      <button
        type="button"
        onClick={onAction}
        disabled={busy}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-[#ECEEF1] px-3 py-2 text-sm font-semibold text-[#0F1115] transition-colors hover:bg-white disabled:cursor-wait disabled:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EA8FE] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1C2026]"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {busy ? busyLabel : actionLabel}
      </button>
    )}
  </li>
);

export const TacticalHUD: React.FC<TacticalHUDProps> = ({
  stage,
  isLoading,
  logs,
  hazardData,
  safeZoneData,
  primaryZoneName,
  routeSummary,
  onScanTelemetry,
  onComputeSafeZones,
  onDispatchRoute,
  onReset,
}) => {
  const stageIndex = STAGE_ORDER.indexOf(stage);
  const stepState = (i: number): 'done' | 'current' | 'upcoming' =>
    stageIndex > i ? 'done' : stageIndex === i ? 'current' : 'upcoming';

  const hazards = hazardData?.features ?? [];
  const shelters = safeZoneData?.features ?? [];
  const hazardCount = hazards.length;
  const shelterCount = shelters.length;

  const routeLine =
    routeSummary && routeSummary.distanceKm !== null
      ? `${routeSummary.distanceKm.toFixed(1)} km${
          routeSummary.durationMin !== null ? ` · about ${Math.round(routeSummary.durationMin)} min` : ''
        }`
      : 'Route ready';

  return (
    <aside className="z-30 flex h-full w-96 flex-none flex-col border-r border-[#2B3038] bg-[#16191E] font-sans text-[#ECEEF1]">
      {/* Header */}
      <header className="border-b border-[#2B3038] p-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-base font-semibold">Flood response</h1>
          <span className="rounded border border-[#F5A524]/40 px-1.5 py-0.5 text-[11px] font-medium text-[#F5C451]">
            Simulated scenario
          </span>
        </div>
        <p className="mt-0.5 text-sm text-[#A1A8B3]">Klang River basin, Kuala Lumpur</p>
      </header>

      {/* Response plan */}
      <section className="flex-shrink-0 p-4" aria-labelledby="plan-heading">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="plan-heading" className="text-xs font-medium uppercase tracking-wide text-[#6B7380]">
            Response plan
          </h2>
          <span className="text-xs text-[#6B7380]">
            {Math.min(stageIndex, 3)} of 3 done
          </span>
        </div>
        <ol className="space-y-2">
          <Step
            index={1}
            title="Detect flood areas"
            description="Compare before and after satellite images."
            doneSummary={`${hazardCount} flood area${hazardCount === 1 ? '' : 's'} found`}
            actionLabel="Scan satellite images"
            busyLabel="Scanning…"
            state={stepState(0)}
            busy={isLoading}
            onAction={onScanTelemetry}
          />
          <Step
            index={2}
            title="Find shelters"
            description="High ground at least 150 m from flooding."
            doneSummary={`${shelterCount} shelter${shelterCount === 1 ? '' : 's'} available`}
            actionLabel="Find shelters"
            busyLabel="Searching…"
            state={stepState(1)}
            busy={isLoading}
            onAction={onComputeSafeZones}
          />
          <Step
            index={3}
            title="Plan rescue route"
            description="From the pickup point to the recommended shelter."
            doneSummary={routeLine}
            actionLabel="Plan rescue route"
            busyLabel="Planning…"
            state={stepState(2)}
            busy={isLoading}
            onAction={onDispatchRoute}
          />
        </ol>
        <button
          type="button"
          onClick={onReset}
          className="mt-3 flex items-center gap-1.5 rounded px-1 py-1 text-xs text-[#A1A8B3] hover:text-[#ECEEF1] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EA8FE]"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Start over
        </button>
      </section>

      {/* Details */}
      <div className="flex-1 space-y-4 overflow-y-auto border-t border-[#2B3038] p-4">
        {routeSummary && (
          <section aria-labelledby="route-heading">
            <h2 id="route-heading" className="mb-2 text-xs font-medium uppercase tracking-wide text-[#6B7380]">
              Rescue route
            </h2>
            <div className="rounded-lg border border-[#30A46C]/40 bg-[#30A46C]/10 p-3">
              <p className="text-lg font-semibold tabular-nums text-[#ECEEF1]">{routeLine}</p>
              <p className="mt-1 text-xs leading-relaxed text-[#A1A8B3]">
                {routeSummary.from} → {routeSummary.to}
              </p>
              {routeSummary.hasBlockedRoute && (
                <p className="mt-2 text-xs text-[#A1A8B3]">
                  <span className="mr-1 inline-block w-4 border-t-2 border-dashed border-[#8B95A1] align-middle" />
                  Direct road blocked by flooding
                </p>
              )}
            </div>
          </section>
        )}

        {hazardCount > 0 && (
          <section aria-labelledby="flood-heading">
            <h2 id="flood-heading" className="mb-2 text-xs font-medium uppercase tracking-wide text-[#6B7380]">
              Flood areas ({hazardCount})
            </h2>
            <ul className="space-y-2">
              {hazards.map((feat, i) => {
                const p = feat.properties ?? {};
                const sev = typeof p.severity === 'string' ? p.severity.toUpperCase() : '';
                return (
                  <li key={feat.id ?? i} className="rounded-lg border border-[#2B3038] bg-[#1C2026] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-[#ECEEF1]">
                        <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-[#E5484D] align-baseline" aria-hidden="true" />
                        {isMissing(p.title) ? 'Flood area' : String(p.title)}
                      </p>
                      {sev && (
                        <span
                          className={`flex-none rounded border px-1.5 py-0.5 text-[11px] font-medium ${
                            SEVERITY_STYLE[sev] ?? 'text-[#A1A8B3] border-[#3A414B]'
                          }`}
                        >
                          {humanize(sev)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[#A1A8B3]">
                      {isMissing(p.infrastructureImpact) ? 'Impact not described.' : String(p.infrastructureImpact)}
                    </p>
                    <p className="mt-1 text-xs text-[#6B7380]">
                      Water depth: {isMissing(p.waterDepthEstM) ? 'unknown' : `${p.waterDepthEstM} m`}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {shelterCount > 0 && (
          <section aria-labelledby="shelter-heading">
            <h2 id="shelter-heading" className="mb-2 text-xs font-medium uppercase tracking-wide text-[#6B7380]">
              Shelters ({shelterCount})
            </h2>
            <ul className="space-y-2">
              {shelters.map((feat, i) => {
                const p = feat.properties ?? {};
                const name = isMissing(p.name) ? 'Shelter' : String(p.name);
                const recommended = primaryZoneName !== null && name === primaryZoneName;
                return (
                  <li key={feat.id ?? i} className="rounded-lg border border-[#2B3038] bg-[#1C2026] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-[#ECEEF1]">
                        <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-[#3B82F6] align-baseline" aria-hidden="true" />
                        {name}
                      </p>
                      {recommended && (
                        <span className="flex-none rounded border border-[#3B82F6]/50 bg-[#3B82F6]/15 px-1.5 py-0.5 text-[11px] font-medium text-[#8DB8FF]">
                          {stage === 'ROUTE_DISPATCHED' ? 'Destination' : 'Recommended'}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs tabular-nums text-[#A1A8B3]">
                      {isMissing(p.capacityPersons) ? 'Capacity unknown' : `${Number(p.capacityPersons).toLocaleString()} people`}
                      {' · '}
                      {isMissing(p.elevationM) ? 'elevation unknown' : `+${p.elevationM} m`}
                    </p>
                    <p className="mt-0.5 text-xs text-[#6B7380]">
                      Access: {isMissing(p.roadAccess) ? 'unknown' : String(p.roadAccess)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {/* Activity log */}
      <section className="flex-shrink-0 border-t border-[#2B3038] p-4" aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="mb-2 text-xs font-medium uppercase tracking-wide text-[#6B7380]">
          Activity
        </h2>
        <ol className="h-28 space-y-1.5 overflow-y-auto text-xs leading-snug" aria-live="polite">
          {logs.map((log, index) => {
            const sep = log.indexOf('  ');
            const time = sep > 0 ? log.slice(0, sep) : '';
            const text = sep > 0 ? log.slice(sep + 2) : log;
            const isWarning = /^(Warning|Scan failed|Route planning failed|Shelter search failed)/.test(text);
            return (
              <li key={index} className="flex gap-2">
                <span className="flex-none tabular-nums text-[#6B7380]">{time}</span>
                <span className={isWarning ? 'text-[#F5C451]' : 'text-[#C9CED6]'}>{text}</span>
              </li>
            );
          })}
        </ol>
      </section>
    </aside>
  );
};
