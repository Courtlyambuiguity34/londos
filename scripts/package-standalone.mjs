import { cpSync, existsSync, mkdirSync } from "node:fs";

if (!existsSync(".next/standalone/server.js")) {
  throw new Error("Standalone output is missing. Build before packaging.");
}
mkdirSync(".next/standalone/.next", { recursive: true });
cpSync("public", ".next/standalone/public", { recursive: true });
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
console.log("Packaged local illustrations and static assets in standalone output.");
