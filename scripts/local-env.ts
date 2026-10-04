import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Explicit CLI-only loader. Next.js loads .env.local through its normal mechanism.
export function loadLocalEnv() {
  const path = resolve(".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match?.[1] && match[2] !== undefined && process.env[match[1]] === undefined)
      process.env[match[1]] = match[2];
  }
}
