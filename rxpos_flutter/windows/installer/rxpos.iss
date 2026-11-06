; Windows installer for the Flutter RxPOS (Inno Setup 6). Built by .github/workflows/flutter-apps.yml:
;   iscc /DAppVersion=1.0.0 /DSourceDir=<Release folder> rxpos.iss
; Installs for the current user (no administrator needed) as "RxPOS". It sits next to the current (Electron) RxPOS app
; without replacing it: its own AppId and its own folder (the Electron app uses Programs\RxPOS), and the desktop shortcut
; is only made when there isn't an RxPOS one already. Copies installed as "RxPOS New" keep their folder when updated.
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\..\build\windows\x64\runner\Release"
#endif

[Setup]
AppId={{6E2B6E1C-4A7E-4C61-9C8B-2F7D1B1A9E31}
AppName=RxPOS
AppVerName=RxPOS {#AppVersion}
UninstallDisplayName=RxPOS
AppVersion={#AppVersion}
AppPublisher=RxPOS
DefaultDirName={localappdata}\RxPOS\App
DefaultGroupName=RxPOS
PrivilegesRequired=lowest
OutputBaseFilename=RxPOS-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\rxpos.exe
; the installer itself carries the RxPOS icon, not Inno Setup's
SetupIconFile=..\runner\resources\app_icon.ico
WizardStyle=modern
; an update closes the running app first (the app also quits as it starts the update)
CloseApplications=force

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{group}\RxPOS"; Filename: "{app}\rxpos.exe"
Name: "{userdesktop}\RxPOS"; Filename: "{app}\rxpos.exe"; Tasks: desktopicon; Check: NoOtherDesktopShortcut

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"

[Run]
Filename: "{app}\rxpos.exe"; Description: "Open RxPOS"; Flags: nowait postinstall skipifsilent
; an update the app installed by itself (/VERYSILENT): open it again
Filename: "{app}\rxpos.exe"; Flags: nowait; Check: WizardSilent

[Code]
// Don't replace the current RxPOS app's desktop shortcut (same name): make ours only when there is none yet.
function NoOtherDesktopShortcut: Boolean;
begin
  Result := not FileExists(ExpandConstant('{userdesktop}\RxPOS.lnk'));
end;
