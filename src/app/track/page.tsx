'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import BicycleLogo from '@/components/BicycleLogo';

interface LocationState {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  lastUpdated: string | null;
  updateCount: number;
}

function TrackContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isSharing, setIsSharing] = useState(false);
  const [statusText, setStatusText] = useState('Ready to authorize location sharing.');
  const [statusType, setStatusType] = useState<'idle' | 'active' | 'error' | 'stopped'>('idle');

  const [location, setLocation] = useState<LocationState>({
    lat: null,
    lng: null,
    accuracy: null,
    lastUpdated: null,
    updateCount: 0,
  });

  const watchIdRef = useRef<number | null>(null);
  const lastSentTimeRef = useRef<number>(0);
  const wakeLockRef = useRef<any>(null);

  // Validate token on mount
  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setErrorMessage('No tracking token provided in URL.');
        setLoading(false);
        return;
      }

      const { data: link, error } = await supabase
        .from('tracking_links')
        .select('token, active, expires_at')
        .eq('token', token)
        .single();

      if (error || !link) {
        setErrorMessage('Invalid tracking token or session does not exist.');
        setLoading(false);
        return;
      }

      if (!link.active) {
        setErrorMessage('This tracking session has been paused or deactivated.');
        setLoading(false);
        return;
      }

      const isExpired = new Date(link.expires_at).getTime() < Date.now();
      if (isExpired) {
        setErrorMessage('This tracking session link has expired.');
        setLoading(false);
        return;
      }

      setTokenValid(true);
      setLoading(false);
    }

    validateToken();
  }, [token]);

  // Clean up watch and wake lock on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
      }
    };
  }, []);

  const sendLocationUpdate = async (coords: GeolocationCoordinates, timestamp: number) => {
    // Throttle HTTP requests to at most once every 3 seconds
    const now = Date.now();
    if (now - lastSentTimeRef.current < 3000) {
      return;
    }
    lastSentTimeRef.current = now;

    try {
      const res = await fetch('/api/update-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
          ts: timestamp,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setStatusText(`Server response: ${data.error || 'Failed to sync position'}`);
        setStatusType('error');
      } else {
        setLocation((prev) => ({
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
          lastUpdated: new Date().toLocaleTimeString(),
          updateCount: prev.updateCount + 1,
        }));
        setStatusText('Bio-Telemetry sharing is ACTIVE. Keep this page open.');
        setStatusType('active');
      }
    } catch (err) {
      console.error('Error sending location:', err);
      setStatusText('Network connection issue. Retrying...');
      setStatusType('error');
    }
  };

  const startSharing = async () => {
    if (!navigator.geolocation) {
      setStatusText('Geolocation is not supported by your browser.');
      setStatusType('error');
      return;
    }

    // Try requesting Screen Wake Lock
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch (err) {
        console.warn('Wake Lock request failed:', err);
      }
    }

    setStatusText('Requesting location permission...');
    setStatusType('idle');
    setIsSharing(true);

    const requestLocationStream = (useHighAccuracy: boolean) => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }

      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          sendLocationUpdate(position.coords, position.timestamp);
        },
        (error) => {
          console.error('Geolocation error:', error);

          if (error.code === error.TIMEOUT && useHighAccuracy) {
            console.warn('High accuracy GPS timed out. Falling back to Wi-Fi/Network location...');
            setStatusText('GPS signal low. Switching to Wi-Fi/Network location...');
            requestLocationStream(false);
            return;
          }

          setIsSharing(false);
          setStatusType('error');

          switch (error.code) {
            case error.PERMISSION_DENIED:
              setStatusText('Location permission denied. Please enable location access in browser settings.');
              break;
            case error.POSITION_UNAVAILABLE:
              setStatusText('Location unavailable. Ensure location/GPS services are turned on.');
              break;
            case error.TIMEOUT:
              setStatusText('Location request timed out. Please check network connection.');
              break;
            default:
              setStatusText('An unknown location error occurred.');
              break;
          }
        },
        {
          enableHighAccuracy: useHighAccuracy,
          timeout: useHighAccuracy ? 15000 : 30000,
          maximumAge: 10000,
        }
      );

      watchIdRef.current = watchId;
    };

    requestLocationStream(true);
  };

  const stopSharing = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
    setIsSharing(false);
    setStatusText('Location sharing has been stopped.');
    setStatusType('stopped');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#030a07] flex flex-col justify-center items-center p-6 text-emerald-300 font-sans">
        <svg className="animate-spin h-9 w-9 text-emerald-400 mb-4 drop-shadow-[0_0_12px_rgba(52,211,153,0.8)]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-xs font-bold tracking-widest uppercase text-emerald-400">Validating Bio-Session Token...</p>
      </div>
    );
  }

  if (errorMessage || !tokenValid) {
    return (
      <div className="min-h-screen bg-[#030a07] text-emerald-50 flex flex-col justify-center items-center p-6 font-sans">
        <div className="w-full max-w-md dew-glass-card border border-emerald-500/25 rounded-3xl p-8 text-center shadow-[0_20px_50px_rgba(0,0,0,0.6)] space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto shadow-[0_0_15px_rgba(244,63,94,0.3)]">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Session Unavailable</h2>
            <p className="text-xs text-emerald-200/70 mt-2 leading-relaxed">{errorMessage}</p>
          </div>
          <div className="p-4 rounded-2xl bg-[#020b07] border border-emerald-500/20 text-xs text-emerald-300/60 text-left">
            💡 <strong>Privacy Session Notice:</strong><br />
            Tracking tokens are temporary, time-bounded session links that automatically expire after 24 hours or can be paused at any time by the session owner.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030a07] text-emerald-50 flex flex-col items-center justify-between p-4 sm:p-6 font-sans selection:bg-emerald-500 selection:text-white">
      {/* Top Header */}
      <header className="w-full max-w-md py-4 flex items-center justify-center space-x-3 border-b border-emerald-500/15">
        <BicycleLogo containerSize="w-8 h-8" size="w-4 h-4" />
        <span className="font-extrabold text-base tracking-tight text-white">Geo Live Tracker Console</span>
      </header>

      {/* Main Consent & Stream Card */}
      <main className="w-full max-w-md my-auto py-6 space-y-6">
        <div className="dew-glass-card border border-emerald-500/25 rounded-3xl p-6 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.6)] space-y-6">
          {/* Card Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold uppercase tracking-wider">
              <span>Encrypted Bio-Telemetry Session</span>
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              Share Live GPS Telemetry
            </h1>
          </div>

          {/* Privacy & Terms Box */}
          <div className="p-4.5 rounded-2xl bg-[#020b07] border border-emerald-500/20 space-y-3 text-left">
            <div className="flex items-center space-x-2 text-emerald-400 font-extrabold text-xs uppercase tracking-wider">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>Consensual Streaming Guarantee</span>
            </div>
            <ul className="text-xs text-emerald-200/70 space-y-2 leading-relaxed list-disc list-inside">
              <li>Your GPS position streams directly to the authorized console map.</li>
              <li>Location streaming occurs <strong>only while this page remains open</strong>.</li>
              <li>You can stop sharing at any instant by clicking <strong>"Stop Sharing"</strong>.</li>
              <li>Session data is temporary and automatically purged after 24 hours.</li>
            </ul>
          </div>

          {/* Stream Trigger Controls */}
          <div className="space-y-3">
            {!isSharing ? (
              <button
                onClick={startSharing}
                className="w-full py-4.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 hover:from-emerald-400 hover:to-cyan-300 text-[#030a07] font-extrabold text-base shadow-[0_0_30px_rgba(16,185,129,0.4)] transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center space-x-3"
              >
                <div className="w-3.5 h-3.5 rounded-full bg-[#030a07] animate-ping" />
                <span>Start Sharing Live Location</span>
              </button>
            ) : (
              <button
                onClick={stopSharing}
                className="w-full py-4.5 px-6 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-base shadow-[0_0_25px_rgba(225,29,72,0.4)] transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
                <span>Stop Location Stream</span>
              </button>
            )}
          </div>

          {/* Status Display Pill */}
          <div
            className={`p-4 rounded-2xl border text-xs font-semibold transition-all text-center ${
              statusType === 'active'
                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                : statusType === 'error'
                ? 'bg-rose-500/15 border-rose-500/35 text-rose-300'
                : statusType === 'stopped'
                ? 'bg-amber-500/15 border-amber-500/35 text-amber-300'
                : 'bg-[#020b07] border-emerald-500/20 text-emerald-300/70'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              {statusType === 'active' && (
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399] shrink-0" />
              )}
              <span>{statusText}</span>
            </div>
          </div>

          {/* Coordinates Telemetry Grid */}
          {location.lat !== null && location.lng !== null && (
            <div className="p-4.5 rounded-2xl bg-[#020b07] border border-emerald-500/20 text-left space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-300/80">
                <span>Live Coordinates</span>
                <span className="text-emerald-400 font-mono">{location.updateCount} pings synced</span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
                <div className="p-2.5 rounded-xl bg-[#051810] border border-emerald-500/20">
                  <span className="text-emerald-400/60 block text-[9px] font-sans font-bold uppercase">LATITUDE</span>
                  <span className="text-emerald-100 font-bold">{location.lat.toFixed(6)}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#051810] border border-emerald-500/20">
                  <span className="text-emerald-400/60 block text-[9px] font-sans font-bold uppercase">LONGITUDE</span>
                  <span className="text-emerald-100 font-bold">{location.lng.toFixed(6)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-emerald-300/60 pt-1">
                <span>Accuracy: ±{location.accuracy ? Math.round(location.accuracy) : '?'} meters</span>
                <span>Last sync: {location.lastUpdated}</span>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-md py-4 text-center text-xs text-emerald-300/40 border-t border-emerald-500/15">
        Geo Live Tracker &bull; Bio-Mesh Telemetry Session
      </footer>
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#030a07] flex items-center justify-center text-emerald-300/70 font-sans text-xs uppercase tracking-widest font-bold">
          Loading Bio-Session...
        </div>
      }
    >
      <TrackContent />
    </Suspense>
  );
}
