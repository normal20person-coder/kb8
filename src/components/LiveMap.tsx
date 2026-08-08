'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [autoFollow, setAutoFollow] = useState(true);
  const hasFitInitialBounds = useRef(false);

  // Initialize Leaflet Map with CartoDB Dark Matter bio-matrix tiles
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [20.5937, 78.9629],
      zoom: 4,
      zoomControl: true,
    });

    // CartoDB Dark Matter map tiles for high-end dark bio-emerald matrix vibe
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Bioluminescent Dewdrop Icon Creator
  const createCustomIcon = (token: string, isSelected: boolean) => {
    return L.divIcon({
      className: 'custom-dewdrop-pin',
      html: `
        <div class="relative flex items-center justify-center">
          <span class="animate-ping absolute inline-flex ${isSelected ? 'h-10 w-10 bg-cyan-400/80' : 'h-8 w-8 bg-emerald-400/60'} rounded-full opacity-75"></span>
          <div class="relative inline-flex rounded-full ${isSelected ? 'h-8 w-8 bg-gradient-to-r from-emerald-400 to-cyan-400 ring-4 ring-cyan-400/30' : 'h-7 w-7 bg-gradient-to-r from-emerald-500 to-teal-400 ring-2 ring-emerald-300/40'} shadow-[0_0_15px_rgba(52,211,153,0.8)] items-center justify-center">
            <svg class="w-4 h-4 text-[#030a07]" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="6" />
            </svg>
          </div>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -18],
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
        <div style="font-family: system-ui, sans-serif; padding: 6px; background: #061811; color: #ecfdf5; border-radius: 12px; border: 1px solid rgba(16, 185, 129, 0.3);">
          <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #34d399; margin-bottom: 2px;">
            Node Token: ${token.substring(0, 8)}...
          </div>
          <div style="font-size: 13px; font-weight: 700; color: #ffffff; margin-bottom: 4px;">
            📍 ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}
          </div>
          <div style="font-size: 11px; color: #a7f3d0;">
            Accuracy: ±${loc.accuracy ? Math.round(loc.accuracy) : '?'}m<br/>
            Last Ping: <strong style="color: #6ee7b7">${formattedTime}</strong>
          </div>
        </div>
      `;

      if (markersRef.current[token]) {
        const marker = markersRef.current[token];
        marker.setLatLng(latLng);
        marker.setIcon(createCustomIcon(token, isSelected));
        marker.getPopup()?.setContent(popupContent);
      } else {
        const marker = L.marker(latLng, {
          icon: createCustomIcon(token, isSelected),
        }).addTo(map);

        marker.bindPopup(popupContent);
        markersRef.current[token] = marker;
      }
    });

    // Handle camera auto-following
    if (bounds.length > 0) {
      if (!hasFitInitialBounds.current || autoFollow) {
        if (selectedToken && locations[selectedToken]) {
          const selLoc = locations[selectedToken];
          map.setView([selLoc.lat, selLoc.lng], 16, { animate: true });
        } else if (bounds.length === 1) {
          map.setView(bounds[0], 15, { animate: true });
        } else {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        }
        hasFitInitialBounds.current = true;
      }
    }
  }, [locations, selectedToken, autoFollow]);

  return (
    <div className="relative w-full h-[450px] lg:h-[550px] rounded-3xl overflow-hidden border border-emerald-500/20 shadow-[0_20px_50px_rgba(0,0,0,0.6)] bg-[#030a07]">
      <div ref={mapContainerRef} className="w-full h-full z-10" />

      {/* Auto-Follow Camera Dewdrop Control */}
      {Object.keys(locations).length > 0 && (
        <div className="absolute top-4 right-4 z-20">
          <button
            onClick={() => setAutoFollow((prev) => !prev)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold backdrop-blur-xl border transition-all duration-300 flex items-center space-x-2 shadow-lg ${
              autoFollow
                ? 'bg-emerald-950/80 border-emerald-400/50 text-emerald-200 shadow-emerald-500/20'
                : 'bg-[#061811]/90 border-slate-700/80 text-emerald-400/70 hover:text-emerald-200'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoFollow ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]' : 'bg-slate-500'}`} />
            <span>{autoFollow ? 'Bio Camera: Auto-Tracking' : 'Bio Camera: Manual View'}</span>
          </button>
        </div>
      )}

      {Object.keys(locations).length === 0 && (
        <div className="absolute inset-0 z-20 bg-[#030a07]/80 backdrop-blur-md flex flex-col items-center justify-center text-emerald-200/80 p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75 0 7.312 9.75 10.75 9.75 10.75s9.75-3.438 9.75-10.75c0-5.385-4.365-9.75-9.75-9.75z" />
            </svg>
          </div>
          <p className="text-lg font-extrabold text-white tracking-tight">No Active Bio-Telemetry Streams</p>
          <p className="text-xs text-emerald-300/60 mt-1 max-w-sm leading-relaxed">
            Generate and share a consensual tracking session token. Once authorized by the participant, live GPS coordinates will render on this bio-matrix map.
          </p>
        </div>
      )}
    </div>
  );
}
