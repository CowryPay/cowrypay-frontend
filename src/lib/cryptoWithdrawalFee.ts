/**
 * Mirrors the backend's fee-split functions (domain/offramp/fee.ts) exactly
 * — same 0.3% rate for both flows, but two DIFFERENT minimum-fee floors.
 * There's no live quote endpoint for either flow (unlike off-ramp sends,
 * which lock a real provider order up front), so this is the only way to
 * show a fee before the user submits. If the backend's fee env vars ever
 * change from their defaults, update the constants below to match.
 */
const FEE_BPS = 30;
// CRYPTO_WITHDRAWAL_MIN_FEE_USD — same-chain withdrawal.
const WITHDRAWAL_MIN_FEE = 0.1;
// CROSS_CHAIN_SEND_MIN_FEE_USD — deliberately much smaller than the
// withdrawal floor above (verified against real LI.FI quotes on the
// backend): a flat $0.1 floor was what made a $2 cross-chain send look
// expensive, not the bridge's real ~2.2% cost. Never reuse the withdrawal
// constant here — the two are intentionally decoupled server-side so this
// flow's affordability can be tuned independently.
const CROSS_CHAIN_SEND_MIN_FEE = 0.02;

export type CryptoWithdrawalFeeSplit = { feeAmount: string; netAmount: string };

function computeFeeSplitWithFloor(amount: string, minFee: number): CryptoWithdrawalFeeSplit | null {
  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) return null;
  const pctFee = Math.round(amountNum * FEE_BPS) / 10_000;
  const feeAmount = Math.max(pctFee, minFee);
  if (feeAmount >= amountNum) return null;
  const netAmount = Math.round((amountNum - feeAmount) * 1_000_000) / 1_000_000;
  return { feeAmount: String(feeAmount), netAmount: String(netAmount) };
}

/** Returns null when the amount can't even cover the minimum fee — same stance as the backend. */
export function computeCryptoWithdrawalFeeSplit(amount: string): CryptoWithdrawalFeeSplit | null {
  return computeFeeSplitWithFloor(amount, WITHDRAWAL_MIN_FEE);
}

/** Same rate as a same-chain withdrawal, but cross-chain send's own, much smaller minimum-fee floor. */
export function computeCrossChainSendFeeSplit(amount: string): CryptoWithdrawalFeeSplit | null {
  return computeFeeSplitWithFloor(amount, CROSS_CHAIN_SEND_MIN_FEE);
}
