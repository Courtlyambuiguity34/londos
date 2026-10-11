# Windows 10 Pro Docker setup for Londos (legacy)

> **Current default:** Londos no longer installs or requires Docker for Windows local mode.
> `INSTALL-WINDOWS.bat` installs verified native PostgreSQL directly. Follow
> [Windows native PostgreSQL setup](./WINDOWS-NATIVE-POSTGRESQL.md).

This page preserves the diagnosis of the earlier Docker installer error. It is useful only if an
operator independently uses Docker Desktop for other workloads. The current Londos installer does
not call `winget` for Docker, does not require WSL, and does not inspect custom Docker locations.
It also does not uninstall Docker because containers, images, and volumes may belong to unrelated
projects.

## What the earlier error meant

The signed decimal code `-1978335226` is hexadecimal `0x8A150006`. Microsoft identifies it as
`APPINSTALLER_CLI_ERROR_SHELLEXEC_INSTALL_FAILED`: the package installer's process did not finish
successfully. It did not show that the Londos UAC handoff was wrong.

Common Docker-specific causes were:

- WSL 2 absent or outdated;
- hardware virtualization disabled;
- Windows waiting for a restart;
- a damaged or partially registered Docker installation; or
- an unsupported Windows build.

The photographed machine reported Windows 10 Pro version 21H2, OS build 19044.1288. Docker's
requirements checked on 11 October 2026 called for Windows 10 22H2/build 19045 and WSL 2.1.5 or
newer, so that machine did not meet the documented Docker Desktop baseline. This is why replacing
Docker in Londos's Windows path with native PostgreSQL is the safer route for this setup.

For Docker's current requirements, use its official
[Windows installation documentation](https://docs.docker.com/desktop/setup/install/windows-install/).
Do not reinstall Docker merely to run Londos. If another project needs Docker, update Windows,
confirm virtualization in Task Manager, install/update WSL through Microsoft's supported process,
and treat that as a separate administrator task.

## Old diagnostic files

Older Londos branches wrote:

```text
.local\logs\windows-install-error.log
.local\logs\winget-docker-install.log
```

The current installer still writes the first path for a safe failure summary, but no longer creates
the Docker log. Old local logs are ignored by Git and may contain private usernames or paths; inspect
them before sharing and do not commit them.
