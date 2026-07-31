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

export function getMe(): Promise<{ user: PublicUser; wallet: Wallet; balances: unknown[] }> {
  return authedFetch("/me");
}

/** Deterministic welcome text (greeting + deposit address) — call once right after auth. */
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

export type OfframpSendRecipient = {
  institution:       string;
  /** Human-readable label for `institution` (e.g. "OPay") — the code alone isn't fit to show a user. */
  institutionName?:  string;
  accountIdentifier: string;
  accountName:       string;
  memo?:             string;
};

/**
 * A fully-resolved send the chat LLM already built: recipient verified, a
 * real Paycrest order created to lock a genuine rate + receive address. Not
 * money-moved yet — the frontend shows this as a confirmation card, collects
 * the PIN, and submits it to createOfframpSend. Chat can only ever propose,
 * never execute (a message alone must never be sufficient to move money).
 */
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
};

/**
 * Real backend chat — deterministic balance/address/help answers, an LLM
 * that parses free-form "send $X to Y" requests into a multi-turn remittance
 * draft (server-persisted between messages), and a Groq/Claude fallback for
 * general conversation. `pendingSend` is present once a send request fully
 * resolves — see RemittanceDraft.
 */
export function sendChatMessage(
  message: string,
  signal?: AbortSignal,
): Promise<{ reply: string; pendingSend?: RemittanceDraft }> {
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
  existingOrder?: {
    orderId:         string;
    receiveAddress:  string;
    validUntil:      string;
    rate:            string;
    reference:       string;
    feeAmount:       string;
    treasuryAddress: string;
  };
}): Promise<{ send: { id: string; state: string }; receiveAddress: string; validUntil: string }> {
  return authedFetch("/offramp/sends", { method: "POST", body: JSON.stringify(input) });
}
