import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// STUB: @cowry/agent-core isn't checked out in this environment, so there's no
// real session store to clear. No-op until the sibling package is wired up.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { sessionId } = body;

  if (typeof sessionId !== "string" || !sessionId.trim()) {
    return NextResponse.json({ error: "sessionId (string) required" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
