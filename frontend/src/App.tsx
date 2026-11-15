import { useState, useCallback, useRef } from 'react';
import * as turf from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import missionConfig from '@shared/config.json';
import fallbackDamage from '@shared/fallback_damage.json';
import { MapView } from './components/MapView';
import { TacticalHUD, RouteSummary } from './components/TacticalHUD';
import { SatelliteScanModal } from './components/SatelliteScanModal';
import { ActivityLog, LogDock, LogEntry } from './components/ActivityLog';
import {
  runDisasterScan,
  GeoJsonFeatureCollection,
} from './services/api';
import { computeSafeReliefZones } from './services/turfSafeZone';
import { calculateRescueRoute, extractHazardAvoidancePoints } from './services/routing';

const BEFORE_IMAGE_SRC = '/imagery/before.jpg';
const AFTER_IMAGE_SRC = '/imagery/after.jpg';
const SCAN_MIN_DURATION_MS = 3000;
const SCAN_COMPLETE_HOLD_MS = 1200;

// Rescue team's starting location. Hard-coded for the demo (KL Sentral, SPEC.md) — [lon, lat].
// TODO: replace with the device's real location (navigator.geolocation) when there is time.
const RESCUER_START: [number, number] = [101.6865, 3.1340];
const RESCUER_START_LABEL = 'Rescue team · KL Sentral';
// Last-resort destination (Relief Camp Alpha, SPEC.md) — [lon, lat]
const DEFAULT_DESTINATION: [number, number] = [101.7015, 3.1418];
const BBOX = missionConfig.spatial.boundingBox;

type SafeZoneFeature = Feature<
  Polygon | MultiPolygon,
  { name?: unknown; elevationM?: unknown; centroid?: unknown } | null
>;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** True only for a finite [lon, lat] pair inside the mission bounding box (catches swapped [lat, lon]). */
const isLonLatInBBox = (coord: unknown): coord is [number, number] =>
  Array.isArray(coord) &&
  coord.length >= 2 &&
  typeof coord[0] === 'number' &&
  typeof coord[1] === 'number' &&
  coord[0] >= BBOX.minLon &&
  coord[0] <= BBOX.maxLon &&
  coord[1] >= BBOX.minLat &&
  coord[1] <= BBOX.maxLat;

const display = (v: unknown, fallback = '—'): string =>
  v === undefined || v === null || v === '' ? fallback : String(v);

/** Distance/time from either Dev 2's live metadata or the cached route's metrics. */
const readRouteMetrics = (route: GeoJsonFeatureCollection): { distanceKm: number | null; durationMin: number | null } => {
  const meta = route.metadata ?? {};
  const toNum = (v: unknown): number | null => {
    const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) ? n : null;
  };
  return {
    distanceKm: toNum(meta.safeDistanceKm) ?? toNum(meta.metrics?.safeRouteDistanceKm),
    durationMin: toNum(meta.durationMin) ?? toNum(meta.metrics?.estimatedTravelTimeMin),
  };
};

const INITIAL_LOG = 'Ready. Start by scanning the satellite images.';
const LOG_DOCK_KEY = 'aegis.logDock';
const LOG_DOCKS: LogDock[] = ['right', 'left', 'bottom', 'float'];

const fmtCoord = (c: unknown): string =>
  Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number'
    ? `[${c[0].toFixed(4)}, ${c[1].toFixed(4)}]`
    : '—';
const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

/** Times a promise without changing its result */
const timed = async <T,>(p: Promise<T>): Promise<{ value: T; ms: number }> => {
  const t0 = performance.now();
  const value = await p;
  return { value, ms: performance.now() - t0 };
};

const readSavedDock = (): LogDock => {
  try {
    const v = window.localStorage.getItem(LOG_DOCK_KEY) as LogDock | null;
    return v && LOG_DOCKS.includes(v) ? v : 'right';
  } catch {
    return 'right';
  }
};

