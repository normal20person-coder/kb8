import Link from 'next/link';
import BicycleLogo from '@/components/BicycleLogo';

export default function Home() {
  return (
    <div className="min-h-screen bg-[#030a07] text-emerald-50 flex flex-col justify-between selection:bg-emerald-500 selection:text-white">
      {/* Navigation Header */}
      <header className="border-b border-emerald-500/15 bg-[#061811]/60 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3.5">
            <BicycleLogo containerSize="w-10 h-10" size="w-5 h-5" />
            <div className="flex flex-col">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-emerald-100 to-teal-300 bg-clip-text text-transparent">
                Geo Live Tracker
              </span>
              <span className="text-[10px] font-semibold text-emerald-400/70 tracking-widest uppercase -mt-0.5">
                Bio-Mesh Telemetry
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <Link
              href="/login"
              className="text-sm font-semibold text-emerald-200/80 hover:text-white transition-colors px-4 py-2 rounded-xl hover:bg-emerald-950/40 border border-transparent hover:border-emerald-500/20"
            >
              Console Sign In
            </Link>
            <Link
              href="/signup"
              className="text-sm font-bold bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-cyan-400 text-[#030a07] px-5 py-2.5 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all hover:shadow-[0_0_30px_rgba(52,211,153,0.5)] hover:scale-[1.02]"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-6xl mx-auto px-6 py-20 flex-1 flex flex-col items-center justify-center text-center relative z-10">
        {/* Floating Dewdrop Network Badge */}
        <div className="inline-flex items-center space-x-2.5 px-4 py-2 rounded-full border border-emerald-500/30 bg-[#072418]/80 backdrop-blur-md text-emerald-300 text-xs font-bold tracking-wider uppercase mb-10 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
          <span>Consensual Bio-Mesh Telemetry Protocol</span>
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-4xl leading-[1.12]">
          Consensual & Privacy-First <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent drop-shadow-[0_0_35px_rgba(16,185,129,0.3)]">
            Real-Time Location Mesh
          </span>
        </h1>

        <p className="mt-8 text-base sm:text-lg text-emerald-200/70 max-w-2xl leading-relaxed font-normal">
          Generate encrypted, time-bounded tracking sessions. Participants stream GPS coordinates in real-time only after explicit browser authorization, with zero persistent history.
        </p>

        {/* Hero Action Buttons */}
        <div className="mt-12 flex flex-col sm:flex-row items-center gap-5 w-full sm:w-auto">
          <Link
            href="/dashboard"
            className="w-full sm:w-auto px-9 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-cyan-400 text-[#030a07] font-extrabold text-base shadow-[0_0_30px_rgba(16,185,129,0.4)] transition-all hover:scale-[1.03] active:scale-[0.98] flex items-center justify-center space-x-2.5"
          >
            <span>Open Management Console</span>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>

          <Link
            href="/signup"
            className="w-full sm:w-auto px-9 py-4 rounded-2xl bg-[#072016]/80 hover:bg-[#0c2b1e] text-emerald-200 border border-emerald-500/30 font-bold transition-all hover:border-emerald-400/60 hover:scale-[1.03]"
          >
            Create Owner Account
          </Link>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-7 mt-24 text-left w-full">
          <div className="dew-glass-card p-8 rounded-3xl border border-emerald-500/20 transition-all duration-300">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 mb-6 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2.5">1. Ephemeral Session Tokens</h3>
            <p className="text-sm text-emerald-200/65 leading-relaxed">
              Generate 24-hour encrypted tracking session links that automatically expire and can be paused at any instant.
            </p>
          </div>

          <div className="dew-glass-card p-8 rounded-3xl border border-emerald-500/20 transition-all duration-300">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/25 flex items-center justify-center text-teal-300 mb-6 shadow-[0_0_15px_rgba(20,184,166,0.2)]">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2.5">2. Explicit Bio-Consent</h3>
            <p className="text-sm text-emerald-200/65 leading-relaxed">
              Participants are presented with clear privacy terms. Location streaming is active only while the browser tab stays open.
            </p>
          </div>

          <div className="dew-glass-card p-8 rounded-3xl border border-emerald-500/20 transition-all duration-300">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-300 mb-6 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75 0 7.312 9.75 10.75 9.75 10.75s9.75-3.438 9.75-10.75c0-5.385-4.365-9.75-9.75-9.75z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2.5">3. Bio-Matrix Telemetry</h3>
            <p className="text-sm text-emerald-200/65 leading-relaxed">
              Live coordinates stream onto a dark matrix map console with zero delay and automatic camera follow mode.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-emerald-500/15 bg-[#04120c]/80 py-8 text-center text-xs text-emerald-300/50">
        Geo Live Tracker &bull; Bio-Mesh Telemetry Platform &bull; Consensual Ephemeral Sessions
      </footer>
    </div>
  );
}
