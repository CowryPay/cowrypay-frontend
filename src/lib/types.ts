// ── Agent API types (mirrors @cowry/agent-core/types.js) ─────────────────────

export type EncodedTxJson = {
  to: string;
  data: string;
  value: string;
  description: string;
};

export type ChatResponse =
  | { type: "clarify"; question: string; transactions?: EncodedTxJson[]; tokenSymbol?: string }
  | {
      type: "draft";
      draftId: string;
      preview: string;
      action: string;
      recipients: { username: string; address: string; amount: number }[];
      totalAmount: number;
      tokenSymbol: string;
    }
  | {
      type: "tx_ready";
      draftId: string;
      preview: string;
      tx: {
        chainId: number;
        token: { address: string; symbol: string; decimals: number };
        cowryPay: string;
        note: string;
        transactions: EncodedTxJson[];
      };
      agent?: {
        address: string;
        erc8004?: { registered: boolean; agentId?: string; hint?: string };
      };
    }
  | { type: "cancelled"; message: string }
  | { type: "info"; message: string; transactions?: EncodedTxJson[] }
  | {
      /**
       * The Cowry AI agent already signed and broadcast the payment on-chain.
       * The user does NOT need to sign anything.
       */
      type: "tx_sent";
      preview: string;
      txHash: string;
      explorerUrl: string;
      /** Agent wallet address that executed the tx */
      agentAddress: string;
    }
  | {
      /** Recent on-chain transaction history for the user's wallet. */
      type: "tx_history";
      items: TxHistoryItem[];
    }
  | {
      /**
       * A cross-border remittance send was created (auto-shopped across
       * every eligible off-ramp provider) — branded "Payment sent" success
       * confirmation with the CowryPay mark.
       */
      type: "send_success";
      orderId: string;
      message: string;
    }
  | {
      /** Cross-border remittance quote awaiting user confirm — auto-shopped across every eligible off-ramp provider. */
      type: "remittance_quote";
      preview: string;
      recipientLabel: string;
      sendAmount: string;
      sendToken: "USDC" | "USDT";
      receiveAmount: string;
      receiveCurrency: string;
      rateLabel: string;
      /** Platform fee displayed to the user, e.g. "0.5 USDC". */
      feeLabel: string;
      /** Which chain this quote is locked to — worth surfacing once a wallet can hold balance on more than one. */
      chain: string;
      /** Identifies which specific draft this card represents — lets the UI tell a stale card (from earlier in the chat) apart from the one currently actionable. */
      reference: string;
    }
  | {
      /**
       * A "withdraw to wallet" request chat has fully resolved, awaiting
       * user confirm — mirrors remittance_quote's shape/purpose but for a
       * direct crypto-to-crypto withdrawal. toAddress is shown in full,
       * never truncated, so the user can actually verify it.
       */
      type: "crypto_withdrawal_quote";
      preview: string;
      amount: string;
      /** Estimated client-side (no live quote endpoint for withdrawals) — see cryptoWithdrawalFee.ts. */
      feeAmount: string;
      netAmount: string;
      tokenSymbol: string;
      chain: string;
      toAddress: string;
      /** Identifies which specific draft this card represents — lets the UI tell a stale card (from earlier in the chat) apart from the one currently actionable. */
      reference: string;
    }
  | {
      /**
       * A "move funds to a different chain" request chat has fully
       * resolved, awaiting user confirm — mirrors crypto_withdrawal_quote
       * but source and destination chains genuinely differ (a real bridge
       * is involved, not just a same-chain broadcast). feeAmount is only
       * the platform-fee estimate; the exact amount the destination
       * receives depends on the bridge's own quote and is only ever
       * accurate in `preview` (the backend's prose), never computed here.
       */
      type: "cross_chain_send_quote";
      preview: string;
      amount: string;
      tokenSymbol: string;
      sourceChain: string;
      destinationChain: string;
      toAddress: string;
      feeAmount: string;
      /** Identifies which specific draft this card represents — lets the UI tell a stale card (from earlier in the chat) apart from the one currently actionable. */
      reference: string;
    }
  | {
      /** On-ramp order created — shows virtual bank account for user to pay into. */
      type: "onramp_virtual_account";
      preview: string;
      bank: string;
      accountNumber: string;
      accountName: string;
      amountToTransfer: string;
      fiatCurrency: string;
      estimatedUsdc: string;
      validUntil: string;
      orderId: string;
    };

/** A merged, display-ready entry from a send, deposit, crypto withdrawal, or cross-chain send — powers Transaction History. */
export type TxHistoryItem = {
  id: string;
  kind: "send" | "deposit" | "withdrawal" | "crossChainSend";
  direction: "sent" | "received";
  amount: string;
  tokenSymbol: string;
  /** Recipient name for a send, destination address for a withdrawal/cross-chain send, or the chain name for a deposit. */
  counterparty: string;
  stateLabel: string;
  stateClassName: string;
  txHash: string | null;
  explorerUrl: string | null;
  timestamp: string;
  /** True when a receipt view is available for this item (a COMPLETE send, or any crypto withdrawal). */
  hasReceipt?: boolean;
};

// ── UI message model ──────────────────────────────────────────────────────────

export type Message = {
  id: string;
  role: "user" | "bot";
  text: string;
  timestamp: Date;
  response?: ChatResponse;
  /** Set only on the post-auth welcome message — renders a copyable address card. */
  depositAddress?: string;
  depositChain?: string;
  /** True for a self-custody (aws-kms) wallet — the same address accepts deposits on every supported chain, not just `depositChain`. */
  depositMultiChain?: boolean;
};

