"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { getSend, getSendReceipt, type Send, type SendReceipt } from "@/lib/backendApi";
import { describeSendState } from "@/lib/txState";
import { formatFiat, formatToken } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";

// The card background html2canvas renders onto — matches cowry-dark
// (tailwind.config.ts) so the exported image isn't transparent/mismatched.
const CARD_BG = "#0B0B0B";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 40; // ~2 minutes of active polling before we give up and let the user check back later

// States a send can sit in for a while (or indefinitely) without us tightly
// polling — MANUAL_REVIEW especially can take hours, not seconds.
const STOP_POLLING_STATES = new Set(["COMPLETE", "FAILED", "SEND_REJECTED", "REFUNDED", "MANUAL_REVIEW"]);

type Props = {
  sendId: string;
  onClose: () => void;
};

/**
 * Pops up right after a payment is submitted (like Cash App/Venmo's receipt
 * screen) and polls until the send settles, then shows the full receipt.
 * Also reused from Transaction History for past COMPLETE sends, where it
 * resolves on the very first poll since the send is already done.
 */
export function ReceiptModal({ sendId, onClose }: Props) {
  const [send, setSend] = useState<Send | null>(null);
  const [receipt, setReceipt] = useState<SendReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"download" | "share" | null>(null);
  const pollsRef = useRef(0);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const { send: s } = await getSend(sendId);
        if (cancelled) return;
        setSend(s);

        if (s.state === "COMPLETE") {
          const { receipt: r } = await getSendReceipt(sendId);
          if (!cancelled) setReceipt(r);
          return;
        }
        if (STOP_POLLING_STATES.has(s.state) || pollsRef.current >= MAX_POLLS) return;

        pollsRef.current += 1;
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (e) {
        if (!cancelled) setError(getErrorMessage(e, "Couldn't load this payment's status"));
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sendId]);

  const state = send?.state;
  const badge = state ? describeSendState(state) : null;
  const isComplete = !!receipt;
  const isFailed = state === "FAILED" || state === "SEND_REJECTED" || state === "REFUNDED";

  /** Renders the receipt card (ref'd content) to a PNG blob — used by both download and share. */
  const captureImage = async (): Promise<Blob | null> => {
    if (!receiptRef.current) return null;
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(receiptRef.current, { backgroundColor: CARD_BG, scale: 2 });
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  };

  const handleDownload = async () => {
    if (!receipt || exporting) return;
    setExporting("download");
    setError(null);
    try {
      const blob = await captureImage();
      if (!blob) throw new Error("Could not generate the receipt image");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cowrypay-receipt-${receipt.reference}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(getErrorMessage(e, "Could not download the receipt"));
    } finally {
      setExporting(null);
    }
  };

  const handleShare = async () => {
    if (!receipt || exporting) return;
    setExporting("share");
    setError(null);
    try {
      const blob = await captureImage();
      const file = blob ? new File([blob], `cowrypay-receipt-${receipt.reference}.png`, { type: "image/png" }) : null;

      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "CowryPay Receipt" });
        return;
      }
      if (navigator.share) {
        await navigator.share({
          title: "CowryPay Receipt",
          text: `Sent ${formatToken(receipt.amountSent)} ${receipt.tokenSymbol} to ${receipt.recipient.accountName} — ref ${receipt.reference}`,
        });
        return;
      }
      // No Web Share API (most desktop browsers) — download instead.
      await handleDownload();
    } catch (e) {
      // The user cancelling the native share sheet throws AbortError — not a real error.
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(getErrorMessage(e, "Could not share the receipt"));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div
      className="absolute inset-0 z-[70] flex flex-col justify-end lg:items-center lg:justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-cowry-dark border-t lg:border border-cowry-border rounded-t-3xl lg:rounded-3xl overflow-hidden max-h-[88vh] lg:max-w-md lg:w-full lg:mx-4 lg:shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-cowry-border">
          <div className="w-10 h-1 bg-cowry-border rounded-full mx-auto mb-3 lg:hidden" />
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Receipt</h2>
            <button onClick={onClose} className="text-cowry-muted hover:text-white text-xs px-2 py-1 transition-colors">
              Close
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-6">
          {error && (
            <div className="mb-4 px-3 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl">
              {error}
            </div>
          )}

          <div ref={receiptRef} className="bg-cowry-dark">
          <div className="flex flex-col items-center text-center mb-6">
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 ${
                isComplete
                  ? "bg-cowry-green/15 border border-cowry-green/40"
                  : isFailed
                    ? "bg-red-500/10 border border-red-500/30"
                    : "bg-amber-500/10 border border-amber-500/30"
              }`}
            >
              {isComplete ? (
                <svg viewBox="0 0 24 24" className="w-7 h-7 fill-cowry-green">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              ) : isFailed ? (
                <svg viewBox="0 0 24 24" className="w-7 h-7 fill-red-400">
                  <path d="M18.3 5.71L12 12.01l-6.3-6.3-1.42 1.42 6.3 6.3-6.3 6.3 1.42 1.42 6.3-6.3 6.3 6.3 1.42-1.42-6.3-6.3 6.3-6.3z" />
                </svg>
              ) : (
                <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              )}
            </div>
            <p className="text-base font-bold text-white">
              {isComplete ? "Payment delivered" : isFailed ? "Payment didn't go through" : "Processing your payment"}
            </p>
            {badge && (
              <span className={`mt-2 text-[10px] font-medium rounded-full px-2.5 py-0.5 border ${badge.className}`}>
                {badge.label}
              </span>
            )}
          </div>

          {!receipt && !isFailed && (
            <p className="text-xs text-cowry-muted text-center leading-relaxed">
              {state === "MANUAL_REVIEW"
                ? "This payment is under manual review — we'll notify you once it clears. Safe to close this and check back in Transaction History."
                : "This usually takes a few seconds. You can close this — it'll keep processing in the background."}
            </p>
          )}

          {!receipt && isFailed && (
            <p className="text-xs text-red-400 text-center leading-relaxed">
              {state === "REFUNDED"
                ? "This payment couldn't be delivered and was refunded to your balance."
                : "This payment failed. Check Transaction History for details, or try sending again."}
            </p>
          )}

          {receipt && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">
                  {receipt.fiatAmountReceived != null
                    ? formatFiat(receipt.fiatAmountReceived, receipt.fiatCurrency)
                    : `${formatToken(receipt.amountSent)} ${receipt.tokenSymbol}`}
                </p>
                <p className="text-xs text-cowry-muted mt-1">
                  to {receipt.recipient.accountName} ({receipt.recipient.institutionName})
                </p>
              </div>

              <div className="bg-cowry-card border border-cowry-border rounded-2xl divide-y divide-cowry-border">
                <Row label="Reference" value={receipt.reference} mono />
                <Row label="You sent" value={`${formatToken(receipt.amountSent)} ${receipt.tokenSymbol}`} />
                <Row label="Fee" value={`${formatToken(receipt.feeAmount)} ${receipt.tokenSymbol}`} />
                <Row label="Network" value={receipt.chain.charAt(0).toUpperCase() + receipt.chain.slice(1)} />
                <Row label="To account" value={receipt.recipient.accountIdentifierMasked} mono />
                <Row label="Sent" value={new Date(receipt.createdAt).toLocaleString()} />
                <Row label="Completed" value={new Date(receipt.completedAt).toLocaleString()} />
              </div>

              {receipt.withdrawTxHash && (
                <a
                  href={`https://celoscan.io/tx/${receipt.withdrawTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-xs text-cowry-green hover:text-cowry-mint font-medium"
                >
                  View on-chain transaction ↗
                </a>
              )}

              <div className="flex items-center justify-center gap-2 pt-3 border-t border-cowry-border">
                <span className="text-xs text-cowry-muted">Executed by</span>
                <Image src="/CowryPay.png" alt="CowryPay" width={90} height={17} className="object-contain" />
              </div>
            </div>
          )}
          </div>

          {receipt && (
            <div className="flex gap-2 mt-6">
              <button
                onClick={handleDownload}
                disabled={!!exporting}
                className="flex-1 flex items-center justify-center gap-1.5 bg-transparent border border-cowry-green/60 text-white text-sm font-semibold py-2.5 rounded-full hover:border-cowry-green transition-all disabled:opacity-50"
              >
                {exporting === "download" ? "Saving…" : "Download"}
              </button>
              <button
                onClick={handleShare}
                disabled={!!exporting}
                className="flex-1 flex items-center justify-center gap-1.5 bg-transparent border border-cowry-green/60 text-white text-sm font-semibold py-2.5 rounded-full hover:border-cowry-green transition-all disabled:opacity-50"
              >
                {exporting === "share" ? "Sharing…" : "Share"}
              </button>
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full mt-3 bg-cowry-green text-black text-sm font-bold py-2.5 rounded-full active:scale-95 transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm gap-3">
      <span className="text-cowry-muted flex-shrink-0">{label}</span>
      <span className={`font-semibold text-white text-right truncate ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
