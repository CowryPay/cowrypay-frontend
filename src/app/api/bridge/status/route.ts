import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// STUB: @cowry/agent-core isn't checked out in this environment.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const txHash      = searchParams.get("txHash") ?? "";
  const fromChainId = Number(searchParams.get("fromChainId"));
  const toChainId   = Number(searchParams.get("toChainId"));

  if (!txHash || !fromChainId || !toChainId) {
    return NextResponse.json(
      { error: "Required query params: txHash, fromChainId, toChainId" },
      { status: 400 },
    );
  }

  return NextResponse.json({ status: "NOT_FOUND" });
}
