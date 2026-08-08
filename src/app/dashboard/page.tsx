'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabaseClient';
import AuthGuard from '@/components/AuthGuard';
import { User } from '@supabase/supabase-js';
import { LocationPoint } from '@/components/LiveMap';

const LiveMap = dynamic(() => import('@/components/LiveMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[450px] lg:h-[550px] rounded-2xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center text-slate-400">
      <svg className="animate-spin h-8 w-8 text-indigo-500 mb-3" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      <span className="text-sm font-medium">Initializing OpenStreetMap & Leaflet...</span>
    </div>
  ),
});

interface TrackingLink {
  id: string;
  owner_id: string;
  token: string;
  created_at: string;
  expires_at: string;
  active: boolean;
  last_update_time?: string | null;
}

function DashboardContent({ user }: { user: User }) {
  const router = useRouter();
  const [links, setLinks] = useState<TrackingLink[]>([]);
  const [liveLocations, setLiveLocations] = useState<Record<string, LocationPoint>>({});
  const [selectedToken, setSelectedToken] = useState<string | null>(null);

  const [loadingLinks, setLoadingLinks] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  // Fetch tracking links and latest known position for each
  const fetchLinksAndLocations = useCallback(async () => {
    setLoadingLinks(true);
    setErrorMsg(null);

    const { data: linkData, error: linkError } = await supabase
      .from('tracking_links')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });

    if (linkError) {
      setErrorMsg(linkError.message);
      setLoadingLinks(false);
      return;
    }

    if (!linkData || linkData.length === 0) {
      setLinks([]);
      setLiveLocations({});
      setLoadingLinks(false);
      return;
    }

    const tokens = linkData.map((l) => l.token);

    // Fetch latest location update row per token
    const { data: updateData } = await supabase
      .from('location_updates')
      .select('token, lat, lng, accuracy, ts, created_at')
      .in('token', tokens)
      .order('created_at', { ascending: false });

    const latestLocationMap: Record<string, LocationPoint> = {};
    const latestTimeMap: Record<string, string> = {};

    if (updateData) {
      updateData.forEach((upd) => {
        if (!latestLocationMap[upd.token]) {
          latestLocationMap[upd.token] = {
            token: upd.token,
            lat: upd.lat,
            lng: upd.lng,
            accuracy: upd.accuracy,
            ts: upd.ts,
            created_at: upd.created_at,
          };
          latestTimeMap[upd.token] = upd.created_at;
        }
      });
    }

    const formattedLinks: TrackingLink[] = linkData.map((link) => ({
      ...link,
      last_update_time: latestTimeMap[link.token] || null,
    }));

    setLinks(formattedLinks);
    setLiveLocations(latestLocationMap);
    setLoadingLinks(false);
  }, [user.id]);

  useEffect(() => {
    fetchLinksAndLocations();
  }, [fetchLinksAndLocations]);

  // Array of tokens for Realtime subscription
  const tokenList = useMemo(() => links.map((l) => l.token), [links]);

  // Supabase Realtime Subscription for incoming live location updates
  useEffect(() => {
    if (tokenList.length === 0) return;

    const channel = supabase
      .channel('dashboard_location_updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'location_updates',
        },
        (payload) => {
          const newUpdate = payload.new as LocationPoint;
          if (tokenList.includes(newUpdate.token)) {
            // Update live locations on map immediately
            setLiveLocations((prev) => ({
              ...prev,
              [newUpdate.token]: newUpdate,
            }));

            // Update relative signal time in link list
            setLinks((prevLinks) =>
              prevLinks.map((l) =>
                l.token === newUpdate.token
                  ? { ...l, last_update_time: newUpdate.created_at }
                  : l
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tokenList]);

  const handleCreateLink = async () => {
    setCreating(true);
    setErrorMsg(null);

    const tokenBytes = new Uint8Array(12);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, '0')).join('');

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from('tracking_links').insert([
      {
        owner_id: user.id,
        token: token,
        expires_at: expiresAt,
        active: true,
      },
    ]);

    if (error) {
      setErrorMsg(error.message);
    } else {
      await fetchLinksAndLocations();
    }

    setCreating(false);
  };

  const handleToggleActive = async (linkId: string, currentActive: boolean) => {
    const { error } = await supabase
      .from('tracking_links')
      .update({ active: !currentActive })
      .eq('id', linkId);

    if (error) {
      setErrorMsg(error.message);
    } else {
      fetchLinksAndLocations();
    }
  };

  const handleCopyLink = (token: string) => {
    const fullUrl = `${origin}/track?token=${token}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt).getTime() < Date.now();
  };

  const formatRelativeTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'No location received';
    const diffSeconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diffSeconds < 10) return 'Just now';
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    return `${Math.floor(diffSeconds / 3600)}h ago`;
  };

  const activeStreamsCount = Object.keys(liveLocations).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Header Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link href="/" className="flex items-center space-x-3 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                GeoConsent Live Dashboard
              </span>
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs font-medium text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>{user.email}</span>
            </div>

            <button
              onClick={handleSignOut}
              className="px-3.5 py-1.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-rose-500/20 hover:border-rose-500/40 hover:text-rose-300 text-xs font-semibold text-slate-300 transition-all"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-8">
        {/* Banner Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 shadow-xl">
          <div>
            <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
              <span>Supabase Realtime Engine Active</span>
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Real-Time Location Tracking</h1>
            <p className="text-sm text-slate-400 mt-1">
              Live updates stream onto the Leaflet map automatically when participants share location.
            </p>
          </div>

          <button
            onClick={handleCreateLink}
            disabled={creating}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-semibold text-sm shadow-lg shadow-indigo-500/25 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 shrink-0"
          >
            {creating ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Generating...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Create New Tracking Link</span>
              </>
            )}
          </button>
        </div>

        {errorMsg && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center space-x-3">
            <svg className="w-5 h-5 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Desktop Split View: Map (Left/Top) & Links List (Right/Bottom) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Real-time Leaflet Map Section */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center space-x-2">
                <span>Interactive Live Map</span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                  {activeStreamsCount} Active {activeStreamsCount === 1 ? 'Marker' : 'Markers'}
                </span>
              </h2>
              <span className="text-xs text-slate-400">OpenStreetMap + Leaflet</span>
            </div>

            <LiveMap locations={liveLocations} selectedToken={selectedToken} />
          </div>

          {/* Tracking Links Management List */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center space-x-2">
                <span>Tracking Links</span>
                <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
                  {links.length}
                </span>
              </h2>
              <button
                onClick={fetchLinksAndLocations}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center space-x-1 font-medium transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Refresh</span>
              </button>
            </div>

            {loadingLinks ? (
              <div className="p-12 text-center bg-slate-900/40 rounded-2xl border border-slate-800 text-slate-400">
                <svg className="animate-spin h-6 w-6 text-indigo-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-sm font-medium">Loading tracking links...</span>
              </div>
            ) : links.length === 0 ? (
              <div className="p-10 text-center bg-slate-900/40 rounded-2xl border border-slate-800 text-slate-400">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-white">No tracking links created</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  Click "Create New Tracking Link" to generate a participant URL.
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[550px] overflow-y-auto pr-1 custom-scrollbar">
                {links.map((link) => {
                  const expired = isExpired(link.expires_at);
                  const fullUrl = `${origin}/track?token=${link.token}`;
                  const isSelected = selectedToken === link.token;
                  const loc = liveLocations[link.token];

                  return (
                    <div
                      key={link.id}
                      onClick={() => setSelectedToken(link.token)}
                      className={`p-4 rounded-2xl bg-slate-900/80 border cursor-pointer transition-all space-y-3 shadow-lg ${
                        isSelected
                          ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-slate-900'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* Top Row: Token & Status */}
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                          {link.token}
                        </span>

                        {expired ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] font-semibold">
                            <span>Expired</span>
                          </span>
                        ) : link.active ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            <span>Active</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-semibold">
                            <span>Paused</span>
                          </span>
                        )}
                      </div>

                      {/* URL Box & Copy */}
                      <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                        <span className="text-[11px] font-mono text-slate-300 truncate flex-1">
                          {fullUrl}
                        </span>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyLink(link.token);
                          }}
                          className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold transition-all shrink-0 flex items-center space-x-1"
                        >
                          {copiedToken === link.token ? (
                            <span>Copied!</span>
                          ) : (
                            <span>Copy</span>
                          )}
                        </button>
                      </div>

                      {/* Signal Telemetry status */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>
                          Signal: <strong className="text-slate-200">{formatRelativeTime(link.last_update_time)}</strong>
                        </span>
                        {loc && (
                          <span className="text-indigo-400 font-mono">
                            📍 {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                          </span>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleActive(link.id, link.active);
                          }}
                          className="text-[11px] text-slate-400 hover:text-slate-200 underline font-medium"
                        >
                          {link.active ? 'Deactivate Link' : 'Activate Link'}
                        </button>

                        <Link
                          href={`/track?token=${link.token}`}
                          target="_blank"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center space-x-1"
                        >
                          <span>Open Track Page</span>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer & Demo Ethics Note */}
      <footer className="border-t border-slate-800 bg-slate-950 py-4 px-4 text-center text-xs text-slate-500 space-y-1">
        <p>GeoConsent Live &bull; Consensual Real-time GPS Tracker College Project</p>
        <p className="text-[11px] text-slate-600">
          Educational Demo Only &bull; Location data auto-expires after 24 hours &bull; Built with Next.js, Supabase Realtime & Leaflet
        </p>
      </footer>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      {(user) => <DashboardContent user={user} />}
    </AuthGuard>
  );
}
