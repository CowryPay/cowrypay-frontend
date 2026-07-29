import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// STUB: @cowry/agent-core isn't checked out in this environment, so there's no
// real agent pipeline to run. Echo a placeholder "info" response so the chat
// UI (bubbles, loading state, etc.) is fully previewable in the meantime.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { message } = body;

  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "message (string) required" }, { status: 400 });
  }

  return NextResponse.json({
    type: "info",
    message: "The Cowry AI backend isn't connected in this environment yet — this is a placeholder response so you can preview the chat UI.",
  });
}
