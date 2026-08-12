"use client";
import { useEffect, useRef, useState } from "react";
import {
  getSend,
  getSendReceipt,
  getSolanaWallet,
  getStellarWallet,
  type Send,
  type SendReceipt,
  type Wallet,
} from "@/lib/backendApi";
import { describeSendState } from "@/lib/txState";
import { explorerUrlFor } from "@/lib/explorer";
import { formatFiat, formatToken } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";

const CARD_BG = "#0B0B0B";
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 40;
const STOP_POLLING_STATES = new Set(["COMPLETE", "FAILED", "SEND_REJECTED", "REFUNDED", "MANUAL_REVIEW"]);

// Pure CSS zigzag (gradient triangles) — no image asset involved. An SVG
// data-URI background-image here previously tainted the html2canvas
// export on iOS Safari ("The operation is insecure"), even with the logo
// <img> fixed via crossOrigin — CSS background-images have no crossOrigin
// equivalent, so this was the only real fix.
const ZIGZAG_STYLE = {
  backgroundImage:
    "linear-gradient(135deg, #00D437 25%, transparent 25%), " +
    "linear-gradient(225deg, #00D437 25%, transparent 25%), " +
    "linear-gradient(315deg, #00D437 25%, transparent 25%), " +
    "linear-gradient(45deg, #00D437 25%, transparent 25%)",
  backgroundPosition: "8px 0, 8px 0, 0 0, 0 0",
  backgroundSize: "16px 16px",
  backgroundRepeat: "repeat-x",
} as const;

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

type Props = {
  sendId: string;
  wallet: Wallet;
  onClose: () => void;
};

