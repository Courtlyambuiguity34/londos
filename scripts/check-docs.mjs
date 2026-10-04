import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter((file) => file.endsWith(".md"));
const missing = [];
let checked = 0;
for (const file of files) {
  const content = readFileSync(file, "utf8");
  for (const match of content.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const link = match[1];
    if (!link || /^[a-z]+:/i.test(link) || link.startsWith("#")) continue;
    const target = decodeURIComponent(link.split("#")[0]);
    if (!target) continue;
    checked++;
    if (!existsSync(resolve(dirname(file), target))) missing.push(`${file}: ${link}`);
  }
}
if (missing.length) {
  console.error(missing.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`${files.length} Markdown files; ${checked} local links resolve.`);
}
