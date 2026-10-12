[CmdletBinding()]
param(
  [string]$OutputDirectory
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $Root "Londos-Launchers" }

if ($env:OS -ne "Windows_NT") {
  throw "Windows launcher executables must be built on Windows. The BAT launchers remain usable."
}

$Launchers = @(
  @{ Name = "Londos Mall.exe"; Target = "START-WINDOWS.bat" },
  @{ Name = "Londos Shopkeeper.exe"; Target = "START-SHOPKEEPER-WINDOWS.bat" },
  @{ Name = "Londos Landlord.exe"; Target = "START-LANDLORD-WINDOWS.bat" },
  @{ Name = "Londos Preview.exe"; Target = "START-PREVIEW-WINDOWS.bat" },
  @{ Name = "Londos Temporary Demo.exe"; Target = "START-TEMPORARY-DEMO-WINDOWS.bat" },
  @{ Name = "Stop Londos.exe"; Target = "STOP-WINDOWS.bat" }
)

$SourceTemplate = @'
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

namespace LondosLaunchers
{
    internal static class __CLASS__
    {
        private const string TargetName = "__TARGET__";

        [STAThread]
        public static int Main()
        {
            try
            {
                string root = FindRoot();
                string target = Path.Combine(root, TargetName);
                Process.Start(new ProcessStartInfo
                {
                    FileName = target,
                    WorkingDirectory = root,
                    UseShellExecute = true
                });
                return 0;
            }
            catch (Exception error)
            {
                MessageBox.Show(error.Message, "Londos launcher", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }

        private static string FindRoot()
        {
            string candidate = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            for (int depth = 0; depth < 5 && !String.IsNullOrEmpty(candidate); depth++)
            {
                if (File.Exists(Path.Combine(candidate, "package.json")) &&
                    File.Exists(Path.Combine(candidate, TargetName)))
                {
                    return candidate;
                }
                DirectoryInfo parent = Directory.GetParent(candidate);
                candidate = parent == null ? null : parent.FullName;
            }
            throw new FileNotFoundException(
                "Keep the Londos-Launchers folder inside the Londos folder. Could not locate " + TargetName + "."
            );
        }
    }
}
'@

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$Index = 0
foreach ($Launcher in $Launchers) {
  $Index += 1
  $TargetPath = Join-Path $Root $Launcher.Target
  if (-not (Test-Path -LiteralPath $TargetPath -PathType Leaf)) {
    throw "Required launcher is missing: $($Launcher.Target)"
  }

  $OutputPath = Join-Path $OutputDirectory $Launcher.Name
  if (Test-Path -LiteralPath $OutputPath) { Remove-Item -LiteralPath $OutputPath -Force }
  $Source = $SourceTemplate.Replace("__CLASS__", "Launcher$Index").Replace("__TARGET__", $Launcher.Target)
  Add-Type -TypeDefinition $Source -Language CSharp -OutputAssembly $OutputPath `
    -OutputType WindowsApplication -ReferencedAssemblies @("System.dll", "System.Windows.Forms.dll") `
    -CompilerOptions "/optimize" | Out-Null

  if (-not (Test-Path -LiteralPath $OutputPath -PathType Leaf)) {
    throw "Windows did not create $($Launcher.Name)."
  }
  Write-Host "Created $OutputPath"
}

Write-Host "Packaged $($Launchers.Count) thin launcher executables."
Write-Host "They start the reviewed BAT files; keep this folder inside the Londos checkout."
Write-Host "Sign the executables with your organization code-signing certificate before public distribution."
exit 0
