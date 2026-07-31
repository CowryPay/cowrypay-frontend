"use client";
import { useCallback, useEffect, useState } from "react";
import { getDeposits, type Deposit } from "@/lib/backendApi";

const POLL_INTERVAL_MS = 20_000;
const STORAGE_KEY_PREFIX = "cowry_deposits_acknowledged_";

/** Polls recent deposits while the app is open and tracks which ones are unread. */
export function useDepositNotifications(userId: string | null) {
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [acknowledgedAt, setAcknowledgedAt] = useState("");

  const storageKey = userId ? `${STORAGE_KEY_PREFIX}${userId}` : null;

  useEffect(() => {
    if (!storageKey) return;
    setAcknowledgedAt(localStorage.getItem(storageKey) ?? "");
  }, [storageKey]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const { deposits: fetched } = await getDeposits();
      setDeposits(fetched);
    } catch {
      // Best-effort — a failed poll just tries again next interval.
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void refresh();
    const interval = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [userId, refresh]);

  const unreadCount = deposits.filter(
    (d) => d.state === "BALANCE_CREDITED" && d.updatedAt > acknowledgedAt,
  ).length;

  /** Call when the notification panel is opened — clears the unread badge. */
  const acknowledge = useCallback(() => {
    if (!storageKey) return;
    const now = new Date().toISOString();
    localStorage.setItem(storageKey, now);
    setAcknowledgedAt(now);
  }, [storageKey]);

  return { deposits, unreadCount, acknowledge };
}
