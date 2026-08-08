'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface LocationPoint {
  token: string;
  lat: number;
  lng: number;
  accuracy?: number | null;
  ts?: number;
  created_at: string;
}

interface LiveMapProps {
  locations: Record<string, LocationPoint>;
  selectedToken?: string | null;
}

export default function LiveMap({ locations, selectedToken }: LiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default center (e.g., college campus or central location, default London/Global center fallback)
    const map = L.map(mapContainerRef.current, {
      center: [20.5937, 78.9629], // India default center, auto-adjusts to markers
      zoom: 4,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Custom marker icon creator
  const createCustomIcon = (token: string, isSelected: boolean) => {
    return L.divIcon({
      className: 'custom-location-pin',
      html: `
        <div class="relative flex items-center justify-center">
          <span class="animate-ping absolute inline-flex ${isSelected ? 'h-10 w-10 bg-cyan-400' : 'h-8 w-8 bg-indigo-400'} rounded-full opacity-75"></span>
          <div class="relative inline-flex rounded-full ${isSelected ? 'h-7 w-7 bg-cyan-500 ring-4 ring-cyan-300/40' : 'h-6 w-6 bg-indigo-600 ring-2 ring-white'} shadow-xl items-center justify-center">
            <div class="w-2.5 h-2.5 rounded-full bg-white"></div>
          </div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16],
    });
  };

  // Update markers when locations prop changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const currentTokens = Object.keys(locations);

    // Remove old markers for tokens no longer present
    Object.keys(markersRef.current).forEach((token) => {
      if (!locations[token]) {
        map.removeLayer(markersRef.current[token]);
        delete markersRef.current[token];
      }
    });

    const bounds: [number, number][] = [];

    currentTokens.forEach((token) => {
      const loc = locations[token];
      if (loc.lat === undefined || loc.lng === undefined) return;

      const latLng: [number, number] = [loc.lat, loc.lng];
      bounds.push(latLng);

      const isSelected = selectedToken === token;
      const formattedTime = new Date(loc.created_at).toLocaleTimeString();

      const popupContent = `
        <div style="font-family: system-ui, sans-serif; padding: 4px; color: #0f172a;">
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6366f1; margin-bottom: 2px;">
            Token: ${token.substring(0, 8)}...
          </div>
          <div style="font-size: 13px; font-weight: 600; margin-bottom: 4px;">
            📍 ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}
          </div>
          <div style="font-size: 11px; color: #64748b;">
            Accuracy: ±${loc.accuracy ? Math.round(loc.accuracy) : '?'}m<br/>
            Last signal: <strong>${formattedTime}</strong>
          </div>
        </div>
      `;

      if (markersRef.current[token]) {
        // Update marker position and popup
        const marker = markersRef.current[token];
        marker.setLatLng(latLng);
        marker.setIcon(createCustomIcon(token, isSelected));
        marker.getPopup()?.setContent(popupContent);
      } else {
        // Create new marker
        const marker = L.marker(latLng, {
          icon: createCustomIcon(token, isSelected),
        }).addTo(map);

        marker.bindPopup(popupContent);
        markersRef.current[token] = marker;
      }
    });

    // Auto fit map bounds if we have locations
    if (bounds.length > 0) {
      if (bounds.length === 1) {
        map.setView(bounds[0], 15, { animate: true });
      } else {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      }
    }
  }, [locations, selectedToken]);

  return (
    <div className="relative w-full h-[450px] lg:h-[550px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-900">
      <div ref={mapContainerRef} className="w-full h-full z-10" />

      {Object.keys(locations).length === 0 && (
        <div className="absolute inset-0 z-20 bg-slate-950/70 backdrop-blur-sm flex flex-col items-center justify-center text-slate-300 p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-base font-bold text-white">No active live streams on map</p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            Share an active tracking link with a participant. Once they allow location access, their marker will automatically appear live on this map.
          </p>
        </div>
      )}
    </div>
  );
}
