# Local launchers (Windows, Linux, macOS)

Requires Node.js 24.x and npm 11.x. Dependencies are installed only in the repository's `node_modules`; Python `.venv` is not appropriate for this Node/Next.js project. The install step uses the committed npm lockfile.

**Windows:** double-click `INSTALL-WINDOWS.bat`, then `START-WINDOWS.bat`. Keep the start terminal open. Ctrl+C stops web and worker. Default mode is public fixture preview, no Docker required.

**Linux:** `sh install-linux.sh`, then `sh start-linux.sh`.

**macOS:** `sh install-macos.command`, then `sh start-macos.command` (or mark scripts executable with `chmod +x` for Finder launch).

**Full database mode:** pass `full` to both installer and starter (e.g. `INSTALL-WINDOWS.bat full`). Requires Docker Desktop on Windows/macOS, or a working Docker daemon on Linux. Full installation starts the existing guarded development PostgreSQL, migrates and seeds it; the startup runs the web and development worker. Run from a trusted local development checkout only. Local DB configuration and volume persist. Existing `.env.local` is not overwritten.

**Stop:** Ctrl+C in the start terminal. The STOP launcher optionally stops the development database when called with `full`; it never deletes its volume. It does not terminate a running web process in a separate terminal.

**Limits:** Native Windows/macOS launchers require verification on those operating systems. Remote MongoDB and Redis remain optional; the default preview needs neither. No live payments or remote AI are enabled by these launchers.
