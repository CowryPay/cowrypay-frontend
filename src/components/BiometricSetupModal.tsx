"use client";
import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { setBiometricEnabled } from "@/lib/backendApi";
import { registerBiometricCredential, clearBiometricCredential, biometricLabel } from "@/lib/biometric";
import { getErrorMessage } from "@/lib/errors";
import { AuthButton } from "@/components/auth/AuthButton";

const CODE_LENGTH = 8;

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

  const handleSendCode = async () => {
    if (await sendCode()) setStep("otp");
  };

  const handleResend = async () => {
    if (resending) return;
    setResending(true);
    await sendCode();
    setResending(false);
  };

  const performAction = async () => {
    setStep("action");
    setError("");
    try {
      if (mode === "enable") {
        await registerBiometricCredential(userId, email ?? "");
        await setBiometricEnabled(true);
      } else {
        clearBiometricCredential(userId);
        await setBiometricEnabled(false);
      }
      onDone();
    } catch (err) {
      setError(getErrorMessage(
        err,
        mode === "enable" ? `Could not enable ${biometricLabel()}` : `Could not turn off ${biometricLabel()}`,
      ));
      // The OTP was already verified — safe to let them retry the device
      // prompt (or the disable call) without sending a new code.
      setStep("otp");
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
      await performAction();
    } catch (err) {
      setError(getErrorMessage(err, "Invalid or expired code"));
      setLoading(false);
    }
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
                Changing this requires a fresh login, so we&apos;ll send a verification code to your email first.
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
