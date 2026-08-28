"use client";
import type { Message } from "@/lib/types";
import { linkify } from "@/lib/linkify";
import { TransactionCard } from "./TransactionCard";
import { TxHistoryCard } from "./TxHistoryCard";
import { RemittanceQuoteCard } from "./RemittanceQuoteCard";
import { CryptoWithdrawalQuoteCard } from "./CryptoWithdrawalQuoteCard";
import { CrossChainSendQuoteCard } from "./CrossChainSendQuoteCard";
import { OnRampCard } from "./OnRampCard";
import { DepositAddressCard } from "./DepositAddressCard";
import { SendSuccessCard } from "./SendSuccessCard";

interface Props {
  message:    Message;
  onConfirm:  () => void;
  onCancel:   () => void;
  onSign:     (r: Message["response"] & { type: "tx_ready" }) => void;
  onApprove?: (
    txs: NonNullable<Extract<Message["response"], { type: "clarify" }>["transactions"]>,
    tokenSymbol?: string,
  ) => void;
  onViewAllTxHistory: () => void;
  txLoading:  boolean;
  /** Reference of the one remittance quote still actionable — every other one in chat history is stale. */
  activeQuoteReference: string | null;
  /** Same idea as activeQuoteReference, for the crypto-withdrawal-to-wallet quote card. */
  activeWithdrawalReference: string | null;
  /** Same idea as activeQuoteReference, for the cross-chain-send quote card. */
  activeCrossChainSendReference: string | null;
  /** True while a send is being confirmed (PIN open or in flight) — freezes the active quote card so it can't be double-tapped. */
  sendPending: boolean;
}

export function MessageBubble({
  message, onConfirm, onCancel, onSign, onApprove, onViewAllTxHistory, txLoading,
  activeQuoteReference, activeWithdrawalReference, activeCrossChainSendReference, sendPending,
}: Props) {
  const isUser = message.role === "user";
  const r = message.response;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} gap-2`}>

      <div className={`max-w-[82%] flex flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}>

        {/* Bubble — remittance/withdrawal/cross-chain quotes fold this text into the card below instead */}
        {r?.type !== "remittance_quote" && r?.type !== "crypto_withdrawal_quote" && r?.type !== "cross_chain_send_quote" && r?.type !== "send_success" && (
          <div
            className={`px-4 py-3 rounded-[22px] text-sm whitespace-pre-wrap break-words leading-relaxed ${
              isUser
                ? "bg-cowry-green text-white font-medium"
                : message.depositAddress
                  ? "bg-cowry-card border border-cowry-green/30 text-white"
                  : "bg-[#141C16] border border-cowry-green/10 text-white"
            }`}
          >
            {linkify(message.text, isUser ? "underline text-white" : "text-cowry-green hover:text-cowry-mint underline")}
          </div>
        )}

        {/* Deposit address — its own card, sits below the welcome text */}
        {message.depositAddress && (
          <DepositAddressCard
            address={message.depositAddress}
            chain={message.depositChain ?? "Celo"}
            multiChain={message.depositMultiChain}
            note={message.depositMultiChain ? "Send USDC on any of the chains above, or USDT on Celo, to this same address." : undefined}
          />
        )}

        {/* Approve button */}
        {r?.type === "clarify" && r.transactions && r.transactions.length > 0 && onApprove && (
          <button
            onClick={() => onApprove(r.transactions!, r.tokenSymbol)}
            disabled={txLoading}
            className="text-xs bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 px-4 py-2 rounded-xl font-medium transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            {txLoading ? "Approving…" : (
              <>
                <span>🔑</span> Approve {r.tokenSymbol ?? "token"} spend
              </>
            )}
          </button>
        )}

        {/* Transaction cards */}
        {r?.type === "draft" && (
          <TransactionCard
            type="draft"
            recipients={r.recipients}
            totalAmount={r.totalAmount}
            tokenSymbol={r.tokenSymbol}
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        )}
        {r?.type === "tx_ready" && (
          <TransactionCard
            type="tx_ready"
            recipients={[]}
            totalAmount={0}
            tokenSymbol={r.tx.token.symbol}
            note={r.tx.note}
            agentAddress={r.agent?.address}
            agentRegistered={r.agent?.erc8004?.registered}
            onSign={() => onSign(r)}
            txLoading={txLoading}
          />
        )}

        {/* Agent executed on-chain — no user signing needed */}
        {r?.type === "tx_sent" && (
          <TransactionCard
            type="tx_sent"
            recipients={[]}
            totalAmount={0}
            tokenSymbol=""
            txHash={r.txHash}
            explorerUrl={r.explorerUrl}
            agentAddress={r.agentAddress}
          />
        )}

        {/* Transaction history */}
        {r?.type === "tx_history" && (
          <TxHistoryCard items={r.items} onViewAll={onViewAllTxHistory} />
        )}

        {/* On-ramp virtual account */}
        {r?.type === "onramp_virtual_account" && (
          <OnRampCard
            bank={r.bank}
            accountNumber={r.accountNumber}
            accountName={r.accountName}
            amountToTransfer={r.amountToTransfer}
            fiatCurrency={r.fiatCurrency}
            estimatedUsdc={r.estimatedUsdc}
            validUntil={r.validUntil}
            orderId={r.orderId}
          />
        )}

        {/* Cross-border remittance quote */}
        {r?.type === "remittance_quote" && (
          <RemittanceQuoteCard
            description={message.text}
            recipientLabel={r.recipientLabel}
            sendAmount={r.sendAmount}
            sendToken={r.sendToken}
            receiveAmount={r.receiveAmount}
            receiveCurrency={r.receiveCurrency}
            rateLabel={r.rateLabel}
            feeLabel={r.feeLabel}
            chain={r.chain}
            disabled={r.reference !== activeQuoteReference || sendPending}
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        )}

        {/* Crypto withdrawal quote awaiting confirm */}
        {r?.type === "crypto_withdrawal_quote" && (
          <CryptoWithdrawalQuoteCard
            description={message.text}
            amount={r.amount}
            feeAmount={r.feeAmount}
            netAmount={r.netAmount}
            tokenSymbol={r.tokenSymbol}
            chain={r.chain}
            toAddress={r.toAddress}
            disabled={r.reference !== activeWithdrawalReference || sendPending}
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        )}

        {/* Cross-chain send quote awaiting confirm */}
        {r?.type === "cross_chain_send_quote" && (
          <CrossChainSendQuoteCard
            description={message.text}
            amount={r.amount}
            tokenSymbol={r.tokenSymbol}
            sourceChain={r.sourceChain}
            destinationChain={r.destinationChain}
            toAddress={r.toAddress}
            feeAmount={r.feeAmount}
            disabled={r.reference !== activeCrossChainSendReference || sendPending}
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        )}

        {/* Cross-border remittance send success — branded confirmation */}
        {r?.type === "send_success" && (
          <SendSuccessCard orderId={r.orderId} message={r.message} />
        )}

        <span className="text-[11px] text-cowry-muted px-1">
          {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}
