"use client";
import { useState } from "react";
import { initiateCryptoWithdrawal, type Wallet } from "@/lib/backendApi";
import { isValidAddressForChain } from "@/lib/addressValidation";
import { computeCryptoWithdrawalFeeSplit } from "@/lib/cryptoWithdrawalFee";
import { formatToken } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import { VerifyPinModal } from "./VerifyPinModal";
import { CryptoWithdrawalReceiptModal } from "./CryptoWithdrawalReceiptModal";

type View = "picker" | "celo" | "base" | "optimism" | "solana" | "stellar";
type Step = "form" | "confirm" | "pin" | "submitting" | "error";

const EVM_CHAINS: { chain: "celo" | "base" | "optimism"; label: string }[] = [
  { chain: "celo",     label: "Celo" },
  { chain: "base",     label: "Base" },
  { chain: "optimism", label: "Optimism" },
];

const fieldClass =
  "w-full bg-cowry-card border border-cowry-border rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-cowry-green/50 transition-colors";

const PLACEHOLDER: Record<string, string> = {
  celo: "0x…", base: "0x…", optimism: "0x…",
  solana: "Solana address",
  stellar: "G…",
};

type Props = {
  wallet:  Wallet;
  onClose: () => void;
};

export function WithdrawModal({ wallet, onClose }: Props) {
  const [view, setView] = useState<View>("picker");
  const [step, setStep] = useState<Step>("form");

  const multiChainEvm = wallet.provider === "aws-kms";
  const [evmChain, setEvmChain] = useState<"celo" | "base" | "optimism">(
    (wallet.chain as "celo" | "base" | "optimism") || "celo",
  );

  const [amount, setAmount]             = useState("");
  const [toAddress, setToAddress]       = useState("");
  const [error, setError]               = useState("");
  const [withdrawalId, setWithdrawalId] = useState<string | null>(null);

  const chain = view === "picker" ? null : view === "celo" || view === "base" || view === "optimism" ? evmChain : view;

  const address = toAddress.trim();
  const addressValid = chain ? address.length > 0 && isValidAddressForChain(chain, address) : false;
  const feeSplit = amount ? computeCryptoWithdrawalFeeSplit(amount) : null;
  const amountValid = Number(amount) > 0 && !!feeSplit;
  const sendingToSelf =
    addressValid && (view === "celo" || view === "base" || view === "optimism") &&
    address.toLowerCase() === wallet.address.toLowerCase();

  const openView = (v: View) => {
    setView(v);
    setStep("form");
    setError("");
    setAmount("");
    setToAddress("");
    setWithdrawalId(null);
  };

  const handlePinVerified = async (pin: string) => {
    if (!chain) return;
    setStep("submitting");
    try {
      const { withdrawal } = await initiateCryptoWithdrawal({ chain, amount, toAddress: address, pin });
      setWithdrawalId(withdrawal.id);
    } catch (e) {
      setError(getErrorMessage(e, "Could not send withdrawal"));
      setStep("error");
    }
  };

  const title =
    view === "picker" ? "Withdraw" :
    view === "solana" ? "Solana" :
    view === "stellar" ? "Stellar" :
    "Celo, Base & Optimism";

  const chainLabel = chain
    ? (EVM_CHAINS.find((c) => c.chain === chain)?.label ?? chain.charAt(0).toUpperCase() + chain.slice(1))
    : "";

  if (withdrawalId) {
    return <CryptoWithdrawalReceiptModal withdrawalId={withdrawalId} wallet={wallet} onClose={onClose} />;
  }

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
                onClick={() => openView("picker")}
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
                onClick={() => openView("celo")}
                className="w-full text-left bg-cowry-card border border-cowry-border hover:border-cowry-green/40 rounded-2xl p-4 transition-all"
              >
                <p className="text-sm font-bold text-white">Celo, Base &amp; Optimism</p>
                <p className="text-xs text-cowry-muted mt-0.5">Send USDC to any address on these chains</p>
              </button>
              <button
                onClick={() => openView("solana")}
                className="w-full text-left bg-cowry-card border border-cowry-border hover:border-cowry-green/40 rounded-2xl p-4 transition-all"
              >
                <p className="text-sm font-bold text-white">Solana</p>
                <p className="text-xs text-cowry-muted mt-0.5">Send USDC to any Solana address</p>
              </button>
              <button
                onClick={() => openView("stellar")}
                className="w-full text-left bg-cowry-card border border-cowry-border hover:border-cowry-green/40 rounded-2xl p-4 transition-all"
              >
                <p className="text-sm font-bold text-white">Stellar</p>
                <p className="text-xs text-cowry-muted mt-0.5">Send USDC to any Stellar address</p>
              </button>
            </div>
          )}

          {view !== "picker" && step === "form" && (
            <div className="space-y-4">
              {(view === "celo" || view === "base" || view === "optimism") && multiChainEvm && (
                <div>
                  <label className="text-[10px] text-cowry-muted mb-1 block">Chain</label>
                  <select
                    className={fieldClass}
                    value={evmChain}
                    onChange={(e) => setEvmChain(e.target.value as "celo" | "base" | "optimism")}
                  >
                    {EVM_CHAINS.map((c) => (
                      <option key={c.chain} value={c.chain} className="bg-cowry-card">{c.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-[10px] text-cowry-muted mb-1 block">Amount (USDC)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-transparent border-none outline-none text-4xl font-bold text-white placeholder-cowry-muted/30"
                />
                {amount && !feeSplit && (
                  <p className="text-[10px] text-red-400 mt-1">
                    Too small to withdraw — it wouldn&apos;t cover the minimum 0.1 USDC fee.
                  </p>
                )}
              </div>

              <div>
                <label className="text-[10px] text-cowry-muted mb-1 block">Destination address</label>
                <input
                  type="text"
                  value={toAddress}
                  onChange={(e) => setToAddress(e.target.value)}
                  placeholder={PLACEHOLDER[chain ?? ""] ?? ""}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className={fieldClass + (address && !addressValid ? " border-red-500/50" : "")}
                />
                {address && !addressValid && (
                  <p className="text-[10px] text-red-400 mt-1">Not a valid address for this chain.</p>
                )}
                {sendingToSelf && (
                  <p className="text-[10px] text-amber-400 mt-1">⚠️ Sending to your own wallet</p>
                )}
              </div>

              {error && (
                <div className="px-3 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl">
                  {error}
                </div>
              )}

              <button
                onClick={() => { setError(""); setStep("confirm"); }}
                disabled={!amountValid || !addressValid}
                className="w-full py-3.5 rounded-full font-bold text-sm transition-all
                  bg-cowry-green text-black active:scale-95
                  disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                Continue
              </button>
            </div>
          )}

          {view !== "picker" && step === "confirm" && (
            <div className="bg-cowry-dark border border-cowry-border rounded-2xl px-5 py-5">
              <div className="flex items-center justify-between mb-5">
                <span className="text-sm font-semibold uppercase tracking-wide text-white">
                  Confirm Withdrawal
                </span>
                <span className="text-[11px] font-medium text-cowry-green bg-cowry-green/10 border border-cowry-green/40 rounded-full px-3 py-1">
                  0.3% fee
                </span>
              </div>

              <div className="flex justify-between gap-4 mb-5">
                <div>
                  <p className="text-xs text-cowry-muted mb-1">You send</p>
                  <p className="text-lg font-bold text-white">{amount} USDC</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-cowry-muted mb-1">Network</p>
                  <p className="text-lg font-bold text-white">{chainLabel}</p>
                </div>
              </div>

              {feeSplit && (
                <div className="flex justify-between gap-4 mb-5">
                  <div>
                    <p className="text-xs text-cowry-muted mb-1">Fee</p>
                    <p className="text-sm font-semibold text-white">{formatToken(feeSplit.feeAmount)} USDC</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-cowry-muted mb-1">Recipient gets</p>
                    <p className="text-sm font-semibold text-white">{formatToken(feeSplit.netAmount)} USDC</p>
                  </div>
                </div>
              )}

              <div className="mb-6">
                <p className="text-xs text-cowry-muted mb-1">To</p>
                <p className="text-sm font-semibold text-white font-mono break-all">{address}</p>
                {sendingToSelf && (
                  <p className="text-[10px] text-amber-400 mt-1">⚠️ Sending to your own wallet</p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep("pin")}
                  className="flex-1 bg-cowry-green text-black text-sm font-bold py-3 rounded-full active:scale-95 transition-all"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setStep("form")}
                  className="flex-1 bg-transparent border border-cowry-green/60 text-white text-sm font-semibold py-3 rounded-full hover:border-cowry-green transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {step === "submitting" && (
            <div className="flex flex-col items-center py-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-full border-4 border-cowry-green border-t-transparent animate-spin" />
              <h3 className="text-base font-bold text-white">Sending…</h3>
              <p className="text-sm text-cowry-muted max-w-xs">Broadcasting your withdrawal.</p>
            </div>
          )}

          {step === "error" && (
            <div className="flex flex-col items-center py-10 text-center space-y-4">
              <span className="text-4xl">❌</span>
              <h3 className="text-base font-bold text-white">Withdrawal failed</h3>
              <p className="text-sm text-cowry-muted max-w-xs">{error}</p>
              <button
                onClick={() => setStep("confirm")}
                className="mt-2 text-sm text-cowry-green hover:text-cowry-mint font-medium transition-colors"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>

      {step === "pin" && (
        <VerifyPinModal onVerified={handlePinVerified} onClose={() => setStep("confirm")} />
      )}
    </div>
  );
}
