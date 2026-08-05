"use client";
import Image from "next/image";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallPrompt() {
  const { visible, canPromptNatively, install, dismiss } = useInstallPrompt();
  if (!visible) return null;

  const description = canPromptNatively
    ? "Add CowryPay to your home screen for a faster, full-screen experience — no app store needed."
    : isIOS()
      ? 'Tap the Share icon below, then "Add to Home Screen" — no app store needed.'
      : 'Open your browser menu and choose "Add to Home screen" — no app store needed.';

  return (
    <div
      className="fixed inset-0 z-[62] flex flex-col justify-end lg:items-center lg:justify-center bg-black/60 backdrop-blur-sm"
      onClick={dismiss}
    >
      <div
        className="bg-cowry-dark border-t lg:border border-cowry-border rounded-t-3xl lg:rounded-3xl lg:max-w-sm lg:w-full lg:mx-4 lg:shadow-2xl px-6 pt-6"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-cowry-border rounded-full mx-auto mb-5 lg:hidden" />

        <div className="flex flex-col items-center text-center">
          <Image
            src="/icon-192.png"
            alt=""
            width={64}
            height={64}
            className="rounded-2xl border border-cowry-border mb-4"
          />
          <p className="text-lg font-bold text-white">Install CowryPay</p>
          <p className="text-xs font-semibold text-cowry-green mt-0.5">Talk. Send. Automate.</p>
          <p className="text-sm text-cowry-muted leading-relaxed mt-3">{description}</p>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={dismiss}
            className="flex-1 bg-transparent border border-cowry-green/60 text-white text-sm font-semibold py-3 rounded-full hover:border-cowry-green transition-all active:scale-95"
          >
            Not now
          </button>
          <button
            onClick={canPromptNatively ? install : dismiss}
            className="flex-1 bg-cowry-green text-black text-sm font-bold py-3 rounded-full active:scale-95 transition-all"
          >
            {canPromptNatively ? "Install" : "Got it"}
          </button>
        </div>
      </div>
    </div>
  );
}
