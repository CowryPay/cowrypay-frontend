"use client";
import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link  from "next/link";
import { useRouter }          from "next/navigation";
import { useAuth }            from "@/hooks/useAuth";
import { getChatWelcome }     from "@/lib/backendApi";
import { useChat }            from "@/hooks/useChat";
import { useVoiceRecorder }   from "@/hooks/useVoiceRecorder";
import { transcribeAudio }    from "@/lib/agent";
import { MessageBubble }      from "./MessageBubble";
import { CommandMenu }        from "./CommandMenu";
import { TransactionHistoryModal } from "./TransactionHistoryModal";
import { SettingsPanel }      from "./SettingsPanel";
import { VerifyPinModal }     from "./VerifyPinModal";
import { ReceiptModal }       from "./ReceiptModal";
import { CryptoWithdrawalReceiptModal } from "./CryptoWithdrawalReceiptModal";
import { CrossChainSendReceiptModal } from "./CrossChainSendReceiptModal";
import { NotificationBell }   from "./NotificationBell";
import { AppLockScreen }      from "./AppLockScreen";
import { DepositModal }       from "./DepositModal";
import { hasLocalBiometricCredential } from "@/lib/biometric";
import type { Message }       from "@/lib/types";

function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Suggestion =
  | { kind: "text"; text: string; icon: string }
  | { kind: "action"; text: string; icon: string; action: "tx-history" | "deposit" };

const SUGGESTIONS: Suggestion[] = [
  { kind: "action", text: "Deposit",                             icon: "/Vector%201.png", action: "deposit" },
  { kind: "text",   text: "Send $20 to mobile money in Kenya",   icon: "/Vector.png" },
  { kind: "text",   text: "What's my balance",                   icon: "/Vector%201.png" },
  { kind: "text",   text: "I have 10 USDC on Celo but need it on Base", icon: "/Vector%202.png" },
  { kind: "text",   text: "Withdraw 20 USDC to a wallet address", icon: "/Vector%202.png" },
  { kind: "text",   text: "Send $50 to a bank account in Nigeria", icon: "/Vector.png" },
  { kind: "action", text: "Transaction History",                 icon: "/Group%209.png", action: "tx-history" },
];

