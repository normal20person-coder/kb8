'use client';

import { useState } from 'react';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  label?: string | null;
}

export default function QRCodeModal({ isOpen, onClose, url, label }: QRCodeModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // QuickChart QR API for ultra-crisp vector rendering with no npm dependencies
  const qrImageUrl = `https://quickchart.io/qr?text=${encodeURIComponent(url)}&size=280&margin=1&ecLevel=H`;

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 text-center">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800/60 hover:bg-slate-800 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div>
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>📱 Mobile Link Sharing</span>
          </div>
          <h3 className="text-xl font-bold text-white tracking-tight">
            {label ? label : 'Scan to Track Location'}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Scan this QR code with any smartphone camera to open live location streaming.
          </p>
        </div>

        {/* QR Code Container */}
        <div className="p-4 bg-white rounded-2xl shadow-inner flex items-center justify-center border border-slate-200 inline-block mx-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrImageUrl}
            alt="Tracking Link QR Code"
            width={240}
            height={240}
            className="rounded-lg object-contain"
          />
        </div>

        {/* Action Controls */}
        <div className="space-y-2">
          <button
            onClick={handleCopy}
            className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center space-x-2"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Link Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                <span>Copy Tracking URL</span>
              </>
            )}
          </button>

          <button
            onClick={onClose}
            className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
}
