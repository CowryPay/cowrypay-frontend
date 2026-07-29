import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";

export const runtime = "nodejs";

// STUB: @cowry/agent-core isn't checked out in this environment. Returning an
// honest error here rather than a fabricated txHash — this executes a real
// transfer once wired up, so it must never pretend to have succeeded.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { fromTokenAddress, fromAmount, fromWallet, toChainId, toTokenAddress, toAddress } = body;

  if (!fromTokenAddress || !fromAmount || !fromWallet || !toChainId || !toTokenAddress || !toAddress) {
    return NextResponse.json(
      { error: "Required: fromTokenAddress, fromAmount, fromWallet, toChainId, toTokenAddress, toAddress" },
      { status: 400 },
    );
  }

  if (!isAddress(String(fromWallet)) || !isAddress(String(toAddress))) {
    return NextResponse.json({ error: "Invalid wallet or recipient address." }, { status: 400 });
  }

  return NextResponse.json({ error: "Cross-chain send isn't available in this environment yet." }, { status: 503 });
}
