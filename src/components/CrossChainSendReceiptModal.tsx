"use client";
import { useEffect, useRef, useState } from "react";
import { getCrossChainSend, type CrossChainSend } from "@/lib/backendApi";
import { describeCrossChainSendState } from "@/lib/txState";
import { explorerUrlFor } from "@/lib/explorer";
import { formatToken } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";

// Same support channel the backend's own chat help message points to
// ("Need a real person?") — kept consistent rather than inventing a
// second contact path just for this screen.
const SUPPORT_TELEGRAM_URL = "https://t.me/+OV3fAjsqmrtlZmY8";

// Escalating interval, not a flat one: most sends resolve within a couple
// minutes (CCTP's FAST transfer mode is 8-20s finality as of 2026-08-27 —
// see cctpBridge.ts's own comment), so poll quickly at first, but LI.FI
// (the Celo-touching path) reports its own dynamic executionDuration with
// no fixed bound, and CCTP itself ran in SLOW mode (~15-20 min) until that
// same commit — a real, live incident where this modal gave up after 5
// minutes and silently froze on "Bridging" while the backend's own
// poller (crossChainSendConfirmationPoller.ts, 30s tick, NO give-up
// condition) kept retrying every 30s until it genuinely completed 15+
// minutes later. ~30 minutes of total coverage here, not 5.
const FAST_POLL_MS = 3000;
const FAST_POLL_COUNT = 40; // ~2 minutes at the fast interval
const SLOW_POLL_MS = 15000;
const SLOW_POLL_COUNT = 112; // ~28 more minutes at the slow interval
const MAX_POLLS = FAST_POLL_COUNT + SLOW_POLL_COUNT;
const STOP_POLLING_STATES = new Set(["COMPLETE", "FAILED", "STUCK", "REFUNDED"]);

