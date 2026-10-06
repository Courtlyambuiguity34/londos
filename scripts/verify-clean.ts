import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, mkdir, copyFile, writeFile, rm, readFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { Pool } from "pg";
import { loadLocalEnv } from "./local-env";
import { requireDevelopmentDatabase } from "../src/server/db/development";
loadLocalEnv();
const parentURL = process.env.DATABASE_URL;
assert(parentURL, "Requires the explicit local development PostgreSQL");
const parent = new Pool({ connectionString: parentURL }),
  name = `londos_test_${randomUUID().replaceAll("-", "")}`,
  directory = await mkdtemp(join(tmpdir(), "londos-clean-p11-")),
  root = process.cwd(),
  log = resolve(".local/p11-clean.log");
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const env = {
  ...process.env,
  DATABASE_URL: parentURL,
  AUTH_SECRET: randomBytes(48).toString("hex"),
  AUTH_BASE_URL: "http://127.0.0.1:3104",
  LONDOS_CORE_ENABLED: "true",
  LONDOS_LOCAL_ADAPTERS: "true",
  LONDOS_AI_REMOTE: "false",
  npm_config_cache: join(directory, ".cache/npm"),
};
for (const key of [
  "OPENAI_API_KEY",
  "LONDOS_OPENAI_API_KEY",
  ...Array.from({ length: 5 }, (_, i) => `GEMINI_API_KEY_${i + 1}`),
])
  delete env[key as keyof typeof env];
const commands: { command: string; exitCode: number; durationMs: number }[] = [];
async function command(args: string[]) {
  await appendFile(log, `\n$ ${args.join(" ")}\n`);
  const started = performance.now(),
    child = spawn(args[0]!, args.slice(1), {
      cwd: directory,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  let output = "";
  child.stdout.on("data", (b) => {
    output += String(b);
  });
  child.stderr.on("data", (b) => {
    output += String(b);
  });
  const exitCode = await new Promise<number>((res, rej) => {
    child.on("error", rej);
    child.on("exit", (code) => res(code ?? 1));
  });
  // Never preserve generated credential-bearing lines if a dependency/driver exposes them.
  for (const value of [env.AUTH_SECRET, env.DATABASE_URL, new URL(env.DATABASE_URL).password])
    if (value.length >= 12) output = output.replaceAll(value, "[REDACTED]");
  await appendFile(log, output);
  commands.push({
    command: args.join(" "),
    exitCode,
    durationMs: Math.round(performance.now() - started),
  });
  assert.equal(exitCode, 0, `Clean setup failed: ${args.join(" ")}`);
}
let created = false;
try {
  await requireDevelopmentDatabase(parent);
  await parent.query(`CREATE DATABASE ${name}`);
  created = true;
  const url = new URL(parentURL);
  url.pathname = `/${name}`;
  env.DATABASE_URL = url.toString();
  await writeFile(
    log,
    "P11 clean source copy: no node_modules/build/private configuration copied.\n",
  );
  const digest = createHash("sha256");
  for (const file of files) {
    assert(!file.startsWith("/") && !file.split("/").includes(".."));
    const bytes = await readFile(join(root, file));
    digest.update(file).update(bytes);
    await mkdir(dirname(join(directory, file)), { recursive: true });
    await copyFile(join(root, file), join(directory, file));
  }
  execFileSync("git", ["init", "-q", "-b", "p11-clean"], { cwd: directory });
  execFileSync("git", ["add", "."], { cwd: directory });
  await command(["npm", "ci", "--no-fund"]);
  await command(["npm", "run", "db:migrate"]);
  await command(["npm", "run", "db:seed"]);
  await command(["npm", "run", "db:migrate"]);
  await command(["npm", "run", "db:seed"]);
  await command(["npm", "run", "check"]);
  await command(["npm", "run", "build"]);
  await command(["npm", "run", "check:bundle-secrets"]);
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  let migrations = 0;
  try {
    migrations = (await pool.query("SELECT count(*)::int AS n FROM schema_migrations")).rows[0].n;
    assert.equal(migrations, 18);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM shops")).rows[0].n, 6);
  } finally {
    await pool.end();
  }
  const report = {
    recordedAt: new Date().toISOString(),
    result: "passed",
    files: files.length,
    sourceSnapshotSha256: digest.digest("hex"),
    commands,
    migrations,
    existingMainDatabaseTouched: false,
    privateFilesCopied: false,
    providerCredentialsPassedToChild: false,
    cleanup: "Only the created guarded database and temporary source checkout",
    limits: [
      "Uses this environment Node/PostgreSQL/proxy/system libraries; not a separate-machine/fresh-task or container-volume restoration proof.",
      "Main Docker database bootstrap is already configured and preserved; the clean copy uses its own isolated database.",
    ],
  };
  await writeFile("docs/evidence/X2-P11-CLEAN.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally {
  if (created) await parent.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await parent.end();
  await rm(directory, { recursive: true, force: true });
}
