import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, symlink, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { test, expect } from "vitest";
import { requireDevelopmentDatabase } from "../../src/server/db/development";

test("embedded real worker consumes bootstrap verification after startup migration", async () => {
  const parent = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const name = `londos_test_${randomUUID().replaceAll("-", "")}`;
  const directory = await mkdtemp(join(tmpdir(), "londos-embedded-db-"));
  let pool: Pool | undefined, child: ChildProcess | undefined;
  let exited: Promise<number | null> | undefined;
  let created = false,
    output = "";
  try {
    await requireDevelopmentDatabase(parent);
    await parent.query(`CREATE DATABASE ${name}`);
    created = true;
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = `/${name}`;
    pool = new Pool({ connectionString: url.href, max: 1 });
    await symlink(resolve("dist"), join(directory, "dist"), "junction");
    await symlink(resolve("migrations"), join(directory, "migrations"), "junction");
    await writeFile(
      join(directory, "server.js"),
      "setInterval(() => {}, 1000); process.on('SIGTERM', () => process.exit(0));",
    );
    child = spawn(process.execPath, [resolve("scripts/release-entry.mjs"), "web"], {
      cwd: directory,
      env: {
        NODE_ENV: "test",
        DATABASE_URL: url.href,
        AUTH_SECRET: process.env.AUTH_SECRET,
        AUTH_BASE_URL: "http://127.0.0.1:3101",
        LONDOS_LOCAL_ADAPTERS: "true",
        LONDOS_CORE_ENABLED: "true",
        LONDOS_MIGRATE_ON_START: "true",
        LONDOS_EMBEDDED_WORKER: "true",
        LONDOS_BOOTSTRAP_ADMIN_NAME: "Embedded test owner",
        LONDOS_BOOTSTRAP_ADMIN_EMAIL: "embedded-owner@londos.invalid",
        LONDOS_BOOTSTRAP_ADMIN_PASSWORD: "Unique-embedded-test-fixture-password",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout!.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr!.on("data", (chunk) => {
      output += String(chunk);
    });
    exited = new Promise((resolve, reject) => {
      child!.on("exit", resolve);
      child!.on("error", reject);
    });
    for (let attempt = 0; attempt < 100 && !output.includes('"event":"job.done"'); attempt++) {
      if (child.exitCode !== null) break;
      await delay(100);
    }
    expect(output).toContain('"event":"release.migration","result":"passed"');
    expect(output).toContain('"event":"bootstrap.complete","created":1');
    expect(output).toContain('"event":"release.embedded_worker_started"');
    expect(output).toContain('"adapters":"local-private-sink"');
    const jobs = (
      await pool.query("SELECT id,state FROM jobs WHERE payload->>'template'='email-verification'")
    ).rows;
    expect(jobs).toHaveLength(1);
    // A maintenance job may finish first; wait specifically for the verification job.
    for (let attempt = 0; attempt < 50; attempt++) {
      if (
        (await pool.query("SELECT state FROM jobs WHERE id=$1", [jobs[0].id])).rows[0].state ===
        "done"
      )
        break;
      await delay(100);
    }
    expect(
      (await pool.query("SELECT state FROM jobs WHERE id=$1", [jobs[0].id])).rows[0].state,
    ).toBe("done");
    expect(await readdir(join(directory, ".local/notifications"))).toContain(`${jobs[0].id}.json`);
    expect(output).not.toContain("Unique-embedded-test-fixture-password");
    expect(output).not.toContain(url.href);
    child.kill("SIGTERM");
    expect(await exited).toBe(143);
    expect(
      (await pool.query("SELECT 1 FROM worker_heartbeats WHERE state='running'")).rowCount,
    ).toBe(0);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await exited;
    }
    await pool?.end();
    if (created) await parent.query(`DROP DATABASE ${name}`);
    await parent.end();
    await rm(directory, { recursive: true, force: true });
  }
});
