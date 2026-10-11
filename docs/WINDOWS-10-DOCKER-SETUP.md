# Windows 10 Pro Docker setup for Londos

Use this checklist when installing Londos on a Windows 10 Pro machine, especially when Windows
Package Manager reports Docker Desktop exit code `-1978335226` (`0x8A150006`).

## Required Windows configuration

Docker Desktop supports Windows 10 Pro when the machine meets its current requirements:

- Windows 10 64-bit Pro, version 22H2, build 19045.
- WSL version 2.1.5 or newer with the WSL 2 Windows feature enabled.
- A 64-bit processor with Second Level Address Translation (SLAT).
- At least 8 GB of RAM.
- Hardware virtualization enabled in BIOS or UEFI.

These requirements were checked on 11 October 2026 against Docker's official
[Windows installation documentation](https://docs.docker.com/desktop/setup/install/windows-install/).

## 1. Check the Windows version

Press `Win + R`, enter `winver`, and press Enter. Confirm that the dialog reports Windows 10
version 22H2 and operating-system build 19045. Install all available Windows updates and restart if
the machine is on an older build.

## 2. Check or install WSL 2

Open PowerShell and run:

```powershell
wsl --version
wsl --status
```

If WSL is missing, outdated, or does not report version information, open PowerShell as
Administrator and run:

```powershell
wsl --install --no-distribution
wsl --update
```

Restart Windows after enabling or updating WSL. Then rerun `wsl --version` and `wsl --status`.
Docker Desktop currently requires WSL 2.1.5 or newer.

## 3. Check hardware virtualization

Open Task Manager, select **Performance**, then **CPU**. The details must show
`Virtualization: Enabled`.

If it says `Disabled`, enable Intel VT-x/VT-d or AMD-V/SVM in the machine's BIOS or UEFI settings.
The exact name and location depend on the computer manufacturer. This setting cannot be enabled by
the Londos installer.

## 4. Restart after pending system changes

Restart Windows after Windows Update, WSL installation, virtualization changes, or a previous
Docker Desktop installation attempt. A pending restart can prevent Docker's installer from
completing even when winget downloaded it successfully.

## 5. Run the Londos installer

Pull or download the latest version of the current Londos branch. Double-click
`INSTALL-WINDOWS.bat` normally and approve the single Windows administrator prompt when it appears.
Running the whole installer as Administrator is supported, but normal execution is preferred so
application and cache files remain owned by the signed-in user.

The installer now searches for Docker Desktop using:

- the current `PATH`;
- Windows uninstall and application registration;
- the Docker Windows service and running Docker processes;
- standard machine and per-user Docker locations; and
- the optional `LONDOS_DOCKER_DESKTOP_DIR` environment variable for a custom installation folder.

If Docker Desktop opens for the first time, accept its agreement and allow it to finish configuring
the WSL 2 backend. Rerun `INSTALL-WINDOWS.bat` afterward; the completed Docker installation and
download caches will be reused.

## Understanding error `0x8A150006`

The signed decimal code `-1978335226` is hexadecimal `0x8A150006`. Microsoft identifies this as
`APPINSTALLER_CLI_ERROR_SHELLEXEC_INSTALL_FAILED`. It means winget's package-installer process did
not complete successfully. It does not mean that Londos failed to request administrator permission.

Common causes include:

- WSL 2 is absent or outdated;
- hardware virtualization is disabled;
- Windows is waiting for a restart;
- an existing Docker installation is damaged or only partially registered; or
- the machine does not meet Docker Desktop's current Windows requirements.

The wrapper code alone does not identify which cause applies.

## Diagnostic files

If installation still fails, inspect these local files:

```text
.local\logs\windows-install-error.log
.local\logs\winget-docker-install.log
```

The second file captures the underlying winget/Docker output from the latest attempt. Both files
are ignored by Git and must not be committed. Check them for private Windows usernames or paths
before sharing them.

If Windows lists Docker Desktop under **Settings > Apps > Installed apps** but Londos cannot locate
it, repair Docker Desktop there or set `LONDOS_DOCKER_DESKTOP_DIR` to the folder containing
`Docker Desktop.exe`, then rerun the installer.

For the complete Londos installation and launcher workflow, see
[One-click local installation and role launchers](./LOCAL-INSTALLATION.md).
