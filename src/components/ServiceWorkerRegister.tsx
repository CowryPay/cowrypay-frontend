"use client";
import { useEffect } from "react";

/**
 * Registers a deliberately no-op service worker (public/sw.js) — its only
 * job is to satisfy Chrome's install-prompt requirement (a SW with a fetch
 * handler). It caches nothing, so it can't serve stale content the way the
 * previous caching SW did.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Best-effort — worst case, install just falls back to the manual menu path.
      });
    }
  }, []);
  return null;
}
