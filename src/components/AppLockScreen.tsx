"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { verifyBiometric, biometricLabel } from "@/lib/biometric";

type Props = {
  userId:   string;
  onUnlock: () => void;
};

/** Blocks the whole app behind a Face ID / Fingerprint prompt on open. */
export function AppLockScreen({ userId, onUnlock }: Props) {
  const [checking, setChecking] = useState(true);
  const [failed, setFailed] = useState(false);

  const attempt = async () => {
    setChecking(true);
    setFailed(false);
    const ok = await verifyBiometric(userId);
    setChecking(false);
    if (ok) onUnlock();
    else setFailed(true);
  };

  useEffect(() => {
    void attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0 z-[90] bg-cowry-dark flex flex-col items-center justify-center px-8 text-center">
      <Image src="/icon-192.png" alt="" width={64} height={64} className="rounded-2xl border border-cowry-border mb-6" />
      <p className="text-lg font-bold text-white mb-2">CowryPay is locked</p>
      <p className="text-sm text-cowry-muted mb-8">
        {checking
          ? `Waiting for ${biometricLabel()}…`
          : failed
            ? "Verification failed or was cancelled."
            : ""}
      </p>
      {!checking && (
        <button
          onClick={attempt}
          className="bg-cowry-green text-black text-sm font-bold px-6 py-3 rounded-full active:scale-95 transition-all"
        >
          Try Again
        </button>
      )}
    </div>
  );
}
