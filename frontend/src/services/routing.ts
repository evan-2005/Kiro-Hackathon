import * as turf from '@turf/turf';
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
const ALPHA_DESTINATION: [number, number] = [101.7015, 3.1418];

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
 * Checks whether a destination coordinate is close to Relief Camp Alpha (~300m threshold).
 */
export function isNearAlpha(destCoord: [number, number]): boolean {
  try {
    const destPt = turf.point(destCoord);
    const alphaPt = turf.point(ALPHA_DESTINATION);
    return turf.distance(destPt, alphaPt, { units: 'kilometers' }) < 0.3;
  } catch {
    return false;
  }
}

/**
 * Checks whether a given route geometry crosses or enters any hazard polygon.
 */
export function isRouteIntersectingHazards(
  routeGeometry: any,
  hazards?: GeoJsonFeatureCollection | null
): boolean {
  if (!routeGeometry) return false;
  const hazardFeatures = hazards?.features?.length
    ? hazards.features
    : (fallbackDamage as any).features || [];

  const routeFeature = routeGeometry.type === 'Feature'
    ? routeGeometry
    : { type: 'Feature', geometry: routeGeometry, properties: {} };

  for (const hazard of hazardFeatures) {
    if (!hazard.geometry) continue;
    try {
      // 1. Check if line segments cross the hazard boundary
      const intersections = turf.lineIntersect(routeFeature, hazard);
      if (intersections.features.length > 0) {
        return true;
      }
      // 2. Check if any waypoint on the line is inside the hazard polygon
      const coords = routeGeometry.coordinates || [];
      for (const pt of coords) {
        if (turf.booleanPointInPolygon(turf.point(pt), hazard)) {
          return true;
        }
      }
    } catch (e) {
      console.warn('[ROUTER] Hazard intersection check error:', e);
    }
  }
  return false;
}

/**
 * Extract road-hazard intersection points or hazard centroids for Mapbox exclusion.
 */
