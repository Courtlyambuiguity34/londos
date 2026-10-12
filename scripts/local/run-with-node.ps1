[CmdletBinding()]
param(
  [switch]$Bootstrap,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$LauncherArguments
)

$ErrorActionPreference = "Stop"
$NodeVersion = "24.19.0"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

$processor = $env:PROCESSOR_ARCHITECTURE
if ($env:PROCESSOR_ARCHITEW6432) { $processor = $env:PROCESSOR_ARCHITEW6432 }
$NodeArch = switch ($processor.ToUpperInvariant()) {
  "AMD64" { "x64" }
  "ARM64" { "arm64" }
  default { throw "Unsupported processor architecture: $processor (supported: x64 and arm64)." }
}

$Archive = "node-v$NodeVersion-win-$NodeArch.zip"
$Runtime = Join-Path $Root ".local\runtime\node-v$NodeVersion-win-$NodeArch"
$PrivateNode = Join-Path $Runtime "node.exe"

function Test-SupportedNode([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
  try {
    $version = (& $Path -p "process.versions.node" 2>$null).Trim().Split(".")
    return [int]$version[0] -eq 24 -and [int]$version[1] -ge 19
  } catch {
    return $false
  }
}

function Install-PrivateNode {
  $BaseUrl = "https://nodejs.org/dist/v$NodeVersion"
  $Downloads = Join-Path $Root ".local\runtime\downloads"
  $ArchivePath = Join-Path $Downloads $Archive
  $SumsPath = Join-Path $Downloads "SHASUMS256-v$NodeVersion.txt"
  $Staging = Join-Path $Root ".local\runtime\.node-$NodeVersion-$NodeArch-$PID"
  New-Item -ItemType Directory -Force -Path $Downloads | Out-Null

  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  # Refresh the small official checksum list before trusting a retained archive.
  Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/SHASUMS256.txt" -OutFile $SumsPath

  $escapedArchive = [Regex]::Escape($Archive)
  $sumLine = Select-String -LiteralPath $SumsPath -Pattern "^([0-9a-fA-F]{64})\s+\*?$escapedArchive$" |
    Select-Object -First 1
  if (-not $sumLine) { throw "The official Node checksum list does not contain $Archive." }
  $Expected = $sumLine.Matches[0].Groups[1].Value.ToLowerInvariant()
  if (-not (Test-Path -LiteralPath $ArchivePath -PathType Leaf)) {
    Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/$Archive" -OutFile $ArchivePath
  }
  $Actual = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($Actual -ne $Expected) {
    Write-Host "The cached Node archive failed verification; downloading a clean copy..."
    Remove-Item -LiteralPath $ArchivePath -Force
    Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/$Archive" -OutFile $ArchivePath
    $Actual = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  } else {
    Write-Host "Using the cached, checksum-verified Node.js archive."
  }
  if ($Actual -ne $Expected) { throw "Node archive checksum verification failed; refusing to extract it." }

  if (Test-Path -LiteralPath $Staging) { Remove-Item -LiteralPath $Staging -Recurse -Force }
  New-Item -ItemType Directory -Path $Staging | Out-Null
  Expand-Archive -LiteralPath $ArchivePath -DestinationPath $Staging
  $Extracted = Join-Path $Staging "node-v$NodeVersion-win-$NodeArch"
  $ExtractedNode = Join-Path $Extracted "node.exe"
  if (-not (Test-SupportedNode $ExtractedNode)) {
    throw "The verified Node archive did not contain the expected executable."
  }
  if (Test-Path -LiteralPath $Runtime) { Remove-Item -LiteralPath $Runtime -Recurse -Force }
  Move-Item -LiteralPath $Extracted -Destination $Runtime
  Remove-Item -LiteralPath $Staging -Recurse -Force
  Write-Host "Installed verified private Node.js $NodeVersion for Windows-$NodeArch."
}

if ($Bootstrap) {
  if (-not (Test-SupportedNode $PrivateNode)) {
    Write-Host "Downloading the pinned private Node.js runtime from nodejs.org..."
    Install-PrivateNode
  }
  $NodeCommand = $PrivateNode
} elseif (Test-SupportedNode $PrivateNode) {
  $NodeCommand = $PrivateNode
} else {
  $SystemNode = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($SystemNode -and (Test-SupportedNode $SystemNode.Source)) {
    $NodeCommand = $SystemNode.Source
  } else {
    throw "Londos needs Node.js 24.19+ in the 24.x line. Run INSTALL-WINDOWS.bat first."
  }
}

$env:Path = "$(Split-Path -Parent $NodeCommand);$env:Path"
$NpmCache = Join-Path $Root ".local\runtime\npm-cache"
New-Item -ItemType Directory -Force -Path $NpmCache | Out-Null
$env:NPM_CONFIG_CACHE = $NpmCache
$env:NPM_CONFIG_UPDATE_NOTIFIER = "false"
Set-Location $Root
& $NodeCommand "scripts\local\launcher.mjs" @LauncherArguments
exit $LASTEXITCODE
