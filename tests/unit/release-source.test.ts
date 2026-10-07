import { test, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { observedSourcePin } from "../../scripts/release/source-pin";
async function repository(
  work: (directory: string, source: string, git: (args: string[]) => string) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "londos-release-pin-"));
  const git = (args: string[]) =>
    execFileSync("git", args, {
      cwd: directory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  try {
    git(["init", "--initial-branch=main"]);
    git(["config", "user.name", "Fictional release test"]);
    git(["config", "user.email", "test@londos.invalid"]);
    await mkdir(join(directory, "src"));
    await writeFile(join(directory, "src/app.ts"), "export const version = 1;\n");
    git(["add", "."]);
    git(["commit", "-m", "Implementation"]);
    await work(directory, git(["rev-parse", "HEAD"]), git);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
test("a documentation-only handoff preserves a clean ancestral implementation pin", async () => {
  await repository(async (directory, source, git) => {
    await writeFile(join(directory, "README.md"), "Release evidence\n");
    git(["add", "."]);
    git(["commit", "-m", "Documentation"]);
    expect(git(["rev-parse", "HEAD"])).not.toBe(source);
    expect(observedSourcePin(source, directory)).toEqual({
      sourceCommit: source,
      sourceDirty: false,
    });
  });
});
test("changed, untracked, committed or unknown implementation inputs invalidate inherited release evidence", async () => {
  await repository(async (directory, source, git) => {
    await mkdir(join(directory, "public"));
    await writeFile(join(directory, "public/new.svg"), "<svg/>\n");
    expect(observedSourcePin(source, directory).sourceDirty).toBe(true);
    await writeFile(join(directory, "src/new.ts"), "export const changed = true;\n");
    expect(observedSourcePin(source, directory).sourceDirty).toBe(true);
    git(["add", "."]);
    git(["commit", "-m", "Changed implementation"]);
    expect(observedSourcePin(source, directory).sourceDirty).toBe(true);
    expect(observedSourcePin("0".repeat(40), directory).sourceDirty).toBe(true);
    expect(observedSourcePin(null, directory).sourceDirty).toBe(true);
  });
});
