import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import * as turf from '@turf/turf';
import 'mapbox-gl/dist/mapbox-gl.css';
import missionConfig from '@shared/config.json';
import { GeoJsonFeatureCollection } from '../services/api';

type MissionStage = 'IDLE' | 'HAZARDS_DETECTED' | 'SAFE_ZONES_COMPUTED' | 'ROUTE_DISPATCHED';

interface StageCamera {
  center: [number, number]; // [lon, lat]
  zoom: number;
  pitch: number;
  bearing: number;
  duration: number;
}

// DESIGN.md colour tokens (standard emergency semantics)
const COLOR = {
  base: '#0F1115',
  flood: '#E5484D',
  shelter: '#3B82F6',
  route: '#30A46C',
  routeCasing: '#0B1A12',
  blocked: '#8B95A1',
  building: '#262B33',
};

// North-up camera (responders give directions by compass), moderate tilt so terrain still reads.
// Center/zoom come from shared config; pitch/bearing are a deliberate DESIGN.md override.
const BOOT_CAMERA = {
  center: missionConfig.spatial.center as [number, number],
  zoom: missionConfig.spatial.zoom,
  pitch: 40,
  bearing: 0,
};

// Per-stage camera. Angles/timing always used; center/zoom only when there is no data to frame.
const STAGE_CAMERA: Record<Exclude<MissionStage, 'IDLE'>, StageCamera> = {
  HAZARDS_DETECTED: { center: [101.6935, 3.1420], zoom: 14.8, pitch: 40, bearing: 0, duration: 1800 },
  SAFE_ZONES_COMPUTED: { center: [101.6980, 3.1360], zoom: 14.2, pitch: 40, bearing: 0, duration: 1800 },
  ROUTE_DISPATCHED: { center: [101.6940, 3.1360], zoom: 14.5, pitch: 45, bearing: 0, duration: 2000 },
};
const FIT_PADDING = 80;
const FIT_MAX_ZOOM = 15.5;
const RESET_DURATION_MS = 1500;

/** Bounds [[minLon, minLat], [maxLon, maxLat]] of all features in the given collections, or null. */
const getBounds = (
  collections: Array<GeoJsonFeatureCollection | null | undefined>
): [[number, number], [number, number]] | null => {
  const features = collections.flatMap((fc) => (fc?.features?.length ? fc.features : []));
  if (features.length === 0) return null;
  try {
    const [minLon, minLat, maxLon, maxLat] = turf.bbox(turf.featureCollection(features));
    if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite)) return null;
    return [
      [minLon, minLat],
      [maxLon, maxLat],
    ];
  } catch {
    return null;
  }
};

