"use client";

type Props = {
  description?: string;
  amount:       string;
  /** Estimated — see fetchAgentResponse's own comment on why this can't be exact until submit. */
  feeAmount:    string;
  netAmount:    string;
  tokenSymbol:  string;
  chain:        string;
  toAddress:    string;
  /** True once this quote is no longer actionable — already confirmed/cancelled, superseded by a newer quote, or a withdrawal is currently in flight. */
  disabled?:    boolean;
  onConfirm:    () => void;
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
  disabled,
  onConfirm,
  onCancel,
}: Props) {
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

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={onConfirm} disabled={disabled}
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
