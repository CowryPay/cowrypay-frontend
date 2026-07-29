import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";

export const runtime = "nodejs";

// STUB: @cowry/agent-core isn't checked out in this environment.
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  const page = Number(req.nextUrl.searchParams.get("page") ?? "1");

  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "valid address required" }, { status: 400 });
  }
  if (!Number.isInteger(page) || page < 1) {
    return NextResponse.json({ error: "page must be a positive integer" }, { status: 400 });
  }

  return NextResponse.json({ items: [], hasMore: false });
}