export function extractHazardAvoidancePoints(
  hazards?: GeoJsonFeatureCollection | null,
  directRouteLine?: any
): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const hazardFeatures = hazards?.features?.length ? hazards.features : (fallbackDamage as any).features || [];

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
  const destinationIsAlpha = isNearAlpha(cleanDest);

  const activeHazards: GeoJsonFeatureCollection | null = Array.isArray(hazardsOrAvoidPoints)
    ? null
    : (hazardsOrAvoidPoints || (fallbackDamage as unknown as GeoJsonFeatureCollection));

  // If no Mapbox token is supplied or placeholder is used, handle offline fallback
  if (!MAPBOX_TOKEN || MAPBOX_TOKEN.includes('your-username') || MAPBOX_TOKEN.includes('example')) {
    console.info('[ROUTER] Using pre-computed tactical route (Mapbox token not provided or demo fallback)');
    if (destinationIsAlpha) {
      return fallbackRoute as unknown as GeoJsonFeatureCollection;
    }
    // If destination is another camp and offline, do not draw the Alpha line to the wrong camp
    const fallbackDirect = (fallbackRoute as any).features.find((f: any) => f.id === 'compromised-route');
    return {
      type: 'FeatureCollection',
      metadata: {
        engine: 'Offline Golden Cache (No Mapbox Token)',
        status: 'NO_SAFE_CORRIDOR_FOUND',
        compromisedDistanceKm: '2.40',
        safeDistanceKm: null,
        durationMin: null,
        message: 'Offline bypass route is only pre-cached for Camp Alpha.',
      },
      features: [
        {
          type: 'Feature',
          id: 'start-point',
          properties: { title: 'Trapped Civilians / Ambulance', type: 'START', icon: 'ambulance', color: '#FFB800' },
          geometry: { type: 'Point', coordinates: cleanStart },
        },
        {
          type: 'Feature',
          id: 'destination-point',
          properties: { title: 'Selected Safe Zone', type: 'DESTINATION', icon: 'shield-check', color: '#00F0FF' },
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
          geometry: fallbackDirect?.geometry || { type: 'LineString', coordinates: [cleanStart, cleanDest] },
        },
      ],
    };
  }

  try {
    const coordsQuery = `${cleanStart[0]},${cleanStart[1]};${cleanDest[0]},${cleanDest[1]}`;

    // 1. Fetch the direct/standard shortest route (which cuts into flood zones)
    const directUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsQuery}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
    let directRouteGeom: any = null;
    let directDistanceKm = '2.40';

    try {
      const directRes = await fetch(directUrl);
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

    // Fallback direct route geometry if needed
    if (!directRouteGeom) {
      const fallbackCompromised = (fallbackRoute as any).features.find((f: any) => f.id === 'compromised-route');
      directRouteGeom = fallbackCompromised?.geometry || { type: 'LineString', coordinates: [cleanStart, cleanDest] };
    }

    // 2. Resolve avoidance points
    let avoidPoints: Array<[number, number]> = [];
    if (Array.isArray(hazardsOrAvoidPoints)) {
      avoidPoints = hazardsOrAvoidPoints.map(sanitizeCoord);
    } else {
      avoidPoints = extractHazardAvoidancePoints(hazardsOrAvoidPoints, directRouteGeom);
    }

    // 3. Attempt to fetch a live hazard-avoiding route from Mapbox
    let avoidanceRouteGeom: any = null;
    let safeDistanceKm: string | null = null;
    let durationMin: string | null = null;

    // Attempt A: Direct Mapbox query with exclude=point(...)
    if (avoidPoints.length > 0) {
      const excludeParam = avoidPoints
        .slice(0, 5)
        .map(([lon, lat]) => `point(${lon.toFixed(4)} ${lat.toFixed(4)})`)
        .join(',');

      const safeUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsQuery}?geometries=geojson&overview=full&exclude=${encodeURIComponent(excludeParam)}&access_token=${MAPBOX_TOKEN}`;

      try {
        const safeRes = await fetch(safeUrl);
        if (safeRes.ok) {
          const safeData = await safeRes.json();
          if (safeData.code === 'Ok' && safeData.routes?.[0]?.geometry) {
            const candidateGeom = safeData.routes[0].geometry;
            // Validate: route MUST NOT cross the hazard polygon
            if (!isRouteIntersectingHazards(candidateGeom, activeHazards)) {
              avoidanceRouteGeom = candidateGeom;
              safeDistanceKm = ((safeData.routes[0].distance || 0) / 1000).toFixed(2);
              durationMin = ((safeData.routes[0].duration || 0) / 60).toFixed(1);
            } else {
              console.warn('[ROUTER] Mapbox excluded route still intersects hazard zone, attempting bypass waypoint.');
            }
          }
        }
      } catch (safeErr) {
        console.warn('[ROUTER] Excluded route fetch error:', safeErr);
      }
    }

    // Attempt B: If Attempt A crossed the hazard or failed, attempt bypass waypoint around the hazard perimeter
    if (!avoidanceRouteGeom && activeHazards?.features?.length) {
      try {
        // Derive southern bypass waypoint outside the hazard envelope
        const bbox = turf.bbox(activeHazards); // [minLon, minLat, maxLon, maxLat]
        const southWaypoint: [number, number] = [
          Number(((bbox[0] + bbox[2]) / 2).toFixed(4)),
          Number((bbox[1] - 0.005).toFixed(4)), // 500m south of flood envelope
        ];
        const bypassQuery = `${cleanStart[0]},${cleanStart[1]};${southWaypoint[0]},${southWaypoint[1]};${cleanDest[0]},${cleanDest[1]}`;
        const bypassUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${bypassQuery}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

        const bypassRes = await fetch(bypassUrl);
        if (bypassRes.ok) {
          const bypassData = await bypassRes.json();
          if (bypassData.code === 'Ok' && bypassData.routes?.[0]?.geometry) {
            const candidateBypass = bypassData.routes[0].geometry;
            if (!isRouteIntersectingHazards(candidateBypass, activeHazards)) {
              avoidanceRouteGeom = candidateBypass;
              safeDistanceKm = ((bypassData.routes[0].distance || 0) / 1000).toFixed(2);
              durationMin = ((bypassData.routes[0].duration || 0) / 60).toFixed(1);
              console.info('[ROUTER] Successfully resolved safe corridor via southern bypass perimeter.');
            }
          }
        }
      } catch (bypassErr) {
        console.warn('[ROUTER] Bypass waypoint routing attempt failed:', bypassErr);
      }
    }

    // Attempt C: Golden fallback corridor ONLY IF destination is Relief Camp Alpha
    if (!avoidanceRouteGeom && destinationIsAlpha) {
      const fallbackEvacuation = (fallbackRoute as any).features.find((f: any) => f.id === 'evacuation-route');
      if (fallbackEvacuation?.geometry && !isRouteIntersectingHazards(fallbackEvacuation.geometry, activeHazards)) {
        avoidanceRouteGeom = fallbackEvacuation.geometry;
        safeDistanceKm = '3.80';
        durationMin = '9.4';
      }
    }

    // If no safe route could be found, safeDistanceKm remains null (no fake numbers)
    const isAvoidanceSuccess = avoidanceRouteGeom !== null;

    const resultFeatures: any[] = [
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
          title: destinationIsAlpha ? 'Optimal Relief Camp Alpha' : 'Selected Relief Camp',
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
    ];

    // Only draw the green evacuation route if a verified safe route reaching the marker actually exists
    if (isAvoidanceSuccess) {
      resultFeatures.push({
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
      });
    }

    return {
      type: 'FeatureCollection',
      metadata: {
        engine: 'Mapbox Directions API Live Dual-Corridor',
        status: isAvoidanceSuccess ? 'SAFE_CORRIDOR_CALCULATED' : 'NO_SAFE_CORRIDOR_FOUND',
        compromisedDistanceKm: directDistanceKm,
        safeDistanceKm: safeDistanceKm, // null when no route found (no fake numbers)
        durationMin: durationMin,       // null when no route found
        avoidancePointsApplied: avoidPoints.length,
        hazardAvoidanceVerified: isAvoidanceSuccess,
        warning: isAvoidanceSuccess ? undefined : 'No road avoids the active hazard envelope to this destination.',
      },
      features: resultFeatures,
    };
  } catch (err) {
    console.warn('[ROUTER] Live route calculation failed:', err);
    if (destinationIsAlpha) {
      return fallbackRoute as unknown as GeoJsonFeatureCollection;
    }
    return {
      type: 'FeatureCollection',
      metadata: {
        engine: 'Mapbox Directions Error Fallback',
        status: 'NO_SAFE_CORRIDOR_FOUND',
        compromisedDistanceKm: '2.40',
        safeDistanceKm: null,
        durationMin: null,
        warning: 'Routing failed and no fallback route exists for this destination.',
      },
      features: [
        {
          type: 'Feature',
          id: 'start-point',
          properties: { title: 'Trapped Civilians / Ambulance', type: 'START', color: '#FFB800' },
          geometry: { type: 'Point', coordinates: cleanStart },
        },
        {
          type: 'Feature',
          id: 'destination-point',
          properties: { title: 'Selected Relief Camp', type: 'DESTINATION', color: '#00F0FF' },
          geometry: { type: 'Point', coordinates: cleanDest },
        },
      ],
    };
  }
}
