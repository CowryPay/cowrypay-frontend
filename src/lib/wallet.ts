import { createWalletClient, createPublicClient, custom, http } from "viem";
import { celo } from "viem/chains";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function getProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: EthereumProvider }).ethereum ?? null;
}

/**
 * Returns the Ethereum provider or throws a clear error.
 * Use this before any wallet operation that MUST succeed.
 */
export function requireProvider(): EthereumProvider {
  const p = getProvider();
  if (!p) {
    throw new Error("No Ethereum wallet found. Please open this app in a Web3 browser.");
  }
  return p;
}

/**
 * Wait for window.ethereum to be injected (some wallets inject after page load).
 * Listens for the standard `ethereum#initialized` event and falls back to polling.
 * Resolves true when ready, false if it never appears within timeoutMs.
 */
export function waitForProvider(timeoutMs = 3000): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (getProvider()) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    const done = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timer);
      window.removeEventListener("ethereum#initialized", onInit);
      resolve(result);
    };

    const onInit = () => done(true);
    window.addEventListener("ethereum#initialized", onInit, { once: true });

    // Poll every 100 ms as a fallback (some wallets don't emit the event)
    const poll = setInterval(() => {
      if (getProvider()) done(true);
    }, 100);

    // Give up after timeoutMs
    const timer = setTimeout(() => done(false), timeoutMs);
  });
}

export function getWalletClient() {
  const provider = getProvider();
  if (!provider) return null;
  return createWalletClient({ chain: celo, transport: custom(provider) });
}

export function getPublicClient() {
  const rpc = process.env.NEXT_PUBLIC_CELO_RPC_URL ?? "https://forno.celo.org";
  return createPublicClient({ chain: celo, transport: http(rpc) });
}

export async function getConnectedAddress(): Promise<`0x${string}` | null> {
  const client = getWalletClient();
  if (!client) return null;
  try {
    const [addr] = await client.getAddresses();
    return addr ?? null;
  } catch {
    return null;
  }
}

export async function requestAccounts(): Promise<`0x${string}` | null> {
  const provider = getProvider();
  if (!provider) return null;
  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
    return (accounts[0] ?? null) as `0x${string}` | null;
  } catch {
    return null;
  }
}

/** Returns the current chain ID from the injected provider. */
export async function getCurrentChainId(): Promise<number | null> {
  const provider = getProvider();
  if (!provider) return null;
  try {
    const hex = await provider.request({ method: "eth_chainId" }) as string;
    return parseInt(hex, 16);
  } catch {
    return null;
  }
}

const CELO_CHAIN_PARAMS = {
  chainId:           "0xA4EC",        // 42220
  chainName:         "Celo Mainnet",
  nativeCurrency:    { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls:           ["https://forno.celo.org"],
  blockExplorerUrls: ["https://celoscan.io"],
};

/**
 * Switch the injected wallet to Celo mainnet (chain 42220).
 * Adds the network if it isn't in the wallet yet. No-op if already on Celo.
 */
export async function switchToCelo(): Promise<void> {
  const provider = getProvider();
  if (!provider) return;

  const current = await getCurrentChainId();
  if (current === 42220) return;        // already on Celo

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xA4EC" }],
    });
  } catch (err: unknown) {
    // Error 4902 = chain not added yet — add it first
    const code = (err as { code?: number }).code;
    if (code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [CELO_CHAIN_PARAMS],
      });
    } else {
      throw err;
    }
  }
}

/** Sign and broadcast a transaction using the connected injected wallet. */
export async function sendTransaction(tx: {
  to: string;
  data: string;
  value: string;
}): Promise<`0x${string}`> {
  const client = getWalletClient();
  if (!client) throw new Error("Wallet not connected");
  const [account] = await client.getAddresses();
  if (!account) throw new Error("No account found");

  return client.sendTransaction({
    account,
    to:    tx.to    as `0x${string}`,
    data:  tx.data  as `0x${string}`,
    value: BigInt(tx.value || "0x0"),
  });
}

export function shortAddress(addr: string): string {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Poll the wallet RPC until a transaction is confirmed. */
export async function waitForTransaction(
  hash: `0x${string}`,
  timeoutMs = 120_000,
): Promise<void> {
  const provider = requireProvider();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipt = await provider.request({
      method: "eth_getTransactionReceipt",
      params: [hash],
    }) as { status?: string } | null;
    if (receipt) {
      if (receipt.status === "0x0") {
        throw new Error("Transaction reverted on-chain");
      }
      return;
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error("Transaction confirmation timed out — try again in a moment");
}
