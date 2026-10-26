import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, copyFile, writeFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Optional packaging regression, requiring a running local Docker daemon.
// Export only a synthetic source snapshot: never put the real .env, private
// account files, build outputs or Docker credentials into a test context.
const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "londos-docker-context-"));
const context = join(temporary, "source"),
  output = join(temporary, "output");
const dockerEnv = { ...process.env, BUILDX_CONFIG: join(temporary, "buildx") };
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete dockerEnv[key];
try {
  await mkdir(context);
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const lifecycle = ["prebuild", "build", "postbuild"].flatMap((phase) =>
    [
      ...(manifest.scripts[phase] ?? "").matchAll(/\bnode\s+(scripts\/[A-Za-z0-9_./-]+\.mjs)\b/g),
    ].map((match) => match[1]),
  );
  if (!lifecycle.length) throw Error("No build lifecycle entrypoints were discovered.");
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  const configs = [
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "next.config.ts",
    "next-env.d.ts",
    ".prettierrc.json",
  ];
  for (const file of [
    ...new Set([
      ...tracked.filter((path) => /^(src|scripts|public|migrations)\//.test(path)),
      ...configs,
      ".dockerignore",
    ]),
  ]) {
    await mkdir(dirname(join(context, file)), { recursive: true });
    await copyFile(join(root, file), join(context, file));
  }
  const excluded = [
    ".env",
    ".env.local",
    ".local/fictional-private-account.json",
    "core/fictional-credentials.json",
    "node_modules/fictional-cache.txt",
    "scripts/unapproved-build-input.mjs",
  ];
  for (const file of excluded) {
    await mkdir(dirname(join(context, file)), { recursive: true });
    await writeFile(join(context, file), "FICTIONAL-PACKAGING-CANARY\n");
  }
  // Docker's actual ignore parser decides which inputs COPY can see. There is
  // no hand-written imitation of .dockerignore wildcard/negation semantics.
  execFileSync(
    "docker",
    [
      "--host=unix:///var/run/docker.sock",
      "build",
      "--progress=plain",
      "--file",
      "-",
      "--output",
      `type=local,dest=${output}`,
      context,
    ],
    {
      cwd: root,
      env: dockerEnv,
      input: "FROM scratch\nCOPY . /context/\n",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120_000,
    },
  );
  const presets = tracked.filter((path) =>
    /^src\/modules\/shop-themes\/presets\/[^/]+\.json$/.test(path),
  );
  const required = [
    ...configs,
    ...lifecycle,
    "scripts/release/bootstrap.ts",
    "scripts/release/migrate.ts",
    ...presets,
  ];
  for (const file of required) {
    try {
      await access(join(output, "context", file));
    } catch {
      throw Error(`Required Docker build input is excluded: ${file}`);
    }
  }
  for (const file of excluded) {
    const present = await access(join(output, "context", file)).then(
      () => true,
      () => false,
    );
    if (present) throw Error(`Private/unapproved canary entered the Docker context: ${file}`);
  }
  console.log(
    JSON.stringify({
      check: "docker-build-context",
      requiredInputs: required.length,
      excludedCanaries: excluded.length,
      themes: presets.length,
      result: "passed",
    }),
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
