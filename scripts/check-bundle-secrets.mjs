import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const values = [process.env.AUTH_SECRET, process.env.DATABASE_URL];
if (process.env.DATABASE_URL) values.push(new URL(process.env.DATABASE_URL).password);
if (existsSync(".local/development-accounts.json")) {
  for (const account of Object.values(
    JSON.parse(readFileSync(".local/development-accounts.json", "utf8")),
  ))
    values.push(account.password);
}
if (existsSync(".local/trust-reviewer.json"))
  values.push(JSON.parse(readFileSync(".local/trust-reviewer.json", "utf8")).password);
const needles = values
  .filter((value) => typeof value === "string" && value.length >= 12)
  .map((value) => Buffer.from(value));
let files = 0;
function scan(directory) {
  if (!existsSync(directory)) throw new Error("Build before checking artifact secret leakage.");
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (entry.isFile()) {
      files++;
      const bytes = readFileSync(path);
      if (needles.some((value) => bytes.includes(value)))
        throw new Error(`Configured secret detected in artifact ${path}; no value printed.`);
    }
  }
}
for (const path of [".next/static", ".next/standalone/.next/server", "dist"]) scan(path);
for (const name of [".env", ".env.local", ".env.production"])
  if (existsSync(join(".next/standalone", name)))
    throw new Error("A server environment file was packaged into standalone output.");
console.log(
  JSON.stringify({
    check: "configured-secret-artifact-scan",
    files,
    candidateValues: needles.length,
    result: "passed",
    limit:
      "Exact configured values only; this does not replace repository/production secret scanning.",
  }),
);
