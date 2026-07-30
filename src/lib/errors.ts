/** Extracts a user-facing message from an unknown thrown value — handles
 *  plain Errors, Supabase's AuthError-likes, and anything with a usable
 *  .message, falling back only when nothing legible is found. */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim() && msg !== "{}") return msg;
  }
  return fallback;
}
