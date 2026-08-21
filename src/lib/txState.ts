export type StateBadge = { label: string; className: string };

const GREEN: StateBadge["className"] = "text-cowry-green bg-cowry-green/10 border-cowry-green/40";
const AMBER: StateBadge["className"] = "text-amber-400 bg-amber-500/10 border-amber-500/30";
const RED: StateBadge["className"]   = "text-red-400 bg-red-500/10 border-red-500/30";
const GRAY: StateBadge["className"]  = "text-cowry-muted bg-white/5 border-cowry-border";

export function describeDepositState(state: string): StateBadge {
  switch (state) {
    case "BALANCE_CREDITED":
      return { label: "Credited", className: GREEN };
    case "MANUAL_REVIEW":
      return { label: "Under review", className: AMBER };
    case "DEPOSIT_HELD":
      return { label: "Held", className: RED };
    case "RETURN_TO_SENDER":
      return { label: "Returned", className: RED };
    default:
      return { label: "Processing", className: AMBER };
  }
}

// Mirrors backend's describeSendState (ai-agent/chat/responses.ts) so the
// history list and the chat's "recent sends" text always agree.
export function describeSendState(state: string): StateBadge {
  switch (state) {
    case "COMPLETE":
      return { label: "Delivered", className: GREEN };
    case "MANUAL_REVIEW":
      return { label: "Under review", className: AMBER };
    case "SEND_REJECTED":
    case "FAILED":
      return { label: "Failed", className: RED };
    case "REFUNDED":
      return { label: "Refunded", className: GRAY };
    default:
      return { label: "Processing", className: AMBER };
  }
}

export function describeCryptoWithdrawalState(state: string): StateBadge {
  switch (state) {
    case "CONFIRMED":
      return { label: "Confirmed", className: GREEN };
    case "BROADCAST":
      return { label: "Broadcasting", className: AMBER };
    case "FAILED":
      return { label: "Failed", className: RED };
    default:
      return { label: "Processing", className: AMBER };
  }
}

// STUCK is deliberately its own label, distinct from "Failed" — the
// source-chain leg already confirmed (real, final, irreversible), only the
// destination leg is taking longer than usual. Framing it as "Failed"
// (or in red) would wrongly suggest nothing happened and/or an auto-refund
// is coming, neither true — it gets the same calm amber treatment as any
// other in-progress state. Only FAILED (never left the user's balance)
// gets red.
export function describeCrossChainSendState(state: string): StateBadge {
  switch (state) {
    case "COMPLETE":
      return { label: "Delivered", className: GREEN };
    case "STUCK":
      return { label: "Almost there", className: AMBER };
    case "FAILED":
      return { label: "Failed", className: RED };
    case "REFUNDED":
      return { label: "Refunded", className: GRAY };
    case "BRIDGING":
      return { label: "Bridging", className: AMBER };
    default:
      return { label: "Processing", className: AMBER };
  }
}
