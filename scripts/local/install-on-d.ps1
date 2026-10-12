[CmdletBinding()]
param(
  [string]$SourceRoot,
  [string]$TargetRoot = "D:\Londos"
)

$ErrorActionPreference = "Stop"
function ConvertTo-NormalizedFolderPath {
  param(
    [Parameter(Mandatory = $true)][string]$Value,
    [Parameter(Mandatory = $true)][string]$Label
  )
  $Candidate = $Value.Trim().Trim('"')
  if ([string]::IsNullOrWhiteSpace($Candidate)) { throw "$Label cannot be empty." }
  try {
    return [IO.Path]::GetFullPath($Candidate).TrimEnd('\')
  } catch {
    throw "$Label contains an invalid Windows path. Extract Londos to a normal folder and rerun INSTALL-WINDOWS-ON-D.bat."
  }
}

$DerivedSourceRoot = Join-Path $PSScriptRoot "..\.."
$Source = if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  ConvertTo-NormalizedFolderPath $DerivedSourceRoot "Derived source root"
} else {
  ConvertTo-NormalizedFolderPath $SourceRoot "SourceRoot"
}
if (-not (Test-Path -LiteralPath (Join-Path $Source "package-lock.json") -PathType Leaf)) {
  throw "SourceRoot is not a complete Londos checkout: $Source"
}
if (-not (Test-Path -LiteralPath "D:\" -PathType Container)) {
  throw "Drive D: is unavailable. Connect or create drive D:, then rerun this launcher."
}

$SourceDrive = [IO.Path]::GetPathRoot($Source).TrimEnd('\')
if ($SourceDrive -ieq "D:") {
  $InstallRoot = $Source
  Write-Host "Londos is already on drive D. Installing in $InstallRoot"
} else {
  $InstallRoot = ConvertTo-NormalizedFolderPath $TargetRoot "TargetRoot"
  if ([IO.Path]::GetPathRoot($InstallRoot).TrimEnd('\') -ine "D:") {
    throw "TargetRoot must be a folder on drive D."
  }
  if (Test-Path -LiteralPath $InstallRoot) {
    $Existing = @(Get-ChildItem -LiteralPath $InstallRoot -Force -ErrorAction Stop)
    if ($Existing.Count -gt 0) {
      throw "$InstallRoot is not empty. Run its own installer or choose an empty target; Londos will not merge or overwrite it."
    }
  } else {
    New-Item -ItemType Directory -Path $InstallRoot | Out-Null
  }

  Write-Host "Copying a clean Londos checkout to $InstallRoot ..."
  $ExcludedDirectories = @(
    (Join-Path $Source ".git"),
    (Join-Path $Source ".local"),
    (Join-Path $Source "core"),
    (Join-Path $Source ".next"),
    (Join-Path $Source "node_modules"),
    (Join-Path $Source "dist"),
    (Join-Path $Source "playwright-report"),
    (Join-Path $Source "test-results")
  )
  $Arguments = @(
    $Source, $InstallRoot,
    '/E', '/COPY:DAT', '/DCOPY:DAT', '/R:2', '/W:1', '/NFL', '/NDL', '/NP',
    '/XD'
  ) + $ExcludedDirectories + @('/XF', '.env', '.env.local', '.env.*.local', '*.log')
  & robocopy.exe @Arguments | Out-Host
  $CopyExit = $LASTEXITCODE
  if ($CopyExit -ge 8) {
    throw "The clean copy to $InstallRoot failed with Robocopy exit code $CopyExit."
  }
  foreach ($Required in @('INSTALL-WINDOWS.bat', 'package.json', 'package-lock.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $InstallRoot $Required) -PathType Leaf)) {
      throw "The copied D-drive checkout is incomplete: $Required is missing."
    }
  }
  Write-Host "Clean D-drive checkout ready. Failed C-drive credentials and build outputs were not copied."
}

$Installer = Join-Path $InstallRoot "INSTALL-WINDOWS.bat"
Write-Host "Starting the contained Londos installer from $Installer"
Push-Location $InstallRoot
try {
  & $Installer
  $InstallExit = $LASTEXITCODE
} finally {
  Pop-Location
}
exit $InstallExit