interface MapViewProps {
  hazardData: GeoJsonFeatureCollection | null;
  safeZoneData: GeoJsonFeatureCollection | null;
  routeData: GeoJsonFeatureCollection | null;
  stage: 'IDLE' | 'HAZARDS_DETECTED' | 'SAFE_ZONES_COMPUTED' | 'ROUTE_DISPATCHED';
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

// Standard Mapbox "animated dash" sequence for the rescue-route flow layer
const DASH_ARRAY_SEQUENCE: number[][] = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [0, 0.5, 3, 3.5],
  [0, 1, 3, 3],
  [0, 1.5, 3, 2.5],
  [0, 2, 3, 2],
  [0, 2.5, 3, 1.5],
  [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
];
// Slow, subtle travel-direction dashes (not a light show)
const DASH_STEP_MS = 90;

interface RoutePointFeature {
  id?: string | number;
  properties?: { type?: unknown } | null;
  geometry?: { type?: string; coordinates?: unknown } | null;
}

// Popup content is built with textContent only: hazard properties come from an AI model (untrusted).
type FeatureProps = Record<string, unknown> | null | undefined;

const isMissing = (v: unknown): boolean => v === undefined || v === null || v === '';

const show = (v: unknown): string => (isMissing(v) ? '—' : String(v));

const el = (tag: string, className: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** "RIVER_OVERTOPPING" → "River overtopping" */
const humanize = (v: unknown): string => {
  if (isMissing(v)) return '—';
  const s = String(v).replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const row = (label: string, value: string): HTMLElement => {
  const r = el('div', 'info-popup-row');
  r.appendChild(el('span', 'info-popup-label', label));
  r.appendChild(el('span', 'info-popup-value', value));
  return r;
};

const buildHazardPopup = (props: FeatureProps): HTMLElement => {
  const p = props ?? {};
  const root = el('div', 'info-popup-body');
  root.appendChild(el('div', 'info-popup-kind info-popup-kind--flood', 'Flood area'));
  root.appendChild(el('div', 'info-popup-title', show(p.title)));
  const severity = isMissing(p.severity) ? '' : String(p.severity).toUpperCase();
  if (severity) {
    root.appendChild(el('span', `info-popup-badge info-popup-badge--${severity.toLowerCase()}`, humanize(severity)));
  }
  root.appendChild(row('Type', humanize(p.type)));
  root.appendChild(row('Water depth', isMissing(p.waterDepthEstM) ? 'Unknown' : `${String(p.waterDepthEstM)} m`));
  root.appendChild(el('p', 'info-popup-text', show(p.infrastructureImpact)));
  root.appendChild(el('p', 'info-popup-note', 'AI estimate — verify on the ground.'));
  return root;
};

const buildSafeZonePopup = (props: FeatureProps): HTMLElement => {
  const p = props ?? {};
  const root = el('div', 'info-popup-body');
  root.appendChild(el('div', 'info-popup-kind info-popup-kind--shelter', 'Shelter'));
  root.appendChild(el('div', 'info-popup-title', show(p.name)));
  const capacityNum = Number(p.capacityPersons);
  root.appendChild(
    row('Capacity', isMissing(p.capacityPersons) || Number.isNaN(capacityNum) ? '—' : `${capacityNum.toLocaleString()} people`)
  );
  root.appendChild(row('Elevation', isMissing(p.elevationM) ? '—' : `+${String(p.elevationM)} m`));
  root.appendChild(row('Road access', show(p.roadAccess)));
  return root;
};

// Legend items appear only once they are on the map (minStage = index in the 4-stage flow)
const STAGE_INDEX: Record<MissionStage, number> = {
  IDLE: 0,
  HAZARDS_DETECTED: 1,
  SAFE_ZONES_COMPUTED: 2,
  ROUTE_DISPATCHED: 3,
};
const LEGEND: Array<{ label: string; swatch: string; minStage: number }> = [
  { label: 'Flood area', swatch: 'legend-swatch legend-swatch--flood', minStage: 1 },
  { label: 'Shelter', swatch: 'legend-swatch legend-swatch--shelter', minStage: 2 },
  { label: 'Rescue route', swatch: 'legend-line legend-line--route', minStage: 3 },
  { label: 'Blocked road', swatch: 'legend-line legend-line--blocked', minStage: 3 },
  { label: 'Rescue team', swatch: 'legend-dot legend-dot--start', minStage: 3 },
];

// Base-map label groups that compete with the rescue data (roads, districts and water names stay)
const NOISY_LABEL_LAYERS = /^(poi-label|transit-label|airport-label|natural-point-label)/;

export const MapView: React.FC<MapViewProps> = ({
  hazardData,
  safeZoneData,
  routeData,
  stage,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const routeMarkersRef = useRef<mapboxgl.Marker[]>([]);
  // Last stage the camera animated to; starts at IDLE so the map does not move at boot
  const lastAnimatedStageRef = useRef<MissionStage>('IDLE');
  const [mapLoaded, setMapLoaded] = useState(false);
  const [tokenMissing, setTokenMissing] = useState(false);

  // Initialize Mapbox
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!MAPBOX_TOKEN || MAPBOX_TOKEN.includes('your-username') || MAPBOX_TOKEN.includes('example')) {
      setTokenMissing(true);
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: BOOT_CAMERA.center,
      zoom: BOOT_CAMERA.zoom,
      pitch: BOOT_CAMERA.pitch,
      bearing: BOOT_CAMERA.bearing,
      antialias: true,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');

    // Redraw when the container changes size (e.g. the activity log is docked or moved)
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(mapContainerRef.current);

    map.on('error', (e) => {
      try {
        console.warn('[MAP]', e?.error ?? e);
      } catch {
        // Never let map error logging throw
      }
    });

    map.on('load', () => {
      // Add 3D terrain
      try {
        map.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14,
        });
        map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
      } catch (e) {
        console.warn('3D Terrain setup warning:', e);
      }

      // Plain dark horizon (no stars)
      try {
        map.setFog({
          color: COLOR.base,
          'high-color': '#16191E',
          'horizon-blend': 0.06,
          'space-color': COLOR.base,
          'star-intensity': 0,
        });
      } catch (e) {
        console.warn('Fog setup warning:', e);
      }

      // 3D buildings for street-level orientation
      try {
        const layers = map.getStyle().layers;
        const labelLayerId = layers?.find(
          (layer) => layer.type === 'symbol' && layer.layout?.['text-field']
        )?.id;

        map.addLayer(
          {
            id: '3d-buildings',
            source: 'composite',
            'source-layer': 'building',
            filter: ['==', 'extrude', 'true'],
            type: 'fill-extrusion',
            minzoom: 13,
            paint: {
              'fill-extrusion-color': COLOR.building,
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['get', 'min_height'],
              'fill-extrusion-opacity': 0.7,
            },
          },
          labelLayerId
        );
      } catch (e) {
        console.warn('3D Buildings setup warning:', e);
      }

      // Declutter the base map: hide shop/POI/transit labels so flood data and road names stand out
      try {
        for (const layer of map.getStyle().layers ?? []) {
          if (layer.type === 'symbol' && NOISY_LABEL_LAYERS.test(layer.id)) {
            map.setLayoutProperty(layer.id, 'visibility', 'none');
          }
        }
      } catch (e) {
        console.warn('Label declutter warning:', e);
      }

      // Add Data Sources
      map.addSource('hazards-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addSource('safe-zones-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addSource('route-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Flood areas (red)
      map.addLayer({
        id: 'hazards-fill',
        type: 'fill',
        source: 'hazards-src',
        paint: {
          'fill-color': COLOR.flood,
          'fill-opacity': 0.3,
        },
      });
      map.addLayer({
        id: 'hazards-line',
        type: 'line',
        source: 'hazards-src',
        paint: {
          'line-color': COLOR.flood,
          'line-width': 2,
          'line-opacity': 0.9,
        },
      });

      // Shelters (blue)
      map.addLayer({
        id: 'safe-zones-fill',
        type: 'fill',
        source: 'safe-zones-src',
        paint: {
          'fill-color': COLOR.shelter,
          'fill-opacity': 0.28,
        },
      });
      map.addLayer({
        id: 'safe-zones-line',
        type: 'line',
        source: 'safe-zones-src',
        paint: {
          'line-color': COLOR.shelter,
          'line-width': 2,
          'line-opacity': 0.9,
        },
      });

      // Blocked direct road (dashed grey)
      map.addLayer({
        id: 'route-compromised',
        type: 'line',
        source: 'route-src',
        filter: ['==', 'status', 'IMPASSABLE'],
        paint: {
          'line-color': COLOR.blocked,
          'line-width': 3,
          'line-opacity': 0.85,
          'line-dasharray': [2, 2],
        },
      });

      // Rescue route (green)
      map.addLayer({
        id: 'route-safe',
        type: 'line',
        source: 'route-src',
        filter: ['==', 'status', 'ACTIVE_SECURE'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': COLOR.route,
          'line-width': 5,
          'line-opacity': 1,
        },
      });

      // Dark casing under the rescue route so it reads over any background (like navigation apps)
      map.addLayer(
        {
          id: 'route-safe-glow',
          type: 'line',
          source: 'route-src',
          filter: ['==', 'status', 'ACTIVE_SECURE'],
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': COLOR.routeCasing,
            'line-width': 9,
            'line-opacity': 0.9,
          },
        },
        'route-safe'
      );

      // Subtle direction-of-travel dashes on the rescue route
      map.addLayer({
        id: 'route-safe-flow',
        type: 'line',
        source: 'route-src',
        filter: ['==', 'status', 'ACTIVE_SECURE'],
        paint: {
          'line-color': '#FFFFFF',
          'line-width': 1.5,
          'line-opacity': 0.55,
          'line-dasharray': DASH_ARRAY_SEQUENCE[0],
        },
      });

      // Small anchor dots under the start/destination pins
      map.addLayer({
        id: 'route-waypoints',
        type: 'circle',
        source: 'route-src',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 4,
          'circle-color': COLOR.base,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#FFFFFF',
        },
      });

      // Shelter names written directly on the map (short name = text before " - ")
      try {
        map.addLayer({
          id: 'safe-zones-label',
          type: 'symbol',
          source: 'safe-zones-src',
          layout: {
            'text-field': [
              'case',
              ['>', ['index-of', ' - ', ['to-string', ['get', 'name']]], 0],
              ['slice', ['to-string', ['get', 'name']], 0, ['index-of', ' - ', ['to-string', ['get', 'name']]]],
              ['to-string', ['get', 'name']],
            ],
            'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
            'text-size': 14,
            'text-max-width': 8,
            'text-anchor': 'top',
            'text-offset': [0, 1],
          },
          paint: {
            'text-color': '#DCE8FF',
            'text-halo-color': COLOR.base,
            'text-halo-width': 2,
          },
        });
      } catch (e) {
        console.warn('Shelter label setup warning:', e);
      }

      // Click popups: one map-level handler, one popup at a time
      map.on('click', (e) => {
        popupRef.current?.remove();
        popupRef.current = null;

        const feature = map.queryRenderedFeatures(e.point, {
          layers: ['safe-zones-fill', 'hazards-fill'],
        })[0];
        if (!feature) return;

        const layerId = feature.layer?.id;
        const content =
          layerId === 'hazards-fill'
            ? buildHazardPopup(feature.properties)
            : layerId === 'safe-zones-fill'
              ? buildSafeZonePopup(feature.properties)
              : null;
        if (!content) return;

        popupRef.current = new mapboxgl.Popup({
          className: 'info-popup',
          closeButton: true,
          maxWidth: '280px',
          offset: 8,
        })
          .setLngLat(e.lngLat)
          .setDOMContent(content)
          .addTo(map);
      });

      // Pointer cursor over clickable zones
      const setPointer = () => {
        map.getCanvas().style.cursor = 'pointer';
      };
      const clearPointer = () => {
        map.getCanvas().style.cursor = '';
      };
      for (const layerId of ['hazards-fill', 'safe-zones-fill']) {
        map.on('mouseenter', layerId, setPointer);
        map.on('mouseleave', layerId, clearPointer);
      }

      setMapLoaded(true);
    });

    return () => {
      resizeObserver.disconnect();
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, []);

  // Update Hazard Layer
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const source = mapRef.current.getSource('hazards-src') as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData(hazardData || { type: 'FeatureCollection', features: [] });
    }
  }, [hazardData, mapLoaded]);

  // Update Safe Zone Layer
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const source = mapRef.current.getSource('safe-zones-src') as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData(safeZoneData || { type: 'FeatureCollection', features: [] });
    }
  }, [safeZoneData, mapLoaded]);

  // Update Route Layer
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const source = mapRef.current.getSource('route-src') as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData(routeData || { type: 'FeatureCollection', features: [] });
    }
  }, [routeData, mapLoaded]);

  // Labelled rescue-team start / destination pins for the route
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !routeData) return;

    for (const feature of routeData.features as RoutePointFeature[]) {
      if (feature?.geometry?.type !== 'Point') continue;
      const coords = feature.geometry.coordinates;
      if (!Array.isArray(coords) || typeof coords[0] !== 'number' || typeof coords[1] !== 'number') continue;

      const pointType = feature.properties?.type;
      const pin =
        feature.id === 'start-point' || pointType === 'START'
          ? { variant: 'map-pin--start', label: 'Rescue team' }
          : feature.id === 'destination-point' || pointType === 'DESTINATION'
            ? { variant: 'map-pin--shelter', label: 'Destination' }
            : null;
      if (!pin) continue;

      // The element is the dot itself (so the default center anchor sits on the point); the label hangs beside it
      const element = document.createElement('div');
      element.className = `map-pin ${pin.variant}`;
      const label = document.createElement('span');
      label.className = 'map-pin-label';
      label.textContent = pin.label;
      element.appendChild(label);
      const marker = new mapboxgl.Marker({ element })
        .setLngLat([coords[0], coords[1]]) // [lon, lat]
        .addTo(map);
      routeMarkersRef.current.push(marker);
    }

    return () => {
      routeMarkersRef.current.forEach((marker) => marker.remove());
      routeMarkersRef.current = [];
    };
  }, [routeData, mapLoaded]);

  // Animated dash flow along the rescue route (only once dispatched)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || stage !== 'ROUTE_DISPATCHED') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frameId = 0;
    let step = -1;
    const animate = (timestamp: number) => {
      const nextStep = Math.floor(timestamp / DASH_STEP_MS) % DASH_ARRAY_SEQUENCE.length;
      if (nextStep !== step && map.getLayer('route-safe-flow')) {
        map.setPaintProperty('route-safe-flow', 'line-dasharray', DASH_ARRAY_SEQUENCE[nextStep]);
        step = nextStep;
      }
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frameId);
  }, [stage, mapLoaded]);

  // Close any open popup on Reset
  useEffect(() => {
    if (stage === 'IDLE') {
      popupRef.current?.remove();
      popupRef.current = null;
    }
  }, [stage]);

  // Camera Choreography per Stage: frame the actual data, animate once per stage change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (lastAnimatedStageRef.current === stage) return;
    lastAnimatedStageRef.current = stage;

    if (stage === 'IDLE') {
      // Reset: fly back to the boot camera (padding 0 clears the padding fitBounds leaves behind)
      map.flyTo({
        center: BOOT_CAMERA.center,
        zoom: BOOT_CAMERA.zoom,
        pitch: BOOT_CAMERA.pitch,
        bearing: BOOT_CAMERA.bearing,
        padding: 0,
        duration: RESET_DURATION_MS,
        essential: true,
      });
      return;
    }

    const camera = STAGE_CAMERA[stage];
    const bounds =
      stage === 'HAZARDS_DETECTED'
        ? getBounds([hazardData])
        : stage === 'SAFE_ZONES_COMPUTED'
          ? getBounds([hazardData, safeZoneData])
          : getBounds([routeData, hazardData]);

    if (bounds) {
      map.fitBounds(bounds, {
        padding: FIT_PADDING,
        pitch: camera.pitch,
        bearing: camera.bearing,
        duration: camera.duration,
        maxZoom: FIT_MAX_ZOOM,
        essential: true,
      });
    } else {
      map.flyTo({
        center: camera.center,
        zoom: camera.zoom,
        pitch: camera.pitch,
        bearing: camera.bearing,
        padding: 0,
        duration: camera.duration,
        essential: true,
      });
    }
  }, [stage, mapLoaded, hazardData, safeZoneData, routeData]);

  return (
    <div className="relative h-full w-full bg-[#0F1115] font-sans">
      <div ref={mapContainerRef} className="h-full w-full" />

      {/* Missing Mapbox token */}
      {tokenMissing && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#0F1115] p-8">
          <div className="max-w-md rounded-lg border border-[#2B3038] bg-[#16191E] p-5 text-[#ECEEF1]">
            <h2 className="text-base font-semibold">Map unavailable</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#A1A8B3]">
              The base map needs a Mapbox access token. Add it to <code className="text-[#ECEEF1]">frontend/.env</code> and
              restart the app:
            </p>
            <code className="mt-3 block rounded border border-[#2B3038] bg-[#0F1115] p-2 text-xs text-[#C9CED6]">
              VITE_MAPBOX_TOKEN=pk.eyJ1...
            </code>
            <p className="mt-3 text-sm text-[#A1A8B3]">
              Flood detection, shelters and routing still work from cached data.
            </p>
          </div>
        </div>
      )}

      {/* Legend */}
      {!tokenMissing && STAGE_INDEX[stage] > 0 && (
        <div
          className="pointer-events-none absolute left-3 top-3 z-10 rounded-md border border-[#2B3038] bg-[#16191E]/95 px-3 py-2.5 text-sm text-[#ECEEF1]"
          aria-label="Map legend"
        >
          <ul className="space-y-1.5">
            {LEGEND.filter((item) => STAGE_INDEX[stage] >= item.minStage).map((item) => (
              <li key={item.label} className="flex items-center gap-2">
                <span className={item.swatch} aria-hidden="true" />
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
