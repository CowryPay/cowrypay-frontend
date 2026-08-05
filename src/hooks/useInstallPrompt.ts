"use client";
import { useCallback, useEffect, useState } from "react";

const LAST_SHOWN_KEY = "cowrypay_install_prompt_last_shown";
const INSTALLED_KEY = "cowrypay_install_prompt_installed";
const REPROMPT_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000; // re-show at most every 2 days
const SHOW_DELAY_MS = 3000; // let the page settle before interrupting

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's older, non-standard signal — matchMedia doesn't cover it there.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Drives a custom "Install CowryPay" banner instead of relying solely on
 * Chrome's own mini-infobar (which we don't control the timing/design of).
 * Shows at most once every 2 days, never again once installed.
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(INSTALLED_KEY) === "1") {
      setInstalled(true);
      return;
    }

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      localStorage.setItem(INSTALLED_KEY, "1");
      setInstalled(true);
      setVisible(false);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    const lastShown = Number(localStorage.getItem(LAST_SHOWN_KEY) ?? 0);
    const dueToShow = Date.now() - lastShown >= REPROMPT_INTERVAL_MS;

    const timer = dueToShow ? setTimeout(() => setVisible(true), SHOW_DELAY_MS) : null;

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
    setVisible(false);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
    localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
    if (outcome === "accepted") {
      localStorage.setItem(INSTALLED_KEY, "1");
      setInstalled(true);
    }
  }, [deferredPrompt]);

  return {
    visible: visible && !installed,
    installed,
    canPromptNatively: !!deferredPrompt,
    install,
    dismiss,
  };
}
