/**
 * Mirrors the backend's computeCryptoWithdrawalFeeSplit (domain/offramp/fee.ts)
 * exactly — 0.3% of the amount with a 0.1 token minimum floor. There's no
 * live quote endpoint for crypto withdrawals (unlike off-ramp sends, which
 * lock a real provider order up front), so this is the only way to show the
 * fee before the user submits. If the backend's fee env vars
 * (CRYPTO_WITHDRAWAL_FEE_BPS / CRYPTO_WITHDRAWAL_MIN_FEE_USD) ever change
 * from their defaults, update these two constants to match.
 */
const FEE_BPS = 30;
const MIN_FEE = 0.1;

export type CryptoWithdrawalFeeSplit = { feeAmount: string; netAmount: string };

/** Returns null when the amount can't even cover the minimum fee — same stance as the backend. */
export function computeCryptoWithdrawalFeeSplit(amount: string): CryptoWithdrawalFeeSplit | null {
  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) return null;
  const pctFee = Math.round(amountNum * FEE_BPS) / 10_000;
  const feeAmount = Math.max(pctFee, MIN_FEE);
  if (feeAmount >= amountNum) return null;
  const netAmount = Math.round((amountNum - feeAmount) * 1_000_000) / 1_000_000;
  return { feeAmount: String(feeAmount), netAmount: String(netAmount) };
}
