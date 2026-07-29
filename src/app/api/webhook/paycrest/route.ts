import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// STUB: @cowry/agent-core isn't checked out in this environment, so there's no
// order-session store to update. Always ack so Paycrest doesn't retry.
export async function POST(req: NextRequest) {
  try {
    await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
