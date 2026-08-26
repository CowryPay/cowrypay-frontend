import { supabase } from "./supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export type KycStatus = "unverified" | "pending" | "verified" | "rejected";

export type PublicUser = {
  id: string;
  email: string | null;
  phone: string | null;
  kycStatus: KycStatus;
  pinSet: boolean;
  biometricEnabled: boolean;
  passwordSet: boolean;
  createdAt: string;
};

export type Wallet = {
  id: string;
  userId: string;
  provider: string;
  externalWalletId: string;
  address: string;
  chain: string;
  createdAt: string;
};

async function authedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `${path} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** Idempotent — creates the user + wallet on first call, just returns them after. */
export function ensureBackendAccount(): Promise<{ created: boolean; user: PublicUser; wallet: Wallet }> {
  return authedFetch("/signup", { method: "POST" });
}

/** Records that the mandatory post-signup "set a password" step is done. */
export function confirmPasswordSet(): Promise<{ user: PublicUser }> {
  return authedFetch("/auth/password/confirm", { method: "POST" });
}

/** Balances are tracked per (token, chain) — USDC on one chain isn't spendable on another. */
export type LedgerBalance = {
  id:               string;
  userId:           string;
  tokenSymbol:      string;
  chain:            string;
  availableBalance: string;
  pendingBalance:   string;
  updatedAt:        string;
};

export function getMe(): Promise<{ user: PublicUser; wallet: Wallet; balances: LedgerBalance[] }> {
  return authedFetch("/me");
}

/**
 * Solana deposit address — a dedicated per-user on-chain address, unlike
 * the shared EVM one. Auto-provisioned in the background at signup, but
 * idempotent, so this is a safe on-demand fallback if that hasn't finished
 * yet (or failed).
 */
export function getSolanaWallet(): Promise<{ address: string }> {
  return authedFetch("/wallets/solana");
}

/**
 * Stellar deposit address — shared across every user; `memo` is what
 * actually identifies this user's deposits and MUST be included, or the
 * deposit can't be credited automatically. Provisioned synchronously at
 * signup, but idempotent, so also safe to call on demand.
 */
export function getStellarWallet(): Promise<{ address: string; memo: string }> {
  return authedFetch("/wallets/stellar");
}

/** Deterministic welcome text — call once right after auth. No longer includes an address (see /wallets/* and the chat deposit-chain flow). */
export function getChatWelcome(): Promise<{ reply: string }> {
  return authedFetch("/chat/welcome");
}

export type DepositState =
  | "DEPOSIT_DETECTED"
  | "DEPOSIT_COMPLIANCE_SCREENING"
  | "MANUAL_REVIEW"
  | "BALANCE_CREDITED"
  | "DEPOSIT_HELD"
  | "RETURN_TO_SENDER";

export type Deposit = {
  id:          string;
  tokenSymbol: string;
  amount:      string;
  chain:       string;
  txHash:      string;
  state:       DepositState;
  createdAt:   string;
  updatedAt:   string;
};

/**
 * Recent deposits for the signed-in user, newest first — used to power the
 * notification bell. NOTE: not live on the backend yet as of this writing —
 * only GET /deposits/:id (single lookup) exists there. Needs a small new
 * route added: `GET /deposits` (requireAuth) -> `depositsRepo.getForUser(userId, 20)`,
 * the exact pattern GET /offramp/sends already uses for the analogous send list.
 */
export function getDeposits(): Promise<{ deposits: Deposit[] }> {
  return authedFetch("/deposits");
}

export type SendState =
  | "SEND_INSTRUCTED"
  | "COMPLIANCE_SCREENING"
  | "MANUAL_REVIEW"
  | "SEND_REJECTED"
  | "ORDER_CREATED"
  | "PAYOUT_INITIATED"
  | "SETTLING"
  | "COMPLETE"
  | "FAILED"
  | "REFUNDED";

export type Send = {
  id:             string;
  tokenSymbol:    string;
  chain:          string;
  amountHuman:    string;
  fiatCurrency:   string;
  recipient:      OfframpSendRecipient;
  feeAmount:      string | null;
  withdrawTxHash: string | null;
  state:          SendState;
  createdAt:      string;
  updatedAt:      string;
};

/** Recent off-ramp sends for the signed-in user, newest first — powers Transaction History. */
export function getSends(): Promise<{ sends: Send[] }> {
  return authedFetch("/offramp/sends");
}

export type SendTransition = { toState: SendState; createdAt: string };

/** Single send lookup with its state-transition history — used to poll a send until it settles. */
export function getSend(id: string): Promise<{ send: Send; transitions: SendTransition[] }> {
  return authedFetch(`/offramp/sends/${id}`);
}

export type SendReceipt = {
  reference:           string;
  amountSent:          string;
  feeAmount:            string;
  tokenSymbol:          string;
  chain:                string;
  fiatCurrency:         string;
  fiatAmountReceived:   string | null;
  recipient: {
    accountName:              string;
    accountIdentifierMasked:  string;
    institutionName:          string;
  };
  status:         SendState;
  createdAt:      string;
  completedAt:    string;
  withdrawTxHash: string | null;
};

/** Only available once a send has reached COMPLETE — 400s otherwise. */
export function getSendReceipt(id: string): Promise<{ receipt: SendReceipt }> {
  return authedFetch(`/offramp/sends/${id}/receipt`);
}

export type OfframpSendRecipient = {
  institution:       string;
  /** Human-readable label for `institution` (e.g. "OPay") — the code alone isn't fit to show a user. */
  institutionName?:  string;
  accountIdentifier: string;
  accountName:       string;
  memo?:             string;
};

export type SavedRecipient = {
  id:                      string;
  nickname:                string;
  institutionName:         string;
  accountName:             string;
  /** Last 4 digits only — the backend never returns a saved account number in full. */
  accountIdentifierMasked: string;
  fiatCurrency:            string;
  createdAt:               string;
};

/**
 * Saves a recipient for reuse — once saved, the chat LLM can resolve
 * "send $20 to <nickname>" directly without re-asking for bank/account
 * details. Upserts on nickname, so saving an existing one just updates it.
 */
export function saveRecipient(input: {
  nickname:          string;
  institution:       string;
  institutionName:   string;
  accountIdentifier: string;
  accountName:       string;
  fiatCurrency:      string;
}): Promise<{ recipient: SavedRecipient }> {
  return authedFetch("/recipients", { method: "POST", body: JSON.stringify(input) });
}

/**
 * A fully-resolved send the chat LLM already built: recipient verified, a
 * real Paycrest order created to lock a genuine rate + receive address. Not
 * money-moved yet — the frontend shows this as a confirmation card, collects
 * the PIN, and submits it to createOfframpSend. Chat can only ever propose,
 * never execute (a message alone must never be sufficient to move money).
 */
export type OfframpProvider = "paycrest" | "quidax" | "centiiv";

export type RemittanceDraft = {
  amount:          string;
  feeAmount:       string;
  netAmount:       string;
  treasuryAddress: string;
  fiatCurrency:    string;
  recipient:       OfframpSendRecipient;
  rate:            string;
  reference:       string;
  orderId:         string;
  receiveAddress:  string;
  validUntil:      string;
  /** Which chain this quote (and the eventual payout) is locked to — a wallet can hold balance on more than one. */
  chain:           string;
  /** Which provider actually locked this rate (auto-shopped across every eligible off-ramp provider) — required when reusing this order via createOfframpSend. */
  provider:        OfframpProvider;
  /** Which token this order was actually quoted/created for — omitted defaults to USDC server-side, so this must be forwarded via createOfframpSend's existingOrder, not just displayed. */
  tokenSymbol:     string;
};

/**
 * A withdraw-to-external-wallet request chat has fully resolved (amount,
 * destination address, chain, token all known and balance-checked) but not
 * money-moved yet — the frontend must show the full destination address
 * back to the user (never truncated/buried) for explicit review, collect
 * the PIN, and submit via initiateCryptoWithdrawal itself. Chat only ever
 * proposes this draft, same §9 boundary as RemittanceDraft above.
 */
export type CryptoWithdrawalDraft = {
  amount:      string;
  toAddress:   string;
  chain:       string;
  tokenSymbol: string;
};

/**
 * A "move funds to a different chain" request chat has fully resolved
 * (amount, destination address, source/destination chain, token all known,
 * balance-checked, and a real bridge quote obtained) but not money-moved
 * yet — same §9 boundary as the other two drafts above. Distinct from
 * CryptoWithdrawalDraft: sourceChain and destinationChain genuinely
 * differ here, which is what makes this a bridge instead of a same-chain
 * withdrawal.
 */
export type CrossChainSendDraft = {
  amount:           string;
  toAddress:        string;
  sourceChain:      string;
  destinationChain: string;
  tokenSymbol:      string;
};

/**
 * Real backend chat — deterministic balance/address/help answers, an LLM
 * that parses free-form "send $X to Y" requests into a multi-turn remittance
 * draft (server-persisted between messages), and a Groq/Claude fallback for
 * general conversation. `pendingSend` is present once a send request fully
 * resolves — see RemittanceDraft. `pendingCryptoWithdrawal` is the same idea
 * for a "withdraw to wallet" request — see CryptoWithdrawalDraft.
 * `pendingCrossChainSend` is the same idea for moving funds to a different
 * chain — see CrossChainSendDraft.
 */
export function sendChatMessage(
  message: string,
  signal?: AbortSignal,
): Promise<{
  reply: string;
  pendingSend?: RemittanceDraft;
  pendingCryptoWithdrawal?: CryptoWithdrawalDraft;
  pendingCrossChainSend?: CrossChainSendDraft;
}> {
  return authedFetch("/chat", { method: "POST", body: JSON.stringify({ message }), signal });
}

/**
 * Sets/changes the transaction PIN. Requires a session from a genuinely
 * fresh login (Supabase email-OTP verified in the last 10 min) — the caller
 * must re-verify OTP right before this or the backend 401s with `reauth_required`.
 */
export function setTransactionPin(pin: string): Promise<{ ok: boolean }> {
  return authedFetch("/auth/pin", { method: "POST", body: JSON.stringify({ pin }) });
}

/**
 * Checks whether a PIN is correct, nothing more — same rate limiting as the
 * real send call, but doesn't move any money itself. Used by VerifyPinModal
 * so its job stays scoped to "is this PIN right," with the actual operation
 * (and all its error handling) happening separately once this confirms yes.
 */
export function verifyTransactionPin(pin: string): Promise<{ valid: boolean }> {
  return authedFetch("/auth/pin/verify", { method: "POST", body: JSON.stringify({ pin }) });
}

/**
 * Persists the biometric-unlock preference. Requires a fresh login (same
 * `reauth_required` gate as the PIN) and a PIN already set — the backend
 * treats biometric as supplementary to the PIN, never a replacement for it.
 */
export function setBiometricEnabled(enabled: boolean): Promise<{ ok: boolean }> {
  return authedFetch("/auth/biometric", { method: "POST", body: JSON.stringify({ enabled }) });
}

// ── Off-ramp (crypto → fiat send via Paycrest) ──────────────────────────────

/**
 * Creates the send record and — as of the latest backend — actually
 * broadcasts the payout from the user's custodial wallet. The PIN is
 * verified server-side inside this call (rate-limited: 5 failed attempts
 * locks for 15 min), not pre-checked separately — a message alone can never
 * be enough to move money, only this call with a correct PIN can.
 *
 * When confirming a chat-resolved draft, pass `existingOrder` (the draft's
 * orderId/receiveAddress/rate/etc.) so the already-locked Paycrest order is
 * reused instead of creating a second one.
 */
export function createOfframpSend(input: {
  amount:        string;
  fiatCurrency:  string;
  recipient:     OfframpSendRecipient;
  pin:           string;
  rate?:         string;
  /** Which chain to pay out from — omit to default to the wallet's chain (only matters once a wallet holds balance on more than one). */
  chain?:        string;
  existingOrder?: {
    orderId:         string;
    receiveAddress:  string;
    validUntil:      string;
    rate:            string;
    reference:       string;
    feeAmount:       string;
    treasuryAddress: string;
    /** Which provider actually created this locked order — must match, since each provider uses its own bank-code namespace. */
    provider:        OfframpProvider;
    /** Which token this order was actually locked in — omitting this makes the backend default to USDC regardless of what was quoted (see LockedOrder.tokenSymbol on the backend). */
    tokenSymbol:     string;
  };
}): Promise<{
  send: { id: string; state: string };
  receiveAddress: string;
  validUntil: string;
  /** Friendly "processing" confirmation text — deliberately not "completed," since settlement isn't confirmed yet. */
  message: string;
}> {
  return authedFetch("/offramp/sends", { method: "POST", body: JSON.stringify(input) });
}

// ── Crypto withdrawals (crypto → crypto, to any external address) ──────────

export type CryptoWithdrawalState = "PENDING" | "BROADCAST" | "CONFIRMED" | "FAILED";

export type CryptoWithdrawal = {
  id:                 string;
  userId:             string;
  walletId:           string;
  tokenSymbol:        string;
  chain:              string;
  amountHuman:        string;
  toAddress:          string;
  provider:           string;
  reference:          string;
  withdrawTxHash:     string | null;
  withdrawConfirmedAt: string | null;
  state:              CryptoWithdrawalState;
  createdAt:          string;
  updatedAt:          string;
};

export type CryptoWithdrawalTransition = {
  toState:   CryptoWithdrawalState;
  createdAt: string;
};

/**
 * Direct on-chain withdrawal to a user-supplied address — no fiat, a 0.3%
 * platform fee. Chat can build a draft (see CryptoWithdrawalDraft) but never
 * calls this itself — a wrong destination address here is unrecoverable
 * money loss, so this always requires the app to show the user the full
 * address and collect a fresh PIN first. The PIN is verified server-side
 * inside this call, same as createOfframpSend.
 */
export function initiateCryptoWithdrawal(input: {
  chain:       string;
  amount:      string;
  toAddress:   string;
  pin:         string;
  /** Omit for USDC — only Celo and Solana support anything else right now. */
  tokenSymbol?: string;
}): Promise<{ withdrawal: CryptoWithdrawal }> {
  return authedFetch("/crypto-withdrawals", { method: "POST", body: JSON.stringify(input) });
}

/** Single crypto withdrawal lookup with its state-transition history. */
export function getCryptoWithdrawal(
  id: string,
): Promise<{ withdrawal: CryptoWithdrawal; transitions: CryptoWithdrawalTransition[] }> {
  return authedFetch(`/crypto-withdrawals/${id}`);
}

/** Recent crypto withdrawals for the signed-in user, newest first — powers Transaction History. */
export function getCryptoWithdrawals(): Promise<{ withdrawals: CryptoWithdrawal[] }> {
  return authedFetch("/crypto-withdrawals");
}

// ── Cross-chain send (crypto → crypto, bridged to a different chain) ───────

/**
 * Richer lifecycle than a same-chain CryptoWithdrawal — real funds are, for
 * a genuine window, in flight on a bridge with no synchronous fallback if
 * the destination leg fails. STUCK means the source-chain burn/lock
 * already confirmed (real, final, on-chain) but the destination leg
 * didn't complete — NOT auto-refunded, needs manual resolution; treat it
 * as distinct from FAILED (which failed before the source leg confirmed,
 * and is safe to auto-refund) when showing this to a user.
 */
export type CrossChainSendState =
  | "PENDING"
  | "SOURCE_BROADCAST"
  | "SOURCE_CONFIRMED"
  | "BRIDGING"
  | "DESTINATION_BROADCAST"
  | "COMPLETE"
  | "FAILED"
  | "STUCK"
  | "REFUNDED";

export type CrossChainSend = {
  id:                     string;
  tokenSymbol:            string;
  sourceChain:            string;
  destinationChain:       string;
  amountHuman:            string;
  feeAmount:              string;
  netAmount:              string;
  toAddress:              string;
  reference:              string;
  sourceTxHash:           string | null;
  destinationTxHash:      string | null;
  sourceConfirmedAt:      string | null;
  destinationConfirmedAt: string | null;
  state:                  CrossChainSendState;
  createdAt:              string;
  updatedAt:              string;
};

export type CrossChainSendTransition = {
  toState:   CrossChainSendState;
  createdAt: string;
};

/**
 * Bridges a balance from one chain to a different one, to any address —
 * CCTP for Base/Optimism/Solana pairs, LI.FI for anything touching Celo.
 * Chat can build a draft (see CrossChainSendDraft) but never calls this
 * itself, same §9 boundary as initiateCryptoWithdrawal. The PIN is
 * verified server-side inside this call.
 */
export function initiateCrossChainSend(input: {
  sourceChain:      string;
  destinationChain: string;
  amount:           string;
  toAddress:        string;
  pin:              string;
  /** Omit for USDC. */
  tokenSymbol?:     string;
}): Promise<{ send: CrossChainSend }> {
  return authedFetch("/cross-chain-sends", { method: "POST", body: JSON.stringify(input) });
}

/** Single cross-chain send lookup with its state-transition history — used to poll one until it settles. */
export function getCrossChainSend(
  id: string,
): Promise<{ send: CrossChainSend; transitions: CrossChainSendTransition[] }> {
  return authedFetch(`/cross-chain-sends/${id}`);
}

/** Recent cross-chain sends for the signed-in user, newest first — powers Transaction History. */
export function getCrossChainSends(): Promise<{ sends: CrossChainSend[] }> {
  return authedFetch("/cross-chain-sends");
}
