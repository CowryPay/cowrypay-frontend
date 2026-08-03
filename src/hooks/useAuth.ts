"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import { getMe, type PublicUser, type Wallet } from "@/lib/backendApi";

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Shared auth store. useAuth is mounted by several components at the same time
 * (ChatInterface + SettingsPanel), and each used to hold its own useState copy —
 * so a mutation in one instance (e.g. setting the transaction PIN) only updated
 * that one and the other stayed stale until a full page reload. Keeping the
 * state at module scope and syncing every hook instance via useSyncExternalStore
 * means a single refresh() pushes the new user/wallet to all subscribers at once.
 */
type AuthState = {
  loading: boolean;
  user: PublicUser | null;
  wallet: Wallet | null;
};

let state: AuthState = { loading: true, user: null, wallet: null };
let initialized = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  if (!initialized) {
    initialized = true;
    void doRefresh();
  }
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): AuthState {
  return state;
}

/** Server-render fallback — components read the initial "loading" state. */
function getServerSnapshot(): AuthState {
  return { loading: true, user: null, wallet: null };
}

async function doRefresh(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    state = { loading: false, user: null, wallet: null };
    notify();
    return;
  }
  try {
    const me = await getMe();
    state = { loading: false, user: me.user, wallet: me.wallet };
  } catch {
    state = { loading: false, user: null, wallet: null };
  } finally {
    notify();
  }
}

export function useAuth() {
  const { loading, user, wallet } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void doRefresh();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(() => doRefresh(), []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    state = { loading: false, user: null, wallet: null };
    notify();
  }, []);

  return {
    loading,
    user,
    wallet,
    address: wallet?.address ?? null,
    shortAddress: wallet ? shorten(wallet.address) : null,
    isAuthenticated: !!user,
    signOut,
    /** Re-fetch user/wallet — call after a mutation like setting the PIN. */
    refresh,
  };
}
