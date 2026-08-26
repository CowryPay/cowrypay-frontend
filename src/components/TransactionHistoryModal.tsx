"use client";
import { useEffect, useState } from "react";
import { getSends, getDeposits, getCryptoWithdrawals, getCrossChainSends } from "@/lib/backendApi";
import { describeSendState, describeDepositState, describeCryptoWithdrawalState, describeCrossChainSendState } from "@/lib/txState";
import { explorerUrlFor } from "@/lib/explorer";
import { shortAddress } from "@/lib/wallet";
import { useAuth } from "@/hooks/useAuth";
import type { TxHistoryItem } from "@/lib/types";
import { TxHistoryRow } from "./TxHistoryRow";
import { ReceiptModal } from "./ReceiptModal";
import { CryptoWithdrawalReceiptModal } from "./CryptoWithdrawalReceiptModal";
import { CrossChainSendReceiptModal } from "./CrossChainSendReceiptModal";

interface Props {
  onClose: () => void;
}

function recipientLabel(recipient: { accountName: string; institutionName?: string }): string {
  return recipient.institutionName
    ? `${recipient.accountName} (${recipient.institutionName})`
    : recipient.accountName;
}

async function loadHistory(): Promise<TxHistoryItem[]> {
  const [{ sends }, { deposits }, { withdrawals }, { sends: crossChainSends }] = await Promise.all([
    getSends(),
    getDeposits(),
    getCryptoWithdrawals(),
    getCrossChainSends(),
  ]);

  const sendItems: TxHistoryItem[] = sends.map((s) => {
    const { label, className } = describeSendState(s.state);
    return {
      id: s.id,
      kind: "send",
      direction: "sent",
      amount: s.amountHuman,
      tokenSymbol: s.tokenSymbol,
      counterparty: recipientLabel(s.recipient),
      stateLabel: label,
      stateClassName: className,
      txHash: s.withdrawTxHash,
      explorerUrl: explorerUrlFor(s.chain, s.withdrawTxHash),
      timestamp: s.createdAt,
      hasReceipt: s.state === "COMPLETE",
    };
  });

  const depositItems: TxHistoryItem[] = deposits.map((d) => {
    const { label, className } = describeDepositState(d.state);
    return {
      id: d.id,
      kind: "deposit",
      direction: "received",
      amount: d.amount,
      tokenSymbol: d.tokenSymbol,
      counterparty: d.chain,
      stateLabel: label,
      stateClassName: className,
      txHash: d.txHash,
      explorerUrl: explorerUrlFor(d.chain, d.txHash),
      timestamp: d.createdAt,
    };
  });

  const withdrawalItems: TxHistoryItem[] = withdrawals.map((w) => {
    const { label, className } = describeCryptoWithdrawalState(w.state);
    return {
      id: w.id,
      kind: "withdrawal",
      direction: "sent",
      amount: w.amountHuman,
      tokenSymbol: w.tokenSymbol,
      counterparty: `${shortAddress(w.toAddress)} (${w.chain})`,
      stateLabel: label,
      stateClassName: className,
      txHash: w.withdrawTxHash,
      explorerUrl: explorerUrlFor(w.chain, w.withdrawTxHash),
      timestamp: w.createdAt,
      hasReceipt: true,
    };
  });

  const crossChainSendItems: TxHistoryItem[] = crossChainSends.map((cc) => {
    const { label, className } = describeCrossChainSendState(cc.state);
    // Destination hash is the more meaningful "did it land" link once it
    // exists; falls back to the source hash while still in flight — the
    // receipt modal (opened via "View receipt") shows both regardless.
    const txHash = cc.destinationTxHash ?? cc.sourceTxHash;
    const explorerChain = cc.destinationTxHash ? cc.destinationChain : cc.sourceChain;
    return {
      id: cc.id,
      kind: "crossChainSend",
      direction: "sent",
      amount: cc.amountHuman,
      tokenSymbol: cc.tokenSymbol,
      counterparty: `${cc.sourceChain} → ${cc.destinationChain}`,
      stateLabel: label,
      stateClassName: className,
      txHash,
      explorerUrl: explorerUrlFor(explorerChain, txHash),
      timestamp: cc.createdAt,
      hasReceipt: true,
    };
  });

  return [...sendItems, ...depositItems, ...withdrawalItems, ...crossChainSendItems].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

export function TransactionHistoryModal({ onClose }: Props) {
  const { wallet } = useAuth();
  const [items, setItems] = useState<TxHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [receiptSendId, setReceiptSendId] = useState<string | null>(null);
  const [receiptWithdrawalId, setReceiptWithdrawalId] = useState<string | null>(null);
  const [receiptCrossChainSendId, setReceiptCrossChainSendId] = useState<string | null>(null);

  const handleViewReceipt = (tx: TxHistoryItem) => {
    if (tx.kind === "withdrawal") setReceiptWithdrawalId(tx.id);
    else if (tx.kind === "crossChainSend") setReceiptCrossChainSendId(tx.id);
    else setReceiptSendId(tx.id);
  };

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
              No transactions yet.
            </p>
          ) : (
            <div className="divide-y divide-cowry-border">
              {items.map((tx) => (
                <TxHistoryRow key={tx.id} tx={tx} showDate onViewReceipt={handleViewReceipt} />
              ))}
            </div>
          )}
        </div>
      </div>

      {receiptSendId && wallet && (
        <ReceiptModal sendId={receiptSendId} wallet={wallet} onClose={() => setReceiptSendId(null)} />
      )}

      {receiptWithdrawalId && wallet && (
        <CryptoWithdrawalReceiptModal
          withdrawalId={receiptWithdrawalId}
          wallet={wallet}
          onClose={() => setReceiptWithdrawalId(null)}
        />
      )}

      {receiptCrossChainSendId && (
        <CrossChainSendReceiptModal
          crossChainSendId={receiptCrossChainSendId}
          onClose={() => setReceiptCrossChainSendId(null)}
        />
      )}
    </div>
  );
}
