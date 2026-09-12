"use client";
import { useState } from "react";

type Props = {
  description?: string;
  amount:       string;
  /** Estimated — see fetchAgentResponse's own comment on why this can't be exact until submit. */
  feeAmount:    string;
  netAmount:    string;
  tokenSymbol:  string;
  chain:        string;
  toAddress:    string;
  /** Stellar-only, optional, non-blocking — may already be set from a chat-parsed draft, editable here either way before confirming. */
  memo?:        string;
  /** True once this quote is no longer actionable — already confirmed/cancelled, superseded by a newer quote, or a withdrawal is currently in flight. */
  disabled?:    boolean;
  /** Passed the current memo field value (or undefined if the field is hidden/empty) at the moment Confirm is tapped. */
  onConfirm:    (memo?: string) => void;
  onCancel:     () => void;
};

export function CryptoWithdrawalQuoteCard({
  description,
  amount,
  feeAmount,
  netAmount,
  tokenSymbol,
  chain,
  toAddress,
  memo,
  disabled,
  onConfirm,
  onCancel,
}: Props) {
  // Memo is meaningful on Stellar only (see the field's own note below) —
  // seeded from whatever chat already parsed out of the user's message,
  // still editable here since chat may have missed it or gotten it wrong.
  const [memoInput, setMemoInput] = useState(memo ?? "");
  const isStellar = chain.toLowerCase() === "stellar";

  return (
    <div className="w-full bg-cowry-dark border border-cowry-border rounded-2xl px-5 py-5">

      {description && (
        <p className="text-sm text-white whitespace-pre-wrap break-words leading-relaxed mb-5">{description}</p>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <span className="text-sm font-semibold uppercase tracking-wide text-white">
          Confirm Withdrawal
        </span>
        <span className="text-[11px] font-medium text-cowry-green bg-cowry-green/10 border border-cowry-green/40 rounded-full px-3 py-1">
          Draft
        </span>
      </div>

      {/* You send / Network */}
      <div className="flex justify-between gap-4 mb-5">
        <div>
          <p className="text-xs text-cowry-muted mb-1">You send</p>
          <p className="text-lg font-bold text-white">{amount} {tokenSymbol}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-cowry-muted mb-1">Network</p>
          <p className="text-lg font-bold text-white capitalize">{chain}</p>
        </div>
      </div>

      {/* Fee / net — estimated client-side (0.3%, 0.1 min); the exact fee locks in on submit */}
      <div className="flex justify-between gap-4 mb-5">
        <div>
          <p className="text-xs text-cowry-muted mb-1">Est. fee</p>
          <p className="text-sm font-semibold text-white">{feeAmount} {tokenSymbol}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-cowry-muted mb-1">They&apos;ll receive</p>
          <p className="text-sm font-semibold text-white">{netAmount} {tokenSymbol}</p>
        </div>
      </div>

      {/* Destination — shown in full, never truncated */}
      <div className="mb-6">
        <p className="text-xs text-cowry-muted mb-1">To</p>
        <p className="text-sm font-semibold text-white font-mono break-all">{toAddress}</p>
        <p className="text-[10px] text-amber-400 mt-1">⚠️ Double-check this address — crypto sent to the wrong one can&apos;t be recovered.</p>
      </div>

      {/* Memo — Stellar-only, optional, non-blocking (an exchange/platform deposit address often needs one to actually credit the deposit; a personal wallet usually doesn't). */}
      {isStellar && (
        <div className="mb-6">
          <label className="text-xs text-cowry-muted mb-1 block">Memo (optional)</label>
          <input
            type="text"
            inputMode="numeric"
            value={memoInput}
            onChange={(e) => setMemoInput(e.target.value)}
            disabled={disabled}
            placeholder="e.g. 12345"
            className="w-full bg-cowry-card border border-cowry-border rounded-xl px-3 py-2 text-sm text-white font-mono outline-none focus:border-cowry-green/50 disabled:opacity-50"
          />
          {!memoInput.trim() && (
            <p className="text-[10px] text-cowry-muted mt-1">
              If this is an exchange or platform deposit address, it likely needs a memo — leave blank for a personal wallet.
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={() => onConfirm(isStellar ? memoInput.trim() : undefined)} disabled={disabled}
          className="flex-1 bg-cowry-green text-black text-sm font-bold py-3 rounded-full active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100">
          Confirm
        </button>
        <button onClick={onCancel} disabled={disabled}
          className="flex-1 bg-transparent border border-cowry-green/60 text-white text-sm font-semibold py-3 rounded-full hover:border-cowry-green transition-all disabled:opacity-40 disabled:cursor-not-allowed">
          Cancel
        </button>
      </div>
    </div>
  );
}
