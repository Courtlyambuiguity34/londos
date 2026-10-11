import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const launcher = resolve(root, "scripts/local/launcher.mjs");

test("launcher help is side-effect free and documents supported modes and roles", () => {
  const output = execFileSync(process.execPath, [launcher, "help"], {
    encoding: "utf8",
    cwd: root,
  });
  expect(output).toContain("preview, local (or full), server");
  expect(output).toContain("mall, shopkeeper, landlord");
});

test("launcher rejects unknown modes before installing or starting", () => {
  const result = spawnSync(process.execPath, [launcher, "start", "production", "mall"], {
    encoding: "utf8",
    cwd: root,
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Mode must be preview, local, or server");
});

test("local configuration guard accepts only the marked loopback database shape", () => {
  const code = `
    import { assertLocalConfiguration } from ${JSON.stringify(pathToFileURL(launcher).href)};
    assertLocalConfiguration({
      DATABASE_URL: 'postgresql://londos:fixture@127.0.0.1:54329/londos_development',
      AUTH_SECRET: 'fixture-secret-at-least-thirty-two-characters',
      AUTH_BASE_URL: 'http://127.0.0.1:3000'
    });
    let rejected = false;
    try {
      assertLocalConfiguration({
        DATABASE_URL: 'postgresql://londos:fixture@database.example/londos',
        AUTH_SECRET: 'fixture-secret-at-least-thirty-two-characters',
        AUTH_BASE_URL: 'https://londos.example'
      });
    } catch { rejected = true; }
    if (!rejected) process.exit(2);
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", code], {
    encoding: "utf8",
    cwd: root,
  });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toBe("");
});

test("launcher derives local listening and browser origins from AUTH_BASE_URL", () => {
  const code = `
    import { launchTargets } from ${JSON.stringify(pathToFileURL(launcher).href)};
    const local = launchTargets('local', { AUTH_BASE_URL: 'http://127.0.0.1:3210' });
    if (JSON.stringify(local) !== JSON.stringify({
      port: '3210',
      healthOrigin: 'http://127.0.0.1:3210',
      publicOrigin: 'http://127.0.0.1:3210'
    })) process.exit(2);
    const server = launchTargets('server', {
      AUTH_BASE_URL: 'https://mall.example',
      PORT: '10000'
    });
    if (server.healthOrigin !== 'http://127.0.0.1:10000') process.exit(3);
    if (server.publicOrigin !== 'https://mall.example') process.exit(4);
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", code], {
    encoding: "utf8",
    cwd: root,
  });
  expect(result.status, result.stderr).toBe(0);
});

test("launcher rejects a local port that would break the configured authentication origin", () => {
  const code = `
    import { launchTargets } from ${JSON.stringify(pathToFileURL(launcher).href)};
    launchTargets('local', {
      AUTH_BASE_URL: 'http://127.0.0.1:3000',
      PORT: '3309'
    });
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", code], {
    encoding: "utf8",
    cwd: root,
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(
    "Local PORT 3309 must match AUTH_BASE_URL port 3000; change both together.",
  );
});

test("one-click installers bootstrap the private runtime and preserve role entry points", () => {
  const windowsInstaller = readFileSync(resolve(root, "INSTALL-WINDOWS.bat"), "utf8");
  expect(windowsInstaller).toContain("bootstrap-prerequisites.ps1");
  expect(windowsInstaller).toContain("INSTALL_EXIT=%ERRORLEVEL%");
  expect(windowsInstaller).toContain("windows-install-error.log");
  expect(readFileSync(resolve(root, "install-linux.sh"), "utf8")).toContain(
    "bootstrap-prerequisites.sh",
  );
  expect(readFileSync(resolve(root, "install-macos.command"), "utf8")).toContain(
    "bootstrap-prerequisites.sh",
  );
  expect(readFileSync(resolve(root, "START-WINDOWS.bat"), "utf8")).toContain("run-with-node.ps1");
  expect(readFileSync(resolve(root, "START-SHOPKEEPER-WINDOWS.bat"), "utf8")).toContain(
    "local shopkeeper",
  );
  expect(readFileSync(resolve(root, "START-LANDLORD-WINDOWS.bat"), "utf8")).toContain(
    "local landlord",
  );
  expect(readFileSync(resolve(root, "start-shopkeeper-linux.sh"), "utf8")).toContain(
    "start local shopkeeper",
  );
  expect(readFileSync(resolve(root, "start-landlord-macos.command"), "utf8")).toContain(
    "start local landlord",
  );
});

test("runtime bootstrap pins and verifies official Node downloads", () => {
  const shell = readFileSync(resolve(root, "scripts/local/run-with-node.sh"), "utf8");
  const powershell = readFileSync(resolve(root, "scripts/local/run-with-node.ps1"), "utf8");
  for (const content of [shell, powershell]) {
    expect(content).toContain("24.19.0");
    expect(content).toContain("https://nodejs.org/dist/");
    expect(content).toContain("SHASUMS256");
    expect(content).toContain(".local");
    expect(content).not.toMatch(/curl[^\n]*\|\s*(?:ba)?sh/);
  }
  expect(shell).toMatch(/sha256sum|shasum/);
  expect(powershell).toContain("Get-FileHash");
});

test("full local bootstrap handles Docker while preview and server keep it optional", () => {
  const shell = readFileSync(resolve(root, "scripts/local/bootstrap-prerequisites.sh"), "utf8");
  const powershell = readFileSync(
    resolve(root, "scripts/local/bootstrap-prerequisites.ps1"),
    "utf8",
  );
  expect(shell).toContain('if [ "$MODE" = "local" ] || [ "$MODE" = "full" ]');
  expect(shell).toContain("docker info");
  expect(powershell).toContain('$Mode -in @("local", "full")');
  expect(powershell).toContain("Docker.DockerDesktop");
  expect(powershell).toContain("LONDOS_DOCKER_DESKTOP_DIR");
  expect(powershell).toContain("Windows\\CurrentVersion\\Uninstall");
  expect(powershell).toContain("Windows\\CurrentVersion\\App Paths\\Docker Desktop.exe");
  expect(powershell).toContain("CurrentControlSet\\Services\\com.docker.service");
  expect(powershell).toContain("Programs\\DockerDesktop");
  expect(powershell).toContain("Using the existing Docker Desktop installation");
  expect(powershell).toContain("-Verb RunAs");
  expect(powershell).toContain("DockerInstallOnly");
  expect(powershell).toContain("Test-Administrator");
  expect(powershell).toContain("Administrator permission (UAC) prompt");
  expect(powershell).toContain("windows-install-error.log");
  expect(powershell).toContain("winget-docker-install.log");
  expect(powershell).toContain("Test-WingetDockerRegistered");
  expect(powershell).toContain("0x8A150006");
  expect(powershell).toContain("$null = $Roots.Add($Candidate)");
  expect(powershell.indexOf("Find-DockerInstallation")).toBeLessThan(
    powershell.indexOf("Docker.DockerDesktop"),
  );
});

test("Windows bootstrap reuses only a checksum-verified cached Node archive", () => {
  const powershell = readFileSync(resolve(root, "scripts/local/run-with-node.ps1"), "utf8");
  expect(powershell).toContain("Using the cached, checksum-verified Node.js archive");
  expect(powershell).toContain("The cached Node archive failed verification");
  expect(powershell).toMatch(/Test-Path[^\n]+\$ArchivePath[\s\S]+Invoke-WebRequest[^\n]+\$Archive/);
  expect(powershell).toMatch(/Get-FileHash[\s\S]+\$Actual -ne \$Expected/);
});
