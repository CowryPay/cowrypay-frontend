import { isAddress } from "viem";

const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const STELLAR_RE = /^G[A-Z2-7]{55}$/;

/**
 * Format-only sanity check, mirrors the backend's per-chain rule
 * (backend/src/domain/cryptoWithdrawals/addressValidation.ts) so a
 * malformed address is caught before the PIN step, not after. The backend
 * still re-validates authoritatively — this is just a friendlier UI gate.
 */
export function isValidAddressForChain(chain: string, address: string): boolean {
  const c = chain.toLowerCase();
  if (c === "celo" || c === "base" || c === "optimism") return isAddress(address);
  if (c === "solana") return SOLANA_RE.test(address);
  if (c === "stellar") return STELLAR_RE.test(address);
  return false;
}
