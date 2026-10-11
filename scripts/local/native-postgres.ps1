[CmdletBinding()]
param(
  [ValidateSet("install", "up", "stop")]
  [string]$Action = "up"
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$LocalDirectory = Join-Path $Root ".local"
$LogDirectory = Join-Path $LocalDirectory "logs"
$CredentialsPath = Join-Path $LocalDirectory "native-postgres.env"
$OptionFile = Join-Path $LocalDirectory "postgresql-installer.options"
$InstallLog = Join-Path $LogDirectory "postgresql-install.log"
$EnvPath = Join-Path $Root ".env.local"
$PostgresVersion = "18.6-5"
$PostgresSha256 = "227E2BC08091B4C2B8338C7D61B11D057F895711480B006F90BFCFCD2410A58A"
$PostgresUrl = "https://get.enterprisedb.com/postgresql/postgresql-$PostgresVersion-windows-x64.exe"
$PostgresService = "londos-postgresql-18"
$PostgresPort = "54329"

function New-HexSecret {
  param([ValidateRange(16, 128)][int]$Bytes = 32)
  $Buffer = New-Object byte[] $Bytes
  $Generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $Generator.GetBytes($Buffer) } finally { $Generator.Dispose() }
  return (($Buffer | ForEach-Object { $_.ToString("x2") }) -join "")
}

function Set-PrivateFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )
  $Directory = Split-Path -Parent $Path
  New-Item -ItemType Directory -Force -Path $Directory | Out-Null
  [IO.File]::WriteAllText($Path, $Content, (New-Object Text.UTF8Encoding($false)))
  try {
    $Acl = New-Object Security.AccessControl.FileSecurity
    $Acl.SetAccessRuleProtection($true, $false)
    $Identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $Rule = New-Object Security.AccessControl.FileSystemAccessRule(
      $Identity,
      [Security.AccessControl.FileSystemRights]::FullControl,
      [Security.AccessControl.AccessControlType]::Allow
    )
    $Acl.AddAccessRule($Rule)
    $Administrators = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')
    $AdministratorRule = New-Object Security.AccessControl.FileSystemAccessRule(
      $Administrators,
      [Security.AccessControl.FileSystemRights]::FullControl,
      [Security.AccessControl.AccessControlType]::Allow
    )
    $Acl.AddAccessRule($AdministratorRule)
    Set-Acl -LiteralPath $Path -AclObject $Acl
  } catch {
    Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    throw "Could not restrict access to private file $Path. No credential file was retained."
  }
}

function Read-KeyValueFile {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Values = @{}
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $Values }
  foreach ($Line in [IO.File]::ReadAllLines($Path)) {
    if ($Line -match '^([A-Z][A-Z0-9_]*)=(.*)$') { $Values[$Matches[1]] = $Matches[2] }
  }
  return $Values
}

function Assert-LocalEnvironmentIsSafe {
  $Existing = Read-KeyValueFile $EnvPath
  if ($Existing.DATABASE_URL) {
    try { $ExistingDatabase = [Uri]$Existing.DATABASE_URL }
    catch { throw ".env.local contains an invalid DATABASE_URL; it was not overwritten." }
    if ($ExistingDatabase.Scheme -notin @('postgresql', 'postgres')) {
      throw ".env.local does not select PostgreSQL. It was preserved and native installation stopped."
    }
    if ($ExistingDatabase.Host -notin @('localhost', '127.0.0.1', '[::1]', '::1')) {
      throw ".env.local selects a hosted database. It was preserved; use INSTALL-AIVEN-WINDOWS.bat for server mode."
    }
  }
  if ($Existing.AUTH_SECRET -and $Existing.AUTH_SECRET.Length -lt 32) {
    throw ".env.local AUTH_SECRET is shorter than 32 characters; it was not overwritten."
  }
}

function Convert-SecureStringToText {
  param([Parameter(Mandatory = $true)][Security.SecureString]$Value)
  $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer) }
}

function Add-PostgresBinCandidate {
  param(
    [System.Collections.Generic.List[string]]$Candidates,
    [AllowNull()][string]$Value
  )
  if ([string]::IsNullOrWhiteSpace($Value)) { return }
  $Candidate = [Environment]::ExpandEnvironmentVariables($Value.Trim().Trim('"'))
  if (Test-Path -LiteralPath $Candidate -PathType Leaf) {
    $Candidate = Split-Path -Parent $Candidate
  }
  if ((Split-Path -Leaf $Candidate) -ne "bin") { $Candidate = Join-Path $Candidate "bin" }
  try { $Candidate = [IO.Path]::GetFullPath($Candidate) } catch { return }
  if (-not $Candidates.Contains($Candidate)) { $null = $Candidates.Add($Candidate) }
}

