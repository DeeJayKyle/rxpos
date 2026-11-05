; Windows installer for the Flutter RxPOS (Inno Setup 6). Built by .github/workflows/flutter-apps.yml:
;   iscc /DAppVersion=1.0.0 /DSourceDir=<Release folder> rxpos.iss
; Installs for the current user (no administrator needed), next to the current RxPOS app, not replacing it.
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\..\build\windows\x64\runner\Release"
#endif

[Setup]
AppId={{6E2B6E1C-4A7E-4C61-9C8B-2F7D1B1A9E31}
AppName=RxPOS New
AppVersion={#AppVersion}
AppPublisher=RxPOS
DefaultDirName={localappdata}\Programs\RxPOS New
DefaultGroupName=RxPOS New
PrivilegesRequired=lowest
OutputBaseFilename=RxPOS-New-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\rxpos.exe
WizardStyle=modern

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{group}\RxPOS New"; Filename: "{app}\rxpos.exe"
Name: "{userdesktop}\RxPOS New"; Filename: "{app}\rxpos.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"

[Run]
Filename: "{app}\rxpos.exe"; Description: "Open RxPOS New"; Flags: nowait postinstall skipifsilent
