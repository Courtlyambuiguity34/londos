Control Room — Digital Operations Headquarters for local client, project, infrastructure, document, quotation, contract, finance, and follow-up management.

## Downloads

- **Control-Room-Windows-x64.zip**: complete Windows application folder, source code ZIP, user guide, and Windows build report. Extract everything, open `Control-Room/Windows-App`, and run `Control Room.exe`.
- **Control-Room-1.0.0-x64-Setup.exe**: Windows installer.
- **Control-Room-1.0.0-x64-Portable.exe**: single-file portable launcher.
- **Control-Room-Source.zip**: source code, tests, build scripts, documentation, and screenshots.
- **SHA256SUMS.txt**: download integrity checksums.

No Node.js, Python, Docker, or separate backend is required to run the packaged application.

## Verification

Built on a GitHub Actions Windows runner after lint, 22 core tests, frontend build, and actual Electron desktop smoke tests passed. Installer and portable packaging completed successfully. The desktop tests exercise the development Electron application; manual installer/uninstaller use, packaged-app launch, code signing, and OS notification appearance are not verified. This is an unsigned prerelease.

Use a separate workspace folder for your database and documents. Read START-HERE.txt and the user guide included in the ZIP.

These release assets and the isolated `control-room-download-build` branch host Control Room. The Londos default branch/application source was not changed.
