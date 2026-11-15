import { useState, useCallback, useRef } from 'react';
import * as turf from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import missionConfig from '@shared/config.json';
import { MapView } from './components/MapView';
import { TacticalHUD, RouteSummary } from './components/TacticalHUD';
import { SatelliteScanModal } from './components/SatelliteScanModal';
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

// Last-resort pickup if no flood area has usable geometry (KL Sentral, SPEC.md) — [lon, lat]
const DEFAULT_PICKUP: [number, number] = [101.6865, 3.1340];
// Last-resort destination (Relief Camp Alpha, SPEC.md) — [lon, lat]
const DEFAULT_DESTINATION: [number, number] = [101.7015, 3.1418];
const BBOX = missionConfig.spatial.boundingBox;

type SafeZoneFeature = Feature<
  Polygon | MultiPolygon,
  { name?: unknown; elevationM?: unknown; centroid?: unknown } | null
>;
type HazardFeature = Feature<Polygon | MultiPolygon, { title?: unknown } | null>;

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

/**
 * Pickup point = where people are trapped: a point guaranteed to lie INSIDE the largest
 * detected flood area (turf.pointOnFeature), so the rescue starts in the red zone.
 */
const getPickup = (
  hazards: GeoJsonFeatureCollection | null
): { coord: [number, number]; hazardTitle: string | null } => {
  let best: { coord: [number, number]; area: number; title: string | null } | null = null;
  for (const feature of (hazards?.features ?? []) as HazardFeature[]) {
    const type = feature?.geometry?.type;
    if (type !== 'Polygon' && type !== 'MultiPolygon') continue;
    try {
      const area = turf.area(feature);
      const point = turf.pointOnFeature(feature).geometry.coordinates;
      if (!isLonLatInBBox(point)) continue;
      if (!best || area > best.area) {
        const title = feature.properties?.title;
        best = { coord: [point[0], point[1]], area, title: typeof title === 'string' ? title : null };
      }
    } catch {
      // Skip invalid geometry
    }
  }
  return best ? { coord: best.coord, hazardTitle: best.title } : { coord: DEFAULT_PICKUP, hazardTitle: null };
};

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

