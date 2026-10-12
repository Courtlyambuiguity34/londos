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
    assertLocalConfiguration({
      DATABASE_URL: 'postgresql://londos:fixture@localhost/londos_development',
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

test("local launcher passes generated private configuration to every child process", () => {
  const code = `
    import { localSubprocessEnvironment } from ${JSON.stringify(pathToFileURL(launcher).href)};
    const environment = localSubprocessEnvironment({
      DATABASE_URL: 'postgresql://londos:generated@127.0.0.1:54330/londos_development',
      AUTH_SECRET: 'generated-local-secret-at-least-thirty-two-characters',
      AUTH_BASE_URL: 'http://127.0.0.1:3000'
    }, {
      DATABASE_URL: 'postgresql://wrong:wrong@hosted.example/londos',
      AUTH_SECRET: 'wrong-secret',
      AUTH_BASE_URL: 'https://wrong.example',
      OPTIONAL_VALUE: 'preserved'
    });
    if (environment.DATABASE_URL !== 'postgresql://londos:generated@127.0.0.1:54330/londos_development') process.exit(2);
    if (environment.AUTH_SECRET !== 'generated-local-secret-at-least-thirty-two-characters') process.exit(3);
    if (environment.AUTH_BASE_URL !== 'http://127.0.0.1:3000') process.exit(4);
    if (environment.OPTIONAL_VALUE !== 'preserved') process.exit(5);
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", code], {
    encoding: "utf8",
    cwd: root,
  });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toBe("");

  const source = readFileSync(launcher, "utf8");
  expect(source).toContain('npmCommand(["run", "db:migrate"], { env });');
  expect(source).toContain('npmCommand(["run", "db:seed"], { env });');
  expect(source).toContain('npmCommand(["run", "build"], { env });');
  expect(source).toContain('npmCommand(["run", "db:local"], { env: runtime });');
  expect(source).toContain(": { ...runtime, PORT: port };");
});

test("Windows npm execution avoids deprecated shell argument concatenation", () => {
  const source = readFileSync(launcher, "utf8");
  expect(source).toContain(
    'resolve(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")',
  );
  expect(source).toContain("spawn(npmProgram, npmArguments(args)");
  expect(source).not.toContain('process.platform === "win32" ? "npm.cmd"');
  expect(source).not.toContain('shell: process.platform === "win32"');
});

test("Aiven shortcut guard requires an explicit hosted PostgreSQL configuration", () => {
  const code = `
    import { assertHostedConfiguration } from ${JSON.stringify(pathToFileURL(launcher).href)};
    assertHostedConfiguration({
      DATABASE_URL: 'postgresql://londos:fixture@hosted.example:5432/londos?sslmode=require',
      AUTH_SECRET: 'fixture-secret-at-least-thirty-two-characters',
      AUTH_BASE_URL: 'https://mall.example'
    });
    for (const DATABASE_URL of [
      'postgresql://londos:fixture@127.0.0.1:54329/londos',
      'mongodb+srv://hosted.example/londos',
      'postgresql://londos:fixture@hosted.example:5432/londos'
    ]) {
      let rejected = false;
      try {
        assertHostedConfiguration({
          DATABASE_URL,
          AUTH_SECRET: 'fixture-secret-at-least-thirty-two-characters',
          AUTH_BASE_URL: 'https://mall.example'
        });
      } catch { rejected = true; }
      if (!rejected) process.exit(2);
    }
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", code], {
    encoding: "utf8",
    cwd: root,
  });
  expect(result.status, result.stderr).toBe(0);
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
  const dDriveInstaller = readFileSync(resolve(root, "INSTALL-WINDOWS-ON-D.bat"), "utf8");
  const dDriveBootstrap = readFileSync(resolve(root, "scripts/local/install-on-d.ps1"), "utf8");
  const gitignore = readFileSync(resolve(root, ".gitignore"), "utf8");
  expect(windowsInstaller).toContain("bootstrap-prerequisites.ps1");
  expect(windowsInstaller).toContain("INSTALL_EXIT=%ERRORLEVEL%");
  expect(windowsInstaller).toContain("windows-install-error.log");
  expect(dDriveInstaller).toContain("install-on-d.ps1");
  expect(dDriveInstaller).not.toContain("-SourceRoot");
  expect(dDriveBootstrap).toContain('[string]$TargetRoot = "D:\\Londos"');
  expect(dDriveBootstrap).toContain('Join-Path $PSScriptRoot "..\\.."');
  expect(dDriveBootstrap).toContain("Derived source root");
  expect(dDriveBootstrap).toContain("ConvertTo-NormalizedFolderPath");
  expect(dDriveBootstrap).toContain("$Value.Trim().Trim('\"')");
  expect(dDriveBootstrap).toContain("$CopyExit -ge 8");
  expect(dDriveBootstrap).toContain('(Join-Path $Source ".local")');
  expect(dDriveBootstrap).toContain('(Join-Path $Source "core")');
  expect(gitignore).toMatch(/^core\/$/m);
  expect(dDriveBootstrap).toContain("is not empty");
  expect(dDriveBootstrap).not.toMatch(/Remove-Item|rmdir|rd \/s/i);
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
    expect(content).not.toMatch(/curl[^\n]*\|\s*(?:ba)?sh/);
  }
  expect(shell).toContain(".local");
  expect(powershell).toContain('$CoreDirectory = Join-Path $Root "core"');
  expect(powershell).not.toContain(".local\\runtime");
  expect(shell).toMatch(/sha256sum|shasum/);
  expect(powershell).toContain("Get-FileHash");
});

