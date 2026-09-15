"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getMe, startKyc } from "@/lib/backendApi";
import { getErrorMessage } from "@/lib/errors";

// docs.dojah.io/sdks/javascript-library — verified live before wiring this
// in. Deliberately no async/defer on the <script> tag: Dojah's own docs
// warn the inline Connect() call can run before the library loads if set.
const DOJAH_WIDGET_SRC = "https://widget.dojah.io/widget.js";

const DOJAH_APP_ID = process.env.NEXT_PUBLIC_DOJAH_APP_ID;
const DOJAH_PUBLIC_KEY = process.env.NEXT_PUBLIC_DOJAH_PUBLIC_KEY;
const DOJAH_WIDGET_ID = process.env.NEXT_PUBLIC_DOJAH_WIDGET_ID;
// Hardcoded fallback while the real Dojah dashboard config (#2) isn't
// finalized yet — the whole real flow (POST /kyc/start, the widget script,
// GET /me polling) is wired up and working today; this is the one piece
// that has to wait on values from whoever owns the Dojah account. Once
// the three NEXT_PUBLIC_DOJAH_* env vars are set for real, this screen
// needs no further changes.
const DOJAH_CONFIGURED = !!DOJAH_APP_ID && !!DOJAH_PUBLIC_KEY && !!DOJAH_WIDGET_ID;

// Same support channel already used elsewhere in the app (the backend's
// own chat help text, the cross-chain-send STUCK screen) — one contact
// path, not a new one invented just for this screen.
const SUPPORT_TELEGRAM_URL = "https://t.me/+OV3fAjsqmrtlZmY8";

const POLL_INTERVAL_MS = 4000;
// ~100s of active polling — comfortably inside the "a minute or two"
// window the widget's own onSuccess->webhook->DB round trip normally
// takes. Falls through to the "still processing" screen after this, not
// an error — the backend keeps resolving it regardless of whether this
// screen is still open to see it happen.
const MAX_POLLS = 25;

type Step =
  | "checking"
  | "verified"
  | "config-missing"
  | "intro"
  | "processing"
  | "timeout"
  | "rejected"
  | "error";

type DojahConnectOptions = {
  app_id: string;
  p_key: string;
  type: "custom";
  config: { widget_id: string };
  reference_id: string;
  onSuccess: (response: unknown) => void;
  onError: (err: unknown) => void;
  onClose: () => void;
};

type DojahConnectInstance = {
  setup: () => void;
  open: () => void;
};

declare global {
  interface Window {
    Connect?: new (options: DojahConnectOptions) => DojahConnectInstance;
  }
}

function loadDojahScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Connect) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${DOJAH_WIDGET_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load the verification widget")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = DOJAH_WIDGET_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the verification widget"));
    document.body.appendChild(script);
  });
}

type Props = { onClose: () => void };

