"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ensureBackendAccount } from "@/lib/backendApi";
import { getErrorMessage } from "@/lib/errors";
import { AuthButton } from "@/components/auth/AuthButton";

const CODE_LENGTH = 6;

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyForm />
    </Suspense>
  );
}

function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const flow = params.get("flow");

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const setDigit = (i: number, value: string) => {
    const next = [...digits];
    next[i] = value;
    setDigits(next);
  };

  const handleChange = (i: number, raw: string) => {
    const value = raw.replace(/\D/g, "");
    if (!value) {
      setDigit(i, "");
      return;
    }
    // Handle pasted multi-digit strings landing in one box.
    const chars = value.split("");
    chars.forEach((c, offset) => {
      if (i + offset < CODE_LENGTH) setDigit(i + offset, c);
    });
    const nextIndex = Math.min(i + chars.length, CODE_LENGTH - 1);
    inputsRef.current[nextIndex]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputsRef.current[i - 1]?.focus();
    }
  };

  // Handled explicitly rather than relying on onChange to catch it — pasting
  // into one of several small custom-styled boxes is unreliable on mobile
  // (the browser's native paste behavior into a bounded field doesn't always
  // produce a clean onChange we can redistribute from). Always fills from
  // the first box regardless of which one was focused when the paste
  // happened, since a full pasted code always represents the whole thing.
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    setDigits(Array.from({ length: CODE_LENGTH }, (_, i) => pasted[i] ?? ""));
    inputsRef.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
  };

  const code = digits.join("");

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email) {
      setError("Missing email — go back and try again.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "email",
      });
      if (verifyError) throw verifyError;

      if (flow === "reset") {
        router.push("/set-password");
        return;
      }

      const { user } = await ensureBackendAccount();
      router.push(user.passwordSet ? "/app" : "/set-password");
    } catch (err) {
      setError(getErrorMessage(err, "Invalid or expired code"));
      setLoading(false);
    }
  };

  // Auto-submits once all digits are in, whether typed or pasted (e.g. a
  // code copied from the email app) — no need to hunt for the Continue
  // button. Re-typing the same finished code after a failed attempt
  // re-triggers this too, since `code` becomes a "new" value again.
  useEffect(() => {
    if (code.length === CODE_LENGTH && !loading) void handleSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Best-effort: when the tab regains focus (e.g. the user switched to
  // their email app, copied the code, and switched back), silently check
  // the clipboard and fill it in without waiting for an explicit paste.
  // Only works where the browser allows clipboard reads outside a direct
  // user gesture — notably NOT Safari/iOS, which never permits this; the
  // explicit paste-then-auto-submit above is the real fallback there.
  useEffect(() => {
    const tryClipboard = async () => {
      if (document.visibilityState !== "visible" || loading || !navigator.clipboard?.readText) return;
      try {
        const text = await navigator.clipboard.readText();
        const found = text.replace(/\D/g, "").slice(0, CODE_LENGTH);
        if (found.length === CODE_LENGTH) {
          setDigits(Array.from({ length: CODE_LENGTH }, (_, i) => found[i] ?? ""));
        }
      } catch {
        // Not permitted here (no user gesture) — silently do nothing, the manual paste path still works.
      }
    };
    document.addEventListener("visibilitychange", tryClipboard);
    window.addEventListener("focus", tryClipboard);
    return () => {
      document.removeEventListener("visibilitychange", tryClipboard);
      window.removeEventListener("focus", tryClipboard);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const handleResend = async () => {
    if (!email || resending) return;
    setError("");
    setResending(true);
    try {
      // shouldCreateUser must stay true for signup (that's the whole point —
      // the account doesn't exist yet) but false for reset, so a reset link
      // reached directly (e.g. a hand-typed /verify?email=...&flow=reset URL)
      // can't silently create a ghost account for an email with no account,
      // same fix as sign-in's forgot-password flow.
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: flow !== "reset" },
      });
      if (otpError) throw otpError;
    } catch (err) {
      setError(getErrorMessage(err, "Could not resend code"));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="relative flex-1 min-h-0 flex flex-col px-8 py-6 overflow-y-auto scrollbar-hide">
      <div className="absolute inset-0 bg-glow-green pointer-events-none" />

      <button
        onClick={() => router.back()}
        aria-label="Back"
        className="relative text-white hover:text-cowry-green transition-colors -ml-1 p-1 mb-6 self-start"
      >
        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-none stroke-current stroke-2">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <form onSubmit={handleSubmit} className="relative flex-1 flex flex-col justify-center">
        <h1 className="text-4xl font-black mb-2">Verification Code</h1>
        <p className="text-cowry-muted text-sm mb-8">
          Code sent to <span className="text-white">{email || "your email"}</span>. Check your inbox.
        </p>

        <div className="flex gap-2 mb-8">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputsRef.current[i] = el; }}
              type="text"
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              maxLength={CODE_LENGTH}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              autoFocus={i === 0}
              className="w-full aspect-square min-w-0 bg-cowry-card border border-cowry-border rounded-xl text-center text-lg font-bold text-white focus:outline-none focus:border-cowry-green/50 transition-colors"
            />
          ))}
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <AuthButton type="submit" arrow disabled={loading || code.length !== CODE_LENGTH}>
          {loading ? "Verifying…" : "Continue"}
        </AuthButton>

        <p className="text-center text-cowry-muted text-sm mt-4">
          Didn&apos;t receive the code?{" "}
          <button type="button" onClick={handleResend} disabled={resending} className="text-cowry-green disabled:opacity-50">
            {resending ? "Resending…" : "Resend Code"}
          </button>
        </p>
      </form>
    </div>
  );
}