const timestamp = () =>
  new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function App() {
  const [stage, setStage] = useState<'IDLE' | 'HAZARDS_DETECTED' | 'SAFE_ZONES_COMPUTED' | 'ROUTE_DISPATCHED'>('IDLE');
  const [isLoading, setIsLoading] = useState(false);
  const [hazardData, setHazardData] = useState<GeoJsonFeatureCollection | null>(null);
  const [safeZoneData, setSafeZoneData] = useState<GeoJsonFeatureCollection | null>(null);
  const [routeData, setRouteData] = useState<GeoJsonFeatureCollection | null>(null);
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const logIdRef = useRef(0);
  const [logs, setLogs] = useState<LogEntry[]>(() => [{ id: 0, time: timestamp(), text: INITIAL_LOG, tone: 'info' }]);
  const [logDock, setLogDock] = useState<LogDock>(readSavedDock);
  const [logVisible, setLogVisible] = useState(true);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanStatus, setScanStatus] = useState<'scanning' | 'complete'>('scanning');
  const [scanHazardCount, setScanHazardCount] = useState<number | null>(null);
  const [primaryZone, setPrimaryZone] = useState<SafeZoneFeature | null>(null);
  // Problems must be impossible to miss: shown as a banner, not only as a log line
  const [alert, setAlert] = useState<string | null>(null);
  // Bumped by every async step and by Reset, so a slow result finishing after Reset is ignored
  const runIdRef = useRef(0);

  const closeScanModal = useCallback(() => setScanModalOpen(false), []);

  const addLog = useCallback((text: string, tone: LogEntry['tone'] = 'info', details?: string[]) => {
    const entry: LogEntry = { id: ++logIdRef.current, time: timestamp(), text, tone, details };
    setLogs((prev) => [...prev.slice(-60), entry]);
  }, []);

  const changeLogDock = useCallback((dock: LogDock) => {
    setLogDock(dock);
    try {
      window.localStorage.setItem(LOG_DOCK_KEY, dock);
    } catch {
      // Storage unavailable: position just won't be remembered
    }
  }, []);

  // Step 1: detect flood areas from satellite imagery
  const handleScanTelemetry = async () => {
    setIsLoading(true);
    setAlert(null);
    addLog('Scanning before/after satellite images of the Klang River basin…');

    const runId = ++runIdRef.current;
    setScanStatus('scanning');
    setScanHazardCount(null);
    setScanModalOpen(true);

    try {
      const [{ value: data, ms: scanMs }] = await Promise.all([timed(runDisasterScan()), wait(SCAN_MIN_DURATION_MS)]);
      if (runId !== runIdRef.current) return;

      setScanHazardCount(data.features.length);
      setScanStatus('complete');
      await wait(SCAN_COMPLETE_HOLD_MS);
      if (runId !== runIdRef.current) return;

      setScanModalOpen(false);
      setHazardData(data);
      setStage('HAZARDS_DETECTED');
      const hazardCount = data.features.length;
      const hazardTitles = data.features
        .map((f: { properties?: { title?: unknown } | null }) => f?.properties?.title)
        .filter((t: unknown): t is string => typeof t === 'string' && t.length > 0);
      // api.ts returns this exact cached object when the AI backend is unreachable
      const fromCache = (data as unknown) === (fallbackDamage as unknown);
      const scanDetails = [
        fromCache
          ? 'Source: cached result — AI backend unreachable'
          : `Source: AI backend · POST /api/analyze-disaster${data.metadata?.model ? ` · model ${String(data.metadata.model)}` : ''}`,
        `Response time: ${fmtMs(scanMs)}`,
        ...data.features.map((f: Feature<Polygon | MultiPolygon, Record<string, unknown> | null>) => {
          let area = '—';
          let centre = '—';
          try {
            area = `${(turf.area(f) / 1e6).toFixed(2)} km²`;
            centre = fmtCoord(turf.centroid(f).geometry.coordinates);
          } catch {
            // Keep placeholders for invalid geometry
          }
          return `${display(f.properties?.title, 'Flood area')} · ${display(f.properties?.severity)} · ${area} · centre ${centre}`;
        }),
      ];
      if (hazardCount === 0) {
        addLog('No flood areas found in the images.', 'ok', scanDetails);
      } else {
        addLog(
          `Found ${hazardCount} flood area${hazardCount === 1 ? '' : 's'}${
            hazardTitles.length ? `: ${hazardTitles.join(', ')}` : ''
          }. AI estimate — verify on the ground.`,
          fromCache ? 'warn' : 'ok',
          scanDetails
        );
      }
    } catch (e) {
      if (runId !== runIdRef.current) return;
      setScanModalOpen(false);
      addLog(`Scan failed: ${e}`, 'warn');
      setAlert('Scan failed. Check the connection and try again.');
    } finally {
      if (runId === runIdRef.current) setIsLoading(false);
    }
  };

  // Step 2: find shelters on safe high ground
  const handleComputeSafeZones = () => {
    if (!hazardData) return;
    setIsLoading(true);
    setAlert(null);
    addLog('Looking for high ground at least 150 m from flood areas…');

    try {
      const t0 = performance.now();
      const computed = computeSafeReliefZones(hazardData);
      const turfMs = performance.now() - t0;
      // Dev 2 returns zones sorted best-first (largest usable area), so the first one is primary
      const primary = (computed.features[0] as SafeZoneFeature | undefined) ?? null;
      if (!primary) {
        addLog('Warning: no safe ground found nearby.', 'warn');
        setAlert('No safe ground found nearby. Shelters cannot be recommended.');
        return;
      }

      setSafeZoneData(computed);
      setPrimaryZone(primary);
      setStage('SAFE_ZONES_COMPUTED');
      const elevation = primary.properties?.elevationM;
      const criteria = computed.metadata?.criteriaApplied;
      addLog(
        `${computed.features.length} shelter${computed.features.length === 1 ? '' : 's'} available. Recommended: ${display(
          primary.properties?.name
        )}${elevation === undefined || elevation === null ? '' : ` (+${String(elevation)} m)`}.`,
        'ok',
        [
          computed.metadata?.computedBy
            ? `Computed by: ${String(computed.metadata.computedBy)} in ${fmtMs(turfMs)}`
            : `Source: cached shelter list (spatial engine returned no metadata) · ${fmtMs(turfMs)}`,
          criteria
            ? `Rules: elevation ≥ ${display(criteria.minElevationMeters)} m · ${Number(criteria.hazardBufferKm) * 1000} m flood buffer · usable area ≥ ${display(criteria.minUsableAreaSqM)} m²`
            : `Flood areas used as input: ${hazardData.features.length}`,
          ...computed.features.map(
            (f: Feature<Polygon | MultiPolygon, Record<string, unknown> | null>) =>
              `${display(f.properties?.name, 'Shelter')} · usable ${
                typeof f.properties?.computedAreaSqM === 'number'
                  ? `${f.properties.computedAreaSqM.toLocaleString()} m²`
                  : '—'
              } · centre ${fmtCoord(f.properties?.centroid)}`
          ),
        ]
      );
    } catch (e) {
      addLog(`Shelter search failed: ${e}`, 'warn');
      setAlert('Shelter search failed. Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: plan the rescue route from the rescue team's location to the shelter
  const handleDispatchRoute = async () => {
    setIsLoading(true);
    setAlert(null);
    const runId = ++runIdRef.current;
    const shelterName = display(primaryZone?.properties?.name, 'shelter');
    addLog(`Planning route from the rescue team's location to ${shelterName}…`);

    // Destination: Dev 2's centroid if valid, else Turf centroid of the zone, else Camp Alpha default
    let destination: [number, number] | null = null;
    const zoneCentroid = primaryZone?.properties?.centroid;
    if (isLonLatInBBox(zoneCentroid)) {
      destination = [zoneCentroid[0], zoneCentroid[1]];
    } else if (primaryZone) {
      try {
        const computedCentroid = turf.centroid(primaryZone).geometry.coordinates;
        if (isLonLatInBBox(computedCentroid)) destination = [computedCentroid[0], computedCentroid[1]];
      } catch {
        // Fall through to the default destination below
      }
    }
    if (!destination) {
      console.warn('[ROUTER] Primary safe-zone centroid unavailable or outside mission bbox; using default destination');
      addLog('Warning: shelter location unclear; routing to Relief Camp Alpha.', 'warn');
      setAlert('Shelter location unclear. Route goes to Relief Camp Alpha — confirm before dispatch.');
      destination = DEFAULT_DESTINATION;
    }

    try {
      // Pass the hazard collection (not pre-extracted points) so Dev 2's router can add the points where
      // the direct road route crosses each hazard; centroid-only points leave the route unchanged.
      // If hazards are somehow missing, fall back to Dev 2's helper (which uses the golden cache).
      const avoidInput = hazardData?.features.length ? hazardData : extractHazardAvoidancePoints(hazardData);
      const { value: route, ms: routeMs } = await timed(calculateRescueRoute(RESCUER_START, destination, avoidInput));
      if (runId !== runIdRef.current) return;

      const { distanceKm, durationMin } = readRouteMetrics(route);
      const hasBlocked = route.features.some(
        (f: { properties?: { status?: unknown } | null }) => f?.properties?.status === 'IMPASSABLE'
      );
      setRouteData(route);
      setRouteSummary({
        distanceKm,
        durationMin,
        from: RESCUER_START_LABEL,
        to: shelterName,
        hasBlockedRoute: hasBlocked,
      });
      setStage('ROUTE_DISPATCHED');

      const engine = route.metadata?.engine ? String(route.metadata.engine) : null;
      const live = !!engine && /live/i.test(engine);
      addLog(
        distanceKm !== null
          ? `Route ready: ${distanceKm.toFixed(1)} km${durationMin !== null ? `, about ${Math.round(durationMin)} min` : ''}.`
          : 'Route ready.',
        live ? 'ok' : 'warn',
        [
          live
            ? `Source: ${engine} · ${fmtMs(routeMs)}`
            : `Source: cached route${engine ? ` (${engine})` : ''} — live routing unavailable`,
          `Start (rescue team): ${fmtCoord(RESCUER_START)}`,
          `Destination: ${shelterName} ${fmtCoord(destination)}`,
          `Flood points avoided: ${display(route.metadata?.avoidancePointsApplied, '—')}`,
          ...(route.metadata?.compromisedDistanceKm !== undefined
            ? [`Direct road (blocked): ${String(route.metadata.compromisedDistanceKm)} km`]
            : []),
        ]
      );
      if (hasBlocked) {
        addLog('Direct road is blocked by flooding (shown dashed grey).');
      } else {
        console.info('[ROUTER] No compromised route returned');
      }
    } catch (e) {
      if (runId !== runIdRef.current) return;
      addLog(`Route planning failed: ${e}`, 'warn');
      setAlert('Route planning failed. Try again.');
    } finally {
      if (runId === runIdRef.current) setIsLoading(false);
    }
  };

  // Start over
  const handleReset = () => {
    runIdRef.current += 1;
    setScanModalOpen(false);
    setIsLoading(false);
    setStage('IDLE');
    setHazardData(null);
    setSafeZoneData(null);
    setPrimaryZone(null);
    setRouteData(null);
    setRouteSummary(null);
    setAlert(null);
    setLogs([{ id: ++logIdRef.current, time: timestamp(), text: `Started over. ${INITIAL_LOG}`, tone: 'info' }]);
  };

  const logPanel = logVisible ? (
    <ActivityLog entries={logs} dock={logDock} onDockChange={changeLogDock} onHide={() => setLogVisible(false)} />
  ) : null;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0F1115]">
      <TacticalHUD
        stage={stage}
        isLoading={isLoading}
        hazardData={hazardData}
        safeZoneData={safeZoneData}
        primaryZoneName={primaryZone ? display(primaryZone.properties?.name) : null}
        routeSummary={routeSummary}
        alert={alert}
        onScanTelemetry={handleScanTelemetry}
        onComputeSafeZones={handleComputeSafeZones}
        onDispatchRoute={handleDispatchRoute}
        onReset={handleReset}
      />

      {logDock === 'left' && logPanel}

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="relative min-h-0 flex-1">
          <MapView
            hazardData={hazardData}
            safeZoneData={safeZoneData}
            routeData={routeData}
            stage={stage}
          />
          <SatelliteScanModal
            open={scanModalOpen}
            beforeSrc={BEFORE_IMAGE_SRC}
            afterSrc={AFTER_IMAGE_SRC}
            status={scanStatus}
            hazardCount={scanHazardCount}
            onClose={closeScanModal}
          />
          {!logVisible && (
            <button
              type="button"
              onClick={() => setLogVisible(true)}
              className="absolute bottom-8 right-3 z-20 flex h-11 items-center gap-2 rounded-md border border-[#4A525E] bg-[#16191E] px-4 text-sm font-medium text-[#ECEEF1] shadow-lg hover:bg-[#1C2026] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EA8FE]"
            >
              Show activity log ({logs.length})
            </button>
          )}
        </main>
        {logDock === 'bottom' && logPanel}
      </div>

      {logDock === 'right' && logPanel}
      {logDock === 'float' && logPanel}
    </div>
  );
}

export default App;
