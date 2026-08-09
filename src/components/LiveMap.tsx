'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface LocationPoint {
  token: string;
  participant_name?: string | null;
  label?: string | null;
  blood_group?: string | null;
  emergency_contact?: string | null;
  address?: string | null;
  lat: number;
  lng: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  battery_level?: number | null;
  is_sos?: boolean;
  ts?: number;
  created_at: string;
}

interface LiveMapProps {
  locations: Record<string, LocationPoint>;
  history?: Record<string, LocationPoint[]>;
  selectedToken?: string | null;
}

export default function LiveMap({ locations, history = {}, selectedToken }: LiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const polylinesRef = useRef<Record<string, L.Polyline>>({});

  const [autoFollow, setAutoFollow] = useState(true);
  const [showTrails, setShowTrails] = useState(true);
  const hasFitInitialBounds = useRef(false);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default center (World/India center fallback)
    const map = L.map(mapContainerRef.current, {
      center: [20.5937, 78.9629],
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
  const createCustomIcon = (token: string, isSelected: boolean, isSos?: boolean) => {
    if (isSos) {
      return L.divIcon({
        className: 'custom-location-pin-sos',
        html: `
          <div class="relative flex items-center justify-center">
            <span class="animate-ping absolute inline-flex h-12 w-12 bg-rose-500 rounded-full opacity-90"></span>
            <div class="relative inline-flex rounded-full h-9 w-9 bg-rose-600 ring-4 ring-rose-300 text-white font-extrabold text-[11px] shadow-2xl items-center justify-center animate-bounce">
              SOS
            </div>
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        popupAnchor: [0, -22],
      });
    }

    return L.divIcon({
      className: 'custom-location-pin',
      html: `
        <div class="relative flex items-center justify-center">
          <span class="animate-ping absolute inline-flex ${isSelected ? 'h-10 w-10 bg-cyan-400' : 'h-8 w-8 bg-indigo-400'} rounded-full opacity-75"></span>
          <div class="relative inline-flex rounded-full ${isSelected ? 'h-8 w-8 bg-cyan-500 ring-4 ring-cyan-300/40' : 'h-7 w-7 bg-indigo-600 ring-2 ring-white'} shadow-xl items-center justify-center">
            <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle cx="5.5" cy="17.5" r="3" stroke-width="2" />
              <circle cx="18.5" cy="17.5" r="3" stroke-width="2" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 6h3m-3 0l-3 6.5M5.5 17.5l3.5-7.5h5l3.5 7.5M9 10l-2-4H4" />
            </svg>
          </div>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -18],
    });
  };

  // Update markers and movement polylines when locations/history change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const currentTokens = Object.keys(locations);

    // Remove old markers & lines for tokens no longer present
    Object.keys(markersRef.current).forEach((token) => {
      if (!locations[token]) {
        map.removeLayer(markersRef.current[token]);
        delete markersRef.current[token];
      }
    });

    Object.keys(polylinesRef.current).forEach((token) => {
      if (!locations[token] || !showTrails) {
        map.removeLayer(polylinesRef.current[token]);
        delete polylinesRef.current[token];
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
      const speedKmh = loc.speed !== undefined && loc.speed !== null ? (loc.speed * 3.6).toFixed(1) : null;
      const battery = loc.battery_level !== undefined && loc.battery_level !== null ? Math.round(loc.battery_level * 100) : null;
      const displayLabel = loc.label || loc.participant_name || `Token: ${token.substring(0, 8)}`;

      // Render Polyline trail if history exists
      const tokenHistory = history[token] || [];
      if (showTrails && tokenHistory.length > 1) {
        const polyCoords: [number, number][] = tokenHistory.map((h) => [h.lat, h.lng]);

        if (polylinesRef.current[token]) {
          polylinesRef.current[token].setLatLngs(polyCoords);
        } else {
          const polyline = L.polyline(polyCoords, {
            color: loc.is_sos ? '#f43f5e' : isSelected ? '#06b6d4' : '#6366f1',
            weight: 4,
            opacity: 0.8,
            dashArray: '8, 8',
          }).addTo(map);
          polylinesRef.current[token] = polyline;
        }
      }

      const bloodGroupBadge = loc.blood_group
        ? `<span style="background-color: #ffe4e6; color: #e11d48; border: 1px solid #f43f5e; font-size: 10px; font-weight: 800; padding: 1px 5px; border-radius: 4px; margin-left: 4px;">🩸 ${loc.blood_group}</span>`
        : '';

      const callButtonHtml = loc.emergency_contact
        ? `<div style="margin-top: 6px;">
            <a href="tel:${loc.emergency_contact}" style="background-color: #e11d48; color: #ffffff; text-decoration: none; font-size: 11px; font-weight: 800; padding: 4px 8px; border-radius: 6px; display: inline-block;">📞 Call (${loc.emergency_contact})</a>
           </div>`
        : '';

      const sosBadgeHtml = loc.is_sos
        ? `<div style="background-color: #ffe4e6; border: 1px solid #f43f5e; color: #e11d48; font-size: 11px; font-weight: 800; padding: 2px 6px; border-radius: 6px; display: inline-block; margin-bottom: 4px;">
            🚨 EMERGENCY SOS ACTIVE
           </div>`
        : '';

      const popupContent = `
        <div style="font-family: system-ui, sans-serif; padding: 4px; color: #0f172a; min-width: 180px;">
          ${sosBadgeHtml}
          <div style="font-size: 13px; font-weight: 800; color: #4338ca; margin-bottom: 2px;">
            👤 ${displayLabel} ${bloodGroupBadge}
          </div>
          ${loc.address ? `<div style="font-size: 11px; color: #64748b; margin-bottom: 4px;">🏠 ${loc.address}</div>` : ''}
          <div style="font-size: 13px; font-weight: 700; margin-bottom: 4px; color: #0f172a;">
            📍 ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}
          </div>
          <div style="font-size: 11px; color: #475569; line-height: 1.4;">
            ${speedKmh !== null ? `🚀 Speed: <strong>${speedKmh} km/h</strong><br/>` : ''}
            ${battery !== null ? `🔋 Battery: <strong>${battery}%</strong><br/>` : ''}
            🎯 Accuracy: ±${loc.accuracy ? Math.round(loc.accuracy) : '?'}m<br/>
            🕒 Last signal: <strong>${formattedTime}</strong>
          </div>
          ${callButtonHtml}
        </div>
      `;

      if (markersRef.current[token]) {
        const marker = markersRef.current[token];
        marker.setLatLng(latLng);
        marker.setIcon(createCustomIcon(token, isSelected, loc.is_sos));
        marker.getPopup()?.setContent(popupContent);
      } else {
        const marker = L.marker(latLng, {
          icon: createCustomIcon(token, isSelected, loc.is_sos),
        }).addTo(map);

        marker.bindPopup(popupContent);
        markersRef.current[token] = marker;
      }
    });

    // Camera Auto-Following
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
  }, [locations, history, selectedToken, autoFollow, showTrails]);

  return (
    <div className="relative w-full h-[450px] lg:h-[550px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-900">
      <div ref={mapContainerRef} className="w-full h-full z-10" />

      {/* Map Control Bar Overlay */}
      {Object.keys(locations).length > 0 && (
        <div className="absolute top-4 right-4 z-20 flex items-center space-x-2">
          <button
            onClick={() => setShowTrails((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold shadow-lg backdrop-blur-md transition-all flex items-center space-x-1.5 ${
              showTrails
                ? 'bg-indigo-600/90 border-indigo-400 text-white'
                : 'bg-slate-900/90 border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            <span>📈 Trails: {showTrails ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={() => setAutoFollow((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold shadow-lg backdrop-blur-md transition-all flex items-center space-x-2 ${
              autoFollow
                ? 'bg-indigo-600/90 border-indigo-400 text-white shadow-indigo-500/20'
                : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoFollow ? 'bg-cyan-300 animate-pulse' : 'bg-slate-500'}`} />
            <span>{autoFollow ? 'Auto-Follow: ON' : 'Auto-Follow: OFF'}</span>
          </button>
        </div>
      )}

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


