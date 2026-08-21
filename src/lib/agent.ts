import type { ChatResponse } from "./types";

function base(): string {
  // In production/staging: set NEXT_PUBLIC_AGENT_URL to the hosted agent URL.
  // In local dev: /api → Next.js proxies /api/* to the agent service on 3001.
  return process.env.NEXT_PUBLIC_AGENT_URL ?? "/api";
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `${path} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${base()}${path}`);
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return res.json() as Promise<T>;
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export function chat(
  message:       string,
  walletAddress: string,
  sessionId:     string,
  signal?:       AbortSignal,
): Promise<ChatResponse> {
  return post("/chat", { message, walletAddress, sessionId }, signal);
}

/** Clear server-side pending state for a chat session (drafts, remittance flow, etc.). */
export function resetSession(sessionId: string): Promise<{ ok: boolean }> {
  return post("/session/reset", { sessionId });
}

// ── Voice notes (speech → text) ─────────────────────────────────────────────

export async function transcribeAudio(blob: Blob, signal?: AbortSignal): Promise<string> {
  const form = new FormData();
  form.set("audio", blob, "voice-note.webm");

  const res = await fetch(`${base()}/transcribe`, { method: "POST", body: form, signal });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Transcription failed (${res.status})`);
  }
  const data = await res.json() as { text?: string };
  return data.text ?? "";
}

// ── Tx status ─────────────────────────────────────────────────────────────────

export function getTxStatus(txHash: string) {
  return get<{ status: string; message: string }>(`/tx/${txHash}`);
}
