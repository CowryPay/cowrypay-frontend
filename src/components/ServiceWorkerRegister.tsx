"use client";
import { useEffect } from "react";

/** Registers the offline app-shell service worker (public/sw.js). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-fatal — app works fine without offline support.
    });
  }, []);

  return null;
}