function Find-PostgresInstallation {
  $Candidates = New-Object 'System.Collections.Generic.List[string]'
  Add-PostgresBinCandidate $Candidates $env:LONDOS_POSTGRES_BIN
  $PsqlCommand = Get-Command psql.exe -ErrorAction SilentlyContinue
  if ($PsqlCommand) { Add-PostgresBinCandidate $Candidates $PsqlCommand.Source }

  foreach ($RegistryPath in @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )) {
    foreach ($Record in @(Get-ItemProperty -Path $RegistryPath -ErrorAction SilentlyContinue)) {
      if ($Record.DisplayName -like 'PostgreSQL 18*') {
        Add-PostgresBinCandidate $Candidates $Record.InstallLocation
        Add-PostgresBinCandidate $Candidates $Record.DisplayIcon
      }
    }
  }
  Add-PostgresBinCandidate $Candidates (Join-Path $env:ProgramFiles "PostgreSQL\18")

  foreach ($Candidate in $Candidates) {
    $Psql = Join-Path $Candidate "psql.exe"
    $Ready = Join-Path $Candidate "pg_isready.exe"
    if ((Test-Path -LiteralPath $Psql -PathType Leaf) -and
        (Test-Path -LiteralPath $Ready -PathType Leaf)) {
      return [PSCustomObject]@{ Bin = $Candidate; Psql = $Psql; Ready = $Ready }
    }
  }
  return $null
}

function Get-PostgresService {
  $Exact = Get-Service -Name $PostgresService -ErrorAction SilentlyContinue
  if ($Exact) { return $Exact }
  return Get-Service -Name 'postgresql-x64-18' -ErrorAction SilentlyContinue |
    Select-Object -First 1
}

function Test-PostgresReady {
  param(
    [Parameter(Mandatory = $true)]$Installation,
    [Parameter(Mandatory = $true)][string]$Port
  )
  & $Installation.Ready -q -h 127.0.0.1 -p $Port -d postgres *> $null
  return $LASTEXITCODE -eq 0
}

