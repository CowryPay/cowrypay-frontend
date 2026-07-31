"use client";
import { useState } from "react";
import { useDepositNotifications } from "@/hooks/useDepositNotifications";
import type { Deposit } from "@/lib/backendApi";
import { formatToken } from "@/lib/currency";
import { describeDepositState } from "@/lib/txState";

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-2">
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 01-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DepositRow({ deposit }: { deposit: Deposit }) {
  const { label, className } = describeDepositState(deposit.state);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-cowry-border last:border-b-0">
      <div>
        <p className="text-sm font-semibold text-white">
          {formatToken(deposit.amount)} {deposit.tokenSymbol}
        </p>
        <p className="text-xs text-cowry-muted mt-0.5">{new Date(deposit.createdAt).toLocaleString()}</p>
      </div>
      <span className={`text-[11px] font-medium rounded-full px-2.5 py-1 border ${className}`}>{label}</span>
    </div>
  );
}

interface Props {
  userId: string | null;
}

export function NotificationBell({ userId }: Props) {
  const [open, setOpen] = useState(false);
  const { deposits, unreadCount, acknowledge } = useDepositNotifications(userId);

  const handleOpen = () => {
    setOpen(true);
    acknowledge();
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-cowry-card transition-colors text-cowry-green"
        title="Notifications"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-cowry-green" />
        )}
      </button>

      {open && (
        <div
          className="absolute inset-0 z-[65] flex flex-col justify-end lg:items-center lg:justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-cowry-dark border-t lg:border border-cowry-border rounded-t-3xl lg:rounded-3xl overflow-hidden max-h-[80vh] lg:max-h-[70vh] lg:max-w-md lg:w-full lg:mx-4 lg:shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-cowry-border">
              <div className="w-10 h-1 bg-cowry-border rounded-full mx-auto mb-3 lg:hidden" />
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">Deposits</h2>
                <button
                  onClick={() => setOpen(false)}
                  className="text-cowry-muted hover:text-white text-xs px-2 py-1 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              {deposits.length === 0 ? (
                <p className="text-center text-cowry-muted text-sm py-10">No deposits yet.</p>
              ) : (
                deposits.map((d) => <DepositRow key={d.id} deposit={d} />)
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
