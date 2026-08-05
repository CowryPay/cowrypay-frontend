"use client";
import { useEffect, useState } from "react";
import { getSends, getDeposits } from "@/lib/backendApi";
import { describeSendState, describeDepositState } from "@/lib/txState";
import type { TxHistoryItem } from "@/lib/types";
import { TxHistoryRow } from "./TxHistoryRow";
import { ReceiptModal } from "./ReceiptModal";

interface Props {
  onClose: () => void;
}

function explorerUrl(txHash: string | null): string | null {
  return txHash ? `https://celoscan.io/tx/${txHash}` : null;
}

function recipientLabel(recipient: { accountName: string; institutionName?: string }): string {
  return recipient.institutionName
    ? `${recipient.accountName} (${recipient.institutionName})`
    : recipient.accountName;
}

async function loadHistory(): Promise<TxHistoryItem[]> {
  const [{ sends }, { deposits }] = await Promise.all([getSends(), getDeposits()]);

  const sendItems: TxHistoryItem[] = sends.map((s) => {
    const { label, className } = describeSendState(s.state);
    return {
      id: s.id,
      direction: "sent",
      amount: s.amountHuman,
      tokenSymbol: s.tokenSymbol,
      counterparty: recipientLabel(s.recipient),
      stateLabel: label,
      stateClassName: className,
      txHash: s.withdrawTxHash,
      explorerUrl: explorerUrl(s.withdrawTxHash),
      timestamp: s.createdAt,
      hasReceipt: s.state === "COMPLETE",
    };
  });

  const depositItems: TxHistoryItem[] = deposits.map((d) => {
    const { label, className } = describeDepositState(d.state);
    return {
      id: d.id,
      direction: "received",
      amount: d.amount,
      tokenSymbol: d.tokenSymbol,
      counterparty: d.chain,
      stateLabel: label,
      stateClassName: className,
      txHash: d.txHash,
      explorerUrl: explorerUrl(d.txHash),
      timestamp: d.createdAt,
    };
  });

  return [...sendItems, ...depositItems].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

export function TransactionHistoryModal({ onClose }: Props) {
  const [items, setItems] = useState<TxHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [receiptSendId, setReceiptSendId] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    setLoading(true);
    setError("");
    loadHistory()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load transactions"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div
      className="absolute inset-0 z-[65] flex flex-col justify-end lg:items-center lg:justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-cowry-dark border-t lg:border border-cowry-border rounded-t-3xl lg:rounded-3xl overflow-hidden max-h-[88vh] lg:max-h-[80vh] lg:max-w-lg lg:w-full lg:mx-4 lg:shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-cowry-border">
          <div className="w-10 h-1 bg-cowry-border rounded-full mx-auto mb-3 lg:hidden" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">📋</span>
              <h2 className="text-sm font-bold text-white">Transaction History</h2>
            </div>
            <button
              onClick={onClose}
              className="text-cowry-muted hover:text-white text-xs px-2 py-1 transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {error && (
            <div className="m-4 px-3 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <div className="w-8 h-8 rounded-full border-2 border-cowry-green border-t-transparent animate-spin" />
              <p className="text-xs text-cowry-muted">Loading transactions…</p>
            </div>
          ) : items.length === 0 && !error ? (
            <p className="text-sm text-cowry-muted text-center py-16">
              No sends or deposits yet.
            </p>
          ) : (
            <div className="divide-y divide-cowry-border">
              {items.map((tx) => (
                <TxHistoryRow key={tx.id} tx={tx} showDate onViewReceipt={setReceiptSendId} />
              ))}
            </div>
          )}
        </div>
      </div>

      {receiptSendId && (
        <ReceiptModal sendId={receiptSendId} onClose={() => setReceiptSendId(null)} />
      )}
    </div>
  );
}