export function ChatInterface() {
  const router = useRouter();
  const { user, wallet, address, shortAddress, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/signin");
    }
  }, [authLoading, user, router]);

  const [showDeposit, setShowDeposit] = useState(false);
  const [depositInitialChain, setDepositInitialChain] = useState<string | null>(null);

  const {
    messages, loading, txLoading, send, stop, confirm, cancel, signAndSend, addBotMessage, bottomRef,
    pinVerifyOpen, closePinVerify, onPinVerified, activeSendReference,
    receiptSendId, closeReceipt,
    activeWithdrawalReference, receiptWithdrawalId, closeWithdrawalReceipt,
    activeCrossChainSendReference, receiptCrossChainSendId, closeCrossChainSendReceipt,
  } = useChat(user, (chain) => { setDepositInitialChain(chain); setShowDeposit(true); });

  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (!user) return;
    if (!user.biometricEnabled || !hasLocalBiometricCredential(user.id)) return;
    if (sessionStorage.getItem(`cowrypay_unlocked_${user.id}`) === "1") return;
    setLocked(true);
  }, [user]);
  const handleUnlock = () => {
    if (user) sessionStorage.setItem(`cowrypay_unlocked_${user.id}`, "1");
    setLocked(false);
  };

  const hasGreetedRef = useRef(false);
  useEffect(() => {
    if (authLoading || hasGreetedRef.current || !user || !wallet) return;
    hasGreetedRef.current = true;
    // No address in the welcome text anymore — a user now has three genuinely
    // different deposit flows (shared EVM address, dedicated Solana address,
    // shared Stellar address + memo), so auto-showing just one by default
    // would be incomplete. The Deposit suggestion/command opens DepositModal
    // to pick one instead.
    void getChatWelcome()
      .then(({ reply }) => addBotMessage(reply))
      .catch(() => {
        // Best-effort greeting — deposit is still reachable via the Deposit suggestion.
      });
  }, [authLoading, user, wallet, addBotMessage]);

  const hasUserMessage = messages.some((m) => m.role === "user");

  const [input,       setInput]       = useState("");
  const [showCommands, setShowCommands] = useState(false);
  const [showTxHistory, setShowTxHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { isRecording, durationSec, error: recordError, start: startRecording, stop: stopRecording, cancel: cancelRecording } =
    useVoiceRecorder();

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    send(text);
  };
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };
  const handleMicClick = async () => {
    if (isRecording) {
      setTranscribing(true);
      try {
        const blob = await stopRecording();
        if (blob) {
          const text = await transcribeAudio(blob);
          if (text) send(text);
          else addBotMessage("Couldn't hear anything in that recording — please try again.");
        }
      } catch (e) {
        addBotMessage(`⚠️ ${e instanceof Error ? e.message : "Voice transcription failed"}`);
      } finally {
        setTranscribing(false);
      }
      return;
    }
    if (loading) return;
    await startRecording();
  };
  const handleSign = (r: Extract<Message["response"], { type: "tx_ready" }>) => {
    if (!r) return;
    signAndSend(r.tx.transactions, r.tx.token.symbol);
  };
  // Cross-chain send is chat-only (same reasoning as withdraw-to-wallet) —
  // this just pre-fills the input like a text suggestion, it doesn't send.
  const promptCrossChainSend = () => {
    setInput("I have 10 USDC on Celo but need it on Base");
    inputRef.current?.focus();
  };

  // Not signed in — redirecting to /signin (see the effect above). Show a
  // blank loading state instead of flashing broken chat while that happens.
  if (authLoading || !user) {
    return (
      <div className="relative flex-1 flex items-center justify-center bg-cowry-dark">
        <div className="w-6 h-6 border-2 border-cowry-green/30 border-t-cowry-green rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden bg-cowry-dark">
      <div className="absolute inset-0 bg-glow-green pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 lg:px-10 py-3 lg:py-4 bg-cowry-dark border-b border-cowry-border flex-shrink-0">
        <Link
          href="/"
          className="flex items-center justify-center w-9 h-9 rounded-full bg-cowry-card border border-cowry-border hover:border-cowry-green/40 transition-colors lg:hidden"
          title="Back to homepage"
        >
          <Image src="/logo.png" alt="CowryPay" width={18} height={18} />
        </Link>
        <Link href="/" className="hidden lg:block" title="Back to homepage">
          <Image src="/CowryPay.png" alt="CowryPay" width={140} height={27} className="object-contain" />
        </Link>

        <button
          onClick={() => { setDepositInitialChain(null); setShowDeposit(true); }}
          className="flex items-center gap-1.5 text-xs lg:text-sm font-medium text-white border border-cowry-green/60 rounded-full px-4 py-1.5 hover:border-cowry-green transition-colors"
          title={address ?? undefined}
        >
          <span>{shortAddress ?? "Wallet"}</span>
          <svg viewBox="0 0 24 24" className="w-3 h-3 fill-cowry-green">
            <path d="M7 10l5 5 5-5z" />
          </svg>
        </button>

        <div className="flex items-center gap-1.5 lg:gap-3">
          <NotificationBell userId={user.id} />

          <button
            onClick={() => setShowTxHistory(true)}
            className="flex w-8 h-8 items-center justify-center rounded-full hover:bg-cowry-card transition-colors"
            title="Transaction history"
          >
            <Image src="/history.png" alt="" width={20} height={20} />
          </button>

          <button
            onClick={promptCrossChainSend}
            className="lg:hidden w-8 h-8 flex items-center justify-center rounded-full hover:bg-cowry-card transition-colors"
            title="Cross-chain send"
          >
            <Image src="/Vector%202.png" alt="Send" width={18} height={18} />
          </button>
          <button
            onClick={promptCrossChainSend}
            className="hidden lg:flex items-center gap-2 text-sm font-medium text-white border border-cowry-border rounded-full pl-4 pr-3 py-1.5 hover:border-cowry-green/40 transition-colors"
          >
            Cross-chain send
            <Image src="/Vector%202.png" alt="" width={16} height={16} />
          </button>

          <button
            onClick={() => setShowSettings(true)}
            className="flex w-8 h-8 items-center justify-center rounded-full hover:bg-cowry-card transition-colors"
            title="Settings"
          >
            <Image src="/settings.png" alt="" width={20} height={20} />
          </button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 overflow-y-auto px-3 lg:px-10 py-4">
       <div className="space-y-2 lg:max-w-3xl lg:mx-auto">
        {!hasUserMessage && (
          <div className="flex flex-col items-center gap-3 pt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 w-full max-w-xs lg:max-w-2xl">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  onClick={() => {
                    if (s.kind === "action") {
                      if (s.action === "tx-history") setShowTxHistory(true);
                      else if (s.action === "deposit") { setDepositInitialChain(null); setShowDeposit(true); }
                    } else {
                      setInput(s.text);
                      inputRef.current?.focus();
                    }
                  }}
                  className="flex items-center gap-3 text-left text-sm bg-cowry-card border border-cowry-green/30 hover:border-cowry-green/70 text-gray-300 hover:text-white pl-2 pr-4 py-2 rounded-full transition-all"
                >
                  <span className="flex items-center justify-center w-8 h-8 rounded-full border border-cowry-green/40 flex-shrink-0">
                    <Image src={s.icon} alt="" width={16} height={16} />
                  </span>
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onConfirm={confirm}
            onCancel={cancel}
            onSign={(r) => handleSign(r as Extract<Message["response"], { type: "tx_ready" }>)}
            onApprove={(txs, symbol) =>
              signAndSend(txs, symbol ?? "USDC", { continuePendingDraft: true })
            }
            onViewAllTxHistory={() => setShowTxHistory(true)}
            txLoading={txLoading}
            activeQuoteReference={activeSendReference}
            activeWithdrawalReference={activeWithdrawalReference}
            activeCrossChainSendReference={activeCrossChainSendReference}
            sendPending={loading || pinVerifyOpen}
          />
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-[#141C16] border border-cowry-green/10 rounded-[22px] px-4 py-3">
              <span className="inline-flex gap-1 items-center">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 bg-cowry-green rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
       </div>
      </div>

      <div className="relative z-[60] bg-cowry-dark border-t border-cowry-border px-3 lg:px-10 py-3 flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => setShowCommands((v) => !v)}
          disabled={isRecording}
          className="w-11 h-11 bg-cowry-card border border-cowry-border rounded-full flex items-center justify-center flex-shrink-0 hover:border-cowry-green/40 hover:text-cowry-green text-cowry-muted transition-all disabled:opacity-40"
          title={showCommands ? "Close commands" : "Browse commands"}
        >
          {showCommands ? (
            <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 fill-current">
              <path d="M18.3 5.71L12 12.01l-6.3-6.3-1.42 1.42 6.3 6.3-6.3 6.3 1.42 1.42 6.3-6.3 6.3 6.3 1.42-1.42-6.3-6.3 6.3-6.3z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 fill-current">
              <rect x="4" y="6" width="16" height="2" rx="1" />
              <rect x="4" y="11" width="16" height="2" rx="1" />
              <rect x="4" y="16" width="10" height="2" rx="1" />
            </svg>
          )}
        </button>

        {isRecording ? (
          <div className="flex-1 flex items-center gap-3 bg-cowry-card border border-cowry-border rounded-full px-4 py-3">
            <button
              onClick={cancelRecording}
              className="text-cowry-muted hover:text-red-400 transition-colors flex-shrink-0"
              title="Cancel recording"
            >
              <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 fill-current">
                <path d="M6 7h12v2H6V7zm2 3h2v8H8v-8zm6 0h2v8h-2v-8zM9 4h6l1 2h4v2H4V6h4l1-2z" />
              </svg>
            </button>
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <span className="text-sm text-white flex-1">Recording {formatDuration(durationSec)}</span>
          </div>
        ) : (
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Type or record a command"
            disabled={loading}
            className="flex-1 bg-cowry-card border border-cowry-border rounded-full px-4 py-3 text-sm text-white placeholder-cowry-muted outline-none focus:border-cowry-green/50 disabled:opacity-50 transition-colors"
          />
        )}

        <button
          onClick={isRecording ? handleMicClick : loading ? stop : input.trim() ? handleSend : handleMicClick}
          disabled={transcribing}
          className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40 active:scale-95 transition-all hover:brightness-110 ${
            isRecording ? "bg-red-500" : "bg-cowry-green"
          }`}
        >
          {transcribing ? (
            <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 fill-none stroke-cowry-darker animate-spin">
              <circle cx="12" cy="12" r="9" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="40 60" />
            </svg>
          ) : isRecording ? (
            <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 fill-white">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          ) : loading ? (
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-cowry-darker">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : input.trim() ? (
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-cowry-darker translate-x-0.5">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
              <path d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.92V21h2v-3.08A7 7 0 0019 11h-2z" />
            </svg>
          )}
        </button>
      </div>

      <div className="hidden lg:flex items-center justify-between px-10 py-3 text-xs text-cowry-muted flex-shrink-0">
        <span>© 2026 CowryPay</span>
        <span>Live on Celo, Base, Solana &amp; Stellar</span>
      </div>

      {recordError && (
        <div className="px-4 pb-2 -mt-1 flex-shrink-0">
          <p className="text-xs text-red-400">{recordError}</p>
        </div>
      )}

      {showCommands && (
        <CommandMenu
          onSelect={(template) => {
            setInput(template);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          onOpenTxHistory={() => { setShowCommands(false); setShowTxHistory(true); }}
          onOpenSettings={() => { setShowCommands(false); setShowSettings(true); }}
          onOpenDeposit={() => { setShowCommands(false); setDepositInitialChain(null); setShowDeposit(true); }}
          onClose={() => setShowCommands(false)}
        />
      )}

      {showTxHistory && (
        <TransactionHistoryModal onClose={() => setShowTxHistory(false)} />
      )}

      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}

      {pinVerifyOpen && (
        <VerifyPinModal onClose={closePinVerify} onVerified={onPinVerified} />
      )}

      {receiptSendId && wallet && (
        <ReceiptModal sendId={receiptSendId} wallet={wallet} onClose={closeReceipt} />
      )}

      {receiptWithdrawalId && wallet && (
        <CryptoWithdrawalReceiptModal withdrawalId={receiptWithdrawalId} wallet={wallet} onClose={closeWithdrawalReceipt} />
      )}

      {receiptCrossChainSendId && (
        <CrossChainSendReceiptModal crossChainSendId={receiptCrossChainSendId} onClose={closeCrossChainSendReceipt} />
      )}

      {showDeposit && wallet && (
        <DepositModal
          wallet={wallet}
          initialChain={depositInitialChain}
          onClose={() => { setShowDeposit(false); setDepositInitialChain(null); }}
        />
      )}

      {locked && user && (
        <AppLockScreen userId={user.id} onUnlock={handleUnlock} />
      )}
    </div>
  );
}
