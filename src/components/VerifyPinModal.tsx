"use client";
import { useState } from "react";
import { verifyTransactionPin } from "@/lib/backendApi";
import { getErrorMessage } from "@/lib/errors";
import { PinDots, Keypad, PIN_LENGTH } from "@/components/PinPad";

interface Props {
  /** Called once the PIN is confirmed correct — hands the pin back up so the
   *  caller can use it for the actual operation. This component's job stops
   *  here; it has no idea what happens next or whether it succeeds. */
  onVerified: (pin: string) => void;
  onClose:    () => void;
}

export function VerifyPinModal({ onVerified, onClose }: Props) {
  const [pinInput, setPinInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (pin: string) => {
    setLoading(true);
    try {
      const { valid } = await verifyTransactionPin(pin);
      if (valid) {
        onVerified(pin);
        return;
      }
      setError("Incorrect PIN — try again");
      setTimeout(() => setPinInput(""), 400);
    } catch (e) {
      setError(getErrorMessage(e, "Could not verify PIN — try again"));
      setTimeout(() => setPinInput(""), 400);
    } finally {
      setLoading(false);
    }
  };

  const handleDigit = (d: string) => {
    if (loading || pinInput.length >= PIN_LENGTH) return;
    const next = pinInput + d;
    setPinInput(next);
    setError(null);
    if (next.length === PIN_LENGTH) void submit(next);
  };

  const handleBackspace = () => {
    if (!loading) setPinInput((v) => v.slice(0, -1));
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
            <h2 className="text-sm font-bold text-white">Confirm Send</h2>
            <button onClick={onClose} className="text-cowry-muted hover:text-white text-xs px-2 py-1 transition-colors">
              Close
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-6">
          <div className="flex flex-col items-center pt-2 pb-4">
            <p className="text-sm text-white font-semibold mb-1 text-center">Enter your PIN to confirm</p>
            <p className="text-xs text-red-400 mb-8 text-center min-h-[16px]">{error ?? " "}</p>
            <PinDots filled={pinInput.length} error={!!error} />
            <Keypad onDigit={handleDigit} onBackspace={handleBackspace} />
            {loading && <p className="text-cowry-muted text-xs mt-6">Verifying…</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
