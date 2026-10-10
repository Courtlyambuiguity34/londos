import { copyFile, mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "../..");
const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);

function safeUrl(value, name) {
  if (!value || value.length > 8192) throw new Error(`${name} is required.`);
  try {
    const parsed = new URL(value);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new Error();
    return parsed;
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL.`);
  }
}

export function validateAivenSource(value) {
  const parsed = safeUrl(value, "AIVEN_DATABASE_URL");
  if (loopback.has(parsed.hostname)) throw new Error("AIVEN_DATABASE_URL must be remote.");
  if (!["require", "verify-ca", "verify-full"].includes(parsed.searchParams.get("sslmode") ?? ""))
    throw new Error("AIVEN_DATABASE_URL must require TLS.");
  return parsed;
}

export function validateLocalTarget(value) {
  const parsed = safeUrl(value, "DATABASE_URL");
  if (!loopback.has(parsed.hostname))
    throw new Error("DATABASE_URL must target loopback PostgreSQL.");
  return parsed;
}

function tool(program, args, databaseUrl) {
  const connection = safeUrl(databaseUrl, "database connection");
  const database = decodeURIComponent(connection.pathname.replace(/^\//, ""));
  if (!database) throw new Error("Database connection must select a database.");
  const tlsMode = connection.searchParams.get("sslmode");
  const result = spawnSync(program, args, {
    cwd: root,
    env: {
      ...process.env,
      PGHOST: connection.hostname.replace(/^\[|\]$/g, ""),
      PGPORT: connection.port || "5432",
      PGUSER: decodeURIComponent(connection.username),
      PGPASSWORD: decodeURIComponent(connection.password),
      PGDATABASE: database,
      ...(tlsMode ? { PGSSLMODE: tlsMode } : {}),
      ...(connection.searchParams.get("sslrootcert")
        ? { PGSSLROOTCERT: connection.searchParams.get("sslrootcert") }
        : {}),
    },
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error?.code === "ENOENT")
    throw new Error(`${program} is not installed or not on PATH.`);
  if (result.status !== 0)
    throw new Error(`${program} failed; credentials and driver output were suppressed.`);
}

function stamp() {
  return new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d{3}Z$/, "Z");
}

async function checksum(path) {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

async function dump(databaseUrl, finalPath) {
  await mkdir(dirname(finalPath), { recursive: true, mode: 0o700 });
  const partial = `${finalPath}.partial`;
  for (const candidate of [finalPath, partial]) {
    try {
      await stat(candidate);
      throw new Error("Backup target already exists; choose a new path.");
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
        throw error;
    }
  }
  tool("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--file", partial], databaseUrl);
  await rename(partial, finalPath);
  const digest = await checksum(finalPath);
  await writeFile(`${finalPath}.sha256`, `${digest}  ${finalPath.split(/[\\/]/).pop()}\n`, {
    mode: 0o600,
  });
  return digest;
}

async function exportAiven(outputArgument) {
  const source = validateAivenSource(process.env.AIVEN_DATABASE_URL);
  const output = outputArgument
    ? resolve(outputArgument)
    : resolve(root, ".local/backups", `aiven-${stamp()}.dump`);
  await dump(source.href, output);
  console.log(`Aiven export created: ${output}`);
}

async function restoreLocal(inputArgument) {
  if (!inputArgument) throw new Error("Pass the custom-format dump file to restore.");
  if (process.env.LONDOS_RESTORE_CONFIRM !== "restore-local")
    throw new Error(
      "Set LONDOS_RESTORE_CONFIRM=restore-local after completing the restore checklist.",
    );
  const target = validateLocalTarget(process.env.DATABASE_URL);
  const input = resolve(inputArgument);
  if (!(await stat(input)).isFile()) throw new Error("Restore input must be a file.");
  tool(
    "pg_restore",
    ["--clean", "--if-exists", "--no-owner", "--no-acl", "--exit-on-error", "--dbname", "", input],
    target.href,
  );
  console.log(
    "Local PostgreSQL restore completed. Run migrations and verification before flipping traffic.",
  );
}

async function nightlyBackup() {
  const target = validateLocalTarget(process.env.DATABASE_URL);
  const configuredOffsite = process.env.LONDOS_BACKUP_OFFSITE_DIR;
  if (!configuredOffsite || !isAbsolute(configuredOffsite))
    throw new Error("LONDOS_BACKUP_OFFSITE_DIR must be an absolute mounted/off-machine path.");
  const offsite = await realpath(configuredOffsite);
  const rootRelative = relative(root, offsite);
  if (!rootRelative || (!rootRelative.startsWith("..") && !isAbsolute(rootRelative)))
    throw new Error("Off-machine backup directory must be outside the Londos checkout.");
  const name = `londos-${stamp()}.dump`;
  const local = resolve(root, ".local/backups", name);
  const digest = await dump(target.href, local);
  const remote = resolve(offsite, name);
  await copyFile(local, remote);
  await writeFile(`${remote}.sha256`, `${digest}  ${name}\n`, { mode: 0o600 });
  console.log(`Nightly backup copied to configured off-machine storage: ${name}`);
}

function checkTools() {
  for (const program of ["pg_dump", "pg_restore"]) {
    const result = spawnSync(program, ["--version"], { encoding: "utf8", windowsHide: true });
    if (result.error || result.status !== 0)
      throw new Error(`${program} is not installed or not on PATH.`);
  }
  console.log("PostgreSQL dump and restore tools are available.");
}

async function main() {
  const [action, argument] = process.argv.slice(2);
  if (action === "export-aiven") return exportAiven(argument);
  if (action === "restore-local") return restoreLocal(argument);
  if (action === "nightly-backup") return nightlyBackup();
  if (action === "check-tools") return checkTools();
  throw new Error("Action must be export-aiven, restore-local, nightly-backup, or check-tools.");
}

const direct = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct)
  main().catch((error) => {
    console.error(`Londos PostgreSQL tool: ${error instanceof Error ? error.message : "failed"}`);
    process.exitCode = 1;
  });
