import { execFileSync } from "node:child_process";

// Documentation-only handoffs may follow an immutable, verified implementation.
// Changes to any deployable source, test or build input invalidate that pin.
const sourcePaths = [
  ".",
  ":(top,exclude)docs",
  ":(top,exclude)README.md",
  ":(top,exclude)RECOMMENDATIONS.md",
];
export function observedSourcePin(candidate: string | null, cwd = process.cwd()) {
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const head = git(["rev-parse", "HEAD"]);
  const sourceDirty =
    git(["status", "--porcelain", "--untracked-files=all", "--", ...sourcePaths]).length > 0;
  if (candidate && /^[a-f0-9]{40}$/.test(candidate)) {
    try {
      git(["merge-base", "--is-ancestor", candidate, head]);
      git(["diff", "--quiet", candidate, head, "--", ...sourcePaths]);
      return { sourceCommit: candidate, sourceDirty };
    } catch {
      /* A missing, divergent or changed source cannot inherit evidence. */
    }
  }
  return { sourceCommit: head, sourceDirty: true };
}
