import * as turf from '@turf/turf';
import fallbackSafeZones from '@shared/fallback_safe_zones.json';
import { GeoJsonFeatureCollection } from './api';

/**
 * DEV 2 (Spatial Architect) Engine:
 * Calculates optimal disaster relief camps by:
 * 1. Filtering candidate high-elevation open areas by minimum elevation
 * 2. Sanitizing incoming AI hazard polygons (auto-correcting flipped coordinates, closing unclosed rings, unkinking self-intersections)
 * 3. Buffering danger polygons with a safety clearance buffer (e.g. 150m-200m)
 * 4. Computing polygon difference (turf.difference) to carve out flood zones
 * 5. Discarding engulfed candidate areas that have zero or sub-threshold usable area
 * 6. Deriving safe zone centroids and square meterage for routing endpoints
 */

export interface SafeZoneCriteria {
  minElevationMeters: number;
  hazardBufferKm: number; // e.g. 0.15 km = 150m
  minUsableAreaSqM?: number; // minimum usable relief camp area in m²
}

/**
 * Sanitizes input hazard features:
 * 1. Flips inverted coordinates if [lat, lon] was accidentally provided
 * 2. Ensures polygon linear rings are closed (first point === last point)
 * 3. Resolves self-intersecting (kinked) polygons into clean valid polygons via turf.unkinkPolygon
 */
export function sanitizeHazardFeature(feature: any): any[] {
  if (!feature || !feature.geometry) return [];
  const geom = feature.geometry;

  if (geom.type === 'Polygon') {
    const coords = geom.coordinates.map((ring: any[]) => {
      let cleaned = ring.map(([lon, lat]: [number, number]) => {
        // If coordinate order was accidentally flipped (lat > 50, lon < 50 for KL)
        if (lon < 50 && lat > 50) {
          return [lat, lon];
        }
        return [lon, lat];
      });

      // Ensure ring has at least 3 distinct vertices and is closed
      if (cleaned.length >= 3) {
        const first = cleaned[0];
        const last = cleaned[cleaned.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          cleaned.push([first[0], first[1]]);
        }
      }
      return cleaned;
    });

    try {
      const poly = turf.polygon(coords, feature.properties);
      const kinks = turf.kinks(poly);
      if (kinks.features.length > 0) {
        return turf.unkinkPolygon(poly).features;
      }
      return [poly];
    } catch {
      return [feature];
    }
  }

  if (geom.type === 'MultiPolygon') {
    const polys: any[] = [];
    for (const polygonCoords of geom.coordinates) {
      try {
        const poly = turf.polygon(polygonCoords, feature.properties);
        const kinks = turf.kinks(poly);
        if (kinks.features.length > 0) {
          polys.push(...turf.unkinkPolygon(poly).features);
        } else {
          polys.push(poly);
        }
      } catch {
        // Continue
      }
    }
    return polys.length > 0 ? polys : [feature];
  }

  return [feature];
}

export function computeSafeReliefZones(
  dangerZones?: GeoJsonFeatureCollection | null,
  criteria: SafeZoneCriteria = { minElevationMeters: 45, hazardBufferKm: 0.15, minUsableAreaSqM: 5000 }
): GeoJsonFeatureCollection {
  try {
    const rawCandidates = (fallbackSafeZones as any).features || [];
    const minElevation = criteria.minElevationMeters ?? 45;
    const bufferDistance = criteria.hazardBufferKm ?? 0.15;
    const minArea = criteria.minUsableAreaSqM ?? 5000;

    // Filter candidate areas by elevation threshold
    const eligibleCandidates = rawCandidates.filter((feat: any) => {
      const elevation = feat.properties?.elevationM ?? 0;
      return elevation >= minElevation;
    });

    // Combine all danger zones into a single unified buffer
    let bufferedHazards: any = null;
    if (dangerZones && dangerZones.features && dangerZones.features.length > 0) {
      for (const rawFeat of dangerZones.features) {
        try {
          if (!rawFeat.geometry) continue;

          // Sanitize hazard polygon (close ring, flip inverted coords, unkink)
          const sanitizedFeatures = sanitizeHazardFeature(rawFeat);
          for (const feat of sanitizedFeatures) {
            const buffered = turf.buffer(feat, bufferDistance, { units: 'kilometers' });
            if (buffered) {
              if (!bufferedHazards) {
                bufferedHazards = buffered;
              } else {
                bufferedHazards = turf.union(turf.featureCollection([bufferedHazards, buffered]));
              }
            }
          }
        } catch (bufErr) {
          console.warn('[TURF] Hazard buffer warning:', bufErr);
        }
      }
    }

    const processedFeatures: any[] = [];

    // Process each candidate safe zone
    for (const candidate of eligibleCandidates) {
      let finalGeom = candidate.geometry;
      let isEngulfed = false;

      if (bufferedHazards) {
        try {
          // Check if candidate intersects buffered hazard zone
          const intersects = turf.booleanIntersects(candidate, bufferedHazards);
          if (intersects) {
            // Subtract buffered hazards using Turf v7 single-FeatureCollection signature
            const difference = turf.difference(turf.featureCollection([candidate, bufferedHazards]));
            if (difference && difference.geometry) {
              finalGeom = difference.geometry;
            } else {
              // Difference is null => candidate is completely submerged inside the hazard buffer
              isEngulfed = true;
            }
          }
        } catch (diffErr) {
          console.warn(`[TURF] Difference calculation error for ${candidate.id || 'candidate'}:`, diffErr);
          // If topology error occurs, keep original candidate geometry
          finalGeom = candidate.geometry;
        }
      }

      // Exclude engulfed zones
      if (isEngulfed || !finalGeom) {
        continue;
      }

      // Compute area
      const areaSqM = Math.round(turf.area({ type: 'Feature', geometry: finalGeom, properties: {} }));

      // Exclude if surviving usable area is below minimum threshold
      if (areaSqM < minArea) {
        continue;
      }

      // Compute centroid for rescue route endpoint
      const center = turf.centroid({ type: 'Feature', geometry: finalGeom, properties: {} });
      const [rawLon, rawLat] = center.geometry.coordinates;
      const centroid: [number, number] = [
        Math.round(rawLon * 1000000) / 1000000,
        Math.round(rawLat * 1000000) / 1000000,
      ];

      // Calculate area-adjusted capacity
      const baseCapacity = candidate.properties?.capacityPersons || 3500;
      const capacity = Math.max(500, Math.min(baseCapacity, Math.round(areaSqM / 8)));

      processedFeatures.push({
        ...candidate,
        geometry: finalGeom,
        properties: {
          ...candidate.properties,
          computedAreaSqM: areaSqM,
          capacityPersons: capacity,
          centroid,
          status: candidate.properties?.status || 'VALIDATED_CLEAR',
        },
      });
    }

    // Sort by usable area descending
    processedFeatures.sort((a, b) => (b.properties.computedAreaSqM || 0) - (a.properties.computedAreaSqM || 0));

    return {
      type: 'FeatureCollection',
      metadata: {
        computedBy: 'Turf.js Client-Side Spatial Engine (Dev 2)',
        activeZones: processedFeatures.length,
        criteriaApplied: {
          minElevationMeters: minElevation,
          hazardBufferKm: bufferDistance,
          minUsableAreaSqM: minArea,
        },
      },
      features: processedFeatures,
    };
  } catch (error) {
    console.error('[TURF-ENGINE] Calculation failed, returning pre-calculated safe zones', error);
    return fallbackSafeZones as unknown as GeoJsonFeatureCollection;
  }
}