export function KycModal({ onClose }: Props) {
  const { user, refresh } = useAuth();
  const [step, setStep] = useState<Step>("checking");
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const pollsRef = useRef(0);

  // Step 0 — entry guard. Runs once per real kycStatus change, never
  // re-derives step from a stale closure since it reads straight off
  // useAuth's shared store.
  useEffect(() => {
    if (!user) return;
    if (user.kycStatus === "verified") {
      setStep("verified");
      return;
    }
    if (user.kycStatus === "pending") {
      // An attempt is already in flight — possibly from a previous
      // session (user backgrounded the app / closed the tab mid-widget).
      // Resume polling directly, never call /kyc/start or open a second
      // widget for an attempt that's already running.
      setStep("processing");
      return;
    }
    // unverified or rejected — both get the same intro screen; rejected
    // can always retry, Dojah's own flow supports re-attempting.
    setStep(DOJAH_CONFIGURED ? "intro" : "config-missing");
  }, [user?.kycStatus]);

  // Step 4 — polling GET /me directly (not through useAuth's own refresh)
  // so each check reads a genuinely fresh response instead of a stale
  // closure over useAuth's state; refresh() is still called once a
  // terminal state lands, so every other consumer of useAuth (Settings,
  // a future send-blocked gate) picks up the change immediately too.
  useEffect(() => {
    if (step !== "processing") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    pollsRef.current = 0;

    async function poll() {
      try {
        const { user: freshUser } = await getMe();
        if (cancelled) return;
        if (freshUser.kycStatus === "verified") {
          setStep("verified");
          void refresh();
          return;
        }
        if (freshUser.kycStatus === "rejected") {
          setStep("rejected");
          void refresh();
          return;
        }
      } catch {
        // Transient network/API hiccup — don't abandon polling over one
        // bad tick, just retry on the next one.
      }
      if (cancelled) return;
      if (pollsRef.current >= MAX_POLLS) {
        setStep("timeout");
        return;
      }
      pollsRef.current += 1;
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [step, refresh]);

  const handleStart = async () => {
    setStarting(true);
    setError("");
    try {
      const { providerReference } = await startKyc();
      await loadDojahScript();
      if (!window.Connect) throw new Error("Verification widget failed to load");

      const connect = new window.Connect({
        app_id: DOJAH_APP_ID!,
        p_key: DOJAH_PUBLIC_KEY!,
        type: "custom",
        config: { widget_id: DOJAH_WIDGET_ID! },
        reference_id: providerReference,
        onSuccess: () => {
          // The widget finishing ≠ verified — the real decision arrives
          // later via webhook. Never mark verified here, only start
          // polling for the actual outcome.
          setStarting(false);
          setStep("processing");
        },
        onError: () => {
          setStarting(false);
          setError("Something went wrong during verification.");
          setStep("error");
        },
        onClose: () => {
          // step is only ever changed by onSuccess/onError above, never
          // just by opening the widget — so there's nothing to revert
          // here even if onClose fires after one of those (some widget
          // SDKs do, as part of their own cleanup). Only the in-flight
          // "Starting…" button state needs resetting, for the genuine
          // case of the user dismissing the widget before finishing.
          setStarting(false);
        },
      });
      connect.setup();
      connect.open();
    } catch (e) {
      setStarting(false);
      setError(getErrorMessage(e, "Could not start verification"));
      setStep("error");
    }
  };

  return (
    <div className="absolute inset-0 z-[70] bg-cowry-dark flex flex-col" onClick={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 bg-glow-green pointer-events-none" />

      <div className="relative flex flex-col h-full w-full overflow-x-hidden">
        <div className="flex-shrink-0 px-4 lg:px-10 py-4 border-b border-cowry-border flex items-center gap-3">
          <button onClick={onClose} aria-label="Back" className="text-white hover:text-cowry-green transition-colors -ml-1 p-1">
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-none stroke-current stroke-2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-lg font-bold text-white">Identity Verification</h2>
        </div>

        <div className="overflow-y-auto flex-1 px-4 lg:px-10 py-6">
          <div className="lg:max-w-md lg:mx-auto flex flex-col items-center text-center py-6">

            {step === "checking" && (
              <div className="w-6 h-6 border-2 border-cowry-green border-t-transparent rounded-full animate-spin" />
            )}

            {step === "verified" && (
              <>
                <div className="w-14 h-14 rounded-full bg-cowry-green/10 border border-cowry-green/30 flex items-center justify-center mb-4">
                  <svg viewBox="0 0 24 24" className="w-7 h-7 fill-cowry-green">
                    <path d="M20 6L9 17l-5-5 1.41-1.41L9 14.17l9.59-9.58z" />
                  </svg>
                </div>
                <p className="text-base font-bold text-white">You&apos;re verified</p>
                <p className="text-xs text-cowry-muted mt-2 max-w-xs">Your identity has been confirmed. You&apos;re all set.</p>
              </>
            )}

            {step === "config-missing" && (
              <>
                <span className="text-4xl mb-3">🚧</span>
                <p className="text-base font-bold text-white">Verification isn&apos;t available yet</p>
                <p className="text-xs text-cowry-muted mt-2 max-w-xs">
                  We&apos;re still setting this up — check back soon.
                </p>
              </>
            )}

            {step === "intro" && (
              <>
                <span className="text-4xl mb-3">🪪</span>
                <p className="text-base font-bold text-white">
                  {user?.kycStatus === "rejected" ? "Let's try again" : "Verify your identity"}
                </p>
                <p className="text-xs text-cowry-muted mt-2 max-w-xs leading-relaxed">
                  {user?.kycStatus === "rejected"
                    ? "Your last attempt didn't go through. You can try again — have a valid ID and a few minutes ready."
                    : "Quick ID check — have a valid government ID and a few minutes ready. This runs in a secure widget, not on this screen."}
                </p>
                {error && (
                  <div className="mt-4 px-3 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl max-w-xs">
                    {error}
                  </div>
                )}
                <button
                  onClick={handleStart}
                  disabled={starting}
                  className="mt-6 w-full max-w-xs bg-cowry-green text-black text-sm font-bold py-3 rounded-full active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {starting ? "Starting…" : user?.kycStatus === "rejected" ? "Try Again" : "Start Verification"}
                </button>
              </>
            )}

            {step === "processing" && (
              <>
                <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-base font-bold text-white">Verifying your identity</p>
                <p className="text-xs text-cowry-muted mt-2 max-w-xs">This usually takes a few seconds — you can leave this screen, we&apos;ll keep checking.</p>
                {/* A "pending" attempt with a config error (e.g. a bad widget id) never gets a real
                    webhook to resolve it — polling alone would wait forever. Backend doesn't block
                    re-starting while pending (only "verified" is blocked), so this is a real escape
                    hatch, not just a reassurance message. */}
                <button
                  onClick={handleStart}
                  disabled={starting}
                  className="mt-6 text-xs text-cowry-muted hover:text-white underline underline-offset-2 transition-colors disabled:opacity-50"
                >
                  {starting ? "Starting…" : "Taking too long? Start a new attempt"}
                </button>
              </>
            )}

            {step === "timeout" && (
              <>
                <span className="text-4xl mb-3">⏳</span>
                <p className="text-base font-bold text-white">Still processing</p>
                <p className="text-xs text-cowry-muted mt-2 max-w-xs">
                  This is taking longer than usual — we&apos;ll let you know once it&apos;s done. Check back here anytime.
                </p>
                {error && (
                  <div className="mt-4 px-3 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl max-w-xs">
                    {error}
                  </div>
                )}
                <button
                  onClick={handleStart}
                  disabled={starting}
                  className="mt-6 w-full max-w-xs bg-cowry-green text-black text-sm font-bold py-3 rounded-full active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {starting ? "Starting…" : "Start a New Attempt"}
                </button>
                <a
                  href={SUPPORT_TELEGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 text-xs text-cowry-green hover:text-cowry-mint font-medium transition-colors"
                >
                  Taking a while? Contact support ↗
                </a>
              </>
            )}

            {step === "rejected" && (
              <>
                <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4">
                  <svg viewBox="0 0 24 24" className="w-7 h-7 fill-red-400">
                    <path d="M18.3 5.71L12 12.01l-6.3-6.3-1.42 1.42 6.3 6.3-6.3 6.3 1.42 1.42 6.3-6.3 6.3 6.3 1.42-1.42-6.3-6.3 6.3-6.3z" />
                  </svg>
                </div>
                <p className="text-base font-bold text-white">Verification didn&apos;t pass</p>
                <p className="text-xs text-cowry-muted mt-2 max-w-xs">You can try again with a valid, clear ID.</p>
                <button
                  onClick={() => { setError(""); setStep("intro"); }}
                  className="mt-6 w-full max-w-xs bg-cowry-green text-black text-sm font-bold py-3 rounded-full active:scale-95 transition-all"
                >
                  Try Again
                </button>
              </>
            )}

            {step === "error" && (
              <>
                <span className="text-4xl mb-3">❌</span>
                <p className="text-base font-bold text-white">Couldn&apos;t start verification</p>
                <p className="text-xs text-cowry-muted mt-2 max-w-xs">{error}</p>
                <button
                  onClick={() => { setError(""); setStep("intro"); }}
                  className="mt-6 w-full max-w-xs bg-cowry-green text-black text-sm font-bold py-3 rounded-full active:scale-95 transition-all"
                >
                  Try Again
                </button>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
