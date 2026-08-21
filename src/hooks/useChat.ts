"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { resetSession } from "@/lib/agent";
import {
  sendChatMessage,
  createOfframpSend,
  initiateCryptoWithdrawal,
  initiateCrossChainSend,
  saveRecipient,
  type PublicUser,
  type RemittanceDraft,
  type CryptoWithdrawalDraft,
  type CrossChainSendDraft,
} from "@/lib/backendApi";
import { formatFiat, formatToken } from "@/lib/currency";
import { computeCryptoWithdrawalFeeSplit, computeCrossChainSendFeeSplit } from "@/lib/cryptoWithdrawalFee";
import { sendTransaction, waitForTransaction } from "@/lib/wallet";
import type { Message, ChatResponse, EncodedTxJson } from "@/lib/types";

function newSessionId(): string {
  return `session_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

/** Clear server pending state after this long without a user message. */
const IDLE_RESET_MS = 20 * 60 * 1000;

// Mirrors the backend's DEPOSIT_INTENT_RE + ADDRESS_RE + CHAIN_NAME_RE (ai-agent/chat/intent.ts).
const DEPOSIT_INTENT_RE = /\b(deposit|top ?up|fund my (wallet|account)|add (money|funds|usdc))\b/i;
const ADDRESS_RE = /\b(deposit address|wallet address|my address|my wallet)\b/i;
const CHAIN_NAME_RE = /\b(celo|base|optimism|stellar|solana)\b/i;

export function useChat(user: PublicUser | null, onDepositIntent?: (chain: string | null) => void) {
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [loading,   setLoading]   = useState(false);
  /**
   * txLoading is now only used for the USDC approval step (user still signs that).
   * Payment transactions are executed by the agent — no user signing required.
   */
  const [txLoading, setTxLoading] = useState(false);
  const [pinVerifyOpen, setPinVerifyOpen] = useState(false);
  /** The one remittance quote card that's still actionable — every other one in chat history is stale and shouldn't respond to taps. */
  const [activeSendReference, setActiveSendReference] = useState<string | null>(null);
  /** Set right after a send is submitted — opens the receipt modal, which polls until it settles. */
  const [receiptSendId, setReceiptSendId] = useState<string | null>(null);
  /** Same idea as activeSendReference, for the crypto-withdrawal-to-wallet quote card. */
  const [activeWithdrawalReference, setActiveWithdrawalReference] = useState<string | null>(null);
  /** Set right after a chat-confirmed withdrawal is submitted — opens the withdrawal receipt modal. */
  const [receiptWithdrawalId, setReceiptWithdrawalId] = useState<string | null>(null);
  /** Same idea as activeSendReference, for the cross-chain-send quote card. */
  const [activeCrossChainSendReference, setActiveCrossChainSendReference] = useState<string | null>(null);
  /** Set right after a chat-confirmed cross-chain send is submitted — opens its receipt modal. */
  const [receiptCrossChainSendId, setReceiptCrossChainSendId] = useState<string | null>(null);
  const sessionIdRef = useRef(newSessionId());
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSendRef = useRef<RemittanceDraft | null>(null);
  /**
   * Mirrors pendingSendRef for the crypto-withdrawal-to-wallet flow — the
   * backend session only ever holds one draft type at a time (see
   * sessionRepository.ts's ChatDraftIntent), so a new quote of either kind
   * always clears the other here too.
   */
  const pendingCryptoWithdrawalRef = useRef<CryptoWithdrawalDraft | null>(null);
  /** Mirrors pendingSendRef for the cross-chain-send flow — same one-draft-at-a-time invariant as pendingCryptoWithdrawalRef. */
  const pendingCrossChainSendRef = useRef<CrossChainSendDraft | null>(null);
  /** Set right after a send completes — the next message is read as a nickname (or "skip"), not a normal chat message. */
  const pendingSaveRecipientRef = useRef<{
    institution: string;
    institutionName: string;
    accountIdentifier: string;
    accountName: string;
    fiatCurrency: string;
  } | null>(null);

  const getSessionId = useCallback(() => sessionIdRef.current, []);

  /** Rotate session id and wipe server pending state — no UI changes. */
  const resetSessionState = useCallback(async () => {
    const oldSessionId = sessionIdRef.current;
    sessionIdRef.current = newSessionId();
    pendingSaveRecipientRef.current = null;
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

  /**
   * The chat LLM (backend) handles send-intent parsing, multi-turn
   * slot-filling, and recipient/rate resolution itself now — this just
   * forwards the message and turns a resolved draft into a confirm card.
   */
  const fetchAgentResponse = useCallback(async (text: string, signal?: AbortSignal): Promise<ChatResponse> => {
    const { reply, pendingSend, pendingCryptoWithdrawal, pendingCrossChainSend } = await sendChatMessage(text, signal);
    if (pendingCrossChainSend) {
      pendingSendRef.current = null;
      setActiveSendReference(null);
      pendingCryptoWithdrawalRef.current = null;
      setActiveWithdrawalReference(null);
      pendingCrossChainSendRef.current = pendingCrossChainSend;
      const reference = crypto.randomUUID();
      setActiveCrossChainSendReference(reference);
      // Platform-fee estimate only — the bridge's own destination-amount
      // quote is only ever accurate in the backend's own reply text, never
      // here. Uses the cross-chain-specific fee floor (much smaller than
      // same-chain withdrawal's — see cryptoWithdrawalFee.ts's own
      // comment), never computeCryptoWithdrawalFeeSplit.
      const split = computeCrossChainSendFeeSplit(pendingCrossChainSend.amount);
      const ccAmount = formatToken(pendingCrossChainSend.amount);
      const ccFee = split ? formatToken(split.feeAmount) : "0.00";
      // Built client-side, same as remittance_quote's preview below —
      // deliberately does NOT interpolate the raw backend reply (or the
      // address) into this prose: a 42-char unbroken address mid-sentence
      // overflows a narrow card with no word-break opportunity. The
      // address gets its own dedicated, properly-wrapped "To" field on
      // the card instead.
      const ccPreview = [
        "🌉 Cross-Chain Send",
        `You send: ${ccAmount} ${pendingCrossChainSend.tokenSymbol}`,
        `Route: ${pendingCrossChainSend.sourceChain} → ${pendingCrossChainSend.destinationChain}`,
        `Est. fee: ${ccFee} ${pendingCrossChainSend.tokenSymbol}`,
        "",
        "Reply confirm to send, or cancel to abort.",
      ].join("\n");
      return {
        type: "cross_chain_send_quote",
        preview: ccPreview,
        amount: ccAmount,
        feeAmount: ccFee,
        tokenSymbol: pendingCrossChainSend.tokenSymbol,
        sourceChain: pendingCrossChainSend.sourceChain,
        destinationChain: pendingCrossChainSend.destinationChain,
        toAddress: pendingCrossChainSend.toAddress,
        reference,
      };
    }
    if (pendingCryptoWithdrawal) {
      pendingSendRef.current = null;
      setActiveSendReference(null);
      pendingCrossChainSendRef.current = null;
      setActiveCrossChainSendReference(null);
      pendingCryptoWithdrawalRef.current = pendingCryptoWithdrawal;
      const reference = crypto.randomUUID();
      setActiveWithdrawalReference(reference);
      // No live quote endpoint for withdrawals (unlike off-ramp sends, which
      // lock a real provider order) — mirrors the backend's own fee formula
      // client-side so the card isn't stuck saying "No fee" like before.
      // This should match the backend's own computed fee unless the
      // deployed fee env vars were changed from their defaults (see
      // cryptoWithdrawalFee.ts).
      const split = computeCryptoWithdrawalFeeSplit(pendingCryptoWithdrawal.amount);
      const wAmount = formatToken(pendingCryptoWithdrawal.amount);
      const wFee = split ? formatToken(split.feeAmount) : "0.00";
      const wNet = split ? formatToken(split.netAmount) : wAmount;
      // Built client-side, same as remittance_quote's preview below —
      // deliberately does NOT interpolate the raw backend reply (or the
      // address) into this prose, same overflow reasoning as the
      // cross-chain-send preview above.
      const wPreview = [
        "📤 Wallet Withdrawal",
        `You send: ${wAmount} ${pendingCryptoWithdrawal.tokenSymbol} (${pendingCryptoWithdrawal.chain})`,
        `Fee: ${wFee} ${pendingCryptoWithdrawal.tokenSymbol}`,
        `You'll receive: ${wNet} ${pendingCryptoWithdrawal.tokenSymbol}`,
        "",
        "Reply confirm to send, or cancel to abort.",
      ].join("\n");
      return {
        type: "crypto_withdrawal_quote",
        preview: wPreview,
        amount: wAmount,
        feeAmount: wFee,
        netAmount: wNet,
        tokenSymbol: pendingCryptoWithdrawal.tokenSymbol,
        chain: pendingCryptoWithdrawal.chain,
        toAddress: pendingCryptoWithdrawal.toAddress,
        reference,
      };
    }
    if (pendingSend) {
      pendingCryptoWithdrawalRef.current = null;
      setActiveWithdrawalReference(null);
      pendingCrossChainSendRef.current = null;
      setActiveCrossChainSendReference(null);
      pendingSendRef.current = pendingSend;
      setActiveSendReference(pendingSend.reference);
      const receiveAmount = (parseFloat(pendingSend.netAmount) * parseFloat(pendingSend.rate)).toFixed(2);
      const sendAmount = formatToken(pendingSend.amount);
      const feeAmount = formatToken(pendingSend.feeAmount);
      // Omitted on older backend responses means USDC — see RemittanceDraft.tokenSymbol's own comment.
      const sendToken = (pendingSend.tokenSymbol as "USDC" | "USDT" | undefined) ?? "USDC";
      const last4 = pendingSend.recipient.accountIdentifier.slice(-4);
      const institutionPart = pendingSend.recipient.institutionName
        ? `${pendingSend.recipient.institutionName} ••••${last4}`
        : `••••${last4}`;
      const recipientLabel = `${pendingSend.recipient.accountName} (${institutionPart})`;

      const preview = [
        "🌍 Cross-Border Payment",
        `To: ${recipientLabel}`,
        `They get: ${formatFiat(receiveAmount, pendingSend.fiatCurrency)} ${pendingSend.fiatCurrency}`,
        `You send: ${sendAmount} ${sendToken} (${pendingSend.chain})`,
        `Fee: ${feeAmount} ${sendToken}`,
        `Rate: 1 USD ≈ ${formatFiat(pendingSend.rate, pendingSend.fiatCurrency)} (locked for ~1hr)`,
        "",
        "Reply confirm to send, or cancel to abort.",
      ].join("\n");

      return {
        type: "remittance_quote",
        preview,
        recipientLabel,
        sendAmount,
        sendToken,
        receiveAmount,
        receiveCurrency: pendingSend.fiatCurrency,
        rateLabel: `1 ${sendToken} ≈ ${pendingSend.rate} ${pendingSend.fiatCurrency}`,
        feeLabel: `${feeAmount} ${sendToken}`,
        chain: pendingSend.chain,
        reference: pendingSend.reference,
      };
    }
    return { type: "info", message: reply };
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (loading) return;

      scheduleIdleReset();
      addMessage({ role: "user", text });

      // Deposit/address requests are handled entirely client-side — see
      // DEPOSIT_INTENT_RE/ADDRESS_RE above for why this never reaches /chat.
      if (DEPOSIT_INTENT_RE.test(text) || ADDRESS_RE.test(text)) {
        const chainMatch = text.match(CHAIN_NAME_RE);
        const chain = chainMatch ? chainMatch[1].toLowerCase() : null;
        addMessage({ role: "bot", text: chain ? "Here you go 👇" : "Sure — pick a chain below 👇" });
        onDepositIntent?.(chain);
        return;
      }

      // The previous bot message asked "save this recipient?" — this reply is
      // the nickname (or a skip), not a normal message for the chat backend.
      if (pendingSaveRecipientRef.current) {
        const pending = pendingSaveRecipientRef.current;
        pendingSaveRecipientRef.current = null;
        const trimmed = text.trim();

        if (/^(skip|no|nope|cancel|nah)$/i.test(trimmed)) {
          addMessage({ role: "bot", text: "No problem — not saved." });
          return;
        }

        setLoading(true);
        try {
          await saveRecipient({ nickname: trimmed, ...pending });
          addMessage({
            role: "bot",
            text: `Saved! Next time just say "send $20 to ${trimmed}" and I'll use these details.`,
          });
        } catch (e) {
          addMessage({
            role: "bot",
            text: `⚠️ Couldn't save that recipient: ${e instanceof Error ? e.message : "unknown error"}`,
          });
        } finally {
          setLoading(false);
        }
        return;
      }

      setLoading(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
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
    [loading, addMessage, fetchAgentResponse, appendBotResponse, scheduleIdleReset, resetSessionState, onDepositIntent],
  );

  /** Abort the in-flight request and silently reset server session state. */
  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    void resetSessionState();
  }, [resetSessionState]);

  /** Called when user taps Confirm on the send (or withdrawal) quote card — opens PIN verification. */
  const confirm = useCallback(() => {
    if (!pendingSendRef.current && !pendingCryptoWithdrawalRef.current && !pendingCrossChainSendRef.current) return;
    if (!user?.pinSet) {
      addMessage({
        role: "bot",
        text: "You'll need to set a transaction PIN before sending money. Tap the ⚙️ Settings icon (top right) → Security & Privacy → Set PIN, then come back and try again.",
      });
      return;
    }
    setPinVerifyOpen(true);
  }, [user, addMessage]);

  /** Called when user taps Cancel on the send (or withdrawal) quote card. */
  const cancel = useCallback(() => {
    pendingSendRef.current = null;
    setActiveSendReference(null);
    pendingCryptoWithdrawalRef.current = null;
    setActiveWithdrawalReference(null);
    pendingCrossChainSendRef.current = null;
    setActiveCrossChainSendReference(null);
    addMessage({ role: "bot", text: "Okay, cancelled." });
  }, [addMessage]);

  const closePinVerify = useCallback(() => setPinVerifyOpen(false), []);
  const closeReceipt = useCallback(() => setReceiptSendId(null), []);
  const closeWithdrawalReceipt = useCallback(() => setReceiptWithdrawalId(null), []);
  const closeCrossChainSendReceipt = useCallback(() => setReceiptCrossChainSendId(null), []);

  /**
   * VerifyPinModal already confirmed this PIN is correct before calling this
   * — its job is done and it's about to unmount. Everything from here is the
   * chat interface's responsibility: actually creating the send and
   * reporting whatever happens (success or failure) as a normal chat
   * message, never back in the modal.
   */
  const onPinVerified = useCallback(
    async (pin: string) => {
      setPinVerifyOpen(false);

      const crossChainDraft = pendingCrossChainSendRef.current;
      if (crossChainDraft) {
        setLoading(true);
        try {
          const { send: ccSend } = await initiateCrossChainSend({
            sourceChain: crossChainDraft.sourceChain,
            destinationChain: crossChainDraft.destinationChain,
            amount: crossChainDraft.amount,
            toAddress: crossChainDraft.toAddress,
            pin,
            tokenSymbol: crossChainDraft.tokenSymbol,
          });
          pendingCrossChainSendRef.current = null;
          setActiveCrossChainSendReference(null);
          setReceiptCrossChainSendId(ccSend.id);
          addMessage({
            role: "bot",
            text: `✅ Cross-chain send submitted — ${formatToken(crossChainDraft.amount)} ${crossChainDraft.tokenSymbol} from ${crossChainDraft.sourceChain} to ${crossChainDraft.toAddress} on ${crossChainDraft.destinationChain}.`,
          });
        } catch (e) {
          // The draft stays live (not cleared) so Confirm can be tapped again to retry.
          addMessage({
            role: "bot",
            text: `⚠️ Couldn't complete the cross-chain send: ${e instanceof Error ? e.message : "unknown error"}`,
          });
        } finally {
          setLoading(false);
        }
        return;
      }

      const withdrawalDraft = pendingCryptoWithdrawalRef.current;
      if (withdrawalDraft) {
        setLoading(true);
        try {
          const { withdrawal } = await initiateCryptoWithdrawal({
            chain: withdrawalDraft.chain,
            amount: withdrawalDraft.amount,
            toAddress: withdrawalDraft.toAddress,
            pin,
            tokenSymbol: withdrawalDraft.tokenSymbol,
          });
          pendingCryptoWithdrawalRef.current = null;
          setActiveWithdrawalReference(null);
          setReceiptWithdrawalId(withdrawal.id);
          addMessage({
            role: "bot",
            text: `✅ Withdrawal submitted — ${formatToken(withdrawalDraft.amount)} ${withdrawalDraft.tokenSymbol} to ${withdrawalDraft.toAddress} on ${withdrawalDraft.chain}.`,
          });
        } catch (e) {
          // The draft stays live (not cleared) so Confirm can be tapped again to retry.
          addMessage({
            role: "bot",
            text: `⚠️ Couldn't complete the withdrawal: ${e instanceof Error ? e.message : "unknown error"}`,
          });
        } finally {
          setLoading(false);
        }
        return;
      }

      const draft = pendingSendRef.current;
      if (!draft) return;

      setLoading(true);
      try {
        const result = await createOfframpSend({
          amount: draft.amount,
          fiatCurrency: draft.fiatCurrency,
          recipient: draft.recipient,
          pin,
          rate: draft.rate,
          chain: draft.chain,
          existingOrder: {
            orderId:         draft.orderId,
            receiveAddress:  draft.receiveAddress,
            validUntil:      draft.validUntil,
            rate:            draft.rate,
            reference:       draft.reference,
            feeAmount:       draft.feeAmount,
            treasuryAddress: draft.treasuryAddress,
            provider:        draft.provider,
            tokenSymbol:     draft.tokenSymbol,
          },
        });
        pendingSendRef.current = null;
        setActiveSendReference(null);
        setReceiptSendId(result.send.id);
        const orderId = result.send.id.slice(0, 8);
        addMessage({
          role: "bot",
          text: result.message,
          response: {
            type: "send_success",
            orderId: `Order #${orderId}`,
            // Backend's own wording — deliberately says "processing," not
            // "sent"/"complete," since settlement isn't confirmed at this
            // point (see domain/offramp/service.ts on the backend).
            message: result.message,
          },
        });

        // memo is only set when this recipient is already saved — either
        // resolved via a saved nickname, or a freshly-typed account number
        // the backend recognized as one already on file (see
        // resolveRemittanceIntent's findByAccountIdentifier check). Prompting
        // to save it again would just be noise on every repeat send.
        if (draft.recipient.memo) return;

        pendingSaveRecipientRef.current = {
          institution:       draft.recipient.institution,
          institutionName:   draft.recipient.institutionName ?? draft.recipient.institution,
          accountIdentifier: draft.recipient.accountIdentifier,
          accountName:       draft.recipient.accountName,
          fiatCurrency:      draft.fiatCurrency,
        };
        addMessage({
          role: "bot",
          text:
            `💾 Save ${draft.recipient.accountName}` +
            `${draft.recipient.institutionName ? ` (${draft.recipient.institutionName})` : ""} as a recipient?\n\n` +
            `Reply with a nickname (e.g. "mom"), or say "skip".`,
        });
      } catch (e) {
        // The quote/draft stays live (not cleared) so Confirm can be tapped again to retry.
        addMessage({
          role: "bot",
          text: `⚠️ Couldn't complete the send: ${e instanceof Error ? e.message : "unknown error"}`,
        });
      } finally {
        setLoading(false);
      }
    },
    [addMessage],
  );

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
    (text: string, extra?: Partial<Pick<Message, "depositAddress" | "depositChain" | "depositMultiChain">>) => {
      addMessage({ role: "bot", text, ...extra });
    },
    [addMessage],
  );

  return {
    messages,
    loading,
    txLoading,
    send,
    stop,
    confirm,
    cancel,
    signAndSend,
    addBotMessage,
    bottomRef,
    pinVerifyOpen,
    closePinVerify,
    onPinVerified,
    activeSendReference,
    receiptSendId,
    closeReceipt,
    activeWithdrawalReference,
    receiptWithdrawalId,
    closeWithdrawalReceipt,
    activeCrossChainSendReference,
    receiptCrossChainSendId,
    closeCrossChainSendReceipt,
  };
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
    case "crypto_withdrawal_quote": return r.preview;
    case "cross_chain_send_quote": return r.preview;
    case "send_success":    return r.message;
    default:           return "...";
  }
}