function nextPollDelay(pollCount: number): number {
  return pollCount < FAST_POLL_COUNT ? FAST_POLL_MS : SLOW_POLL_MS;
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

type Props = {
  crossChainSendId: string;
  onClose:          () => void;
};

export function CrossChainSendReceiptModal({ crossChainSendId, onClose }: Props) {
  const [send, setSend] = useState<CrossChainSend | null>(null);
  const [error, setError] = useState<string | null>(null);
  // True only if this modal's OWN polling window ran out before the send
  // reached a terminal state — the backend keeps retrying regardless (see
  // crossChainSendConfirmationPoller.ts), this just means the user closing
  // and reopening (or finding it again in Transaction History) is the only
  // way this screen itself will show further progress.
  const [gaveUp, setGaveUp] = useState(false);
  const pollsRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const { send: s } = await getCrossChainSend(crossChainSendId);
        if (cancelled) return;
        setSend(s);

        if (STOP_POLLING_STATES.has(s.state)) return;
        if (pollsRef.current >= MAX_POLLS) {
          setGaveUp(true);
          return;
        }

        pollsRef.current += 1;
        timer = setTimeout(poll, nextPollDelay(pollsRef.current));
      } catch (e) {
        if (!cancelled) setError(getErrorMessage(e, "Couldn't load this send's status"));
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [crossChainSendId]);

  const state = send?.state;
  const badge = state ? describeCrossChainSendState(state) : null;
  const isStuck = state === "STUCK";
  const isFailed = state === "FAILED";
  const isRefunded = state === "REFUNDED";
  const isComplete = state === "COMPLETE";
  const isDone = isComplete || isFailed || isStuck || isRefunded;
  // STUCK deliberately gets the same calm, in-progress treatment as
  // BRIDGING/etc, not the red "something's wrong" one — the source-chain
  // leg already confirmed safely; it's genuinely just taking longer than
  // usual, not failed. Only FAILED (never left the user's balance) gets
  // the red/error treatment.

  const statusText = (() => {
    if (!send) return "";
    switch (send.state) {
      case "COMPLETE":
        return `Delivered — ${formatToken(send.amountHuman)} ${send.tokenSymbol} landed on ${send.destinationChain}.`;
      case "STUCK":
        return `Your funds left ${send.sourceChain} safely and are on their way to ${send.destinationChain} — this one's taking a little longer than usual, so our team is keeping an eye on it for you.`;
      case "FAILED":
        return `This didn't go through before anything left your balance — nothing was deducted.`;
      case "REFUNDED":
        return `This didn't complete — your balance was refunded on ${send.sourceChain}.`;
      case "BRIDGING":
        return `Funds left ${send.sourceChain} and are bridging to ${send.destinationChain} now.`;
      case "SOURCE_BROADCAST":
      case "SOURCE_CONFIRMED":
        return `Broadcasting on ${send.sourceChain}…`;
      case "DESTINATION_BROADCAST":
        return `Almost there — delivering on ${send.destinationChain} now.`;
      default:
        return `Getting this send started…`;
    }
  })();

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
          <h2 className="text-lg font-bold text-white">Cross-Chain Send</h2>
        </div>

        <div className="overflow-y-auto flex-1 px-4 lg:px-10 py-6">
          <div className="lg:max-w-md lg:mx-auto">
            {error && (
              <div className="mb-4 px-3 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl">
                {error}
              </div>
            )}

            <div className="flex flex-col items-center text-center py-10">
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 ${
                  isComplete
                    ? "bg-cowry-green/10 border border-cowry-green/30"
                    : isFailed
                      ? "bg-red-500/10 border border-red-500/30"
                      : isRefunded
                        ? "bg-white/5 border border-cowry-border"
                        : "bg-amber-500/10 border border-amber-500/30"
                }`}
              >
                {isComplete ? (
                  <svg viewBox="0 0 24 24" className="w-7 h-7 fill-cowry-green">
                    <path d="M20 6L9 17l-5-5 1.41-1.41L9 14.17l9.59-9.58z" />
                  </svg>
                ) : isFailed ? (
                  <svg viewBox="0 0 24 24" className="w-7 h-7 fill-red-400">
                    <path d="M18.3 5.71L12 12.01l-6.3-6.3-1.42 1.42 6.3 6.3-6.3 6.3 1.42 1.42 6.3-6.3 6.3 6.3 1.42-1.42-6.3-6.3 6.3-6.3z" />
                  </svg>
                ) : (
                  <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                )}
              </div>

              {send && (
                <p className="text-3xl font-bold text-white mb-1">
                  {formatToken(send.amountHuman)} {send.tokenSymbol}
                </p>
              )}
              {send && (
                <p className="text-sm text-cowry-muted capitalize mb-3">
                  {send.sourceChain} → {send.destinationChain}
                </p>
              )}

              {badge && (
                <span className={`text-[10px] font-medium rounded-full px-2.5 py-0.5 border ${badge.className}`}>
                  {badge.label}
                </span>
              )}

              <p className={`text-xs mt-4 leading-relaxed max-w-xs ${isFailed ? "text-red-400" : "text-cowry-muted"}`}>
                {statusText}
              </p>

              {isStuck && send && (
                <>
                  <a
                    href={SUPPORT_TELEGRAM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 text-xs text-cowry-green hover:text-cowry-mint font-medium transition-colors"
                  >
                    Message support on Telegram ↗
                  </a>
                  {/* Invite links (t.me/+hash) can't prefill a message like a t.me/username deep link can — shown as copyable text instead. */}
                  <p className="text-[11px] text-cowry-muted mt-1.5">
                    Mention reference <span className="font-mono text-white">{send.reference}</span>
                  </p>
                </>
              )}

              {!isDone && gaveUp && (
                <p className="text-xs text-cowry-muted mt-4 max-w-xs">
                  This is taking longer than usual — it's still processing on our end. Check Transaction History in a bit for the latest status.
                </p>
              )}

              {!isDone && !gaveUp && (
                <p className="text-xs text-cowry-muted mt-4">
                  You can close this — it'll keep processing in the background.
                </p>
              )}

              {send && (
                <div className="w-full mt-8 space-y-3 text-left">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-cowry-muted flex-shrink-0">To</span>
                    <span className="text-right min-w-0 truncate font-mono text-xs font-semibold text-white">
                      {shortenAddress(send.toAddress)}
                    </span>
                  </div>
                  {send.sourceTxHash && explorerUrlFor(send.sourceChain, send.sourceTxHash) && (
                    <a
                      href={explorerUrlFor(send.sourceChain, send.sourceTxHash)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-center text-xs text-cowry-green hover:text-cowry-mint font-medium"
                    >
                      View source transaction ({send.sourceChain}) ↗
                    </a>
                  )}
                  {send.destinationTxHash && explorerUrlFor(send.destinationChain, send.destinationTxHash) && (
                    <a
                      href={explorerUrlFor(send.destinationChain, send.destinationTxHash)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-center text-xs text-cowry-green hover:text-cowry-mint font-medium"
                    >
                      View destination transaction ({send.destinationChain}) ↗
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
