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
import QRCodeModal from '@/components/QRCodeModal';

const LiveMap = dynamic(() => import('@/components/LiveMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[450px] lg:h-[550px] rounded-2xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center text-slate-400">
      <svg className="animate-spin h-8 w-8 text-indigo-500 mb-3" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      <span className="text-sm font-medium">Initializing OpenStreetMap & Telemetry Engine...</span>
    </div>
  ),
});

interface TrackingLink {
  id: string;
  owner_id: string;
  token: string;
  label?: string | null;
  emergency_contact?: string | null;
  created_at: string;
  expires_at: string;
  active: boolean;
  last_update_time?: string | null;
}

function DashboardContent({ user }: { user: User }) {
  const router = useRouter();
  const [links, setLinks] = useState<TrackingLink[]>([]);
  const [liveLocations, setLiveLocations] = useState<Record<string, LocationPoint>>({});
  const [locationHistory, setLocationHistory] = useState<Record<string, LocationPoint[]>>({});
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [selectedTokens, setSelectedTokens] = useState<string[]>([]);

  // Form Inputs
  const [newLabel, setNewLabel] = useState('');
  const [newEmergencyContact, setNewEmergencyContact] = useState('');
  const [newExpirationHours, setNewExpirationHours] = useState('24');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // QR Modal State
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [qrLabel, setQrLabel] = useState<string | null>(null);

  const [loadingLinks, setLoadingLinks] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [origin] = useState<string>(() => typeof window !== 'undefined' ? window.location.origin : '');
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch tracking links and latest known position + movement history for each
  const fetchLinksAndLocations = useCallback(async () => {
    await Promise.resolve();
    setLoadingLinks(true);
    setErrorMsg(null);

    try {
      const { data: linkData, error: linkError } = await supabase
        .from('tracking_links')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      if (linkError) {
        setErrorMsg(linkError.message);
        return;
      }

      if (!linkData || linkData.length === 0) {
        setLinks([]);
        setLiveLocations({});
        setLocationHistory({});
        return;
      }

      const tokens = linkData.map((l) => l.token);

      // Fetch latest location update row per token
      let updateData: LocationPoint[] | null = null;
      const { data: viewData, error: viewError } = await supabase
        .from('latest_location_updates')
        .select('token, lat, lng, accuracy, speed, heading, battery_level, is_sos, ts, created_at')
        .in('token', tokens);

      if (!viewError && viewData) {
        updateData = viewData as LocationPoint[];
      } else {
        const { data: rawData, error: rawError } = await supabase
          .from('location_updates')
          .select('token, lat, lng, accuracy, speed, heading, battery_level, is_sos, ts, created_at')
          .in('token', tokens)
          .order('created_at', { ascending: false });

        if (rawError) {
          const { data: fallbackRaw } = await supabase
            .from('location_updates')
            .select('token, lat, lng, accuracy, ts, created_at')
            .in('token', tokens)
            .order('created_at', { ascending: false });
          updateData = (fallbackRaw || []) as LocationPoint[];
        } else {
          updateData = (rawData || []) as LocationPoint[];
        }
      }

      // Fetch raw location update history (last 50 points per token) for breadcrumb polylines
      let historyData: LocationPoint[] | null = null;
      const { data: fullHistory, error: historyError } = await supabase
        .from('location_updates')
        .select('token, lat, lng, accuracy, speed, heading, battery_level, is_sos, ts, created_at')
        .in('token', tokens)
        .order('created_at', { ascending: true })
        .limit(200);

      if (historyError) {
        const { data: fallbackHist } = await supabase
          .from('location_updates')
          .select('token, lat, lng, accuracy, ts, created_at')
          .in('token', tokens)
          .order('created_at', { ascending: true })
          .limit(200);
        historyData = (fallbackHist || []) as LocationPoint[];
      } else {
        historyData = (fullHistory || []) as LocationPoint[];
      }

      const historyMap: Record<string, LocationPoint[]> = {};
      if (historyData) {
        (historyData as LocationPoint[]).forEach((point) => {
          if (!historyMap[point.token]) historyMap[point.token] = [];
          historyMap[point.token].push(point);
        });
      }

      const latestLocationMap: Record<string, LocationPoint> = {};
      const latestTimeMap: Record<string, string> = {};

      if (updateData) {
        updateData.forEach((upd) => {
          if (!latestLocationMap[upd.token]) {
            const matchingLink = linkData.find((l) => l.token === upd.token);
            latestLocationMap[upd.token] = {
              ...upd,
              label: matchingLink?.label || null,
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
      setLocationHistory(historyMap);
    } catch (err: unknown) {
      console.error('Error fetching dashboard links:', err);
      setErrorMsg((err as Error)?.message || 'Unexpected error loading tracking data.');
    } finally {
      setLoadingLinks(false);
    }
  }, [user.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
            const matchingLink = links.find((l) => l.token === newUpdate.token);
            const enrichedUpdate = { ...newUpdate, label: matchingLink?.label || null };

            setLiveLocations((prev) => ({
              ...prev,
              [newUpdate.token]: enrichedUpdate,
            }));

            setLocationHistory((prev) => ({
              ...prev,
              [newUpdate.token]: [...(prev[newUpdate.token] || []), enrichedUpdate],
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
  }, [tokenList, links]);

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setErrorMsg(null);

    const tokenBytes = new Uint8Array(12);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const expHours = Number(newExpirationHours) || 24;
    const expiresAt = new Date(Date.now() + expHours * 60 * 60 * 1000).toISOString();

    let { error } = await supabase.from('tracking_links').insert([
      {
        owner_id: user.id,
        token: token,
        label: newLabel.trim() || null,
        emergency_contact: newEmergencyContact.trim() || null,
        expires_at: expiresAt,
        active: true,
      },
    ]);

    if (error && error.message?.includes('schema cache')) {
      const fallback = await supabase.from('tracking_links').insert([
        {
          owner_id: user.id,
          token: token,
          expires_at: expiresAt,
          active: true,
        },
      ]);
      error = fallback.error;
    }

    if (error) {
      setErrorMsg(error.message);
    } else {
      setNewLabel('');
      setNewEmergencyContact('');
      setShowCreateForm(false);
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

  const handleOpenQrModal = (token: string, label?: string | null) => {
    const fullUrl = `${origin}/track?token=${token}`;
    setQrUrl(fullUrl);
    setQrLabel(label || `Token: ${token.substring(0, 8)}`);
    setQrModalOpen(true);
  };

  const handleExportGpx = async (token: string, label?: string | null) => {
    const points = locationHistory[token] || [];
    if (points.length === 0) {
      alert('No recorded movement points available to export for this tracking link.');
      return;
    }

    const title = label || `Track-${token.substring(0, 8)}`;

    const gpxPoints = points
      .map(
        (p) => `      <trkpt lat="${p.lat}" lon="${p.lng}">
        <time>${p.created_at}</time>
        ${p.speed !== undefined && p.speed !== null ? `<speed>${p.speed}</speed>` : ''}
      </trkpt>`
      )
      .join('\n');

    const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Geo Live Tracker" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${title}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${title}</name>
    <trkseg>
${gpxPoints}
    </trkseg>
  </trk>
</gpx>`;

    const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '_')}_route.gpx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = async (token: string, label?: string | null) => {
    const points = locationHistory[token] || [];
    if (points.length === 0) {
      alert('No recorded movement points available to export for this tracking link.');
      return;
    }

    const title = label || `Track-${token.substring(0, 8)}`;
    const headers = ['Timestamp', 'Latitude', 'Longitude', 'Accuracy_m', 'Speed_m_s', 'Battery_Pct', 'SOS_Active'];
    const rows = points.map((p) => [
      p.created_at,
      p.lat,
      p.lng,
      p.accuracy ?? '',
      p.speed ?? '',
      p.battery_level !== undefined && p.battery_level !== null ? Math.round(p.battery_level * 100) : '',
      p.is_sos ? 'YES' : 'NO',
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '_')}_telemetry.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSelectToken = (token: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedTokens((prev) =>
      prev.includes(token) ? prev.filter((t) => t !== token) : [...prev, token]
    );
  };

  const handleDeleteSelected = async () => {
    let tokensToDelete = [...selectedTokens];
    if (tokensToDelete.length === 0 && selectedToken) {
      tokensToDelete = [selectedToken];
    }

    if (tokensToDelete.length === 0) {
      alert('Please select or check one or more tracking links to delete.');
      return;
    }

    const confirmMsg = `Are you sure you want to delete ${tokensToDelete.length} tracking link(s)? This action cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;

    setDeleting(true);
    setErrorMsg(null);

    const { data, error } = await supabase
      .from('tracking_links')
      .delete()
      .eq('owner_id', user.id)
      .in('token', tokensToDelete)
      .select();

    if (error) {
      setErrorMsg(error.message);
    } else if (!data || data.length === 0) {
      setErrorMsg('Deletion blocked by Supabase Row Level Security (RLS). Please check your RLS policies in Supabase SQL Editor.');
    } else {
      setSelectedTokens([]);
      setSelectedToken(null);
      await fetchLinksAndLocations();
    }

    setDeleting(false);
  };

  const handleDeleteSingle = async (token: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this tracking link?')) return;

    setDeleting(true);
    setErrorMsg(null);

    const { data, error } = await supabase
      .from('tracking_links')
      .delete()
      .eq('owner_id', user.id)
      .eq('token', token)
      .select();

    if (error) {
      setErrorMsg(error.message);
    } else if (!data || data.length === 0) {
      setErrorMsg('Deletion blocked by Supabase Row Level Security (RLS). Please check your RLS policies in Supabase SQL Editor.');
    } else {
      setSelectedTokens((prev) => prev.filter((t) => t !== token));
      if (selectedToken === token) setSelectedToken(null);
      await fetchLinksAndLocations();
    }

    setDeleting(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const isExpired = (expiresAt: string, currentTs: number) => {
    if (!currentTs) return false;
    return new Date(expiresAt).getTime() < currentTs;
  };

  const formatRelativeTime = (dateStr: string | null | undefined, currentTs: number) => {
    if (!dateStr) return 'No location received';
    if (!currentTs) return 'Just now';
    const diffSeconds = Math.floor((currentTs - new Date(dateStr).getTime()) / 1000);
    if (diffSeconds < 10) return 'Just now';
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    return `${Math.floor(diffSeconds / 3600)}h ago`;
  };

  // Find if any active streams currently have an SOS signal triggered
  const activeSosPoint = Object.values(liveLocations).find((l) => l.is_sos);
  const activeSosLink = activeSosPoint ? links.find((l) => l.token === activeSosPoint.token) : null;
  const activeStreamsCount = Object.keys(liveLocations).length;

  return (
    <div className="min-h-screen bg-transparent text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* QR Code Modal Component */}
      <QRCodeModal
        isOpen={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        url={qrUrl}
        label={qrLabel}
      />

      {/* Top Header Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link href="/" className="flex items-center space-x-3 group">
              <BicycleLogo />
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                Geo Live Tracker Console
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
        {/* EMERGENCY SOS TOP BEACON BANNER */}
        {activeSosPoint && (
          <div className="p-5 rounded-2xl bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 text-white shadow-2xl border border-rose-400 flex flex-col sm:flex-row items-center justify-between gap-4 animate-pulse">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl shrink-0">
                🚨
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-black text-sm uppercase tracking-wider bg-black/40 px-2 py-0.5 rounded">
                    EMERGENCY SOS ALERT
                  </span>
                  <span className="text-xs font-bold opacity-90">
                    Token: {activeSosPoint.token.substring(0, 8)}
                  </span>
                </div>
                <h3 className="text-lg font-extrabold mt-1">
                  Participant &quot;{activeSosLink?.label || activeSosPoint.token.substring(0, 8)}&quot; triggered Emergency SOS!
                </h3>
                <p className="text-xs text-rose-100 font-mono mt-0.5">
                  Location: {activeSosPoint.lat.toFixed(5)}, {activeSosPoint.lng.toFixed(5)} &bull; Signal: {new Date(activeSosPoint.created_at).toLocaleTimeString()}
                </p>
              </div>
            </div>

            {activeSosLink?.emergency_contact && (
              <a
                href={`tel:${activeSosLink.emergency_contact}`}
                className="px-5 py-3 rounded-xl bg-white text-rose-700 hover:bg-slate-100 font-black text-xs uppercase tracking-wider shadow-lg shrink-0 flex items-center space-x-2"
              >
                <span>📞 Call Emergency Contact ({activeSosLink.emergency_contact})</span>
              </a>
            )}
          </div>
        )}

        {/* Banner Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 shadow-xl">
          <div>
            <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
              <span>Real-Time Telemetry Engine Active</span>
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Live Location Monitoring</h1>
            <p className="text-sm text-slate-400 mt-1">
              Real-time GPS coordinates stream onto the map console as participants authorize location sharing.
            </p>
          </div>

          <button
            onClick={() => setShowCreateForm((prev) => !prev)}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-semibold text-sm shadow-lg shadow-indigo-500/25 transition-all hover:scale-[1.02] flex items-center justify-center space-x-2 shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>{showCreateForm ? 'Cancel Link Creation' : 'Create New Tracking Link'}</span>
          </button>
        </div>

        {/* LINK CREATION FORM MODAL/DRAWER */}
        {showCreateForm && (
          <form
            onSubmit={handleCreateLink}
            className="p-6 rounded-2xl bg-slate-900 border border-indigo-500/30 shadow-2xl space-y-4 animate-fadeIn"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <span>Configure New Tracking Link</span>
              </h3>
              <span className="text-xs text-indigo-400 font-medium">Temporary Consent Link</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Participant / Label (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rider #1042, Alice Run"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Emergency Phone Contact (Optional)
                </label>
                <input
                  type="tel"
                  placeholder="e.g. +1234567890"
                  value={newEmergencyContact}
                  onChange={(e) => setNewEmergencyContact(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Session Duration
                </label>
                <select
                  value={newExpirationHours}
                  onChange={(e) => setNewExpirationHours(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="1">1 Hour</option>
                  <option value="6">6 Hours</option>
                  <option value="24">24 Hours (Default)</option>
                  <option value="168">7 Days</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={creating}
                className="px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50 flex items-center space-x-2"
              >
                {creating ? <span>Generating Link...</span> : <span>Generate Link</span>}
              </button>
            </div>
          </form>
        )}

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
          {/* Real-time Map Section */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center space-x-2">
                <span>Interactive Live Map</span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                  {activeStreamsCount} Active {activeStreamsCount === 1 ? 'Marker' : 'Markers'}
                </span>
              </h2>
              <span className="text-xs text-slate-400 font-medium">Breadcrumb Movement Engine</span>
            </div>

            <LiveMap
              locations={liveLocations}
              history={locationHistory}
              selectedToken={selectedToken}
            />
          </div>

          {/* Tracking Links Management List */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center space-x-2">
                <span>Active Tracking Links</span>
                <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
                  {links.length}
                </span>
              </h2>

              <div className="flex items-center space-x-3">
                <button
                  onClick={fetchLinksAndLocations}
                  className="text-xs text-slate-400 hover:text-slate-200 flex items-center space-x-1 font-medium transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Refresh</span>
                </button>

                <button
                  onClick={handleDeleteSelected}
                  disabled={deleting}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center space-x-1 font-semibold transition-colors disabled:opacity-50"
                  title="Delete selected tracking links"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>
                    {selectedTokens.length > 0 ? `Delete (${selectedTokens.length})` : 'Delete'}
                  </span>
                </button>
              </div>
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
                  Click &quot;Create New Tracking Link&quot; to generate a participant URL.
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[550px] overflow-y-auto pr-1 custom-scrollbar">
                {links.map((link) => {
                  const expired = isExpired(link.expires_at, now);
                  const fullUrl = `${origin}/track?token=${link.token}`;
                  const isChecked = selectedTokens.includes(link.token);
                  const isSelected = selectedToken === link.token || isChecked;
                  const loc = liveLocations[link.token];
                  const speedKmh = loc?.speed !== undefined && loc?.speed !== null ? (loc.speed * 3.6).toFixed(1) : null;
                  const batteryPct = loc?.battery_level !== undefined && loc?.battery_level !== null ? Math.round(loc.battery_level * 100) : null;

                  return (
                    <div
                      key={link.id}
                      onClick={() => setSelectedToken(link.token)}
                      className={`p-4 rounded-2xl bg-slate-900/80 border cursor-pointer transition-all space-y-3 shadow-lg ${
                        loc?.is_sos
                          ? 'border-rose-500 ring-2 ring-rose-500/40 bg-rose-950/20'
                          : isSelected
                          ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-slate-900'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* Top Row: Checkbox, Label & Status */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleSelectToken(link.token);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-950 accent-indigo-600 h-4 w-4 cursor-pointer"
                          />
                          <span className="font-bold text-xs px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                            {link.label ? link.label : `Token: ${link.token.substring(0, 8)}`}
                          </span>
                          {loc?.is_sos && (
                            <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-black animate-pulse">
                              🚨 SOS
                            </span>
                          )}
                        </div>

                        {expired ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] font-semibold shrink-0">
                            <span>Expired</span>
                          </span>
                        ) : link.active ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-semibold shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            <span>Active</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-semibold shrink-0">
                            <span>Paused</span>
                          </span>
                        )}
                      </div>

                      {/* URL Box & Copy + QR */}
                      <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                        <span className="text-[11px] font-mono text-slate-300 truncate flex-1">
                          {fullUrl}
                        </span>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyLink(link.token);
                          }}
                          className="px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold transition-all shrink-0"
                        >
                          {copiedToken === link.token ? 'Copied!' : 'Copy'}
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenQrModal(link.token, link.label);
                          }}
                          className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold transition-all shrink-0 flex items-center space-x-1"
                          title="Show QR Code"
                        >
                          <span>📱 QR</span>
                        </button>
                      </div>

                      {/* Telemetry info (Speed, Battery, Last Signal) */}
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 pt-1">
                        <div>
                          Signal: <strong className="text-slate-200">{formatRelativeTime(link.last_update_time, now)}</strong>
                        </div>
                        <div className="text-right">
                          {speedKmh !== null && <span>🚀 <strong>{speedKmh} km/h</strong> &bull; </span>}
                          {batteryPct !== null && <span>🔋 <strong>{batteryPct}%</strong></span>}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                        <div className="flex items-center space-x-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleActive(link.id, link.active);
                            }}
                            className="text-[11px] text-slate-400 hover:text-slate-200 underline font-medium"
                          >
                            {link.active ? 'Deactivate' : 'Activate'}
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExportGpx(link.token, link.label);
                            }}
                            className="text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold"
                            title="Export route track as GPX file"
                          >
                            Export GPX
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExportCsv(link.token, link.label);
                            }}
                            className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold"
                            title="Export route history as CSV file"
                          >
                            Export CSV
                          </button>

                          <button
                            onClick={(e) => handleDeleteSingle(link.token, e)}
                            className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold transition-colors"
                          >
                            Delete
                          </button>
                        </div>

                        <Link
                          href={`/track?token=${link.token}`}
                          target="_blank"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center space-x-1"
                        >
                          <span>Open Track</span>
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

      {/* Footer & Ethics Note */}
      <footer className="border-t border-slate-800 bg-slate-950 py-4 px-4 text-center text-xs text-slate-500 space-y-1">
        <p>Geo Live Tracker &bull; Privacy-First Real-Time Location Platform</p>
        <p className="text-[11px] text-slate-600">
          End-to-End Encrypted Sessions &bull; Emergency SOS Support &bull; Automated Telemetry Expiration
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