function Wait-Postgres {
  param(
    [Parameter(Mandatory = $true)]$Installation,
    [Parameter(Mandatory = $true)][string]$Port
  )
  for ($Attempt = 0; $Attempt -lt 90; $Attempt++) {
    if (Test-PostgresReady $Installation $Port) { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Invoke-ServiceControl {
  param(
    [Parameter(Mandatory = $true)][ValidateSet("Start", "Restart")][string]$Operation,
    [Parameter(Mandatory = $true)][string]$Name
  )
  if ($Name -notmatch '^[A-Za-z0-9_.-]+$') { throw "PostgreSQL service name is invalid." }
  $Command = if ($Operation -eq 'Start') {
    "Start-Service -Name '$Name'"
  } else {
    "Restart-Service -Name '$Name'"
  }
  try {
    $Process = Start-Process -FilePath "powershell.exe" -Verb RunAs -Wait -PassThru `
      -ArgumentList @('-NoLogo', '-NoProfile', '-Command', $Command)
  } catch {
    throw "Administrator permission was cancelled; PostgreSQL service $Operation did not run."
  }
  if ($Process.ExitCode -ne 0) {
    throw "PostgreSQL service $Operation failed with exit code $($Process.ExitCode)."
  }
}

function Ensure-PostgresService {
  param(
    [Parameter(Mandatory = $true)]$Installation,
    [Parameter(Mandatory = $true)][string]$Port
  )
  if (Test-PostgresReady $Installation $Port) { return }
  $Service = Get-PostgresService
  if (-not $Service) { throw "PostgreSQL 18 is installed but its Windows service was not found." }
  if ($Service.Status -ne 'Running') { Invoke-ServiceControl "Start" $Service.Name }
  if (-not (Wait-Postgres $Installation $Port)) {
    throw "PostgreSQL did not become ready on 127.0.0.1:$Port. Check the Windows service and PostgreSQL logs."
  }
}

function Get-OrCreateCredentials {
  param([bool]$ExistingInstallation)
  $Values = Read-KeyValueFile $CredentialsPath
  if ($Values.Count -gt 0) {
    foreach ($Key in @(
      'POSTGRES_SUPERUSER', 'POSTGRES_SUPERUSER_PASSWORD', 'POSTGRES_APP_USER',
      'POSTGRES_APP_PASSWORD', 'POSTGRES_DB', 'POSTGRES_HOST', 'POSTGRES_PORT'
    )) {
      if ([string]::IsNullOrWhiteSpace($Values[$Key])) {
        throw "$CredentialsPath is incomplete. Restore it or move it aside before rerunning."
      }
    }
    if ($Values.POSTGRES_APP_PASSWORD -notmatch '^[0-9a-f]{64}$') {
      throw "$CredentialsPath contains an invalid Londos application password."
    }
    return $Values
  }

  if ($ExistingInstallation) {
    Write-Host "PostgreSQL 18 already exists. Enter its postgres superuser password to create the isolated Londos database."
    $Secure = Read-Host "PostgreSQL postgres password" -AsSecureString
    $SuperPassword = Convert-SecureStringToText $Secure
    if ([string]::IsNullOrWhiteSpace($SuperPassword) -or $SuperPassword -match '[\r\n]') {
      throw "A non-empty PostgreSQL password is required."
    }
    $Port = if ($env:LONDOS_POSTGRES_PORT) { $env:LONDOS_POSTGRES_PORT } else { "5432" }
  } else {
    $SuperPassword = New-HexSecret 32
    $Port = $PostgresPort
  }
  if ($Port -notmatch '^\d+$' -or [int]$Port -lt 1 -or [int]$Port -gt 65535) {
    throw "LONDOS_POSTGRES_PORT must be between 1 and 65535."
  }
  $Content = @(
    'POSTGRES_SUPERUSER=postgres',
    "POSTGRES_SUPERUSER_PASSWORD=$SuperPassword",
    'POSTGRES_APP_USER=londos',
    "POSTGRES_APP_PASSWORD=$(New-HexSecret 32)",
    'POSTGRES_DB=londos_development',
    'POSTGRES_HOST=127.0.0.1',
    "POSTGRES_PORT=$Port",
    ''
  ) -join "`r`n"
  Set-PrivateFile $CredentialsPath $Content
  return Read-KeyValueFile $CredentialsPath
}

function Install-Postgres {
  param([Parameter(Mandatory = $true)]$Credentials)
  $Architecture = if ($env:PROCESSOR_ARCHITEW6432) {
    $env:PROCESSOR_ARCHITEW6432
  } else {
    $env:PROCESSOR_ARCHITECTURE
  }
  if ($Architecture -ne 'AMD64') {
    throw "The verified PostgreSQL Windows installer supports x64 Windows; found $Architecture."
  }

  $Downloads = Join-Path $LocalDirectory "runtime\downloads"
  $Installer = Join-Path $Downloads "postgresql-$PostgresVersion-windows-x64.exe"
  New-Item -ItemType Directory -Force -Path $Downloads | Out-Null
  $NeedsDownload = -not (Test-Path -LiteralPath $Installer -PathType Leaf)
  if (-not $NeedsDownload) {
    $Actual = (Get-FileHash -LiteralPath $Installer -Algorithm SHA256).Hash.ToUpperInvariant()
    if ($Actual -ne $PostgresSha256) {
      Remove-Item -LiteralPath $Installer -Force
      $NeedsDownload = $true
    } else {
      Write-Host "Using the cached, checksum-verified PostgreSQL $PostgresVersion installer."
    }
  }
  if ($NeedsDownload) {
    Write-Host "Downloading PostgreSQL $PostgresVersion from the official EDB distribution..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -UseBasicParsing -Uri $PostgresUrl -OutFile $Installer
  }
  $Actual = (Get-FileHash -LiteralPath $Installer -Algorithm SHA256).Hash.ToUpperInvariant()
  if ($Actual -ne $PostgresSha256) {
    Remove-Item -LiteralPath $Installer -Force -ErrorAction SilentlyContinue
    throw "PostgreSQL installer checksum verification failed; refusing to execute it."
  }

  $Prefix = Join-Path $env:ProgramFiles "PostgreSQL\18"
  $Options = @(
    'mode=unattended',
    'unattendedmodeui=minimal',
    "prefix=$Prefix",
    "datadir=$(Join-Path $Prefix 'data')",
    "serverport=$($Credentials.POSTGRES_PORT)",
    "servicename=$PostgresService",
    'superaccount=postgres',
    "superpassword=$($Credentials.POSTGRES_SUPERUSER_PASSWORD)",
    "servicepassword=$($Credentials.POSTGRES_SUPERUSER_PASSWORD)",
    'disable-components=pgAdmin,stackbuilder',
    'create_shortcuts=0',
    ''
  ) -join "`r`n"
  Set-PrivateFile $OptionFile $Options
  New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null
  try {
    Write-Host "Windows will request Administrator permission for the verified PostgreSQL installer."
    $Process = Start-Process -FilePath $Installer -Verb RunAs -Wait -PassThru `
      -ArgumentList @('--optionfile', ('"{0}"' -f $OptionFile))
    $Summary = @(
      'Londos native PostgreSQL installation',
      "Time: $([DateTimeOffset]::Now.ToString('o'))",
      "Version: $PostgresVersion",
      "Installer SHA-256 verified: true",
      "Exit code: $($Process.ExitCode)",
      ''
    ) -join "`r`n"
    [IO.File]::WriteAllText($InstallLog, $Summary, (New-Object Text.UTF8Encoding($false)))
    if ($Process.ExitCode -ne 0) {
      throw "PostgreSQL installation failed with exit code $($Process.ExitCode). See $InstallLog."
    }
  } catch {
    if ($_.Exception.Message -like 'PostgreSQL installation failed*') { throw }
    throw "Administrator permission was cancelled or PostgreSQL could not be started: $($_.Exception.Message)"
  } finally {
    Remove-Item -LiteralPath $OptionFile -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-PsqlFile {
  param(
    [Parameter(Mandatory = $true)]$Installation,
    [Parameter(Mandatory = $true)]$Credentials,
    [Parameter(Mandatory = $true)][string]$Sql
  )
  $SqlPath = Join-Path $LocalDirectory "native-postgres-bootstrap.sql"
  Set-PrivateFile $SqlPath $Sql
  $PreviousPassword = $env:PGPASSWORD
  try {
    $env:PGPASSWORD = $Credentials.POSTGRES_SUPERUSER_PASSWORD
    & $Installation.Psql -X -w -h $Credentials.POSTGRES_HOST -p $Credentials.POSTGRES_PORT `
      -U $Credentials.POSTGRES_SUPERUSER -d postgres --set ON_ERROR_STOP=1 --file $SqlPath *> $null
    if ($LASTEXITCODE -ne 0) {
      throw "PostgreSQL rejected the local provisioning transaction. Verify the saved postgres password and service port."
    }
  } finally {
    $env:PGPASSWORD = $PreviousPassword
    Remove-Item -LiteralPath $SqlPath -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-PsqlScalar {
  param(
    [Parameter(Mandatory = $true)]$Installation,
    [Parameter(Mandatory = $true)]$Credentials,
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string]$User,
    [Parameter(Mandatory = $true)][string]$Password,
    [Parameter(Mandatory = $true)][string]$Sql
  )
  $PreviousPassword = $env:PGPASSWORD
  try {
    $env:PGPASSWORD = $Password
    $Output = & $Installation.Psql -X -w -qAt -h $Credentials.POSTGRES_HOST `
      -p $Credentials.POSTGRES_PORT -U $User -d $Database -c $Sql 2>$null
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL connection verification failed." }
    return ($Output | Out-String).Trim()
  } finally {
    $env:PGPASSWORD = $PreviousPassword
  }
}

function Set-LocalEnvironment {
  param([Parameter(Mandatory = $true)]$Credentials)
  Assert-LocalEnvironmentIsSafe
  $Existing = Read-KeyValueFile $EnvPath
  $AuthSecret = $Existing.AUTH_SECRET
  if ([string]::IsNullOrWhiteSpace($AuthSecret)) { $AuthSecret = New-HexSecret 48 }
  if ($AuthSecret.Length -lt 32) {
    throw ".env.local AUTH_SECRET is shorter than 32 characters; it was not overwritten."
  }
  $Managed = [ordered]@{
    DEPLOY_MODE = 'selfhosted'
    LONDOS_CORE_ENABLED = 'true'
    LONDOS_DATA_SOURCE = 'database'
    LONDOS_DATABASE_ENGINE = 'postgresql'
    DATABASE_URL = "postgresql://$($Credentials.POSTGRES_APP_USER):$($Credentials.POSTGRES_APP_PASSWORD)@$($Credentials.POSTGRES_HOST):$($Credentials.POSTGRES_PORT)/$($Credentials.POSTGRES_DB)"
    AUTH_SECRET = $AuthSecret
    AUTH_BASE_URL = 'http://127.0.0.1:3000'
    LONDOS_LOCAL_ADAPTERS = 'true'
  }
  $Result = New-Object 'System.Collections.Generic.List[string]'
  $Written = @{}
  if (Test-Path -LiteralPath $EnvPath -PathType Leaf) {
    foreach ($Line in [IO.File]::ReadAllLines($EnvPath)) {
      if ($Line -match '^([A-Z][A-Z0-9_]*)=') {
        $Key = $Matches[1]
        if ($Managed.Contains($Key)) {
          if (-not $Written[$Key]) {
            $null = $Result.Add("$Key=$($Managed[$Key])")
            $Written[$Key] = $true
          }
          continue
        }
      }
      $null = $Result.Add($Line)
    }
  }
  foreach ($Key in $Managed.Keys) {
    if (-not $Written[$Key]) { $null = $Result.Add("$Key=$($Managed[$Key])") }
  }
  while ($Result.Count -gt 0 -and [string]::IsNullOrWhiteSpace($Result[$Result.Count - 1])) {
    $Result.RemoveAt($Result.Count - 1)
  }
  Set-PrivateFile $EnvPath (($Result -join "`r`n") + "`r`n")
}

function Initialize-LondosDatabase {
  param(
    [Parameter(Mandatory = $true)]$Installation,
    [Parameter(Mandatory = $true)]$Credentials
  )
  Ensure-PostgresService $Installation $Credentials.POSTGRES_PORT
  $ListenAddresses = Invoke-PsqlScalar $Installation $Credentials 'postgres' `
    $Credentials.POSTGRES_SUPERUSER $Credentials.POSTGRES_SUPERUSER_PASSWORD 'SHOW listen_addresses'
  if ($ListenAddresses -notin @('localhost', '127.0.0.1', '::1')) {
    Invoke-PsqlFile $Installation $Credentials "ALTER SYSTEM SET listen_addresses = 'localhost';`r`n"
    $Service = Get-PostgresService
    if (-not $Service) { throw "PostgreSQL service was not found for the loopback-only restart." }
    Invoke-ServiceControl "Restart" $Service.Name
    if (-not (Wait-Postgres $Installation $Credentials.POSTGRES_PORT)) {
      throw "PostgreSQL did not return after applying loopback-only listening."
    }
  }

  $Sql = @"
\set ON_ERROR_STOP on
SET password_encryption = 'scram-sha-256';
DO `$londos`$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$($Credentials.POSTGRES_APP_USER)') THEN
    ALTER ROLE $($Credentials.POSTGRES_APP_USER) LOGIN CREATEDB CREATEROLE NOSUPERUSER PASSWORD '$($Credentials.POSTGRES_APP_PASSWORD)';
  ELSE
    CREATE ROLE $($Credentials.POSTGRES_APP_USER) LOGIN CREATEDB CREATEROLE NOSUPERUSER PASSWORD '$($Credentials.POSTGRES_APP_PASSWORD)';
  END IF;
END;
`$londos`$;
SELECT format('CREATE DATABASE %I OWNER TO %I', '$($Credentials.POSTGRES_DB)', '$($Credentials.POSTGRES_APP_USER)')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '$($Credentials.POSTGRES_DB)')
\gexec
ALTER DATABASE $($Credentials.POSTGRES_DB) OWNER TO $($Credentials.POSTGRES_APP_USER);
"@
  Invoke-PsqlFile $Installation $Credentials $Sql
  $Identity = Invoke-PsqlScalar $Installation $Credentials $Credentials.POSTGRES_DB `
    $Credentials.POSTGRES_APP_USER $Credentials.POSTGRES_APP_PASSWORD `
    "SELECT current_database() || ':' || current_user"
  if ($Identity -ne "$($Credentials.POSTGRES_DB):$($Credentials.POSTGRES_APP_USER)") {
    throw "The Londos PostgreSQL role/database verification returned an unexpected identity."
  }
  Set-LocalEnvironment $Credentials
  Write-Host "Native PostgreSQL is ready on loopback port $($Credentials.POSTGRES_PORT)."
  Write-Host "The Londos database and ignored private .env.local configuration are ready."
}

if ($Action -eq 'stop') {
  Write-Host "Native PostgreSQL remains running as a Windows service; Londos data is preserved."
  exit 0
}

Assert-LocalEnvironmentIsSafe
$Installation = Find-PostgresInstallation
$Credentials = Get-OrCreateCredentials ([bool]$Installation)
if (-not $Installation) {
  if ($Action -ne 'install') {
    throw "Native PostgreSQL 18 is not installed. Run INSTALL-WINDOWS.bat first."
  }
  Install-Postgres $Credentials
  $Installation = Find-PostgresInstallation
  if (-not $Installation) {
    throw "PostgreSQL installation completed but psql.exe was not found. See $InstallLog."
  }
} else {
  Write-Host "Using the existing PostgreSQL 18 installation."
}
Initialize-LondosDatabase $Installation $Credentials
