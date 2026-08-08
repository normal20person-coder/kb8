'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabaseClient';
import AuthGuard from '@/components/AuthGuard';
import { User } from '@supabase/supabase-js';
import { LocationPoint } from '@/components/LiveMap';
import BicycleLogo from '@/components/BicycleLogo';

const LiveMap = dynamic(() => import('@/components/LiveMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[450px] lg:h-[550px] rounded-3xl bg-[#030a07] border border-emerald-500/20 flex flex-col items-center justify-center text-emerald-300/70">
      <svg className="animate-spin h-9 w-9 text-emerald-400 mb-3 drop-shadow-[0_0_12px_rgba(52,211,153,0.8)]" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      <span className="text-xs font-bold tracking-wider uppercase text-emerald-400">Initializing Bio-Matrix & Map Engine...</span>
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

    // Fetch latest location update row per token (using view with fallback)
    let updateData: LocationPoint[] | null = null;
    const { data: viewData, error: viewError } = await supabase
      .from('latest_location_updates')
      .select('token, lat, lng, accuracy, ts, created_at')
      .in('token', tokens);

    if (!viewError && viewData) {
      updateData = viewData as LocationPoint[];
    } else {
      const { data: rawData } = await supabase
        .from('location_updates')
        .select('token, lat, lng, accuracy, ts, created_at')
        .in('token', tokens)
        .order('created_at', { ascending: false });
      updateData = rawData as LocationPoint[];
    }

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
          filter: `token=in.(${tokenList.join(',')})`,
        },
        (payload) => {
          const newUpdate = payload.new as LocationPoint;
          if (tokenList.includes(newUpdate.token)) {
            setLiveLocations((prev) => ({
              ...prev,
              [newUpdate.token]: newUpdate,
            }));

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
    if (!dateStr) return 'No signal received';
    const diffSeconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diffSeconds < 10) return 'Just now';
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    return `${Math.floor(diffSeconds / 3600)}h ago`;
  };

  const activeStreamsCount = Object.keys(liveLocations).length;

  return (
    <div className="min-h-screen bg-[#030a07] text-emerald-50 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Top Navigation Header */}
      <header className="border-b border-emerald-500/15 bg-[#061811]/60 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3.5">
            <Link href="/" className="flex items-center space-x-3.5 group">
              <BicycleLogo containerSize="w-10 h-10" size="w-5 h-5" />
              <div className="flex flex-col">
                <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-emerald-100 to-teal-300 bg-clip-text text-transparent">
                  Geo Live Tracker Console
                </span>
                <span className="text-[10px] font-semibold text-emerald-400/70 tracking-widest uppercase -mt-0.5">
                  Bio-Mesh Telemetry
                </span>
              </div>
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center space-x-2.5 px-3.5 py-1.5 rounded-full bg-[#072418] border border-emerald-500/30 text-xs font-semibold text-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
              <span>{user.email}</span>
            </div>

            <button
              onClick={handleSignOut}
              className="px-4 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-bold transition-all hover:border-rose-500/50"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-8">
        {/* Bio Banner Bar */}
        <div className="dew-glass-card border border-emerald-500/25 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold uppercase tracking-wider mb-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
              <span>Bio-Telemetry Engine Active</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Live Location Mesh Console</h1>
            <p className="text-xs sm:text-sm text-emerald-200/65 mt-1.5 max-w-2xl leading-relaxed">
              Real-time GPS coordinate pings stream onto the dark matrix map console as participants authorize location sharing.
            </p>
          </div>

          <button
            onClick={handleCreateLink}
            disabled={creating}
            className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 hover:from-emerald-400 hover:to-cyan-300 text-[#030a07] font-extrabold text-sm shadow-[0_0_25px_rgba(16,185,129,0.35)] transition-all hover:shadow-[0_0_35px_rgba(52,211,153,0.5)] hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 shrink-0"
          >
            {creating ? (
              <>
                <svg className="animate-spin h-4 w-4 text-[#030a07]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Generating Token...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Generate Tracking Token</span>
              </>
            )}
          </button>
        </div>

        {errorMsg && (
          <div className="p-4.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-center space-x-3">
            <svg className="w-5 h-5 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Desktop Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Real-Time Live Map Column */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center space-x-2.5">
                <span>Bio-Matrix Map View</span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                  {activeStreamsCount} Active {activeStreamsCount === 1 ? 'Node' : 'Nodes'}
                </span>
              </h2>
              <span className="text-xs text-emerald-400/60 font-semibold uppercase tracking-wider">CartoDB Dark Matrix</span>
            </div>

            <LiveMap locations={liveLocations} selectedToken={selectedToken} />
          </div>

          {/* Tracking Links Management Panel */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center space-x-2.5">
                <span>Active Session Tokens</span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                  {links.length}
                </span>
              </h2>
              <button
                onClick={fetchLinksAndLocations}
                className="text-xs text-emerald-300/70 hover:text-emerald-200 flex items-center space-x-1 font-semibold transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Sync Tokens</span>
              </button>
            </div>

            {loadingLinks ? (
              <div className="p-12 text-center dew-glass-card rounded-3xl border border-emerald-500/20 text-emerald-300/70">
                <svg className="animate-spin h-7 w-7 text-emerald-400 mx-auto mb-3 drop-shadow-[0_0_10px_rgba(52,211,153,0.8)]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-xs font-bold tracking-wider uppercase">Loading Session Tokens...</span>
              </div>
            ) : links.length === 0 ? (
              <div className="p-10 text-center dew-glass-card rounded-3xl border border-emerald-500/20 text-emerald-300/70 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 flex items-center justify-center mx-auto shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-white">No Tracking Links Created</h3>
                <p className="text-xs text-emerald-300/60 max-w-xs mx-auto">
                  Click "Generate Tracking Token" above to generate a participant session URL.
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
                      className={`p-5 rounded-2xl cursor-pointer transition-all duration-300 space-y-3.5 dew-glass-card ${
                        isSelected
                          ? 'border-emerald-400 ring-2 ring-emerald-400/20 shadow-[0_0_25px_rgba(16,185,129,0.2)]'
                          : 'border-emerald-500/20 hover:border-emerald-500/40'
                      }`}
                    >
                      {/* Top Row: Token Badge & Status */}
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold px-3 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                          Token: {link.token}
                        </span>

                        {expired ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] font-semibold">
                            <span>Expired</span>
                          </span>
                        ) : link.active ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]" />
                            <span>Active</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-semibold">
                            <span>Paused</span>
                          </span>
                        )}
                      </div>

                      {/* URL Box & Copy Trigger */}
                      <div className="flex items-center space-x-2 bg-[#020b07] px-3.5 py-2 rounded-xl border border-emerald-500/20">
                        <span className="text-[11px] font-mono text-emerald-200/80 truncate flex-1">
                          {fullUrl}
                        </span>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyLink(link.token);
                          }}
                          className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#030a07] text-[11px] font-bold transition-all shrink-0 flex items-center space-x-1 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                        >
                          {copiedToken === link.token ? (
                            <span>Copied!</span>
                          ) : (
                            <span>Copy Link</span>
                          )}
                        </button>
                      </div>

                      {/* Telemetry Signal Info */}
                      <div className="flex items-center justify-between text-[11px] text-emerald-300/70">
                        <span>
                          Last Signal: <strong className="text-emerald-100">{formatRelativeTime(link.last_update_time)}</strong>
                        </span>
                        {loc && (
                          <span className="text-emerald-400 font-mono font-bold">
                            📍 {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                          </span>
                        )}
                      </div>

                      {/* Card Action Controls */}
                      <div className="flex items-center justify-between pt-2 border-t border-emerald-500/15">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleActive(link.id, link.active);
                          }}
                          className="text-[11px] text-emerald-400/80 hover:text-emerald-200 underline font-semibold"
                        >
                          {link.active ? 'Pause Session' : 'Activate Session'}
                        </button>

                        <Link
                          href={`/track?token=${link.token}`}
                          target="_blank"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] text-cyan-300 hover:text-cyan-200 font-bold flex items-center space-x-1"
                        >
                          <span>Open Track Console</span>
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

      {/* Footer */}
      <footer className="border-t border-emerald-500/15 bg-[#04120c]/80 py-5 px-4 text-center text-xs text-emerald-300/50 space-y-1">
        <p>Geo Live Tracker &bull; Bio-Mesh Consensual Location Platform</p>
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
