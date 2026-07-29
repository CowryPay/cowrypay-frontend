import { NextRequest, NextResponse } from "next/server";
import { isHash } from "viem";

export const runtime = "nodejs";

// STUB: @cowry/agent-core isn't checked out in this environment.
export async function GET(_req: NextRequest, { params }: { params: { hash: string } }) {
  const h = params.hash;
  if (!isHash(h)) {
    return NextResponse.json({ error: "invalid tx hash" }, { status: 400 });
  }

  return NextResponse.json({ status: "unknown", message: "Transaction status lookup isn't available yet." });
}