const timestamp = () =>
  new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function App() {
  const [stage, setStage] = useState<'IDLE' | 'HAZARDS_DETECTED' | 'SAFE_ZONES_COMPUTED' | 'ROUTE_DISPATCHED'>('IDLE');
  const [isLoading, setIsLoading] = useState(false);
  const [hazardData, setHazardData] = useState<GeoJsonFeatureCollection | null>(null);
  const [safeZoneData, setSafeZoneData] = useState<GeoJsonFeatureCollection | null>(null);
  const [routeData, setRouteData] = useState<GeoJsonFeatureCollection | null>(null);
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [logs, setLogs] = useState<string[]>(() => [`${timestamp()}  ${INITIAL_LOG}`]);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanStatus, setScanStatus] = useState<'scanning' | 'complete'>('scanning');
  const [scanHazardCount, setScanHazardCount] = useState<number | null>(null);
  const [primaryZone, setPrimaryZone] = useState<SafeZoneFeature | null>(null);
  // Bumped by every async step and by Reset, so a slow result finishing after Reset is ignored
  const runIdRef = useRef(0);

  const closeScanModal = useCallback(() => setScanModalOpen(false), []);

  const addLog = useCallback((message: string) => {
    setLogs((prev) => [`${timestamp()}  ${message}`, ...prev.slice(0, 40)]);
  }, []);

  // Step 1: detect flood areas from satellite imagery
  const handleScanTelemetry = async () => {
    setIsLoading(true);
    addLog('Scanning before/after satellite images of the Klang River basin…');

    const runId = ++runIdRef.current;
    setScanStatus('scanning');
    setScanHazardCount(null);
    setScanModalOpen(true);

    try {
      const [data] = await Promise.all([runDisasterScan(), wait(SCAN_MIN_DURATION_MS)]);
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
      if (hazardCount === 0) {
        addLog('No flood areas found in the images.');
      } else {
        addLog(
          `Found ${hazardCount} flood area${hazardCount === 1 ? '' : 's'}${
            hazardTitles.length ? `: ${hazardTitles.join(', ')}` : ''
          }. AI estimate — verify on the ground.`
        );
      }
    } catch (e) {
      if (runId !== runIdRef.current) return;
      setScanModalOpen(false);
      addLog(`Scan failed: ${e}`);
    } finally {
      if (runId === runIdRef.current) setIsLoading(false);
    }
  };

  // Step 2: find shelters on safe high ground
  const handleComputeSafeZones = () => {
    if (!hazardData) return;
    setIsLoading(true);
    addLog('Looking for high ground at least 150 m from flood areas…');

    try {
      const computed = computeSafeReliefZones(hazardData);
      // Dev 2 returns zones sorted best-first (largest usable area), so the first one is primary
      const primary = (computed.features[0] as SafeZoneFeature | undefined) ?? null;
      if (!primary) {
        addLog('Warning: no safe ground found nearby.');
        return;
      }

      setSafeZoneData(computed);
      setPrimaryZone(primary);
      setStage('SAFE_ZONES_COMPUTED');
      const elevation = primary.properties?.elevationM;
      addLog(
        `${computed.features.length} shelter${computed.features.length === 1 ? '' : 's'} available. Recommended: ${display(
          primary.properties?.name
        )}${elevation === undefined || elevation === null ? '' : ` (+${String(elevation)} m)`}.`
      );
    } catch (e) {
      addLog(`Shelter search failed: ${e}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: plan the rescue route from the pickup point (inside the flood area) to the shelter
  const handleDispatchRoute = async () => {
    setIsLoading(true);
    const runId = ++runIdRef.current;
    const pickup = getPickup(hazardData);
    const shelterName = display(primaryZone?.properties?.name, 'shelter');
    addLog(
      `Planning route from pickup point${pickup.hazardTitle ? ` in ${pickup.hazardTitle}` : ''} to ${shelterName}…`
    );

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
      addLog('Warning: shelter location unclear; routing to Relief Camp Alpha.');
      destination = DEFAULT_DESTINATION;
    }

    try {
      // Pass the hazard collection (not pre-extracted points) so Dev 2's router can add the points where
      // the direct road route crosses each hazard; centroid-only points leave the route unchanged.
      // If hazards are somehow missing, fall back to Dev 2's helper (which uses the golden cache).
      const avoidInput = hazardData?.features.length ? hazardData : extractHazardAvoidancePoints(hazardData);
      const route = await calculateRescueRoute(pickup.coord, destination, avoidInput);
      if (runId !== runIdRef.current) return;

      const { distanceKm, durationMin } = readRouteMetrics(route);
      const hasBlocked = route.features.some(
        (f: { properties?: { status?: unknown } | null }) => f?.properties?.status === 'IMPASSABLE'
      );
      setRouteData(route);
      setRouteSummary({
        distanceKm,
        durationMin,
        from: pickup.hazardTitle ? `Pickup in ${pickup.hazardTitle}` : 'Pickup point',
        to: shelterName,
        hasBlockedRoute: hasBlocked,
      });
      setStage('ROUTE_DISPATCHED');

      addLog(
        distanceKm !== null
          ? `Route ready: ${distanceKm.toFixed(1)} km${durationMin !== null ? `, about ${Math.round(durationMin)} min` : ''}.`
          : 'Route ready.'
      );
      if (hasBlocked) {
        addLog('Direct road is blocked by flooding (shown dashed grey).');
      } else {
        console.info('[ROUTER] No compromised route returned');
      }
    } catch (e) {
      if (runId !== runIdRef.current) return;
      addLog(`Route planning failed: ${e}`);
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
    setLogs([`${timestamp()}  Started over. ${INITIAL_LOG}`]);
  };

  return (
    <div className="flex w-screen h-screen overflow-hidden bg-[#0F1115]">
      <TacticalHUD
        stage={stage}
        isLoading={isLoading}
        logs={logs}
        hazardData={hazardData}
        safeZoneData={safeZoneData}
        primaryZoneName={primaryZone ? display(primaryZone.properties?.name) : null}
        routeSummary={routeSummary}
        onScanTelemetry={handleScanTelemetry}
        onComputeSafeZones={handleComputeSafeZones}
        onDispatchRoute={handleDispatchRoute}
        onReset={handleReset}
      />

      <main className="flex-1 h-full relative">
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
      </main>
    </div>
  );
}

export default App;
