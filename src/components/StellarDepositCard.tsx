"use client";
import { useState } from "react";
import { QrCode } from "./QrCode";

type Props = {
  address: string;
  memo:    string;
};

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="9" y="9" width="12" height="12" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — nothing to fall back to.
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 min-w-0 text-sm font-mono text-white break-all leading-snug">{value}</span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={`Copy ${label}`}
        className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full border border-cowry-green/30 text-cowry-green hover:bg-cowry-green/10 transition-colors"
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </div>
  );
}

export function StellarDepositCard({ address, memo }: Props) {
  return (
    <div className="w-full space-y-3">
      <div className="bg-cowry-card border border-cowry-green/30 rounded-[22px] px-4 py-3">
        <span className="text-xs text-cowry-muted mb-1.5 block">Stellar deposit address</span>
        <div className="mb-3">
          <QrCode value={address} />
        </div>
        <CopyRow label="address" value={address} />
      </div>

      <div className="bg-cowry-card border border-amber-500/40 rounded-[22px] px-4 py-3">
        <span className="text-xs text-amber-400 mb-1.5 block font-semibold">Memo (required)</span>
        <CopyRow label="memo" value={memo} />
      </div>

      <p className="text-xs text-amber-400/90 leading-relaxed px-1">
        ⚠️ You MUST include this memo. Deposits sent without it cannot be recovered or credited to your account.
      </p>
    </div>
  );
}
