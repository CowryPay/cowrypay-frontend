"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { setTransactionPin } from "@/lib/backendApi";
import { getErrorMessage } from "@/lib/errors";
import { AuthButton } from "@/components/auth/AuthButton";
import { PinDots, Keypad, PIN_LENGTH } from "@/components/PinPad";

const CODE_LENGTH = 6;

type Step = "intro" | "otp" | "pin";
type PinStep = "enter" | "confirm";

interface Props {
  email:   string | null;
  /** Called after the PIN is successfully set — caller should refresh auth state. */
  onDone:  () => void;
  onClose: () => void;
}

export function SetPinModal({ email, onDone, onClose }: Props) {
  const [step, setStep] = useState<Step>("intro");
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [pinStep, setPinStep] = useState<PinStep>("enter");
  const [firstPin, setFirstPin] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

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
    // Handle pasted multi-digit strings landing in one box.
    const chars = value.split("");
    chars.forEach((c, offset) => {
      if (i + offset < CODE_LENGTH) setDigit(i + offset, c);
    });
    const nextIndex = Math.min(i + chars.length, CODE_LENGTH - 1);
    inputsRef.current[nextIndex]?.focus();
  };

  const handleDigitKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
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

  const handleSendCode = async () => {
    if (await sendCode()) setStep("otp");
  };

  const handleResend = async () => {
    if (resending) return;
    setResending(true);
    await sendCode();
    setResending(false);
  };

  const handleVerifyCode = async () => {
    if (!email || code.length !== CODE_LENGTH) return;
    setError("");
    setLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
      if (verifyError) throw verifyError;
      setStep("pin");
    } catch (err) {
      setError(getErrorMessage(err, "Invalid or expired code"));
    } finally {
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

  const submitPin = async (pin: string) => {
    setError("");
    setLoading(true);
    try {
      await setTransactionPin(pin);
      onDone();
    } catch (err) {
      setError(getErrorMessage(err, "Could not set PIN — try again"));
      setPinStep("enter");
      setFirstPin("");
      setPinInput("");
    } finally {
      setLoading(false);
    }
  };

  const handlePinDigit = (d: string) => {
    if (loading || pinInput.length >= PIN_LENGTH) return;
    const next = pinInput + d;
    setPinInput(next);
    setPinError(false);

    if (next.length !== PIN_LENGTH) return;

    if (pinStep === "enter") {
      setFirstPin(next);
      setTimeout(() => {
        setPinInput("");
        setPinStep("confirm");
      }, 150);
      return;
    }

    if (next === firstPin) {
      void submitPin(next);
    } else {
      setPinError(true);
      setTimeout(() => setPinInput(""), 400);
    }
  };

  const handlePinBackspace = () => {
    if (loading) return;
    setPinInput((v) => v.slice(0, -1));
  };

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
            <h2 className="text-sm font-bold text-white">Set Transaction PIN</h2>
            <button onClick={onClose} className="text-cowry-muted hover:text-white text-xs px-2 py-1 transition-colors">
              Close
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-6">
          {step === "intro" && (
            <div>
              <p className="text-sm text-cowry-muted mb-6">
                Your transaction PIN confirms it&apos;s really you before any money moves. Setting or changing it
                requires a fresh login, so we&apos;ll send a verification code to your email first.
              </p>
              {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
              <AuthButton onClick={handleSendCode} disabled={loading}>
                {loading ? "Sending code…" : "Send Code"}
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
                    maxLength={CODE_LENGTH}
                    value={d}
                    autoComplete={i === 0 ? "one-time-code" : "off"}
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

          {step === "pin" && (
            <div className="flex flex-col items-center pt-2 pb-4">
              <p className="text-sm text-white font-semibold mb-1 text-center">
                {pinStep === "enter" ? "Choose a 4-digit PIN" : "Confirm your PIN"}
              </p>
              <p className="text-xs text-cowry-muted mb-8 text-center">
                {pinError ? "PINs didn't match — try again" : " "}
              </p>
              <PinDots filled={pinInput.length} error={pinError} />
              {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
              <Keypad onDigit={handlePinDigit} onBackspace={handlePinBackspace} />
              {loading && <p className="text-cowry-muted text-xs mt-6">Saving…</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
