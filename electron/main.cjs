const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

// Keep using the data folder from before the rename (PharmaPOS → RxPOS) so offline data, sign-ins and settings carry over
// A preloaded edition names its own folder (package.json rxposDataDir) so it can sit beside the standard app
const { rxposDataDir } = require('../package.json');
app.setPath('userData', path.join(app.getPath('appData'), rxposDataDir || 'PharmaPOS'));

// `RxPOS.exe --hub --key=YOUR-SECRET [--port 8686]` runs this PC as the sync hub for other devices (no window).
const HUB_MODE = process.argv.includes('--hub');

if (HUB_MODE) {
  const keyArg = process.argv.find((a) => a.startsWith('--key='));
  if (keyArg) process.env.PHARMAPOS_SYNC_KEY = keyArg.slice('--key='.length);
  app.whenReady().then(() => {
    process.env.PHARMAPOS_DATA ||= path.join(app.getPath('userData'), 'hub-data');
    import(pathToFileURL(path.join(__dirname, '..', 'server', 'hub.mjs')).href).catch((e) => {
      console.error(e);
      app.quit();
    });
  });
  app.on('window-all-closed', () => {}); // keep running
} else {
  if (!app.requestSingleInstanceLock()) app.quit();

  let win = null;
  function createWindow() {
    win = new BrowserWindow({
      width: 1366,
      height: 860,
      minWidth: 1024,
      minHeight: 680,
      title: 'RxPOS',
      backgroundColor: '#f4f7f9',
      autoHideMenuBar: true,
      icon: path.join(__dirname, '..', 'build', 'icon.png'),
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    // Open external links in the default browser, never inside the app window
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http')) shell.openExternal(url);
      return { action: 'deny' };
    });
  }

  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { label: 'File', submenu: [{ role: 'reload' }, { type: 'separator' }, { role: 'quit' }] },
      { label: 'View', submenu: [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { role: 'togglefullscreen' }, { role: 'toggleDevTools' }] },
    ])
  );

  if (process.platform === 'win32') app.setAppUserModelId(rxposDataDir ? 'io.github.pharmapos.' + rxposDataDir.toLowerCase() : 'io.github.pharmapos');
  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
  });
  app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
}
