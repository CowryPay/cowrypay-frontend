/** Map LI.FI / bridge signing errors to user-facing copy. */
export function formatBridgeSignError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (
    lower.includes("7939f424") ||
    lower.includes("transferfromfailed")
  ) {
    return "LI.FI could not pull your tokens. You need to approve USDC/USDm first — confirm both prompts in your wallet (approval, then send).";
  }

  if (lower.includes("approval did not complete")) {
    return msg;
  }

  if (lower.includes("user rejected") || lower.includes("user denied")) {
    return "Transaction cancelled in your wallet.";
  }

  return msg || "Signing failed";
}
