'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabaseClient';
import BicycleLogo from '@/components/BicycleLogo';
import { LocationPoint } from '@/components/LiveMap';

const LiveMap = dynamic(() => import('@/components/LiveMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-48 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-xs text-slate-500">
      Loading participant mini-map...
    </div>
  ),
});

interface LocationState {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  speed: number | null;
  battery: number | null;
  lastUpdated: string | null;
  updateCount: number;
  isSos: boolean;
}

function TrackContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emergencyContact, setEmergencyContact] = useState<string | null>(null);
  const [participantName, setParticipantName] = useState<string | null>(null);
  const [bloodGroup, setBloodGroup] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);

  const [isSharing, setIsSharing] = useState(false);
  const [sosActive, setSosActive] = useState(false);
  const [statusText, setStatusText] = useState('Ready to start location sharing.');
  const [statusType, setStatusType] = useState<'idle' | 'active' | 'error' | 'stopped' | 'sos'>('idle');

  const [location, setLocation] = useState<LocationState>({
    lat: null,
    lng: null,
    accuracy: null,
    speed: null,
    battery: null,
    lastUpdated: null,
    updateCount: 0,
    isSos: false,
  });

  const watchIdRef = useRef<number | null>(null);
  const lastSentTimeRef = useRef<number>(0);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const currentCoordsRef = useRef<GeolocationCoordinates | null>(null);

  // Validate token on mount and fetch emergency & medical profile info
  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setErrorMessage('No tracking token provided in URL.');
        setLoading(false);
        return;
      }

      let link: {
        token: string;
        active: boolean;
        expires_at: string;
        label?: string | null;
        blood_group?: string | null;
        emergency_contact?: string | null;
        address?: string | null;
      } | null = null;

      const { data: fullLink, error: initialError } = await supabase
        .from('tracking_links')
        .select('token, active, expires_at, label, blood_group, emergency_contact, address')
        .eq('token', token)
        .single();

      if (initialError) {
        // Fallback query if columns are not in PostgREST schema cache yet
        const { data: fallbackLink, error: fallbackError } = await supabase
          .from('tracking_links')
          .select('token, active, expires_at')
          .eq('token', token)
          .single();

        if (fallbackError || !fallbackLink) {
          setErrorMessage('Invalid tracking link or session does not exist.');
          setLoading(false);
          return;
        }
        link = fallbackLink;
      } else {
        link = fullLink;
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

      if (link.emergency_contact) setEmergencyContact(link.emergency_contact);
      if (link.label) setParticipantName(link.label);
      if (link.blood_group) setBloodGroup(link.blood_group);
      if (link.address) setAddress(link.address);

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

  const sendLocationUpdate = async (coords: GeolocationCoordinates, timestamp: number, isSosTrigger = false) => {
    currentCoordsRef.current = coords;

    // Adaptive Throttling: 3 seconds when moving (speed > 0.5 m/s), 15 seconds when static, 0 for immediate SOS
    const speed = coords.speed !== null && !isNaN(coords.speed) ? coords.speed : 0;
    const minInterval = isSosTrigger ? 0 : speed > 0.5 ? 3000 : 15000;
    const now = Date.now();

    if (!isSosTrigger && now - lastSentTimeRef.current < minInterval) {
      return;
    }
    lastSentTimeRef.current = now;

    // Get battery level if supported
    let batteryLevel: number | null = null;
    try {
      if ('getBattery' in navigator) {
        const battery = await (navigator as unknown as { getBattery: () => Promise<{ level: number }> }).getBattery();
        batteryLevel = battery.level;
      }
    } catch {
      // Battery API not supported or blocked
    }

    try {
      const res = await fetch('/api/update-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
          speed: coords.speed,
          heading: coords.heading,
          battery_level: batteryLevel,
          is_sos: isSosTrigger || sosActive,
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
          speed: coords.speed,
          battery: batteryLevel,
          lastUpdated: new Date().toLocaleTimeString(),
          updateCount: prev.updateCount + 1,
          isSos: isSosTrigger || sosActive,
        }));

        if (isSosTrigger || sosActive) {
          setStatusText('🚨 EMERGENCY SOS ACTIVE! High-priority telemetry broadcasting.');
          setStatusType('sos');
        } else {
          setStatusText('Location sharing is ACTIVE. Keep this page open.');
          setStatusType('active');
        }
      }
    } catch (err) {
      console.error('Error sending location:', err);
      setStatusText('Network connection issue. Retrying...');
      setStatusType('error');
    }
  };

  const handleTriggerSos = async () => {
    setSosActive(true);

    // 1. Broadcast immediate SOS update to server
    if (currentCoordsRef.current) {
      await sendLocationUpdate(currentCoordsRef.current, Date.now(), true);
    }

    // 2. Launch phone call dialer
    const contactToCall = emergencyContact || '911';
    const confirmCall = window.confirm(
      `🚨 EMERGENCY SOS ACTIVATED!\n\nName: ${participantName || 'User'}\nBlood Group: ${bloodGroup || 'Not specified'}\nEmergency Contact: ${contactToCall}\n\nDo you want to dial Emergency Contact (${contactToCall}) now?`
    );

    if (confirmCall) {
      window.location.href = `tel:${contactToCall}`;
    }
  };

  const handleSendSmsAlert = () => {
    if (!location.lat || !location.lng) {
      alert('Location not acquired yet. Please wait a moment.');
      return;
    }
    const mapsUrl = `https://maps.google.com/?q=${location.lat},${location.lng}`;
    const message = `🚨 EMERGENCY SOS ALERT!\nName: ${participantName || 'User'}\nBlood Group: ${bloodGroup || 'N/A'}\nLive GPS Location: ${mapsUrl}${address ? `\nHome Address: ${address}` : ''}`;
    const smsUrl = `sms:${emergencyContact || ''}?body=${encodeURIComponent(message)}`;
    window.location.href = smsUrl;
  };

  const startSharing = async () => {
    if (!navigator.geolocation) {
      setStatusText('Geolocation is not supported by your browser.');
      setStatusType('error');
      return;
    }

    if ('wakeLock' in navigator) {
      try {
        const nav = navigator as Navigator & { wakeLock: { request: (type: string) => Promise<{ release: () => Promise<void> }> } };
        wakeLockRef.current = await nav.wakeLock.request('screen');
      } catch (err) {
        console.warn('Wake Lock request failed:', err);
      }
    }

    setStatusText('Requesting high-precision GPS permission...');
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
              setStatusText('Location request timed out. Please check your network connection and try again.');
              break;
            default:
              setStatusText('An unknown location error occurred.');
              break;
          }
        },
        {
          enableHighAccuracy: useHighAccuracy,
          timeout: useHighAccuracy ? 10000 : 20000,
          maximumAge: 0,
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
    setSosActive(false);
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
        <p className="text-sm font-medium">Validating tracking session...</p>
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
            <h2 className="text-xl font-bold text-white">Session Unavailable</h2>
            <p className="text-sm text-slate-400 mt-2">{errorMessage}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 text-xs text-slate-500 text-left">
            💡 <strong>Session Security Note:</strong><br />
            Tracking links are temporary, time-bounded session links that automatically expire or can be paused by the session creator.
          </div>
        </div>
      </div>
    );
  }

  const speedKmh = location.speed !== null && !isNaN(location.speed) ? (location.speed * 3.6).toFixed(1) : '0.0';
  const batteryPct = location.battery !== null ? Math.round(location.battery * 100) : null;

  const currentMapLocation: Record<string, LocationPoint> =
    location.lat !== null && location.lng !== null && token
      ? {
          [token]: {
            token,
            lat: location.lat,
            lng: location.lng,
            accuracy: location.accuracy,
            speed: location.speed,
            battery_level: location.battery,
            is_sos: sosActive,
            created_at: new Date().toISOString(),
          },
        }
      : {};

  return (
    <div className="min-h-screen bg-transparent text-slate-100 flex flex-col items-center justify-between p-4 sm:p-6 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Mobile Header */}
      <header className="w-full max-w-md py-4 flex items-center justify-between border-b border-slate-800/80">
        <div className="flex items-center space-x-2">
          <BicycleLogo containerSize="w-8 h-8" size="w-4 h-4" />
          <span className="font-bold text-base tracking-tight text-white">Geo Live Tracker</span>
        </div>
        {emergencyContact && (
          <a
            href={`tel:${emergencyContact}`}
            className="px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center space-x-1.5 hover:bg-rose-500/20"
          >
            <span>📞 Call ({emergencyContact})</span>
          </a>
        )}
      </header>

      {/* Main Consent & Stream Card */}
      <main className="w-full max-w-md my-auto py-6 space-y-6">
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl space-y-6">
          {/* Title */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold uppercase tracking-wider">
              <span>Encrypted Telemetry Session</span>
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              Share Your Live Location
            </h1>
          </div>

          {/* Participant Medical & Emergency Profile Badge */}
          {(participantName || bloodGroup || emergencyContact || address) && (
            <div className="p-4 rounded-2xl bg-slate-950/90 border border-indigo-500/30 text-left space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-indigo-400 uppercase tracking-wider">
                  👤 Emergency SOS Profile
                </span>
                {bloodGroup && (
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-extrabold">
                    🩸 Blood Group: {bloodGroup}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-300 space-y-1">
                {participantName && <p>Name: <strong className="text-white">{participantName}</strong></p>}
                {emergencyContact && <p>Emergency Contact: <a href={`tel:${emergencyContact}`} className="text-rose-400 font-bold underline">{emergencyContact}</a></p>}
                {address && <p className="text-slate-400">Home Address: {address}</p>}
              </div>
            </div>
          )}

          {/* EMERGENCY SOS BUTTON BAR */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-950/60 via-slate-900 to-rose-950/60 border border-rose-500/30 text-center space-y-3">
            <button
              onClick={handleTriggerSos}
              className={`w-full py-3.5 px-6 rounded-2xl font-extrabold text-sm uppercase tracking-wider shadow-2xl transition-all flex items-center justify-center space-x-2 ${
                sosActive
                  ? 'bg-rose-600 text-white animate-pulse ring-4 ring-rose-400/50'
                  : 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white shadow-rose-600/30 hover:scale-[1.02]'
              }`}
            >
              <svg className="w-5 h-5 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{sosActive ? '🚨 SOS EMERGENCY SIGNAL ACTIVE' : '🚨 EMERGENCY SOS - INSTANT DIAL & ALERT'}</span>
            </button>

            {sosActive && (
              <div className="flex items-center justify-center space-x-2 text-xs">
                <button
                  onClick={() => window.location.href = `tel:${emergencyContact || '911'}`}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold"
                >
                  📞 Call Contact
                </button>
                <button
                  onClick={handleSendSmsAlert}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold"
                >
                  💬 Send SMS Map Link
                </button>
              </div>
            )}
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
                className="w-full py-4 px-6 rounded-2xl bg-slate-800 hover:bg-rose-600/80 text-slate-200 hover:text-white font-bold text-base border border-slate-700 hover:border-rose-500/50 shadow-xl transition-all flex items-center justify-center space-x-2"
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
              statusType === 'sos'
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-200 animate-pulse'
                : statusType === 'active'
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

          {/* Participant Live Speedometer & Telemetry */}
          {location.lat !== null && location.lng !== null && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase font-bold block">Speed</span>
                  <span className="text-lg font-black text-cyan-400 font-mono">{speedKmh}</span>
                  <span className="text-[10px] text-slate-500 block">km/h</span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase font-bold block">Accuracy</span>
                  <span className="text-lg font-black text-emerald-400 font-mono">
                    ±{location.accuracy ? Math.round(location.accuracy) : '?'}
                  </span>
                  <span className="text-[10px] text-slate-500 block">meters</span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase font-bold block">Battery</span>
                  <span className="text-lg font-black text-indigo-400 font-mono">
                    {batteryPct !== null ? `${batteryPct}%` : 'N/A'}
                  </span>
                  <span className="text-[10px] text-slate-500 block">level</span>
                </div>
              </div>

              {/* Participant Mini-Map Preview */}
              <div className="rounded-2xl overflow-hidden border border-slate-800 shadow-xl">
                <LiveMap locations={currentMapLocation} selectedToken={token} />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-md py-4 text-center text-xs text-slate-500 border-t border-slate-800/80">
        Geo Live Tracker &bull; Secure Real-Time Session
      </footer>
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
          Loading tracking session...
        </div>
      }
    >
      <TrackContent />
    </Suspense>
  );
}
