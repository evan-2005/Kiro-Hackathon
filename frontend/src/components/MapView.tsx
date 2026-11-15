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

// DESIGN.md §6 camera per stage. Angles/timing always used; center/zoom only when there is no data to frame.
const STAGE_CAMERA: Record<Exclude<MissionStage, 'IDLE'>, StageCamera> = {
  HAZARDS_DETECTED: { center: [101.6935, 3.1420], zoom: 14.8, pitch: 58, bearing: -10, duration: 2500 },
  SAFE_ZONES_COMPUTED: { center: [101.6980, 3.1360], zoom: 14.2, pitch: 50, bearing: 15, duration: 2500 },
  ROUTE_DISPATCHED: { center: [101.6940, 3.1360], zoom: 14.5, pitch: 62, bearing: 45, duration: 3000 },
};
const FIT_PADDING = 80;
const FIT_MAX_ZOOM = 15.5;
const RESET_DURATION_MS = 2000;

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
const DASH_STEP_MS = 50;

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

const buildHazardPopup = (props: FeatureProps): HTMLElement => {
  const p = props ?? {};
  const root = el('div', 'tactical-popup-body');
  root.appendChild(el('div', 'tactical-popup-title tactical-popup-title--hazard', show(p.title)));
  root.appendChild(el('span', 'tactical-popup-badge', show(p.severity)));
  root.appendChild(el('div', 'tactical-popup-row', `Type: ${show(p.type)}`));
  const depth = isMissing(p.waterDepthEstM) ? '—' : `${String(p.waterDepthEstM)} m`;
  root.appendChild(el('div', 'tactical-popup-row', `Est. depth: ${depth}`));
  root.appendChild(el('div', 'tactical-popup-row tactical-popup-muted', show(p.infrastructureImpact)));
  return root;
};

