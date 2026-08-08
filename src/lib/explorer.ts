export function explorerUrlFor(chain: string, txHash: string | null): string | null {
  if (!txHash) return null;
  switch (chain.toLowerCase()) {
    case "celo":     return `https://celoscan.io/tx/${txHash}`;
    case "base":     return `https://basescan.org/tx/${txHash}`;
    case "optimism": return `https://optimistic.etherscan.io/tx/${txHash}`;
    case "solana":   return `https://solscan.io/tx/${txHash}`;
    case "stellar":  return `https://stellar.expert/explorer/public/tx/${txHash}`;
    default:         return null;
  }
}
