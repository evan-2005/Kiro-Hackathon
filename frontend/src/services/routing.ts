import fallbackRoute from '@shared/fallback_route.json';
import { GeoJsonFeatureCollection } from './api';

/**
 * DEV 4 (Routing & Pitch) Module:
 * Connects start coordinates (Trapped Civilians / Ambulance) to Safe Zone centroids,
 * avoiding the AI-detected hazard polygons.
 *
 * NOTE ON MAPBOX DIRECTIONS API:
 * Mapbox Directions API accepts an `exclude` parameter for road coordinates:
 * format: `exclude=point(lon lat)`
 * Alternatively, GraphHopper Directions API accepts full GeoJSON avoidance polygons.
 */

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

export async function calculateRescueRoute(
  startCoord: [number, number] = [101.6865, 3.1340],
  destinationCoord: [number, number] = [101.7015, 3.1418],
  avoidPoints: Array<[number, number]> = []
): Promise<GeoJsonFeatureCollection> {
  // If no Mapbox token is supplied or placeholder is used, return the golden avoidance route immediately
  if (!MAPBOX_TOKEN || MAPBOX_TOKEN.includes('your-username') || MAPBOX_TOKEN.includes('example')) {
    console.info('[ROUTER] Using pre-computed tactical route (Mapbox token not provided or demo fallback)');
    return fallbackRoute as unknown as GeoJsonFeatureCollection;
  }

  try {
    const coordsQuery = `${startCoord[0]},${startCoord[1]};${destinationCoord[0]},${destinationCoord[1]}`;
    let url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsQuery}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

    // If Dev 4 extracts road-intersection avoidance points from hazard polygons:
    if (avoidPoints.length > 0) {
      const excludeParam = avoidPoints
        .slice(0, 5) // max points
        .map(([lon, lat]) => `point(${lon.toFixed(4)} ${lat.toFixed(4)})`)
        .join(',');
      url += `&exclude=${encodeURIComponent(excludeParam)}`;
    }

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Mapbox directions returned ${res.status}`);
    }

    const data = await res.json();
    const routeGeom = data.routes?.[0]?.geometry;

    if (!routeGeom) {
      return fallbackRoute as unknown as GeoJsonFeatureCollection;
    }

    // Assemble GeoJSON collection with start, destination, and calculated route
    return {
      type: 'FeatureCollection',
      metadata: {
        engine: 'Mapbox Directions API Live Corridor',
        distanceKm: ((data.routes[0].distance || 0) / 1000).toFixed(2),
        durationMin: ((data.routes[0].duration || 0) / 60).toFixed(1),
      },
      features: [
        {
          type: 'Feature',
          id: 'start-point',
          properties: { title: 'Trapped Civilians / Ambulance', type: 'START', color: '#FFB800' },
          geometry: { type: 'Point', coordinates: startCoord },
        },
        {
          type: 'Feature',
          id: 'destination-point',
          properties: { title: 'Optimal Safe Zone', type: 'DESTINATION', color: '#00F0FF' },
          geometry: { type: 'Point', coordinates: destinationCoord },
        },
        {
          type: 'Feature',
          id: 'evacuation-route',
          properties: {
            title: 'Dynamic Rescue Corridor',
            stroke: '#00FF66',
            strokeWidth: 5,
            status: 'ACTIVE_SECURE',
          },
          geometry: routeGeom,
        },
      ],
    };
  } catch (err) {
    console.warn('[ROUTER] Live route calculation failed, falling back to cached tactical corridor:', err);
    return fallbackRoute as unknown as GeoJsonFeatureCollection;
  }
}