export function ReceiptModal({ sendId, wallet, onClose }: Props) {
  const [send, setSend] = useState<Send | null>(null);
  const [receipt, setReceipt] = useState<SendReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"download" | "share" | null>(null);
  const [senderAddress, setSenderAddress] = useState<string | null>(null);
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

  useEffect(() => {
    if (!receipt) return;
    const chain = receipt.chain.toLowerCase();
    if (chain === "celo" || chain === "base" || chain === "optimism") {
      setSenderAddress(wallet.address);
      return;
    }
    const fetcher = chain === "solana" ? getSolanaWallet : chain === "stellar" ? getStellarWallet : null;
    if (!fetcher) return;
    let cancelled = false;
    fetcher()
      .then((w) => {
        if (!cancelled) setSenderAddress(w.address);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [receipt, wallet.address]);

  const state = send?.state;
  const badge = state ? describeSendState(state) : null;
  const isFailed = state === "FAILED" || state === "SEND_REJECTED" || state === "REFUNDED";

  const waitForImages = (el: HTMLElement): Promise<void> => {
    const images = Array.from(el.querySelectorAll("img"));
    return Promise.all(
      images.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            }),
      ),
    ).then(() => undefined);
  };

  const captureImage = async (): Promise<Blob | null> => {
    if (!receiptRef.current) return null;
    await waitForImages(receiptRef.current);
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(receiptRef.current, { backgroundColor: CARD_BG, scale: 2, useCORS: true });
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
      a.download = `cowrypay-receipt-${receipt.reference}-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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
      const file = blob
        ? new File([blob], `cowrypay-receipt-${receipt.reference}-${Date.now()}.png`, { type: "image/png" })
        : null;

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
      await handleDownload();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(getErrorMessage(e, "Could not share the receipt"));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div
      className="absolute inset-0 z-[70] bg-cowry-dark flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-glow-green pointer-events-none" />

      <div className="relative flex flex-col h-full w-full overflow-x-hidden">
        <div className="flex-shrink-0 px-4 lg:px-10 py-4 border-b border-cowry-border flex items-center gap-3">
          <button
            onClick={onClose}
            aria-label="Back"
            className="text-white hover:text-cowry-green transition-colors -ml-1 p-1"
          >
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-none stroke-current stroke-2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-lg font-bold text-white">View Transaction</h2>
        </div>

        <div className="overflow-y-auto flex-1 px-4 lg:px-10 py-6">
          <div className="lg:max-w-md lg:mx-auto">
            {error && (
              <div className="mb-4 px-3 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl">
                {error}
              </div>
            )}

            {!receipt && (
              <div className="flex flex-col items-center text-center py-16">
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 ${
                    isFailed
                      ? "bg-red-500/10 border border-red-500/30"
                      : "bg-amber-500/10 border border-amber-500/30"
                  }`}
                >
                  {isFailed ? (
                    <svg viewBox="0 0 24 24" className="w-7 h-7 fill-red-400">
                      <path d="M18.3 5.71L12 12.01l-6.3-6.3-1.42 1.42 6.3 6.3-6.3 6.3 1.42 1.42 6.3-6.3 6.3 6.3 1.42-1.42-6.3-6.3 6.3-6.3z" />
                    </svg>
                  ) : (
                    <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
                <p className="text-base font-bold text-white">
                  {isFailed ? "Payment didn't go through" : "Processing your payment"}
                </p>
                {badge && (
                  <span className={`mt-2 text-[10px] font-medium rounded-full px-2.5 py-0.5 border ${badge.className}`}>
                    {badge.label}
                  </span>
                )}
                <p className={`text-xs mt-4 leading-relaxed max-w-xs ${isFailed ? "text-red-400" : "text-cowry-muted"}`}>
                  {isFailed
                    ? state === "REFUNDED"
                      ? "This payment couldn't be delivered and was refunded to your balance."
                      : "This payment failed. Check Transaction History for details, or try sending again."
                    : state === "MANUAL_REVIEW"
                      ? "This payment is under manual review — we'll notify you once it clears. Safe to close this and check back in Transaction History."
                      : "This usually takes a minute or two — bank settlement isn't instant. You can close this — it'll keep processing in the background."}
                </p>
              </div>
            )}

            {receipt && (
              <>
                <div
                  ref={receiptRef}
                  className="relative overflow-hidden rounded-3xl bg-cowry-dark border border-cowry-border"
                >
                  <div
                    className="absolute inset-x-0 top-0 h-14 opacity-[0.08]"
                    style={ZIGZAG_STYLE}
                  />
                  <div
                    className="absolute inset-x-0 bottom-0 h-14 opacity-[0.08]"
                    style={ZIGZAG_STYLE}
                  />

                  <div className="relative px-6 py-7">
                    <div className="flex items-center justify-between mb-7">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/CowryPay.png" alt="CowryPay" width={110} height={21} className="object-contain" crossOrigin="anonymous" />
                      <span className="text-xs text-cowry-muted">Transaction Receipt</span>
                    </div>

                    <p className="text-xs text-cowry-muted text-center mb-2">
                      {new Date(receipt.completedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                      {" • "}
                      {new Date(receipt.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>

                    <p className="text-3xl font-bold text-white text-center mb-1">
                      {receipt.fiatAmountReceived != null
                        ? formatFiat(receipt.fiatAmountReceived, receipt.fiatCurrency)
                        : `${formatToken(receipt.amountSent)} ${receipt.tokenSymbol}`}
                    </p>
                    <p className="text-sm font-semibold text-cowry-green text-center mb-7">Successful</p>

                    <div className="space-y-5">
                      <DetailRow
                        label="RECIPIENT DETAILS"
                        value={receipt.recipient.accountName}
                        sub={`${receipt.recipient.institutionName} • ${receipt.recipient.accountIdentifierMasked}`}
                      />
                      {senderAddress && (
                        <DetailRow label="WALLET ADDRESS" value={shortenAddress(senderAddress)} mono />
                      )}
                      <DetailRow label="NETWORK" value={receipt.chain.toUpperCase()} />
                      <DetailRow label="YOU SENT" value={`${formatToken(receipt.amountSent)} ${receipt.tokenSymbol}`} />
                    </div>

                    {receipt.withdrawTxHash && explorerUrlFor(receipt.chain, receipt.withdrawTxHash) && (
                      <a
                        href={explorerUrlFor(receipt.chain, receipt.withdrawTxHash)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-center text-xs text-cowry-green hover:text-cowry-mint font-medium mt-6"
                      >
                        View on-chain transaction ↗
                      </a>
                    )}

                    <p className="text-center text-xs text-cowry-muted mt-10 pb-1">
                      Thank you for choosing CowryPay
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <button
                    onClick={handleShare}
                    disabled={!!exporting}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-transparent border border-cowry-green/60 text-white text-sm font-semibold py-3 rounded-full hover:border-cowry-green transition-all disabled:opacity-50"
                  >
                    {exporting === "share" ? "Sharing…" : "Share as Image"}
                  </button>
                  <button
                    onClick={handleDownload}
                    disabled={!!exporting}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-cowry-green text-black text-sm font-bold py-3 rounded-full active:scale-95 transition-all disabled:opacity-50"
                  >
                    {exporting === "download" ? "Saving…" : "Download Receipt"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, sub, mono }: { label: string; value: string; sub?: string; mono?: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-cowry-muted tracking-wide flex-shrink-0 leading-relaxed py-0.5">
          {label}
        </span>
        <span
          className={`text-right min-w-0 truncate font-semibold text-white leading-relaxed py-0.5 ${mono ? "font-mono text-xs" : "text-sm"}`}
        >
          {value}
        </span>
      </div>
      {sub && <p className="text-right text-xs text-cowry-muted mt-0.5 truncate leading-relaxed py-0.5">{sub}</p>}
    </div>
  );
}
