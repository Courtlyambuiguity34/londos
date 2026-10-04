import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
import { execFileSync } from "node:child_process";

const selectorNames = new Set([
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
]);
const dockerEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !selectorNames.has(key)),
);
function docker(args) {
  return execFileSync("docker", ["--host=unix:///var/run/docker.sock", ...args], {
    env: dockerEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
const image = "postgres@sha256:5a5a84b19854a9ffaa54082c166ff4ec27473a361e496e5ea167f298f2da9722";
const container = "londos-development-postgres";
const command = process.argv[2] ?? "up";
if (command === "stop") {
  docker(["stop", container]);
  console.log("Development PostgreSQL stopped; its named volume is retained.");
  process.exit(0);
}
if (command !== "up")
  throw new Error("Use db:local or db:stop. This tool never deletes a database volume.");
docker(["info", "--format", "{{.ServerVersion}}"]);
mkdirSync(".local", { recursive: true, mode: 0o700 });
const passwordFile = ".local/postgres.env";
if (!existsSync(passwordFile))
  writeFileSync(
    passwordFile,
    `POSTGRES_USER=londos\nPOSTGRES_DB=londos_development\nPOSTGRES_PASSWORD=${randomBytes(32).toString("hex")}\n`,
    { mode: 0o600 },
  );
const password = /^POSTGRES_PASSWORD=(.+)$/m.exec(readFileSync(passwordFile, "utf8"))?.[1];
let found = true;
try {
  docker(["container", "inspect", "--format", "{{.State.Status}}", container]);
} catch {
  found = false;
}
if (found) {
  if (
    docker([
      "container",
      "inspect",
      "--format",
      '{{index .Config.Labels "londos.environment"}}',
      container,
    ]) !== "development"
  )
    throw new Error("Refusing to control an unmarked container.");
  if (docker(["container", "inspect", "--format", "{{.Config.Image}}", container]) !== image)
    throw new Error(
      "Development image differs from the pinned version. Perform a documented volume-preserving upgrade.",
    );
  docker(["start", container]);
} else
  docker([
    "run",
    "--detach",
    "--name",
    container,
    "--restart",
    "unless-stopped",
    "--label",
    "londos.environment=development",
    "--env-file",
    passwordFile,
    "--publish",
    "127.0.0.1:54329:5432",
    "--volume",
    "londos-development-postgres:/var/lib/postgresql",
    "--health-cmd",
    "pg_isready -U londos -d londos_development",
    "--health-interval",
    "2s",
    "--health-retries",
    "20",
    image,
  ]);
if (!existsSync(".env.local"))
  writeFileSync(
    ".env.local",
    `LONDOS_DATA_SOURCE=fixtures\nDATABASE_URL=postgresql://londos:${password}@127.0.0.1:54329/londos_development\nAUTH_SECRET=${randomBytes(48).toString("hex")}\nAUTH_BASE_URL=http://127.0.0.1:3000\nLONDOS_LOCAL_ADAPTERS=true\n`,
    { mode: 0o600 },
  );
let ready = false;
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    docker(["exec", container, "pg_isready", "-U", "londos", "-d", "londos_development"]);
    ready = true;
    break;
  } catch {
    await setTimeout(500);
  }
}
if (!ready) throw new Error("Development PostgreSQL did not become ready.");
console.log(
  "Development PostgreSQL started on loopback port 54329. Existing .env.local is preserved. Credentials are in ignored, private local files.",
);
