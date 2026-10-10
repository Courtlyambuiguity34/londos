param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("export-aiven", "restore-local", "nightly-backup", "check-tools")]
  [string]$Action,
  [string]$Path
)

$ErrorActionPreference = "Stop"
$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$Arguments = @((Join-Path $ScriptDirectory "postgres-tools.mjs"), $Action)
if ($Path) { $Arguments += $Path }
& node @Arguments
exit $LASTEXITCODE
