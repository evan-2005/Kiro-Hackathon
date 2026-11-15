import * as turf from '@turf/turf';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import fallbackRoute from '@shared/fallback_route.json';
import fallbackDamage from '@shared/fallback_damage.json';
import { GeoJsonFeatureCollection } from './api';

/**
 * DEV 2 (Spatial Math & Routing Lead) Module:
 * Connects start coordinates (Trapped Civilians / Ambulance) to Safe Zone centroids,
 * avoiding AI-detected hazard polygons.
 *
 * MAPBOX DIRECTIONS API SPECIFICATION:
 * Mapbox Directions API accepts an `exclude` parameter for road coordinates:
 * format: `exclude=point(lon lat)` with space-separated coordinates.
 */

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

/**
 * Sanitizes coordinate order: [lon, lat] for Klang River Basin.
 */
function sanitizeCoord(coord: [number, number]): [number, number] {
  let [lon, lat] = coord;
  if (lon < 50 && lat > 50) {
    [lon, lat] = [lat, lon];
  }
  return [lon, lat];
}

/**
 * Extract road-hazard intersection points or hazard centroids for Mapbox exclusion.
 */
export function extractHazardAvoidancePoints(
  hazards?: GeoJsonFeatureCollection | null,
  directRouteLine?: any
): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const hazardFeatures = hazards?.features ?? (fallbackDamage as any).features;

  for (const hazard of hazardFeatures) {
    if (!hazard.geometry) continue;

    // 1. If direct route geometry is available, find line-polygon intersection points
    if (directRouteLine) {
      try {
        const directFeature = directRouteLine.type === 'Feature'
          ? directRouteLine
          : { type: 'Feature', geometry: directRouteLine, properties: {} };
        const intersects = turf.lineIntersect(directFeature, hazard);
        for (const pt of intersects.features) {
          const [lon, lat] = pt.geometry.coordinates;
          const [cleanLon, cleanLat] = sanitizeCoord([lon, lat]);
          points.push([Number(cleanLon.toFixed(4)), Number(cleanLat.toFixed(4))]);
        }
      } catch (err) {
        console.warn('[ROUTER] Intersection calculation warning:', err);
      }
    }

    // 2. Also take the centroid of the hazard polygon as an exclusion point
    try {
      const center = turf.centroid(hazard);
      const [lon, lat] = center.geometry.coordinates;
      const [cleanLon, cleanLat] = sanitizeCoord([lon, lat]);
      points.push([Number(cleanLon.toFixed(4)), Number(cleanLat.toFixed(4))]);
    } catch {
      // Ignore geometry errors
    }
  }

  // De-duplicate points within ~100m (0.001 deg)
  const deduped: Array<[number, number]> = [];
  for (const [lon, lat] of points) {
    const isClose = deduped.some(([dLon, dLat]) => Math.abs(dLon - lon) < 0.001 && Math.abs(dLat - lat) < 0.001);
    if (!isClose) {
      deduped.push([lon, lat]);
    }
  }

  return deduped.slice(0, 5); // Mapbox Directions API safe limit
}

