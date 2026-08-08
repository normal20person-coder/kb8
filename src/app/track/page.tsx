'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

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
  const [statusText, setStatusText] = useState('Ready to start location sharing.');
  const [statusType, setStatusType] = useState<'idle' | 'active' | 'error' | 'stopped'>('idle');

  const [location, setLocation] = useState<LocationState>({
    lat: null,
    lng: null,
    accuracy: null,
    lastUpdated: null,
    updateCount: 0,
  });

  const watchIdRef = useRef<number | null>(null);

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
        setErrorMessage('Invalid tracking link or link does not exist.');
        setLoading(false);
        return;
      }

      if (!link.active) {
        setErrorMessage('This tracking link has been deactivated by the owner.');
        setLoading(false);
        return;
      }

      const isExpired = new Date(link.expires_at).getTime() < Date.now();
      if (isExpired) {
        setErrorMessage('This tracking link has expired (24-hour limit).');
        setLoading(false);
        return;
      }

      setTokenValid(true);
      setLoading(false);
    }

    validateToken();
  }, [token]);

  // Clean up watch on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const sendLocationUpdate = async (coords: GeolocationCoordinates, timestamp: number) => {
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
        setStatusText(`Server error: ${data.error || 'Failed to sync position'}`);
        setStatusType('error');
      } else {
        setLocation((prev) => ({
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
          lastUpdated: new Date().toLocaleTimeString(),
          updateCount: prev.updateCount + 1,
        }));
        setStatusText('Location sharing is ACTIVE. Keep this page open.');
        setStatusType('active');
      }
    } catch (err) {
      console.error('Error sending location:', err);
      setStatusText('Network connection issue. Retrying...');
      setStatusType('error');
    }
  };

  const startSharing = () => {
    if (!navigator.geolocation) {
      setStatusText('Geolocation is not supported by your browser.');
      setStatusType('error');
      return;
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
            // Fall back to standard accuracy (Wi-Fi / IP location) if high accuracy times out
            console.warn('High accuracy GPS timed out. Falling back to standard Wi-Fi/Network location...');
            setStatusText('GPS signal low. Switching to Wi-Fi/Network location...');
            requestLocationStream(false);
            return;
          }

          setIsSharing(false);
          setStatusType('error');

          switch (error.code) {
            case error.PERMISSION_DENIED:
              setStatusText('Location permission was denied. Please allow location access in your browser settings.');
              break;
            case error.POSITION_UNAVAILABLE:
              setStatusText('Location unavailable. Ensure location/GPS services are turned on in your device settings.');
              break;
            case error.TIMEOUT:
              setStatusText('Location request timed out. Please check your GPS/Wi-Fi connection and try again.');
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
    setIsSharing(false);
    setStatusText('Location sharing has been stopped.');
    setStatusType('stopped');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-6 text-slate-300">
        <svg className="animate-spin h-8 w-8 text-indigo-500 mb-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-sm font-medium">Validating tracking link...</p>
      </div>
    );
  }

  if (errorMessage || !tokenValid) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-6 font-sans">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Link Unavailable</h2>
            <p className="text-sm text-slate-400 mt-2">{errorMessage}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 text-xs text-slate-500 text-left">
            💡 <strong>Why am I seeing this?</strong><br />
            Tracking links are temporary demo links created for a college project. Links auto-expire after 24 hours or can be deactivated by the owner.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-4 sm:p-6 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Mobile Header */}
      <header className="w-full max-w-md py-4 flex items-center justify-center space-x-2 border-b border-slate-800/80">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center shadow-md">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <span className="font-bold text-base tracking-tight text-white">GeoConsent Participant</span>
      </header>

      {/* Main Consent & Stream Card */}
      <main className="w-full max-w-md my-auto py-6 space-y-6">
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl space-y-6">
          {/* Title */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold uppercase tracking-wider">
              <span>College Project Demo</span>
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              Share Your Live Location
            </h1>
          </div>

          {/* Ethics & Consent Notice */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3 text-left">
            <div className="flex items-center space-x-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>Explicit Consent Notice</span>
            </div>
            <ul className="text-xs text-slate-300 space-y-2 leading-relaxed list-disc list-inside">
              <li>Your GPS position will be sent in real-time to the project owner's live dashboard.</li>
              <li>Tracking occurs <strong>only while this web page remains open</strong>.</li>
              <li>You can stop sharing anytime by clicking <strong>"Stop Sharing"</strong> or closing this tab.</li>
              <li>Data is temporary and auto-deleted after 24 hours.</li>
            </ul>
          </div>

          {/* Controls */}
          <div className="space-y-3">
            {!isSharing ? (
              <button
                onClick={startSharing}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold text-base shadow-xl shadow-indigo-500/25 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center space-x-3"
              >
                <div className="w-3 h-3 rounded-full bg-white animate-ping"></div>
                <span>Start Sharing My Location</span>
              </button>
            ) : (
              <button
                onClick={stopSharing}
                className="w-full py-4 px-6 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-base shadow-xl shadow-rose-600/25 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
                <span>Stop Sharing</span>
              </button>
            )}
          </div>

          {/* Status Display */}
          <div
            className={`p-4 rounded-2xl border text-sm font-medium transition-all text-center ${
              statusType === 'active'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : statusType === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : statusType === 'stopped'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-slate-950 border-slate-800 text-slate-400'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              {statusType === 'active' && (
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
              )}
              <span>{statusText}</span>
            </div>
          </div>

          {/* Live Coordinates Telemetry */}
          {location.lat !== null && location.lng !== null && (
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/90 text-left space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                <span>Telemetry Status</span>
                <span className="text-indigo-400">{location.updateCount} updates sent</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">LATITUDE</span>
                  <span className="text-slate-200">{location.lat.toFixed(6)}</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">LONGITUDE</span>
                  <span className="text-slate-200">{location.lng.toFixed(6)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                <span>Accuracy: ±{location.accuracy ? Math.round(location.accuracy) : '?'} meters</span>
                <span>Last sync: {location.lastUpdated}</span>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-md py-4 text-center text-xs text-slate-500 border-t border-slate-800/80">
        GeoConsent Live &bull; Educational College Project
      </footer>
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
          Loading track page...
        </div>
      }
    >
      <TrackContent />
    </Suspense>
  );
}
