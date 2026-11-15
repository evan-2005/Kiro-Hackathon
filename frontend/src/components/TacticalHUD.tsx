import React from 'react';
import { AlertTriangle, Check, ChevronDown, Loader2, RotateCcw } from 'lucide-react';
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
  alert: string | null;
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

const SECTION_HEADING = 'mb-2 text-[13px] font-semibold uppercase tracking-wide text-[#8D96A3]';
const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EA8FE]';

const splitLog = (log: string): { time: string; text: string } => {
  const sep = log.indexOf('  ');
  return sep > 0 ? { time: log.slice(0, sep), text: log.slice(sep + 2) } : { time: '', text: log };
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

/** Only the current step is expanded; done and upcoming steps are one quiet line each. */
const Step: React.FC<StepProps> = ({ index, title, description, doneSummary, actionLabel, busyLabel, state, busy, onAction }) => {
  if (state !== 'current') {
    const done = state === 'done';
    return (
      <li className="flex items-center gap-3 px-3 py-1.5">
        <span
          aria-hidden="true"
          className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-[13px] font-semibold ${
            done ? 'bg-[#30A46C] text-[#0F1115]' : 'border border-[#4A525E] text-[#8D96A3]'
          }`}
        >
          {done ? <Check className="h-4 w-4" strokeWidth={3} /> : index}
        </span>
        <span className={`min-w-0 flex-1 truncate text-[15px] ${done ? 'text-[#ECEEF1]' : 'text-[#8D96A3]'}`}>{title}</span>
        {done && (
          <span className="flex-none text-sm tabular-nums text-[#B4BBC5]">
            <span className="sr-only">Completed: </span>
            {doneSummary}
          </span>
        )}
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-[#4A525E] bg-[#1C2026] p-3" aria-current="step">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#ECEEF1] text-[13px] font-bold text-[#0F1115]"
        >
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-[#ECEEF1]">{title}</p>
          <p className="mt-0.5 text-sm leading-snug text-[#B4BBC5]">{description}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onAction}
        disabled={busy}
        className={`mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#ECEEF1] px-4 text-base font-semibold text-[#0F1115] transition-colors hover:bg-white disabled:cursor-wait disabled:opacity-70 ${FOCUS_RING} focus-visible:ring-offset-2 focus-visible:ring-offset-[#1C2026]`}
      >
        {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
        {busy ? busyLabel : actionLabel}
      </button>
    </li>
  );
};

export const TacticalHUD: React.FC<TacticalHUDProps> = ({
  stage,
  isLoading,
  logs,
  hazardData,
  safeZoneData,
  primaryZoneName,
  routeSummary,
  alert,
  onScanTelemetry,
  onComputeSafeZones,
  onDispatchRoute,
  onReset,
}) => {
  const stageIndex = STAGE_ORDER.indexOf(stage);
  const stepState = (i: number): 'done' | 'current' | 'upcoming' =>
    stageIndex > i ? 'done' : stageIndex === i ? 'current' : 'upcoming';

  const hazards = hazardData?.features ?? [];
  const hazardCount = hazards.length;
  // Recommended / destination shelter always first
  const shelters = [...(safeZoneData?.features ?? [])].sort((a, b) => {
    const an = a.properties?.name === primaryZoneName ? 0 : 1;
    const bn = b.properties?.name === primaryZoneName ? 0 : 1;
    return an - bn;
  });
  const shelterCount = shelters.length;

  const distance = routeSummary && routeSummary.distanceKm !== null ? `${routeSummary.distanceKm.toFixed(1)} km` : null;
  const minutes = routeSummary && routeSummary.durationMin !== null ? Math.round(routeSummary.durationMin) : null;

  const latest = splitLog(logs[0] ?? '');

  return (
    <aside className="z-30 flex h-full w-96 flex-none flex-col border-r border-[#2B3038] bg-[#16191E] font-sans text-[#ECEEF1]">
      {/* Header */}
      <header className="border-b border-[#2B3038] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">Flood response</h1>
          <span className="rounded border border-[#F5A524]/50 px-2 py-0.5 text-[13px] font-medium text-[#F5C451]">
            Simulated scenario
          </span>
        </div>
        <p className="text-sm text-[#B4BBC5]">Klang River basin, Kuala Lumpur</p>
      </header>

      {/* Response plan: one step in focus at a time */}
      <section className="flex-shrink-0 px-4 pb-2 pt-4" aria-labelledby="plan-heading">
        <div className="flex items-baseline justify-between">
          <h2 id="plan-heading" className={SECTION_HEADING}>
            Response plan
          </h2>
          <span className="text-[13px] text-[#8D96A3]">{Math.min(stageIndex, 3)} of 3 done</span>
        </div>
        <ol className="space-y-1">
          <Step
            index={1}
            title="Detect flood areas"
            description="Compare before and after satellite images."
            doneSummary={`${hazardCount} found`}
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
            doneSummary={`${shelterCount} available`}
            actionLabel="Find shelters"
            busyLabel="Searching…"
            state={stepState(1)}
            busy={isLoading}
            onAction={onComputeSafeZones}
          />
          <Step
            index={3}
            title="Plan rescue route"
            description="From the rescue team to the recommended shelter, avoiding flooding."
            doneSummary={distance ?? 'Ready'}
            actionLabel="Plan rescue route"
            busyLabel="Planning…"
            state={stepState(2)}
            busy={isLoading}
            onAction={onDispatchRoute}
          />
        </ol>

        {alert && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-md border border-[#F5A524]/60 bg-[#F5A524]/15 p-3 text-sm leading-snug text-[#FFE2A3]"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-[#F5C451]" aria-hidden="true" />
            <span>{alert}</span>
          </div>
        )}

        <button
          type="button"
          onClick={onReset}
          className={`mt-2 flex h-10 items-center gap-2 rounded px-2 text-sm text-[#B4BBC5] hover:text-[#ECEEF1] ${FOCUS_RING}`}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Start over
        </button>
      </section>

      {/* Details: the answer first (route), then where to go (shelters), then the hazard */}
      <div className="flex-1 space-y-5 overflow-y-auto border-t border-[#2B3038] p-4">
        {stage === 'IDLE' && !isLoading && (
          <p className="text-sm leading-relaxed text-[#8D96A3]">
            Results appear here and on the map after each step.
          </p>
        )}

        {routeSummary && (
          <section aria-labelledby="route-heading">
            <h2 id="route-heading" className={SECTION_HEADING}>
              Rescue route
            </h2>
            <div className="rounded-lg border border-[#30A46C]/50 bg-[#30A46C]/10 p-4">
              <p className="flex items-baseline gap-1.5 tabular-nums">
                {minutes !== null ? (
                  <>
                    <span className="text-4xl font-bold leading-none text-[#ECEEF1]">{minutes}</span>
                    <span className="text-lg font-medium text-[#ECEEF1]">min</span>
                    {distance && <span className="ml-2 text-lg text-[#B4BBC5]">{distance}</span>}
                  </>
                ) : (
                  <span className="text-2xl font-bold text-[#ECEEF1]">{distance ?? 'Route ready'}</span>
                )}
              </p>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-[#8D96A3]">To</dt>
                <dd className="font-medium text-[#ECEEF1]">{routeSummary.to}</dd>
                <dt className="text-[#8D96A3]">From</dt>
                <dd className="text-[#B4BBC5]">{routeSummary.from}</dd>
              </dl>
              {routeSummary.hasBlockedRoute && (
                <p className="mt-3 flex items-center gap-2 text-sm text-[#B4BBC5]">
                  <span className="inline-block w-5 flex-none border-t-[3px] border-dashed border-[#8B95A1]" aria-hidden="true" />
                  Direct road blocked by flooding
                </p>
              )}
            </div>
          </section>
        )}

        {shelterCount > 0 && (
          <section aria-labelledby="shelter-heading">
            <h2 id="shelter-heading" className={SECTION_HEADING}>
              Shelters ({shelterCount})
            </h2>
            <ul className="divide-y divide-[#2B3038] rounded-lg border border-[#2B3038] bg-[#1C2026]">
              {shelters.map((feat, i) => {
                const p = feat.properties ?? {};
                const name = isMissing(p.name) ? 'Shelter' : String(p.name);
                const recommended = primaryZoneName !== null && name === primaryZoneName;
                return (
                  <li key={feat.id ?? i} className="px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <span className="mt-1.5 h-2.5 w-2.5 flex-none rounded-sm bg-[#3B82F6]" aria-hidden="true" />
                      <p className="min-w-0 flex-1 text-[15px] font-medium leading-snug text-[#ECEEF1]">{name}</p>
                      {recommended && (
                        <span className="flex-none rounded border border-[#3B82F6]/60 bg-[#3B82F6]/20 px-1.5 py-0.5 text-[13px] font-medium text-[#8DB8FF]">
                          {stage === 'ROUTE_DISPATCHED' ? 'Destination' : 'Recommended'}
                        </span>
                      )}
                    </div>
                    <p className="ml-[18px] mt-0.5 text-sm tabular-nums text-[#B4BBC5]">
                      {isMissing(p.capacityPersons) ? 'Capacity unknown' : `${Number(p.capacityPersons).toLocaleString()} people`}
                      {!isMissing(p.elevationM) && ` · +${p.elevationM} m`}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {hazardCount > 0 && (
          <section aria-labelledby="flood-heading">
            <h2 id="flood-heading" className={SECTION_HEADING}>
              Flood areas ({hazardCount})
            </h2>
            <ul className="divide-y divide-[#2B3038] rounded-lg border border-[#2B3038] bg-[#1C2026]">
              {hazards.map((feat, i) => {
                const p = feat.properties ?? {};
                const sev = typeof p.severity === 'string' ? p.severity.toUpperCase() : '';
                return (
                  <li key={feat.id ?? i} className="px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <span className="mt-1.5 h-2.5 w-2.5 flex-none rounded-sm bg-[#E5484D]" aria-hidden="true" />
                      <p className="min-w-0 flex-1 text-[15px] font-medium leading-snug text-[#ECEEF1]">
                        {isMissing(p.title) ? 'Flood area' : String(p.title)}
                      </p>
                      {sev && (
                        <span
                          className={`flex-none rounded border px-1.5 py-0.5 text-[13px] font-medium ${
                            SEVERITY_STYLE[sev] ?? 'border-[#4A525E] text-[#B4BBC5]'
                          }`}
                        >
                          {humanize(sev)}
                        </span>
                      )}
                    </div>
                    {!isMissing(p.infrastructureImpact) && (
                      <p className="ml-[18px] mt-0.5 text-sm leading-snug text-[#B4BBC5]">{String(p.infrastructureImpact)}</p>
                    )}
                    {!isMissing(p.waterDepthEstM) && (
                      <p className="ml-[18px] mt-0.5 text-sm tabular-nums text-[#B4BBC5]">Water depth about {p.waterDepthEstM} m</p>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[13px] text-[#8D96A3]">AI estimate from satellite images. Verify on the ground.</p>
          </section>
        )}
      </div>

      {/* Status: latest message always visible; full history on demand */}
      <details className="group flex-shrink-0 border-t border-[#2B3038]">
        <summary
          className={`flex cursor-pointer list-none items-start gap-2 px-4 py-3 text-sm leading-snug [&::-webkit-details-marker]:hidden ${FOCUS_RING}`}
        >
          <span className="min-w-0 flex-1" aria-live="polite">
            <span className="mr-2 tabular-nums text-[#8D96A3]">{latest.time}</span>
            <span className="text-[#ECEEF1]">{latest.text}</span>
          </span>
          <span className="flex flex-none items-center gap-1 text-[13px] text-[#8D96A3]">
            History
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          </span>
        </summary>
        <ol id="activity-history" className="max-h-40 space-y-1.5 overflow-y-auto px-4 pb-3 text-sm leading-snug">
          {logs.slice(1).map((log, index) => {
            const { time, text } = splitLog(log);
            return (
              <li key={index} className="flex gap-2">
                <span className="flex-none tabular-nums text-[#8D96A3]">{time}</span>
                <span className="text-[#B4BBC5]">{text}</span>
              </li>
            );
          })}
          {logs.length <= 1 && <li className="text-[#8D96A3]">No earlier activity.</li>}
        </ol>
      </details>
    </aside>
  );
};
