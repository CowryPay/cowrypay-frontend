import { NextResponse } from "next/server";

export const runtime = "nodejs";

// STUB: @cowry/agent-core isn't checked out in this environment.
export function GET() {
  return NextResponse.json(
    { ok: false, mode: "stub", reason: "agent-core not wired up in this environment" },
    { status: 503 },
  );
}
