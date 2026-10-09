import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
process.chdir(root);
const action = process.argv[2] ?? "start";
const mode = process.argv[3] ?? "preview";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
function run(args, env = process.env) {
  const r = spawnSync(npm, args, { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" });
  if (r.error || r.status !== 0) throw new Error(`Command failed: npm ${args[0]} ${args[1] ?? ""} (${r.error?.message ?? r.status})`);
}
function verify() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major !== 24) throw new Error("Londos requires Node.js 24.x; install the pinned version in .nvmrc.");
  const v = spawnSync(npm, ["--version"], { encoding: "utf8", shell: process.platform === "win32" });
  if (v.status !== 0 || Number(v.stdout.trim().split(".")[0]) !== 11)
    throw new Error("Londos requires npm 11.x. Run corepack/npm setup for the pinned packageManager version.");
}
try {
  verify();
  if (!["preview", "full"].includes(mode)) throw new Error("Mode must be preview or full.");
  if (action === "install") {
    run(["ci", "--no-fund"]);
    if (mode === "full") {
      console.log("Preparing local PostgreSQL using your Docker context...");
      run(["run", "db:local"]);
      run(["run", "db:migrate"]);
      run(["run", "db:seed"]);
    }
    console.log(`Londos ${mode} installation complete. Run the matching START launcher.`);
  } else if (action === "start") {
    if (!existsSync(resolve(root, "node_modules", "next")))
      throw new Error("Dependencies missing. Run the INSTALL launcher first.");
    const env = mode === "preview" ? { ...process.env, LONDOS_CORE_ENABLED: "false", LONDOS_DATA_SOURCE: "fixtures" } : process.env;
    if (mode === "full" && !existsSync(resolve(root, ".env.local")))
      throw new Error("Full mode needs .env.local. Run INSTALL with full mode first.");
    const children = [];
    const launch = (args) => {
      const child = spawn(npm, args, { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" });
      children.push(child);
      child.on("error", e => { console.error(e.message); shutdown(); });
      return child;
    };
    let stopping = false;
    function shutdown() {
      if (stopping) return;
      stopping = true;
      for (const child of children) if (child.exitCode === null) {
        if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        else child.kill("SIGTERM");
      }
    }
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    if (mode === "full") launch(["run", "worker:dev"]);
    const web = launch(["run", "dev"]);
    web.on("exit", () => { shutdown(); process.exitCode = web.exitCode ?? 1; });
    console.log("Londos starting at http://localhost:3000 — press Ctrl+C to stop.");
  } else if (action === "stop") {
    console.log("Stop the running START terminal with Ctrl+C. Database volume is preserved.");
    if (mode === "full") run(["run", "db:stop"]);
  } else throw new Error("Action must be install, start or stop.");
} catch (error) {
  console.error("Londos launcher:", error.message);
  process.exitCode = 1;
}