test("Windows local mode provisions verified native PostgreSQL while hosted mode stays explicit", () => {
  const shell = readFileSync(resolve(root, "scripts/local/bootstrap-prerequisites.sh"), "utf8");
  const bootstrap = readFileSync(
    resolve(root, "scripts/local/bootstrap-prerequisites.ps1"),
    "utf8",
  );
  const native = readFileSync(resolve(root, "scripts/local/native-postgres.ps1"), "utf8");
  const database = readFileSync(resolve(root, "scripts/dev-database.mjs"), "utf8");
  expect(shell).toContain('if [ "$MODE" = "local" ] || [ "$MODE" = "full" ]');
  expect(shell).toContain("docker info");
  expect(bootstrap).toContain('$Mode -in @("local", "full")');
  expect(bootstrap).toContain("native-postgres.ps1");
  expect(bootstrap).toContain("Hosted server mode selected");
  expect(bootstrap).not.toContain("Docker.DockerDesktop");
  expect(native).toContain('PostgresVersion = "18.6-5"');
  expect(native).toContain("227E2BC08091B4C2B8338C7D61B11D057F895711480B006F90BFCFCD2410A58A");
  expect(native).toContain("https://get.enterprisedb.com/postgresql/");
  expect(native).toContain("Get-FileHash");
  expect(native).toContain("Using the cached, checksum-verified PostgreSQL");
  expect(native).toContain(
    "Reused the checksum-verified PostgreSQL installer from the former .local cache",
  );
  expect(native).toContain(
    'Join-Path $LocalDirectory "runtime\\downloads\\postgresql-$PostgresVersion-windows-x64.exe"',
  );
  expect(native).toContain("$LegacyHash -eq $PostgresSha256");
  expect(native).toContain("$CopiedHash -ne $PostgresSha256");
  expect(native).toContain("Resolve-InstallPostgresPort");
  expect(native).toContain("Save-PostgresCredentials");
  expect(native).toContain("Saved PostgreSQL port $RequestedPort is unavailable");
  expect(native).toContain("Explicit LONDOS_POSTGRES_PORT $RequestedPort is unavailable");
  expect(native).toMatch(
    /if \(-not \$Installation\)[\s\S]+Resolve-InstallPostgresPort \$Credentials[\s\S]+Install-Postgres \$Credentials/,
  );
  expect(native).toContain("--optionfile");
  expect(native).toContain('$CoreDirectory = Join-Path $Root "core"');
  expect(native).toContain('Join-Path $CoreDirectory "runtime\\postgresql-18"');
  expect(native).toContain('Join-Path $CoreDirectory "data\\postgresql-18"');
  expect(native).toContain("LONDOS_ALLOW_EXTERNAL_POSTGRES");
  expect(native).toContain("LONDOS_PRESERVE_EXTERNAL_POSTGRES");
  expect(native).toContain("londos-postgresql-18-contained");
  expect(native).toContain("Get-RegisteredNonCorePostgres18");
  expect(native).toContain("Remove-RegisteredNonCorePostgres18");
  expect(native).toContain("Test-PathInsideCore");
  expect(native).not.toContain('Join-Path $LocalDirectory "data');
  expect(native).toContain("^PostgreSQL 18");
  expect(native).toContain("uninstall-postgresql.exe");
  expect(native).toContain("--mode', 'unattended");
  expect(native).toContain("Londos does not delete the old PostgreSQL data directory");
  expect(native).not.toMatch(/Remove-Item[^\n]*(?:PostgreSQL|PostgresPrefix|PostgresData)/i);
  expect(native).toContain("CREATE DATABASE %I OWNER %I");
  expect(native).not.toContain("CREATE DATABASE %I OWNER TO %I");
  expect(native).toContain("listen_addresses = 'localhost'");
  expect(native).toContain("POSTGRES_APP_USER=londos");
  expect(native).toContain("DEPLOY_MODE = 'selfhosted'");
  expect(native).toContain(".env.local selects a hosted database. It was preserved");
  expect(native).toContain("END;");
  expect(native).toContain('$SqlNonce = [Guid]::NewGuid().ToString("N")');
  expect(native).toContain('"native-postgres-bootstrap-$PID-$SqlNonce.sql"');
  expect(native).not.toContain('Join-Path $LocalDirectory "native-postgres-bootstrap.sql"');
  expect(native).not.toContain("Docker.DockerDesktop");
  expect(database).toContain('process.platform === "win32"');
  expect(database).toContain("native-postgres.ps1");
  const aivenInstall = readFileSync(resolve(root, "INSTALL-AIVEN-WINDOWS.bat"), "utf8");
  const aivenStart = readFileSync(resolve(root, "START-AIVEN-WINDOWS.bat"), "utf8");
  expect(aivenInstall).toContain('set "LONDOS_REQUIRE_HOSTED_DATABASE=true"');
  expect(aivenInstall).toContain('INSTALL-WINDOWS.bat" server');
  expect(aivenStart).toContain('set "LONDOS_REQUIRE_HOSTED_DATABASE=true"');
  expect(aivenStart).toContain('START-WINDOWS.bat" server');
});

test("Windows bootstrap reuses only a checksum-verified cached Node archive", () => {
  const powershell = readFileSync(resolve(root, "scripts/local/run-with-node.ps1"), "utf8");
  expect(powershell).toContain("Using the cached, checksum-verified Node.js archive");
  expect(powershell).toContain("The cached Node archive failed verification");
  expect(powershell).toContain('$CoreDirectory = Join-Path $Root "core"');
  expect(powershell).toContain('Join-Path $CoreDirectory "runtime\\npm-cache"');
  expect(powershell).toContain("$env:NPM_CONFIG_CACHE = $NpmCache");
  expect(powershell).toMatch(/Test-Path[^\n]+\$ArchivePath[\s\S]+Invoke-WebRequest[^\n]+\$Archive/);
  expect(powershell).toMatch(/Get-FileHash[\s\S]+\$Actual -ne \$Expected/);
});
