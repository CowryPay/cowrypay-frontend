import { NextResponse } from "next/server";

export const runtime = "nodejs";

// STUB: @cowry/agent-core isn't checked out in this environment. Empty
// destinations — the cross-chain send UI renders with nothing to select
// rather than crashing, until the real bridge client is wired up.
export function GET() {
  return NextResponse.json({
    source: { chainId: 42220, name: "Celo", usdcDecimals: 6, usdmDecimals: 18 },
    destinations: [],
  });
}
