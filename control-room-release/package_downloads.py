from pathlib import Path
import hashlib, shutil, zipfile
root=Path('control-room-build/Control-Room')
out=Path('downloads');out.mkdir(exist_ok=True)
source=out/'Control-Room-Source.zip'
shutil.copyfile('control-room-release/source.zip',source)
for name in ['Control-Room-1.0.0-x64-Setup.exe','Control-Room-1.0.0-x64-Portable.exe']:
    file=root/'release'/name
    if not file.is_file() or file.stat().st_size<1000000:
        raise RuntimeError('Missing or incomplete Windows build: '+name)
    shutil.copyfile(file,out/name)
start='''CONTROL ROOM — DIGITAL OPERATIONS HEADQUARTERS

Extract this ENTIRE ZIP, open Windows-App, and run Control Room.exe.
Keep the application files together. Node.js is not required to run it.
Choose a separate workspace folder for your data and documents.

This ZIP contains the portable application FOLDER and source code.
A separate automatic installer (Setup.exe) and single-file portable EXE
are available as assets on the same GitHub Release.

This package was built on a GitHub Actions Windows runner after core tests
and actual Electron smoke tests passed there. The automated tests exercise
the development Electron application. Interactive installation, SmartScreen,
code signing, packaged-app launch, and OS notification appearance have not
been manually verified. This is an unsigned prerelease.

The source archive retains the original Linux verification report as history.
See WINDOWS-BUILD-REPORT.txt for the additional Windows verification.
'''
report='''Windows build verification

This release was generated on a GitHub Actions windows-latest runner only
after npm ci, lint, 22 core tests, frontend build, and real Electron desktop
smoke tests completed successfully. Both NSIS installer and portable EXE
packaging completed. The ZIP contains the corresponding win-unpacked folder.

Manual installation/uninstallation, packaged-app launch, code signing, and
native Windows notification appearance have not been verified. The application
is a prerelease. See the GitHub Actions run for logs and screenshot evidence.
'''
with zipfile.ZipFile(out/'Control-Room-Windows-x64.zip','w',zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
    z.writestr('Control-Room/START-HERE.txt',start)
    z.writestr('Control-Room/WINDOWS-BUILD-REPORT.txt',report)
    for p in sorted((root/'release/win-unpacked').rglob('*')):
        if p.is_file(): z.write(p,'Control-Room/Windows-App/'+p.relative_to(root/'release/win-unpacked').as_posix())
    z.write(source,'Control-Room/Control-Room-Source.zip')
    z.write(root/'docs/USER-GUIDE.md','Control-Room/USER-GUIDE.md')
with zipfile.ZipFile(out/'Control-Room-Windows-x64.zip') as z:
    if z.testzip(): raise RuntimeError('Download ZIP failed integrity verification.')
checksums=[]
for p in sorted(out.iterdir()):
    with p.open('rb') as f: digest=hashlib.file_digest(f,'sha256').hexdigest()
    checksums.append(digest+'  '+p.name)
(out/'SHA256SUMS.txt').write_text('\n'.join(checksums)+'\n')
print('\n'.join(f'{p.name}: {p.stat().st_size} bytes' for p in out.iterdir()))
