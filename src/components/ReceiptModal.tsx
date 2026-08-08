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

// Subtle repeating chevron texture behind the amount, matching the branded
// receipt reference design — an approximation (no exported asset), not a
// pixel-perfect match.
const ZIGZAG_PATTERN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='24' viewBox='0 0 48 24'%3E%3Cpath d='M0 24L12 0L24 24L36 0L48 24' stroke='%2300D437' stroke-width='2' fill='none'/%3E%3C/svg%3E\")";

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

type Props = {
  sendId: string;
  /** The EVM wallet from useAuth — used for the "Wallet Address" field when the send used celo/base/optimism. */
  wallet: Wallet;
  onClose: () => void;
};

/**
 * Pops up right after a payment is submitted (like Cash App/Venmo's receipt
 * screen) and polls until the send settles, then shows the full branded
 * receipt (design matches the reference CowryPay receipt mockup — real data
 * only, e.g. the masked account number, not the mockup's placeholder full
 * number). Also reused from Transaction History for past COMPLETE sends,
 * where it resolves on the very first poll since the send is already done.
 */
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

  // The "Wallet Address" field is which of the user's own addresses this
  // send actually paid out from — not part of the receipt API response, so
  // resolved client-side from data we already have (EVM) or already fetch
  // elsewhere (Solana/Stellar), rather than asking the backend for it.
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
      .catch(() => {
        // Best-effort — the rest of the receipt is still useful without this field.
      });
    return () => {
      cancelled = true;
    };
  }, [receipt, wallet.address]);

  const state = send?.state;
  const badge = state ? describeSendState(state) : null;
  const isComplete = !!receipt;
  const isFailed = state === "FAILED" || state === "SEND_REJECTED" || state === "REFUNDED";

  /**
   * html2canvas snapshots whatever layout exists the instant it's called —
   * if the logo <img>s haven't actually finished loading yet, it captures
   * an incomplete/pre-reflow layout (confirmed live: cut-off text and a
   * clipped logo). Waiting for every image in the card to actually load
   * first is what fixes that, not just delaying by a fixed amount of time.
   */
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

  /** Renders the receipt card (ref'd content) to a PNG blob — used by both download and share. */
  const captureImage = async (): Promise<Blob | null> => {
    if (!receiptRef.current) return null;
    await waitForImages(receiptRef.current);
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
      // Timestamped, not just the reference — some phones/gallery apps show
      // a cached thumbnail for a filename that already exists rather than
      // the freshly generated file, which would look like "nothing changed"
      // even after a real fix.
      a.download = `cowrypay-receipt-${receipt.reference}-${Date.now()}.png`;
      // Attached to the DOM before clicking — a detached element's .click()
      // is unreliable for triggering a download on some mobile browsers.
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
      className="absolute inset-0 z-[70] bg-cowry-dark flex flex-col"
      // Stops every click here (buttons included) from bubbling up into an
      // ancestor's own backdrop onClose — this is rendered as a child of
      // TransactionHistoryModal's backdrop (onClick={onClose} there), and
      // without this, tapping anywhere inside the receipt — Download/Share
      // included — closed the history modal right along with it.
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
                      : "This usually takes a few seconds. You can close this — it'll keep processing in the background."}
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
                    style={{ backgroundImage: ZIGZAG_PATTERN, backgroundRepeat: "repeat-x" }}
                  />
                  <div
                    className="absolute inset-x-0 bottom-0 h-14 opacity-[0.08]"
                    style={{ backgroundImage: ZIGZAG_PATTERN, backgroundRepeat: "repeat-x" }}
                  />

                  <div className="relative px-6 py-7">
                    <div className="flex items-center justify-between mb-7">
                      {/* eslint-disable-next-line @next/next/no-img-element -- plain img, not next/image: html2canvas doesn't reliably capture next/image's lazy-loading wrapper */}
                      <img src="/CowryPay.png" alt="CowryPay" width={110} height={21} className="object-contain" />
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

                    {receipt.withdrawTxHash && (
                      <a
                        href={`https://celoscan.io/tx/${receipt.withdrawTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-center text-xs text-cowry-green hover:text-cowry-mint font-medium mt-6"
                      >
                        View on-chain transaction ↗
                      </a>
                    )}

                    {/* Stacked, not side-by-side — three different inline-
                        alignment techniques (relative offset, margin,
                        background-position) all rendered correctly in the
                        live browser but never carried into the
                        html2canvas-exported image, confirmed live each time
                        after a hard cache clear. Rather than keep fighting
                        html2canvas's fidelity for one specific inline
                        alignment, removing the need for it entirely: each
                        line just centers independently, nothing needs to
                        line up against anything else. */}
                    <div className="text-center mt-10 pb-1">
                      <p className="text-xs text-cowry-muted mb-2.5">Thank you for choosing</p>
                      {/* eslint-disable-next-line @next/next/no-img-element -- plain img, not next/image: html2canvas doesn't reliably capture next/image's lazy-loading wrapper */}
                      <img src="/CowryPay.png" alt="CowryPay" width={90} height={17} className="object-contain mx-auto" />
                    </div>
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
    <div className="flex items-start justify-between gap-3">
      <span className="text-[11px] text-cowry-muted tracking-wide flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-right min-w-0">
        {/* leading-relaxed + a touch of vertical padding: html2canvas uses its
            own approximate font metrics, and without this the calculated
            line-box for bold text came out slightly short — confirmed live
            as the tops of these glyphs specifically getting clipped by
            truncate's overflow:hidden, while the (non-bold) label text next
            to it rendered fine. */}
        <span
          className={`block font-semibold text-white truncate leading-relaxed py-0.5 ${mono ? "font-mono text-xs" : "text-sm"}`}
        >
          {value}
        </span>
        {sub && <span className="block text-xs text-cowry-muted mt-0.5 truncate leading-relaxed py-0.5">{sub}</span>}
      </span>
    </div>
  );
}
