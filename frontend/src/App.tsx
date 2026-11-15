import { useState, useCallback, useRef } from 'react';
import * as turf from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import missionConfig from '@shared/config.json';
import { MapView } from './components/MapView';
import { TacticalHUD } from './components/TacticalHUD';
import { SatelliteScanModal } from './components/SatelliteScanModal';
import { TelemetryConsole } from './components/TelemetryConsole';
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

// Trapped civilians / ambulance origin (KL Sentral, SPEC.md) — [lon, lat]
const START_COORD: [number, number] = [101.6865, 3.1340];
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

const display = (v: unknown): string => (v === undefined || v === null || v === '' ? '—' : String(v));

export function App() {
  const [stage, setStage] = useState<'IDLE' | 'HAZARDS_DETECTED' | 'SAFE_ZONES_COMPUTED' | 'ROUTE_DISPATCHED'>('IDLE');
  const [isLoading, setIsLoading] = useState(false);
  const [hazardData, setHazardData] = useState<GeoJsonFeatureCollection | null>(null);
  const [safeZoneData, setSafeZoneData] = useState<GeoJsonFeatureCollection | null>(null);
  const [routeData, setRouteData] = useState<GeoJsonFeatureCollection | null>(null);
  const [logs, setLogs] = useState<string[]>([
    '[SYS-INIT] Aegis Orbital Command v1.0 initialized.',
    '[GRID-LOCK] Target: Klang River Basin [101.66E, 3.11N to 101.73E, 3.17N].',
    '[READY] Standing by for satellite telemetry ingestion...',
  ]);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanStatus, setScanStatus] = useState<'scanning' | 'complete'>('scanning');
  const [scanHazardCount, setScanHazardCount] = useState<number | null>(null);
  const [primaryZone, setPrimaryZone] = useState<SafeZoneFeature | null>(null);
  // Bumped by every async step and by Reset, so a slow result finishing after Reset is ignored
  const runIdRef = useRef(0);

  const closeScanModal = useCallback(() => setScanModalOpen(false), []);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toISOString().substring(11, 19);
    setLogs((prev) => [`[${timestamp}] ${message}`, ...prev.slice(0, 40)]);
  }, []);

  // Step 1: Scan Satellite Telemetry
  const handleScanTelemetry = async () => {
    setIsLoading(true);
    addLog('[SAT-LINK] Ingesting before/after orbital imagery (simulated flood event)...');
    addLog('[AI-PIPELINE] Querying local Qwen3-VL (qwen3-vl:4b) damage bounding-box model...');

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
      addLog(`[AI-CONFIRMED] ${hazardCount} hazard zone${hazardCount === 1 ? '' : 's'} detected on transit corridors.`);
      const hazardTitles = data.features
        .map((f: { properties?: { title?: unknown } | null }) => f?.properties?.title)
        .filter((t: unknown): t is string => typeof t === 'string' && t.length > 0);
      if (hazardTitles.length > 0) {
        addLog(`[ALERT] Impassable: ${hazardTitles.join(', ')}.`);
      }
    } catch (e) {
      if (runId !== runIdRef.current) return;
      setScanModalOpen(false);
      addLog(`[ERROR] Scan failure: ${e}`);
    } finally {
      if (runId === runIdRef.current) setIsLoading(false);
    }
  };

  // Step 2: Compute Safe Zones
  const handleComputeSafeZones = () => {
    if (!hazardData) return;
    setIsLoading(true);
    addLog('[TURF-ENGINE] Computing topographic multi-criteria elevation model...');
    addLog('[TURF-ENGINE] Buffering hazard polygons (+150m safety clearance)...');

    try {
      const computed = computeSafeReliefZones(hazardData);
      // Dev 2 returns zones sorted best-first (largest usable area), so the first one is primary
      const primary = (computed.features[0] as SafeZoneFeature | undefined) ?? null;
      if (!primary) {
        addLog('[WARN] No safe ground found in sector');
        return;
      }

      setSafeZoneData(computed);
      setPrimaryZone(primary);
      setStage('SAFE_ZONES_COMPUTED');
      addLog(`[SAFE-ZONES-RESOLVED] Identified ${computed.features.length} optimal relief camp plateaus.`);
      const elevation = primary.properties?.elevationM;
      addLog(
        `[STAGING] Primary Site locked: ${display(primary.properties?.name)} (Elevation: ${
          elevation === undefined || elevation === null ? '—' : `+${String(elevation)}m`
        }).`
      );
    } catch (e) {
      addLog(`[ERROR] Turf computation error: ${e}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Dispatch Rescue Route
  const handleDispatchRoute = async () => {
    setIsLoading(true);
    const runId = ++runIdRef.current;
    addLog(`[ROUTER] Calculating rescue corridor from KL Sentral to ${display(primaryZone?.properties?.name)}...`);
    addLog('[ROUTER] Applying dynamic polygon hazard exclusion...');

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
      addLog('[WARN] Safe-zone centroid unavailable; routing to default Relief Camp Alpha.');
      destination = DEFAULT_DESTINATION;
    }

    try {
      // Pass the hazard collection (not pre-extracted points) so Dev 2's router can add the points where
      // the direct road route crosses each hazard; centroid-only points leave the route unchanged.
      // If hazards are somehow missing, fall back to Dev 2's helper (which uses the golden cache).
      const avoidInput = hazardData?.features.length ? hazardData : extractHazardAvoidancePoints(hazardData);
      const route = await calculateRescueRoute(START_COORD, destination, avoidInput);
      if (runId !== runIdRef.current) return;

      setRouteData(route);
      setStage('ROUTE_DISPATCHED');

      const safeDistanceKm = route.metadata?.safeDistanceKm;
      const durationMin = route.metadata?.durationMin;
      if (safeDistanceKm !== undefined && safeDistanceKm !== null) {
        addLog(
          `[CORRIDOR-DEPLOYED] Avoidance corridor locked · ${String(safeDistanceKm)} km · ETA ${display(durationMin)} min`
        );
      } else {
        addLog('[CORRIDOR-DEPLOYED] Avoidance corridor locked');
      }
      const hasCompromised = route.features.some(
        (f: { properties?: { status?: unknown } | null }) => f?.properties?.status === 'IMPASSABLE'
      );
      if (!hasCompromised) {
        console.info('[ROUTER] No compromised route returned');
      }
      addLog('[TACTICAL] Compromised direct route bypassed; ambulance dispatched.');
    } catch (e) {
      if (runId !== runIdRef.current) return;
      addLog(`[ERROR] Routing failure: ${e}`);
    } finally {
      if (runId === runIdRef.current) setIsLoading(false);
    }
  };

  // Reset demo
  const handleReset = () => {
    runIdRef.current += 1;
    setScanModalOpen(false);
    setIsLoading(false);
    setStage('IDLE');
    setHazardData(null);
    setSafeZoneData(null);
    setPrimaryZone(null);
    setRouteData(null);
    setLogs([
      '[RESET] System reset to base state.',
      '[GRID-LOCK] Target: Klang River Basin [101.66E, 3.11N to 101.73E, 3.17N].',
      '[READY] Standing by for satellite telemetry ingestion...',
    ]);
  };

  return (
    <div className="flex w-screen h-screen overflow-hidden bg-[#070B12]">
      {/* Tactical Sidebar HUD */}
      <TacticalHUD
        stage={stage}
        isLoading={isLoading}
        logs={logs}
        hazardData={hazardData}
        safeZoneData={safeZoneData}
        onScanTelemetry={handleScanTelemetry}
        onComputeSafeZones={handleComputeSafeZones}
        onDispatchRoute={handleDispatchRoute}
        onReset={handleReset}
      />

      {/* 3D Mapbox Map Canvas */}
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
        <TelemetryConsole logs={logs} stage={stage} />
      </main>
    </div>
  );
}

export default App;