const buildSafeZonePopup = (props: FeatureProps): HTMLElement => {
  const p = props ?? {};
  const root = el('div', 'tactical-popup-body');
  root.appendChild(el('div', 'tactical-popup-title tactical-popup-title--safe', show(p.name)));
  const elevation = isMissing(p.elevationM) ? '—' : `+${String(p.elevationM)} m`;
  root.appendChild(el('div', 'tactical-popup-row', `Elevation: ${elevation}`));
  const capacityNum = Number(p.capacityPersons);
  const capacity =
    isMissing(p.capacityPersons) || Number.isNaN(capacityNum)
      ? '—'
      : `${capacityNum.toLocaleString()} persons`;
  root.appendChild(el('div', 'tactical-popup-row', `Capacity: ${capacity}`));
  root.appendChild(el('div', 'tactical-popup-row tactical-popup-muted', `Road access: ${show(p.roadAccess)}`));
  return root;
};

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
      center: missionConfig.spatial.center as [number, number],
      zoom: missionConfig.spatial.zoom,
      pitch: missionConfig.spatial.pitch,
      bearing: missionConfig.spatial.bearing,
      antialias: true,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');

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

      // Dark tactical atmosphere
      try {
        map.setFog({
          color: '#070B12',
          'high-color': '#0B111E',
          'horizon-blend': 0.08,
          'space-color': '#070B12',
          'star-intensity': 0.1,
        });
      } catch (e) {
        console.warn('Fog setup warning:', e);
      }

      // Add 3D Building Extrusions for military tactical depth
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
              'fill-extrusion-color': '#0F172A',
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['get', 'min_height'],
              'fill-extrusion-opacity': 0.6,
            },
          },
          labelLayerId
        );
      } catch (e) {
        console.warn('3D Buildings setup warning:', e);
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

      // Hazard Layers (Crimson Neon)
      map.addLayer({
        id: 'hazards-fill',
        type: 'fill',
        source: 'hazards-src',
        paint: {
          'fill-color': '#FF0055',
          'fill-opacity': 0.45,
        },
      });
      map.addLayer({
        id: 'hazards-line',
        type: 'line',
        source: 'hazards-src',
        paint: {
          'line-color': '#FF0055',
          'line-width': 2.5,
          'line-opacity': 0.9,
        },
      });

      // Safe Zone Layers (Cyan Neon)
      map.addLayer({
        id: 'safe-zones-fill',
        type: 'fill',
        source: 'safe-zones-src',
        paint: {
          'fill-color': '#00F0FF',
          'fill-opacity': 0.35,
        },
      });
      map.addLayer({
        id: 'safe-zones-line',
        type: 'line',
        source: 'safe-zones-src',
        paint: {
          'line-color': '#00F0FF',
          'line-width': 2.5,
          'line-opacity': 0.9,
        },
      });

      // Compromised Route Layer (Dashed Grey)
      map.addLayer({
        id: 'route-compromised',
        type: 'line',
        source: 'route-src',
        filter: ['==', 'status', 'IMPASSABLE'],
        paint: {
          'line-color': '#94A3B8',
          'line-width': 3,
          'line-dasharray': [2, 2],
        },
      });

      // Active Rescue Route Layer (Neon Green Glow)
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
          'line-color': '#00FF66',
          'line-width': 5,
          'line-opacity': 0.95,
        },
      });

      // Soft glow under the active rescue route
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
            'line-color': '#00FF66',
            'line-width': 14,
            'line-blur': 8,
            'line-opacity': 0.35,
          },
        },
        'route-safe'
      );

      // Moving dashes above the active rescue route
      map.addLayer({
        id: 'route-safe-flow',
        type: 'line',
        source: 'route-src',
        filter: ['==', 'status', 'ACTIVE_SECURE'],
        paint: {
          'line-color': '#D1FFE3',
          'line-width': 2,
          'line-dasharray': DASH_ARRAY_SEQUENCE[0],
        },
      });

      // Waypoint Circles
      map.addLayer({
        id: 'route-waypoints',
        type: 'circle',
        source: 'route-src',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 8,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#FFFFFF',
        },
      });

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
          className: 'tactical-popup',
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

  // Pulsing start / destination markers for the route
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !routeData) return;

    for (const feature of routeData.features as RoutePointFeature[]) {
      if (feature?.geometry?.type !== 'Point') continue;
      const coords = feature.geometry.coordinates;
      if (!Array.isArray(coords) || typeof coords[0] !== 'number' || typeof coords[1] !== 'number') continue;

      const pointType = feature.properties?.type;
      const variant =
        feature.id === 'start-point' || pointType === 'START'
          ? 'pulse-amber'
          : feature.id === 'destination-point' || pointType === 'DESTINATION'
            ? 'pulse-cyan'
            : null;
      if (!variant) continue;

      const element = document.createElement('div');
      element.className = `pulse-marker ${variant}`;
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
        center: missionConfig.spatial.center as [number, number],
        zoom: missionConfig.spatial.zoom,
        pitch: missionConfig.spatial.pitch,
        bearing: missionConfig.spatial.bearing,
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
    <div className="relative w-full h-full bg-[#070B12]">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Token Missing Warning Banner */}
      {tokenMissing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#070B12]/95 p-8 text-center z-40 backdrop-blur-md">
          <div className="w-16 h-16 mb-4 rounded-full border-2 border-radar-amber flex items-center justify-center text-radar-amber text-2xl font-bold animate-pulse">
            !
          </div>
          <h2 className="text-xl font-bold text-radar-amber tracking-wider mb-2">MAPBOX ACCESS TOKEN REQUIRED</h2>
          <p className="max-w-md text-sm text-slate-400 mb-6 font-mono leading-relaxed">
            To render the 3D tactical satellite canvas, add your token to <span className="text-radar-cyan font-bold">frontend/.env</span>:
            <br />
            <code className="inline-block mt-2 p-2 bg-[#0B111E] rounded text-xs text-slate-200 border border-slate-800">
              VITE_MAPBOX_TOKEN=pk.eyJ1...
            </code>
          </p>
          <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-lg max-w-md text-left text-xs text-slate-300 font-mono">
            <span className="text-radar-green font-bold">READY IN CODE:</span> All spatial logic, Turf.js calculations, and AI endpoints are fully functional. Add a free public Mapbox token to unlock the live WebGL terrain.
          </div>
        </div>
      )}

      {/* Grid Coordinates Overlay */}
      <div className="absolute top-4 left-4 pointer-events-none z-10 flex gap-4 text-[10px] font-mono text-radar-cyan/60 tracking-wider">
        <span className="bg-[#070B12]/80 px-2 py-1 rounded border border-radar-cyan/20">
          COORD: [101.6938°E, 3.1408°N]
        </span>
        <span className="bg-[#070B12]/80 px-2 py-1 rounded border border-radar-cyan/20">
          GRID: KLANG-BASIN-ALPHA
        </span>
        <span className="bg-[#070B12]/80 px-2 py-1 rounded border border-radar-cyan/20">
          DATUM: WGS-84
        </span>
      </div>

      {/* Tactical Compass / Status Ring */}
      <div className="absolute bottom-6 left-6 pointer-events-none z-10">
        <div className="relative w-24 h-24 rounded-full border border-radar-cyan/30 flex items-center justify-center bg-[#070B12]/60 backdrop-blur-sm">
          <div className="absolute inset-1 rounded-full border border-dashed border-radar-cyan/20 animate-spin" style={{ animationDuration: '20s' }} />
          <div className="text-[9px] font-mono text-radar-cyan/80 text-center leading-tight">
            AEGIS<br />
            <span className="text-[11px] font-bold text-radar-cyan">3D-SYS</span><br />
            ONLINE
          </div>
        </div>
      </div>
    </div>
  );
};
