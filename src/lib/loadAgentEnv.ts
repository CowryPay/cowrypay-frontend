import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

let loaded = false;

/** Load ai-agent-service/.env into process.env (only unset keys). */
export function loadAgentEnv(): void {
  if (loaded) return;
  loaded = true;

  const envPath = resolve(process.cwd(), "../ai-agent-service/.env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
