"use client";
import { useState } from "react";

type Props = {
  address: string;
  chain:   string;
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

export function DepositAddressCard({ address, chain }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — nothing to fall back to.
    }
  };

  return (
    <div className="w-full bg-cowry-card border border-cowry-green/30 rounded-[22px] px-4 py-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-cowry-muted">Deposit address</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-cowry-green bg-cowry-green/10 border border-cowry-green/30 rounded-full px-2 py-0.5">
          {chain}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="flex-1 min-w-0 text-sm font-mono text-white break-all leading-snug">
          {address}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy deposit address"
          className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full border border-cowry-green/30 text-cowry-green hover:bg-cowry-green/10 transition-colors"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
  );
}
