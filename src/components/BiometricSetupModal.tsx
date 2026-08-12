"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { setBiometricEnabled } from "@/lib/backendApi";
import { registerBiometricCredential, clearBiometricCredential, biometricLabel } from "@/lib/biometric";
import { getErrorMessage } from "@/lib/errors";
import { AuthButton } from "@/components/auth/AuthButton";

const CODE_LENGTH = 6;

type Step = "intro" | "otp" | "action";

interface Props {
  mode:    "enable" | "disable";
  userId:  string;
  email:   string | null;
  /** Called once the preference is successfully changed — caller should refresh auth state. */
  onDone:  () => void;
  onClose: () => void;
}

export function BiometricSetupModal({ mode, userId, email, onDone, onClose }: Props) {
  const [step, setStep] = useState<Step>("intro");
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  // True once the local WebAuthn credential is created — set once, never
  // recreated on a reauth retry, otherwise a second registration prompt
  // would fire for the same enable attempt.
  const registeredRef = useRef(false);

  const code = digits.join("");

  const setDigit = (i: number, value: string) => {
    const next = [...digits];
    next[i] = value;
    setDigits(next);
  };

  const handleDigitChange = (i: number, raw: string) => {
    const value = raw.replace(/\D/g, "");
    if (!value) {
      setDigit(i, "");
      return;
    }
    const chars = value.split("");
    chars.forEach((c, offset) => {
      if (i + offset < CODE_LENGTH) setDigit(i + offset, c);
    });
    inputsRef.current[Math.min(i + chars.length, CODE_LENGTH - 1)]?.focus();
  };

  const handleDigitKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) inputsRef.current[i - 1]?.focus();
  };

  const handleDigitPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    setDigits(Array.from({ length: CODE_LENGTH }, (_, i) => pasted[i] ?? ""));
    inputsRef.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
  };

  const sendCode = async () => {
    if (!email) {
      setError("No email on file — try signing in again.");
      return false;
    }
    setError("");
    setLoading(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({ email });
      if (otpError) throw otpError;
      return true;
    } catch (err) {
      setError(getErrorMessage(err, "Could not send verification code"));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resending) return;
    setResending(true);
    await sendCode();
    setResending(false);
  };

  /** The actual protected action — assumes the session is fresh enough; callers handle reauth_required. */
  const runAction = async () => {
    if (mode === "enable") {
      if (!registeredRef.current) {
        await registerBiometricCredential(userId, email ?? "");
        registeredRef.current = true;
      }
      await setBiometricEnabled(true);
    } else {
      clearBiometricCredential(userId);
      await setBiometricEnabled(false);
    }
  };

  /**
   * Tries the action directly first — the user's session may already be
   * fresh enough (e.g. they just verified OTP moments ago to set their
   * PIN), in which case a second OTP send here would just collide with
   * Supabase's own per-email resend cooldown for no reason. Only falls
   * back to the OTP flow if the backend actually says it's needed.
   */
  const handleIntroContinue = async () => {
    setStep("action");
    setError("");
    try {
      await runAction();
      onDone();
    } catch (err) {
      if (err instanceof Error && err.message === "reauth_required") {
        // Stay on the "action" spinner while the fallback code sends —
        // bouncing back to "intro" first would flash the Continue button
        // for no reason.
        if (await sendCode()) setStep("otp");
        else setStep("intro");
        return;
      }
      setError(getErrorMessage(
        err,
        mode === "enable" ? `Could not enable ${biometricLabel()}` : `Could not turn off ${biometricLabel()}`,
      ));
      setStep("intro");
    }
  };

  const handleVerifyCode = async () => {
    if (!email || code.length !== CODE_LENGTH) return;
    setError("");
    setLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
      if (verifyError) throw verifyError;
      setLoading(false);
      setStep("action");
      try {
        await runAction();
        onDone();
      } catch (err) {
        setError(getErrorMessage(
          err,
          mode === "enable" ? `Could not enable ${biometricLabel()}` : `Could not turn off ${biometricLabel()}`,
        ));
        // OTP already verified — safe to retry the action without sending a new code.
        setStep("otp");
      }
    } catch (err) {
      setError(getErrorMessage(err, "Invalid or expired code"));
      setLoading(false);
    }
  };

  // Auto-submits once all digits are in, whether typed or pasted — no need
  // to hunt for the Continue button. Scoped to the "otp" step so a stale
  // full code from an earlier attempt can't fire after moving on.
  useEffect(() => {
    if (step === "otp" && code.length === CODE_LENGTH && !loading) void handleVerifyCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, step]);

  // Best-effort: when the tab regains focus (e.g. the user switched to
  // their email app, copied the code, and switched back), silently check
  // the clipboard and fill it in without waiting for an explicit paste.
  // Only works where the browser allows clipboard reads outside a direct
  // user gesture — notably NOT Safari/iOS, which never permits this; the
  // explicit paste-then-auto-submit above is the real fallback there.
  useEffect(() => {
    const tryClipboard = async () => {
      if (step !== "otp" || document.visibilityState !== "visible" || loading || !navigator.clipboard?.readText) return;
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
  }, [step, loading]);

  return (
    <div
      className="absolute inset-0 z-[70] flex flex-col justify-end lg:items-center lg:justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-cowry-dark border-t lg:border border-cowry-border rounded-t-3xl lg:rounded-3xl overflow-hidden max-h-[88vh] lg:max-w-md lg:w-full lg:mx-4 lg:shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-cowry-border">
          <div className="w-10 h-1 bg-cowry-border rounded-full mx-auto mb-3 lg:hidden" />
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">
              {mode === "enable" ? `Enable ${biometricLabel()}` : `Turn Off ${biometricLabel()}`}
            </h2>
            <button onClick={onClose} className="text-cowry-muted hover:text-white text-xs px-2 py-1 transition-colors">
              Close
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-6">
          {step === "intro" && (
            <div>
              <p className="text-sm text-cowry-muted mb-6">
                {mode === "enable"
                  ? "Unlock CowryPay with your face or fingerprint instead of typing in each time. "
                  : ""}
                Changing this requires a fresh login — we&apos;ll ask for a verification code if you need one.
              </p>
              {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
              <AuthButton onClick={handleIntroContinue}>
                Continue
              </AuthButton>
            </div>
          )}

          {step === "otp" && (
            <div>
              <p className="text-sm text-cowry-muted mb-6">
                Code sent to <span className="text-white">{email}</span>. Check your inbox.
              </p>
              <div className="flex gap-2 mb-6">
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputsRef.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={i === 0 ? "one-time-code" : "off"}
                    maxLength={CODE_LENGTH}
                    value={d}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleDigitKeyDown(i, e)}
                    onPaste={handleDigitPaste}
                    autoFocus={i === 0}
                    className="w-full aspect-square min-w-0 bg-cowry-card border border-cowry-border rounded-xl text-center text-lg font-bold text-white focus:outline-none focus:border-cowry-green/50 transition-colors"
                  />
                ))}
              </div>
              {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
              <AuthButton onClick={handleVerifyCode} disabled={loading || code.length !== CODE_LENGTH} className="mb-3">
                {loading ? "Verifying…" : "Continue"}
              </AuthButton>
              <button
                onClick={handleResend}
                disabled={resending}
                className="w-full text-center text-cowry-muted text-sm hover:text-white transition-colors disabled:opacity-50"
              >
                {resending ? "Resending…" : "Resend Code"}
              </button>
            </div>
          )}

          {step === "action" && (
            <div className="flex flex-col items-center pt-2 pb-4 text-center">
              <div className="w-10 h-10 border-2 border-cowry-green border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm text-white font-semibold">
                {mode === "enable" ? "Follow your device's prompt to confirm…" : "Turning off…"}
              </p>
              {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
