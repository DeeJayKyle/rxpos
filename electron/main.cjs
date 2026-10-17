const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

// Keep using the data folder from before the rename (PharmaPOS → RxPOS) so offline data, sign-ins and settings carry over
app.setPath('userData', path.join(app.getPath('appData'), 'PharmaPOS'));

// `RxPOS.exe --hub --key=YOUR-SECRET [--port 8686]` runs this PC as the sync hub for other devices (no window).
const HUB_MODE = process.argv.includes('--hub');

if (HUB_MODE) {
  const keyArg = process.argv.find((a) => a.startsWith('--key='));
  if (keyArg) process.env.RXPOS_SYNC_KEY = keyArg.slice('--key='.length);
  app.whenReady().then(() => {
    process.env.RXPOS_DATA ||= path.join(app.getPath('userData'), 'hub-data');
    import(pathToFileURL(path.join(__dirname, '..', 'server', 'hub.mjs')).href).catch((e) => {
      console.error(e);
      app.quit();
    });
  });
  app.on('window-all-closed', () => {}); // keep running
} else {
  if (!app.requestSingleInstanceLock()) app.quit();

  let win = null;
  // Remember the window's size, position and maximised state between runs
  const fs = require('fs');
  const stateFile = path.join(app.getPath('userData'), 'window-state.json');
  const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return {}; } };
  function createWindow() {
    const st = readState();
    win = new BrowserWindow({
      width: st.width || 1366,
      height: st.height || 860,
      x: st.x, y: st.y,
      minWidth: 1024,
      minHeight: 680,
      title: 'RxPOS',
      backgroundColor: '#0b1220',
      autoHideMenuBar: true,
      show: false,
      icon: path.join(__dirname, '..', 'build', 'icon.png'),
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false },
    });
    if (st.maximized) win.maximize();
    win.once('ready-to-show', () => win.show());
    const save = () => { try { fs.writeFileSync(stateFile, JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() })); } catch {} };
    win.on('close', save);
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    // Open web links in the default browser and tel:/mailto:/WhatsApp links in their own apps, never inside the app window
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^(https?|tel|mailto|whatsapp):/.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e, url) => {
      if (!url.startsWith('file:')) { e.preventDefault(); if (/^(https?|tel|mailto|whatsapp):/.test(url)) shell.openExternal(url); }
    });
    // Camera (prescription photos), microphone (calls, voice notes), notifications: allowed for the app's own pages
    win.webContents.session.setPermissionRequestHandler((wc, permission, cb) => cb(['media', 'notifications', 'geolocation', 'clipboard-read', 'clipboard-sanitized-write'].includes(permission)));
  }

  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      // Refresh = sync now and update the page in place (src/refresh.jsx); Reload app restarts the page
      { label: 'File', submenu: [
        { label: 'Refresh', accelerator: 'F5', click: (_i, w) => w?.webContents.executeJavaScript("window.dispatchEvent(new Event('rxpos-refresh'))").catch(() => {}) },
        { label: 'Refresh', accelerator: 'CmdOrCtrl+R', visible: false, acceleratorWorksWhenHidden: true, click: (_i, w) => w?.webContents.executeJavaScript("window.dispatchEvent(new Event('rxpos-refresh'))").catch(() => {}) },
        { label: 'Reload app', accelerator: 'CmdOrCtrl+Shift+R', click: (_i, w) => w?.webContents.reloadIgnoringCache() },
        { type: 'separator' }, { role: 'quit' },
      ] },
      { label: 'View', submenu: [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { role: 'togglefullscreen' }, { role: 'toggleDevTools' }] },
    ])
  );

  if (process.platform === 'win32') app.setAppUserModelId('io.github.rxpos');
  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
  });
  app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
}
