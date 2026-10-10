param(
  [ValidateSet("web", "worker")]
  [string]$Role = "web"
)

$ErrorActionPreference = "Stop"
$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
& node (Join-Path $ScriptDirectory "start-production.mjs") $Role
exit $LASTEXITCODE
