'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import BicycleLogo from '@/components/BicycleLogo';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
    } else {
      if (data.session) {
        router.push('/dashboard');
        router.refresh();
      } else {
        setSuccessMsg('Account created successfully! You can now log in with your credentials.');
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#030a07] text-emerald-50 flex flex-col justify-center items-center px-4 font-sans selection:bg-emerald-500 selection:text-white">
      <div className="w-full max-w-md my-auto py-10">
        {/* Header Branding */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center space-x-3 group">
            <BicycleLogo containerSize="w-12 h-12" size="w-6 h-6" />
            <div className="text-left">
              <span className="font-extrabold text-2xl tracking-tight bg-gradient-to-r from-white via-emerald-100 to-teal-300 bg-clip-text text-transparent block">
                Geo Live Tracker
              </span>
              <span className="text-[10px] font-semibold text-emerald-400/70 tracking-widest uppercase block -mt-1">
                Bio-Mesh Registration
              </span>
            </div>
          </Link>
          <h2 className="mt-6 text-2xl font-bold tracking-tight text-white">Create Owner Account</h2>
          <p className="mt-1.5 text-xs text-emerald-200/60">Register to generate tracking tokens and monitor live participants</p>
        </div>

        {/* Dewdrop Glass Form Card */}
        <div className="dew-glass-card border border-emerald-500/25 rounded-3xl p-7 sm:p-9 shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
          {errorMsg && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-start space-x-3">
              <svg className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs flex items-start space-x-3">
              <svg className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <p className="font-bold">{successMsg}</p>
                <Link href="/login" className="underline mt-2 inline-block font-bold hover:text-white">
                  Proceed to Login →
                </Link>
              </div>
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-5">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-emerald-300/80 mb-2">
                Console Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@college.edu"
                className="w-full px-4.5 py-3.5 rounded-2xl bg-[#020b07] border border-emerald-500/25 text-emerald-50 placeholder-emerald-400/30 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all text-sm font-medium"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-emerald-300/80 mb-2">
                Secret Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4.5 py-3.5 rounded-2xl bg-[#020b07] border border-emerald-500/25 text-emerald-50 placeholder-emerald-400/30 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all text-sm font-medium"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-emerald-300/80 mb-2">
                Confirm Secret Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4.5 py-3.5 rounded-2xl bg-[#020b07] border border-emerald-500/25 text-emerald-50 placeholder-emerald-400/30 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all text-sm font-medium"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 hover:from-emerald-400 hover:to-cyan-300 text-[#030a07] font-extrabold text-sm shadow-[0_0_25px_rgba(16,185,129,0.35)] transition-all hover:shadow-[0_0_35px_rgba(52,211,153,0.5)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-[#030a07]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Registering Account...</span>
                </>
              ) : (
                <span>Register Owner Account</span>
              )}
            </button>
          </form>

          <div className="mt-7 text-center text-xs text-emerald-200/60">
            Already have an account?{' '}
            <Link href="/login" className="font-extrabold text-emerald-400 hover:text-emerald-300 transition-colors underline">
              Sign In Instead
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
