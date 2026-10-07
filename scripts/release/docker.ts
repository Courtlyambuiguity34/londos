import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const exec = promisify(execFile);
const selectors = new Set([
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
]);
const environment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !selectors.has(key)),
);
export async function docker(args: string[]) {
  try {
    return (
      await exec("docker", ["--host=unix:///var/run/docker.sock", ...args], {
        env: environment as NodeJS.ProcessEnv,
        maxBuffer: 32 * 1024 * 1024,
      })
    ).stdout.trim();
  } catch (error) {
    if (process.env.LONDOS_REHEARSAL_DIAGNOSTICS)
      await appendFile(
        process.env.LONDOS_REHEARSAL_DIAGNOSTICS,
        String((error as { stderr?: string }).stderr ?? "Docker operation failed") + "\n",
        { mode: 0o600 },
      );
    throw new Error(`Docker ${args[0]} operation failed; inspect the private rehearsal log`, {
      cause: error,
    });
  }
}
export const postgresImage =
  "postgres@sha256:5a5a84b19854a9ffaa54082c166ff4ec27473a361e496e5ea167f298f2da9722";
export class RehearsalDocker {
  readonly owner = randomUUID();
  readonly prefix = `londos-p12-${this.owner.slice(0, 8)}`;
  private containers = new Set<string>();
  private volumes = new Set<string>();
  private networks = new Set<string>();
  async volume(suffix: string) {
    const name = `${this.prefix}-${suffix}`;
    await docker(["volume", "create", "--label", `londos.p12.owner=${this.owner}`, name]);
    this.volumes.add(name);
    return name;
  }
  async network() {
    const name = `${this.prefix}-network`;
    await docker(["network", "create", "--label", `londos.p12.owner=${this.owner}`, name]);
    this.networks.add(name);
    return name;
  }
  async run(suffix: string, args: string[]) {
    const name = `${this.prefix}-${suffix}`;
    await docker([
      "run",
      "--detach",
      "--name",
      name,
      "--label",
      `londos.p12.owner=${this.owner}`,
      ...args,
    ]);
    this.containers.add(name);
    return name;
  }
  async remove(name: string) {
    if (
      !this.containers.has(name) ||
      (await docker([
        "inspect",
        "--format",
        '{{index .Config.Labels "londos.p12.owner"}}',
        name,
      ])) !== this.owner
    )
      throw new Error("Refusing to remove an unowned container");
    await docker(["rm", "--force", name]);
    this.containers.delete(name);
  }
  async cleanup() {
    for (const name of [...this.containers]) await this.remove(name);
    for (const [kind, names] of [
      ["volume", this.volumes],
      ["network", this.networks],
    ] as const)
      for (const name of names) {
        if (
          (await docker([
            kind,
            "inspect",
            "--format",
            '{{index .Labels "londos.p12.owner"}}',
            name,
          ])) !== this.owner
        )
          throw new Error("Refusing to remove an unowned resource");
        await docker([kind, "rm", name]);
        names.delete(name);
      }
  }
}

export async function containerLog(name: string) {
  const r = await exec("docker", ["--host=unix:///var/run/docker.sock", "logs", name], {
    env: environment as NodeJS.ProcessEnv,
    maxBuffer: 1024 * 1024,
  });
  return r.stdout + r.stderr;
}
