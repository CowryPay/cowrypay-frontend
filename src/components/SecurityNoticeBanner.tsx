"use client";
import { useEffect, useState } from "react";

// Bump this id if a future notice needs to show again even for someone who
// dismissed this one — dismissal is tracked per-notice, not globally, so an
// old dismissal never silently suppresses an unrelated future announcement.
const NOTICE_ID = "security-update-2026-11-14";
const STORAGE_KEY = `cowry_notice_dismissed_${NOTICE_ID}`;

// No announced maintenance window — visible through the end of the day
// itself, then this component simply stops rendering on its own; nothing
// needs to come back and remove it afterward.
const NOTICE_EXPIRES_AT = new Date("2026-11-15T00:00:00").getTime();

const NOTICE_TEXT =
  "Scheduled security update — Saturday, Nov 14. CowryPay may be briefly unavailable at points during the day. Your funds are always safe — this doesn't touch your balance or wallet in any way.";

function ShieldIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M12 2l7 3.11v5.44c0 5.06-3.16 9.4-7 10.45-3.84-1.05-7-5.39-7-10.45V5.11L12 2zm0 2.18L7 6.3v4.25c0 3.94 2.33 7.37 5 8.36 2.67-.99 5-4.42 5-8.36V6.3l-5-2.12z" />
      <path d="M10.8 14.2l-2-2 .9-.9 1.1 1.1 3.3-3.3.9.9z" />
    </svg>
  );
}

export function SecurityNoticeBanner() {
  const [dismissed, setDismissed] = useState(true); // default hidden until the localStorage check below runs, so it never flashes for an already-dismissed visitor

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setDismissed(false); // storage unavailable — fail open, show the notice
    }
  }, []);

  if (dismissed || Date.now() >= NOTICE_EXPIRES_AT) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Best-effort only — worst case it shows again next visit, nothing breaks.
    }
  };

  return (
    <div className="flex-shrink-0 flex items-center gap-3 bg-cowry-card border-b border-cowry-green/30 pl-4 pr-3 py-2 animate-slide-down">
      <ShieldIcon className="flex-shrink-0 w-4 h-4 fill-cowry-green" />

      <div className="flex-1 min-w-0 overflow-hidden">
        {/* No flex `gap` here deliberately — the separator is baked into
            each span's own text instead, so both spans are byte-identical
            in width and translateX(-50%) lands exactly on a seamless loop
            (a flex gap would throw that math off by one gap-width). */}
        <div className="flex w-max marquee-left-fast">
          {[0, 1].map((i) => (
            <span key={i} className="text-xs font-medium text-white whitespace-nowrap">
              {NOTICE_TEXT}
              <span className="mx-8 text-cowry-green/50">•</span>
            </span>
          ))}
        </div>
      </div>

      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="flex-shrink-0 text-cowry-muted hover:text-white transition-colors p-1 -m-1"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2">
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
