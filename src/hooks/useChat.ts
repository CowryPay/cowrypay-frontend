"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { resetSession } from "@/lib/agent";
import {
  sendChatMessage,
  getOfframpInstitutions,
  verifyOfframpRecipient,
  getOfframpRate,
  createOfframpSend,
  type PublicUser,
  type Wallet,
  type Institution,
} from "@/lib/backendApi";
import { resolveCountry, findCountryInText, SUPPORTED_COUNTRIES, type CountryInfo } from "@/lib/countries";
import { sendTransaction, waitForTransaction } from "@/lib/wallet";
import type { Message, ChatResponse, EncodedTxJson } from "@/lib/types";

function newSessionId(): string {
  return `session_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

/** Clear server pending state after this long without a user message. */
const IDLE_RESET_MS = 20 * 60 * 1000;

// ── Send-flow (off-ramp) intent detection ───────────────────────────────────

const SEND_RE = /\bsend\b/i;
const AMOUNT_RE = /\$?\s?(\d+(?:\.\d+)?)/;
const CANCEL_RE = /^(cancel|stop|never ?mind|nvm)$/i;

type PendingSend =
  | { step: "need_country"; amount: string }
  | { step: "need_institution"; amount: string; country: CountryInfo; institutions: Institution[] }
  | { step: "need_account"; amount: string; country: CountryInfo; institution: Institution }
  | {
      step: "need_confirm";
      amount: string;
      country: CountryInfo;
      institution: Institution;
      accountIdentifier: string;
      accountName: string;
      rate: string;
    };

/** PIN-only gate for now — KYC isn't required client-side yet. */
function sendGateMessage(user: PublicUser | null): string | null {
  if (!user) return "You'll need to be signed in to send money.";
  if (!user.pinSet) {
    return "You'll need to set a transaction PIN before sending money — that's coming soon. In the meantime, ask me about your balance or deposit address.";
  }
  return null;
}

function matchInstitutions(query: string, institutions: Institution[]): Institution[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const exact = institutions.filter((i) => i.name.toLowerCase() === q);
  if (exact.length) return exact;
  return institutions.filter((i) => i.name.toLowerCase().includes(q));
}

function formatInstitutionList(institutions: Institution[]): string {
  return institutions.map((inst, i) => `${i + 1}. ${inst.name}`).join("\n");
}

export function useChat(user: PublicUser | null, wallet: Wallet | null) {
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [loading,   setLoading]   = useState(false);
  /**
   * txLoading is now only used for the USDC approval step (user still signs that).
   * Payment transactions are executed by the agent — no user signing required.
   */
  const [txLoading, setTxLoading] = useState(false);
  const sessionIdRef = useRef(newSessionId());
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSendRef = useRef<PendingSend | null>(null);

  const getSessionId = useCallback(() => sessionIdRef.current, []);

  /** Rotate session id and wipe server pending state — no UI changes. */
  const resetSessionState = useCallback(async () => {
    const oldSessionId = sessionIdRef.current;
    sessionIdRef.current = newSessionId();
    try {
      await resetSession(oldSessionId);
    } catch {
      // Stale Redis state expires within 24h.
    }
  }, []);

  const scheduleIdleReset = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      void resetSessionState();
    }, IDLE_RESET_MS);
  }, [resetSessionState]);

  useEffect(() => {
    scheduleIdleReset();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [scheduleIdleReset]);

  const addMessage = useCallback((msg: Omit<Message, "id" | "timestamp">) => {
    const full: Message = { ...msg, id: crypto.randomUUID(), timestamp: new Date() };
    setMessages((prev) => [...prev, full]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    return full;
  }, []);

  const appendBotResponse = useCallback((response: ChatResponse) => {
    const botText = responseToText(response);
    addMessage({ role: "bot", text: botText, response });
  }, [addMessage]);

  /** Moves the flow forward once amount + (optionally) country are known. */
  const advanceSendFlow = useCallback(
    async (amount: string, country: CountryInfo | null) => {
      if (!country) {
        pendingSendRef.current = { step: "need_country", amount };
        addMessage({ role: "bot", text: `Which country? I support ${SUPPORTED_COUNTRIES.join(", ")}.` });
        return;
      }
      try {
        const { institutions } = await getOfframpInstitutions(country.currencyCode);
        if (institutions.length === 0) {
          pendingSendRef.current = null;
          addMessage({ role: "bot", text: `Sorry, I don't have any providers set up for ${country.name} yet.` });
          return;
        }
        pendingSendRef.current = { step: "need_institution", amount, country, institutions };
        addMessage({
          role: "bot",
          text: `Sending $${amount} to ${country.name}. Which bank or mobile money provider?\n\n${formatInstitutionList(institutions)}`,
        });
      } catch (e) {
        pendingSendRef.current = null;
        addMessage({
          role: "bot",
          text: `⚠️ Couldn't look up providers for ${country.name}: ${e instanceof Error ? e.message : "unknown error"}`,
        });
      }
    },
    [addMessage],
  );

  /**
   * Client-orchestrated off-ramp send flow — the real backend's chat intent
   * classifier doesn't know about "send" yet, so this lives entirely here.
   * Returns true if this message was consumed by the flow (don't forward to
   * the backend chat endpoint), false if it's unrelated free-form chat.
   */
  const tryHandleSendFlow = useCallback(
    async (text: string): Promise<boolean> => {
      const pending = pendingSendRef.current;

      if (pending && CANCEL_RE.test(text.trim())) {
        pendingSendRef.current = null;
        addMessage({ role: "bot", text: "Okay, cancelled." });
        return true;
      }

      if (!pending) {
        if (!SEND_RE.test(text) || !AMOUNT_RE.test(text)) return false;

        const gateMessage = sendGateMessage(user);
        if (gateMessage) {
          addMessage({ role: "bot", text: gateMessage });
          return true;
        }
        if (!wallet) {
          addMessage({ role: "bot", text: "I couldn't find your wallet — try refreshing the app." });
          return true;
        }

        const amount = AMOUNT_RE.exec(text)![1]!;
        await advanceSendFlow(amount, findCountryInText(text));
        return true;
      }

      switch (pending.step) {
        case "need_country": {
          const country = findCountryInText(text) ?? resolveCountry(text);
          if (!country) {
            addMessage({ role: "bot", text: `Which country? I support ${SUPPORTED_COUNTRIES.join(", ")}.` });
            return true;
          }
          await advanceSendFlow(pending.amount, country);
          return true;
        }

        case "need_institution": {
          const numeric = Number(text.trim());
          const byNumber =
            Number.isInteger(numeric) && numeric >= 1 && numeric <= pending.institutions.length
              ? [pending.institutions[numeric - 1]!]
              : [];
          const chosen = byNumber.length ? byNumber : matchInstitutions(text, pending.institutions);

          if (chosen.length !== 1) {
            addMessage({
              role: "bot",
              text:
                chosen.length === 0
                  ? `I didn't recognize that. Reply with a number from the list, or the provider's name:\n\n${formatInstitutionList(pending.institutions)}`
                  : `That matches more than one provider — could you be more specific?\n\n${formatInstitutionList(pending.institutions)}`,
            });
            return true;
          }

          pendingSendRef.current = {
            step: "need_account",
            amount: pending.amount,
            country: pending.country,
            institution: chosen[0]!,
          };
          addMessage({ role: "bot", text: `Got it — ${chosen[0]!.name}. What's the account number?` });
          return true;
        }

        case "need_account": {
          const accountIdentifier = text.trim();
          if (!/^\d{4,}$/.test(accountIdentifier)) {
            addMessage({ role: "bot", text: "That doesn't look like an account number — could you send it again?" });
            return true;
          }
          try {
            const { accountName } = await verifyOfframpRecipient({
              institution: pending.institution.code,
              accountIdentifier,
            });
            const { rate } = await getOfframpRate({
              network:      wallet!.chain,
              token:        "USDC",
              amount:       pending.amount,
              fiatCurrency: pending.country.currencyCode,
            });
            pendingSendRef.current = {
              step: "need_confirm",
              amount: pending.amount,
              country: pending.country,
              institution: pending.institution,
              accountIdentifier,
              accountName,
              rate,
            };
            const receiveAmount = (parseFloat(pending.amount) * parseFloat(rate)).toFixed(2);
            addMessage({
              role: "bot",
              text: "Confirm this transfer:",
              response: {
                type: "remittance_quote",
                preview: "Confirm this transfer",
                recipientLabel: `${accountName} — ${pending.institution.name}`,
                sendAmount: pending.amount,
                sendToken: "USDC",
                receiveAmount,
                receiveCurrency: pending.country.currencyCode,
                rateLabel: `1 USDC ≈ ${rate} ${pending.country.currencyCode}`,
                feeLabel: "",
              },
            });
          } catch (e) {
            pendingSendRef.current = null;
            addMessage({
              role: "bot",
              text: `⚠️ Couldn't verify that account: ${e instanceof Error ? e.message : "unknown error"}. Let's start over — who would you like to send to?`,
            });
          }
          return true;
        }

        case "need_confirm": {
          addMessage({ role: "bot", text: `Tap Confirm or Cancel on the card above, or type "cancel" to stop.` });
          return true;
        }
      }
    },
    [addMessage, user, wallet, advanceSendFlow],
  );

  const fetchAgentResponse = useCallback(async (text: string, signal?: AbortSignal): Promise<ChatResponse> => {
    const { reply } = await sendChatMessage(text, signal);
    return { type: "info", message: reply };
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (loading) return;

      scheduleIdleReset();
      addMessage({ role: "user", text });
      setLoading(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const handledBySendFlow = await tryHandleSendFlow(text);
        if (handledBySendFlow) return;

        const response = await fetchAgentResponse(text, controller.signal);

        // ── Agent already sent the tx on-chain ─────────────────────────────
        // No signing needed — just show the success message with the explorer link.
        if (response.type === "tx_sent") {
          addMessage({
            role: "bot",
            text: "✅ Payment sent by Cowry AI agent!",
            response,
          });
          void resetSessionState();
          return;
        }

        appendBotResponse(response);

        if (response.type === "cancelled") {
          void resetSessionState();
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          return;
        }
        addMessage({
          role: "bot",
          text: `⚠️ ${e instanceof Error ? e.message : "Something went wrong"}`,
        });
      } finally {
        abortControllerRef.current = null;
        setLoading(false);
      }
    },
    [loading, addMessage, fetchAgentResponse, appendBotResponse, scheduleIdleReset, resetSessionState, tryHandleSendFlow],
  );

  /** Abort the in-flight request and silently reset server session state. */
  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    void resetSessionState();
  }, [resetSessionState]);

  /** Called when user taps Confirm on the send quote card. */
  const confirm = useCallback(async () => {
    const pending = pendingSendRef.current;
    if (!pending || pending.step !== "need_confirm") return;

    setLoading(true);
    try {
      const result = await createOfframpSend({
        amount: pending.amount,
        fiatCurrency: pending.country.currencyCode,
        recipient: {
          institution: pending.institution.code,
          accountIdentifier: pending.accountIdentifier,
          accountName: pending.accountName,
        },
        rate: pending.rate,
      });
      pendingSendRef.current = null;
      addMessage({
        role: "bot",
        text:
          `✅ Send created — order #${result.send.id.slice(0, 8)}.\n\n` +
          `I've locked in the rate and opened the transfer with our payments partner. Completing the payout ` +
          `is still being finalized on our end, so it won't move automatically yet — I'll update you here once it does.`,
      });
    } catch (e) {
      addMessage({ role: "bot", text: `⚠️ Couldn't create the send: ${e instanceof Error ? e.message : "unknown error"}` });
    } finally {
      setLoading(false);
    }
  }, [addMessage]);

  /** Called when user taps Cancel on the send quote card. */
  const cancel = useCallback(() => {
    pendingSendRef.current = null;
    addMessage({ role: "bot", text: "Okay, cancelled." });
  }, [addMessage]);

  /**
   * After user approves USDC (user-signed), re-confirm so the agent can execute.
   * The approval is the ONLY tx the user ever signs.
   */
  async function continuePendingDraftAfterApproval() {
    addMessage({
      role: "bot",
      text: "✅ Approval confirmed. Cowry AI is executing your payment now…",
    });

    try {
      const response = await fetchAgentResponse("confirm");

      if (response.type === "tx_sent") {
        addMessage({
          role: "bot",
          text: `✅ Payment sent by Cowry AI agent!\n\n[View on CeloScan](${response.explorerUrl})`,
          response,
        });
        return;
      }

      // Fallback: agent not configured, user must sign manually
      if (response.type === "tx_ready") {
        await executeUserTransactions(response.tx.transactions, response.tx.token.symbol);
        return;
      }

      appendBotResponse(response);
    } catch (e) {
      addMessage({
        role: "bot",
        text:
          `⚠️ Approval succeeded, but the payment couldn't execute automatically: ` +
          `${e instanceof Error ? e.message : String(e)}.\n\nTap Confirm again to retry.`,
      });
    }
  }

  /**
   * Fallback: execute transactions from the USER's wallet.
   * Only used when AGENT_PRIVATE_KEY is not set on the server
   * or agent execution fails. Normal path is agent-executed.
   */
  async function executeUserTransactions(
    transactions: EncodedTxJson[],
    tokenSymbol: string,
    options?: { continuePendingDraft?: boolean },
  ) {
    const hashes: string[] = [];
    for (const tx of transactions) {
      const hash = await sendTransaction(tx);
      hashes.push(hash);
      if (options?.continuePendingDraft) {
        await waitForTransaction(hash);
      }
    }

    if (options?.continuePendingDraft) {
      await continuePendingDraftAfterApproval();
      return;
    }

    const links = hashes
      .map((h) => `[View tx](https://celoscan.io/tx/${h})`)
      .join("\n");
    addMessage({
      role: "bot",
      text: `✅ Payment sent in ${tokenSymbol}.\n\n${links}`,
    });
  }

  /**
   * Used only for USDC approval transactions (still signed by user's wallet).
   * Payment transactions are now handled by the agent — this is not called for those.
   */
  const signAndSend = useCallback(
    async (
      transactions: EncodedTxJson[],
      tokenSymbol: string,
      options?: { continuePendingDraft?: boolean },
    ) => {
      setTxLoading(true);
      try {
        await executeUserTransactions(transactions, tokenSymbol, options);
      } catch (e) {
        addMessage({
          role: "bot",
          text: `❌ Transaction failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      } finally {
        setTxLoading(false);
      }
    },
    [addMessage, executeUserTransactions],
  );

  const addBotMessage = useCallback(
    (text: string, extra?: Partial<Pick<Message, "depositAddress" | "depositChain">>) => {
      addMessage({ role: "bot", text, ...extra });
    },
    [addMessage],
  );

  return { messages, loading, txLoading, send, stop, confirm, cancel, signAndSend, addBotMessage, bottomRef };
}

function responseToText(r: ChatResponse): string {
  switch (r.type) {
    case "clarify":    return r.question;
    case "info":       return r.message;
    case "cancelled":  return r.message;
    case "draft":      return r.preview;
    case "tx_ready":   return r.preview;
    case "tx_sent":    return "✅ Payment sent by Cowry AI agent!";
    case "tx_history": return `Here are your last ${r.items.length} transaction${r.items.length === 1 ? "" : "s"}:`;
    case "remittance_quote": return r.preview;
    default:           return "...";
  }
}
