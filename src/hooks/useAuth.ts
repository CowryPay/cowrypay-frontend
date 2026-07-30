"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getMe, type PublicUser, type Wallet } from "@/lib/backendApi";

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * The account's identity + custodial deposit wallet — issued automatically by
 * the backend on signup. Replaces the old injected-wallet (MetaMask-style)
 * connect flow entirely; there's nothing for the user to "connect" anymore.
 */
export function useAuth() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setUser(null);
      setWallet(null);
      setLoading(false);
      return;
    }
    try {
      const me = await getMe();
      setUser(me.user);
      setWallet(me.wallet);
    } catch {
      setUser(null);
      setWallet(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setWallet(null);
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
