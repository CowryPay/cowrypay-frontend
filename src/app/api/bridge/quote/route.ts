import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";

export const runtime = "nodejs";

// STUB: @cowry/agent-core isn't checked out in this environment. Returning an
// honest error rather than fabricated rates/fees — this is real financial
// data once wired up and must never be faked.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { fromChainId, fromTokenAddress, fromAmount, fromAddress, toChainId, toTokenAddress, toAddress } = body;

  if (!fromChainId || !fromTokenAddress || !fromAmount || !fromAddress || !toChainId || !toTokenAddress || !toAddress) {
    return NextResponse.json(
      { error: "Required: fromChainId, fromTokenAddress, fromAmount, fromAddress, toChainId, toTokenAddress, toAddress" },
      { status: 400 },
    );
  }

  if (!isAddress(String(fromAddress)) || !isAddress(String(toAddress))) {
    return NextResponse.json({ error: "Invalid sender or recipient address." }, { status: 400 });
  }

  return NextResponse.json({ error: "Cross-chain quotes aren't available in this environment yet." }, { status: 503 });
}
