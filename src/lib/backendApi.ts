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

/** Unauthenticated — for the couple of off-ramp endpoints Paycrest itself exposes publicly. */
async function publicFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
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

/**
 * Real backend chat — deterministic balance/address/help answers plus a
 * no-tools Groq fallback for everything else. Can't execute payments yet.
 */
export function sendChatMessage(message: string, signal?: AbortSignal): Promise<{ reply: string }> {
  return authedFetch("/chat", { method: "POST", body: JSON.stringify({ message }), signal });
}

// ── Off-ramp (crypto → fiat send via Paycrest) ──────────────────────────────

export type Institution = { name: string; code: string; type: string };

/** Public — no auth required. */
export function getOfframpRate(params: {
  network:      string;
  token:        string;
  amount:       string;
  fiatCurrency: string;
}): Promise<{ rate: string }> {
  const query = new URLSearchParams(params).toString();
  return publicFetch(`/offramp/rate?${query}`);
}

/** Public — no auth required. */
export function getOfframpInstitutions(currencyCode: string): Promise<{ institutions: Institution[] }> {
  return publicFetch(`/offramp/institutions/${currencyCode}`);
}

export function verifyOfframpRecipient(recipient: {
  institution:       string;
  accountIdentifier: string;
}): Promise<{ accountName: string }> {
  return authedFetch("/offramp/verify-recipient", { method: "POST", body: JSON.stringify(recipient) });
}

export type OfframpSendRecipient = {
  institution:       string;
  accountIdentifier: string;
  accountName:       string;
  memo?:             string;
};

/** MVP: creates the Paycrest order. Doesn't move funds yet — see the caveat in domain/offramp/service.ts. */
export function createOfframpSend(input: {
  amount:       string;
  fiatCurrency: string;
  recipient:    OfframpSendRecipient;
  rate?:        string;
}): Promise<{ send: { id: string; state: string }; receiveAddress: string; validUntil: string }> {
  return authedFetch("/offramp/sends", { method: "POST", body: JSON.stringify(input) });
}
