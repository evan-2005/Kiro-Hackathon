import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import missionConfig from '@shared/config.json';
import { GeoJsonFeatureCollection } from '../services/api';

interface MapViewProps {
  hazardData: GeoJsonFeatureCollection | null;
  safeZoneData: GeoJsonFeatureCollection | null;
  routeData: GeoJsonFeatureCollection | null;
  stage: 'IDLE' | 'HAZARDS_DETECTED' | 'SAFE_ZONES_COMPUTED' | 'ROUTE_DISPATCHED';
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

export const MapView: React.FC<MapViewProps> = ({
  hazardData,
  safeZoneData,
  routeData,
  stage,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
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
        paint: {
          'line-color': '#00FF66',
          'line-width': 5,
          'line-opacity': 0.95,
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

      setMapLoaded(true);
    });

    return () => {
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

  // Camera Choreography per Stage
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    if (stage === 'HAZARDS_DETECTED') {
      map.flyTo({
        center: [101.6935, 3.1420],
        zoom: 14.8,
        pitch: 58,
        bearing: -10,
        duration: 2500,
      });
    } else if (stage === 'SAFE_ZONES_COMPUTED') {
      map.flyTo({
        center: [101.6980, 3.1360],
        zoom: 14.2,
        pitch: 50,
        bearing: 15,
        duration: 2500,
      });
    } else if (stage === 'ROUTE_DISPATCHED') {
      map.flyTo({
        center: [101.6940, 3.1360],
        zoom: 14.5,
        pitch: 62,
        bearing: 45,
        duration: 3000,
      });
    }
  }, [stage, mapLoaded]);

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
      <div className="absolute bottom-6 right-6 pointer-events-none z-10">
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
