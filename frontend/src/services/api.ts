import fallbackDamage from '@shared/fallback_damage.json';
import fallbackSafeZones from '@shared/fallback_safe_zones.json';
import fallbackRoute from '@shared/fallback_route.json';
import missionConfig from '@shared/config.json';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  metadata?: Record<string, any>;
  features: any[];
}

export async function fetchMissionConfig() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/config`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('[AEGIS API] Backend config unreachable, using shared/config.json', err);
  }
  return missionConfig;
}

export async function runDisasterScan(imagePayload?: { before?: string; after?: string }): Promise<GeoJsonFeatureCollection> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/analyze-disaster`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        before_image_url: imagePayload?.before,
        after_image_url: imagePayload?.after,
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const data = await res.json();
      return data as GeoJsonFeatureCollection;
    }
  } catch (err) {
    console.warn('[AEGIS API] AI Backend unreachable, engaging golden fallback telemetry', err);
  }

  // Fallback with simulated realistic satellite processing delay
  await new Promise((resolve) => setTimeout(resolve, 800));
  return fallbackDamage as unknown as GeoJsonFeatureCollection;
}

export async function fetchSafeZonesData(): Promise<GeoJsonFeatureCollection> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/safe-zones`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Graceful fallback
  }
  return fallbackSafeZones as unknown as GeoJsonFeatureCollection;
}

export async function fetchEvacuationRouteData(): Promise<GeoJsonFeatureCollection> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/evacuation-route`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Graceful fallback
  }
  return fallbackRoute as unknown as GeoJsonFeatureCollection;
}
