import { useState, useCallback } from 'react';
import { MapView } from './components/MapView';
import { TacticalHUD } from './components/TacticalHUD';
import {
  runDisasterScan,
  GeoJsonFeatureCollection,
} from './services/api';
import { computeSafeReliefZones } from './services/turfSafeZone';
import { calculateRescueRoute } from './services/routing';

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

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toISOString().substring(11, 19);
    setLogs((prev) => [`[${timestamp}] ${message}`, ...prev.slice(0, 40)]);
  }, []);

  // Step 1: Scan Satellite Telemetry
  const handleScanTelemetry = async () => {
    setIsLoading(true);
    addLog('[SAT-LINK] Ingesting Sentinel-1 SAR & Sentinel-2 optical imagery...');
    addLog('[AI-PIPELINE] Querying local Qwen3-VL (qwen3-vl:4b) damage bounding-box model...');

    try {
      const data = await runDisasterScan();
      setHazardData(data);
      setStage('HAZARDS_DETECTED');
      addLog(`[AI-CONFIRMED] ${data.features.length} Critical hazard zones detected on transit corridors.`);
      addLog('[ALERT] Lebuh Pasar Besar Bridge & Federal Highway underpass impassable.');
    } catch (e) {
      addLog(`[ERROR] Scan failure: ${e}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Compute Safe Zones
  const handleComputeSafeZones = () => {
    if (!hazardData) return;
    setIsLoading(true);
    addLog('[TURF-ENGINE] Computing topographic multi-criteria elevation model...');
    addLog('[TURF-ENGINE] Buffering hazard polygons (+200m safety clearance)...');

    try {
      const computed = computeSafeReliefZones(hazardData);
      setSafeZoneData(computed);
      setStage('SAFE_ZONES_COMPUTED');
      addLog(`[SAFE-ZONES-RESOLVED] Identified ${computed.features.length} optimal relief camp plateaus.`);
      addLog('[STAGING] Primary Site locked: Stadium Merdeka Ridge (Elevation: +68m).');
    } catch (e) {
      addLog(`[ERROR] Turf computation error: ${e}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Dispatch Rescue Route
  const handleDispatchRoute = async () => {
    setIsLoading(true);
    addLog('[ROUTER] Calculating rescue corridor from KL Sentral to Camp Alpha...');
    addLog('[ROUTER] Applying dynamic polygon hazard exclusion...');

    try {
      const route = await calculateRescueRoute();
      setRouteData(route);
      setStage('ROUTE_DISPATCHED');
      addLog('[CORRIDOR-DEPLOYED] Dynamic avoidance corridor locked (3.8 km).');
      addLog('[TACTICAL] Compromised direct route bypassed; ambulance dispatched.');
    } catch (e) {
      addLog(`[ERROR] Routing failure: ${e}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Reset demo
  const handleReset = () => {
    setStage('IDLE');
    setHazardData(null);
    setSafeZoneData(null);
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
      </main>
    </div>
  );
}

export default App;
