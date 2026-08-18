"use client";
import { useEffect, useState } from "react";
import { getSolanaWallet, getStellarWallet, type Wallet } from "@/lib/backendApi";
import { getErrorMessage } from "@/lib/errors";
import { linkify } from "@/lib/linkify";
import { DepositAddressCard } from "./DepositAddressCard";
import { StellarDepositCard } from "./StellarDepositCard";

type View = "picker" | "evm" | "solana" | "stellar";

/** Maps a chain name parsed from chat ("celo", "base", "solana", ...) to the view that shows it. */
function viewForChain(chain: string | null | undefined): View {
  if (chain === "solana") return "solana";
  if (chain === "stellar") return "stellar";
  if (chain === "celo" || chain === "base" || chain === "optimism") return "evm";
  return "picker";
}

type Props = {
  /** The default (EVM) wallet from useAuth — already loaded, no fetch needed for that option. */
  wallet:        Wallet;
  /** A chain named in a chat message ("what's my address on celo") — jumps straight to that view instead of the picker. */
  initialChain?: string | null;
  onClose:       () => void;
};

export function DepositModal({ wallet, initialChain, onClose }: Props) {
  const [view, setView] = useState<View>(() => viewForChain(initialChain));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [solanaAddress, setSolanaAddress] = useState<string | null>(null);
  const [stellarWallet, setStellarWallet] = useState<{ address: string; memo: string } | null>(null);

  const multiChainEvm = wallet.provider === "aws-kms";

  const openSolana = async () => {
    setView("solana");
    if (solanaAddress) return;
    setLoading(true);
    setError("");
    try {
      const { address } = await getSolanaWallet();
      setSolanaAddress(address);
    } catch (e) {
      setError(getErrorMessage(e, "Could not load your Solana address"));
    } finally {
      setLoading(false);
    }
  };

  const openStellar = async () => {
    setView("stellar");
    if (stellarWallet) return;
    setLoading(true);
    setError("");
    try {
      const w = await getStellarWallet();
      setStellarWallet(w);
    } catch (e) {
      setError(getErrorMessage(e, "Could not load your Stellar address"));
    } finally {
      setLoading(false);
    }
  };

  // Jump straight to fetching Solana/Stellar when opened with a chain
  // already named (e.g. "what's my address on solana") — EVM needs no
  // fetch, wallet data is already loaded, so no effect needed for it.
  useEffect(() => {
    if (initialChain === "solana") void openSolana();
    else if (initialChain === "stellar") void openStellar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title =
    view === "picker" ? "Deposit" : view === "evm" ? "Celo & Base" : view === "solana" ? "Solana" : "Stellar";

  return (
    <div
      className="absolute inset-0 z-[65] flex flex-col justify-end lg:items-center lg:justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-cowry-dark border-t lg:border border-cowry-border rounded-t-3xl lg:rounded-3xl overflow-hidden max-h-[88vh] lg:max-w-md lg:w-full lg:mx-4 lg:shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-cowry-border">
          <div className="w-10 h-1 bg-cowry-border rounded-full mx-auto mb-3 lg:hidden" />
          <div className="flex items-center justify-between gap-2">
            {view !== "picker" ? (
              <button
                onClick={() => setView("picker")}
                aria-label="Back"
                className="text-white hover:text-cowry-green transition-colors p-1 -ml-1"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-2">
                  <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : (
              <span className="w-7" />
            )}
            <h2 className="text-sm font-bold text-white flex-1 text-center">{title}</h2>
            <button onClick={onClose} className="text-cowry-muted hover:text-white text-xs px-2 py-1 transition-colors">
              Close
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-6">
          {view === "picker" && (
            <div className="space-y-3">
              <button
                onClick={() => setView("evm")}
                className="w-full text-left bg-cowry-card border border-cowry-border hover:border-cowry-green/40 rounded-2xl p-4 transition-all"
              >
                <p className="text-sm font-bold text-white">Celo &amp; Base</p>
                <p className="text-xs text-cowry-muted mt-0.5">
                  {multiChainEvm ? "One address works on both" : `Runs on ${wallet.chain}`}
                </p>
              </button>
              <button
                onClick={openSolana}
                className="w-full text-left bg-cowry-card border border-cowry-border hover:border-cowry-green/40 rounded-2xl p-4 transition-all"
              >
                <p className="text-sm font-bold text-white">Solana</p>
                <p className="text-xs text-cowry-muted mt-0.5">A dedicated address just for you</p>
              </button>
              <button
                onClick={openStellar}
                className="w-full text-left bg-cowry-card border border-cowry-border hover:border-cowry-green/40 rounded-2xl p-4 transition-all"
              >
                <p className="text-sm font-bold text-white">Stellar</p>
                <p className="text-xs text-cowry-muted mt-0.5">Requires a memo with every deposit</p>
              </button>
            </div>
          )}

          {view === "evm" && (
            <DepositAddressCard
              address={wallet.address}
              chain={wallet.chain}
              multiChain={multiChainEvm}
              note={multiChainEvm ? "Send USDC on any of the chains above, or USDT on Celo, to this same address." : undefined}
            />
          )}

          {(view === "solana" || view === "stellar") && loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              <div className="w-6 h-6 border-2 border-cowry-green border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-cowry-muted">
                Setting up your {view === "solana" ? "Solana" : "Stellar"} address…
              </p>
            </div>
          )}

          {view === "solana" && !loading && solanaAddress && (
            <DepositAddressCard address={solanaAddress} chain="Solana" note="This address also accepts USDT." />
          )}

          {view === "stellar" && !loading && stellarWallet && (
            <StellarDepositCard address={stellarWallet.address} memo={stellarWallet.memo} />
          )}

          {error && (
            <p className="text-red-400 text-sm text-center mt-4">
              {linkify(error, "text-cowry-green hover:text-cowry-mint underline")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