export async function calculateRescueRoute(
  startCoord: [number, number] = [101.6865, 3.1340],
  destinationCoord: [number, number] = [101.7015, 3.1418],
  hazardsOrAvoidPoints?: GeoJsonFeatureCollection | Array<[number, number]>
): Promise<GeoJsonFeatureCollection> {
  const cleanStart = sanitizeCoord(startCoord);
  const cleanDest = sanitizeCoord(destinationCoord);
  const hazardFeatures = Array.isArray(hazardsOrAvoidPoints)
    ? fallbackDamage.features
    : hazardsOrAvoidPoints?.features ?? fallbackDamage.features;
  const routeIsBlocked = (geometry: any) => hazardFeatures.some(hazard => {
    const buffered = turf.buffer(hazard as Feature<Polygon | MultiPolygon>, 0.15, { units: 'kilometers' });
    if (!buffered) throw new Error('Hazard buffer could not be validated');
    return turf.booleanIntersects(turf.feature(geometry), buffered);
  });
  const cachedRoute = (reason: string): GeoJsonFeatureCollection => {
    const evacuation = fallbackRoute.features.find(feature => feature.id === 'evacuation-route')!;
    const coordinates = evacuation.geometry.coordinates as number[][];
    if (routeIsBlocked(evacuation.geometry)
      || turf.distance(turf.point(cleanStart), turf.point(coordinates[0])) > 0.1
      || turf.distance(turf.point(cleanDest), turf.point(coordinates[coordinates.length - 1])) > 0.1) {
      throw new Error('No validated rescue corridor available for this hazard and destination');
    }
    return { ...fallbackRoute, metadata: {
      ...fallbackRoute.metadata, engine: 'CACHED_DEMO_ROUTE', fallbackReason: reason,
    } } as unknown as GeoJsonFeatureCollection;
  };

  // If no Mapbox token is supplied or placeholder is used, return the golden avoidance route immediately
  if (!MAPBOX_TOKEN || MAPBOX_TOKEN.includes('your-username') || MAPBOX_TOKEN.includes('example')) {
    console.info('[ROUTER] Using pre-computed tactical route (Mapbox token not provided or demo fallback)');
    return cachedRoute('Mapbox token unavailable');
  }

  try {
    const coordsQuery = `${cleanStart[0]},${cleanStart[1]};${cleanDest[0]},${cleanDest[1]}`;

    // 1. Fetch the direct/standard shortest route (which cuts into flood zones)
    const directUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsQuery}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
    let directRouteGeom: any = null;
    let directDistanceKm = '2.40';

    try {
      const directRes = await fetch(directUrl, { signal: AbortSignal.timeout(6000) });
      if (directRes.ok) {
        const directData = await directRes.json();
        if (directData.code === 'Ok' && directData.routes?.[0]?.geometry) {
          directRouteGeom = directData.routes[0].geometry;
          if (directData.routes[0].distance) {
            directDistanceKm = (directData.routes[0].distance / 1000).toFixed(2);
          }
        }
      } else {
        console.warn(`[ROUTER] Direct route returned HTTP ${directRes.status}, falling back to cache.`);
      }
    } catch (directErr) {
      console.warn('[ROUTER] Direct route fetch error:', directErr);
    }

    // Fallback direct route geometry from golden cache if needed
    if (!directRouteGeom) {
      const fallbackCompromised = (fallbackRoute as any).features.find((f: any) => f.id === 'compromised-route');
      directRouteGeom = fallbackCompromised?.geometry;
    }

    // 2. Resolve avoidance points
    let avoidPoints: Array<[number, number]> = [];
    if (Array.isArray(hazardsOrAvoidPoints)) {
      avoidPoints = hazardsOrAvoidPoints.map(sanitizeCoord);
    } else {
      avoidPoints = extractHazardAvoidancePoints(hazardsOrAvoidPoints, directRouteGeom);
    }

    // 3. Fetch the hazard-avoiding rescue route with exclusion points
    let avoidanceRouteGeom: any = null;
    let safeDistanceKm = '3.80';
    let durationMin = '9.4';

    if (avoidPoints.length > 0) {
      const excludeParam = avoidPoints
        .slice(0, 5)
        .map(([lon, lat]) => `point(${lon.toFixed(4)} ${lat.toFixed(4)})`)
        .join(',');

      const safeUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsQuery}?geometries=geojson&overview=full&exclude=${encodeURIComponent(excludeParam)}&access_token=${MAPBOX_TOKEN}`;
      
      try {
        const safeRes = await fetch(safeUrl, { signal: AbortSignal.timeout(6000) });
        if (safeRes.ok) {
          const safeData = await safeRes.json();
          if (safeData.code === 'Ok' && safeData.routes?.[0]?.geometry) {
            avoidanceRouteGeom = safeData.routes[0].geometry;
            if (safeData.routes[0].distance) {
              safeDistanceKm = ((safeData.routes[0].distance || 0) / 1000).toFixed(2);
              durationMin = ((safeData.routes[0].duration || 0) / 60).toFixed(1);
            }
          }
        } else {
          console.warn(`[ROUTER] Excluded route returned HTTP ${safeRes.status}, falling back to cache.`);
        }
      } catch (safeErr) {
        console.warn('[ROUTER] Excluded route fetch error:', safeErr);
      }
    }

    if (avoidPoints.length === 0) avoidanceRouteGeom = directRouteGeom;
    // Excluding points does not guarantee that Mapbox avoids the whole flood polygon.
    if (!avoidanceRouteGeom || routeIsBlocked(avoidanceRouteGeom)) {
      return cachedRoute('Live route unavailable or intersects the 150m hazard buffer');
    }

    // Assemble GeoJSON collection with both compromised and safe routes
    return {
      type: 'FeatureCollection',
      metadata: {
        engine: 'Mapbox Directions API Live Dual-Corridor',
        status: 'SAFE_CORRIDOR_CALCULATED',
        compromisedDistanceKm: directDistanceKm,
        safeDistanceKm,
        durationMin,
        avoidancePointsApplied: avoidPoints.length,
      },
      features: [
        {
          type: 'Feature',
          id: 'start-point',
          properties: {
            title: 'Trapped Civilians / Ambulance',
            type: 'START',
            icon: 'ambulance',
            color: '#FFB800',
          },
          geometry: { type: 'Point', coordinates: cleanStart },
        },
        {
          type: 'Feature',
          id: 'destination-point',
          properties: {
            title: 'Optimal Relief Camp Alpha',
            type: 'DESTINATION',
            icon: 'shield-check',
            color: '#00F0FF',
          },
          geometry: { type: 'Point', coordinates: cleanDest },
        },
        {
          type: 'Feature',
          id: 'compromised-route',
          properties: {
            title: 'Standard Direct Route (COMPROMISED)',
            status: 'IMPASSABLE',
            stroke: '#94A3B8',
            strokeWidth: 3,
            strokeDasharray: [2, 2],
            warning: 'Crosses into critical flood/washout corridor',
          },
          geometry: directRouteGeom,
        },
        {
          type: 'Feature',
          id: 'evacuation-route',
          properties: {
            title: 'Dynamic Rescue Corridor (OPTIMIZED)',
            status: 'ACTIVE_SECURE',
            stroke: '#00FF66',
            strokeWidth: 5,
            hazardAvoidanceSuccess: true,
          },
          geometry: avoidanceRouteGeom,
        },
      ],
    };
  } catch (err) {
    console.warn('[ROUTER] Live route calculation failed, falling back to cached tactical corridor:', err);
    return cachedRoute('Live route calculation failed');
  }
}
