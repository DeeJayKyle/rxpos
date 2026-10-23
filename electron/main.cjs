const { app, BrowserWindow, Menu, shell, Tray, nativeImage, ipcMain } = require('electron');
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
  const updater = require('./updater.cjs');
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
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false, preload: path.join(__dirname, 'preload.cjs') },
    });
    if (st.maximized) win.maximize();
    win.once('ready-to-show', () => win.show());
    const save = () => { try { fs.writeFileSync(stateFile, JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() })); } catch {} };
    win.on('query-session-end', () => { quitting = true; }); // Windows shutting down or signing out: really close
    win.on('close', (e) => {
      save();
      // "Keep running in the tray" (This device): closing hides the window so messages and calls still arrive
      if (keepInTray && !quitting) { e.preventDefault(); win.hide(); showTray(); }
    });
    updater.attach(win);
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    // Open web links in the default browser and tel:/mailto:/WhatsApp links in their own apps, never inside the app window
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^(https?|tel|mailto|whatsapp):/.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e, url) => {
      if (!url.startsWith('file:')) { e.preventDefault(); if (/^(https?|tel|mailto|whatsapp):/.test(url)) shell.openExternal(url); }
    });
    // Camera (prescription photos), microphone (calls, voice notes), notifications: allowed only for the app's own
    // local pages (1.7 checks the requesting origin, so a navigated-to remote page can never request them).
    win.webContents.session.setPermissionRequestHandler((wc, permission, cb, details) => {
      const own = String(details?.requestingUrl || '').startsWith('file://');
      cb(own && ['media', 'notifications', 'geolocation', 'clipboard-read', 'clipboard-sanitized-write'].includes(permission));
    });
    // Content-Security-Policy for the app window: its own files plus the RxPOS cloud and the weather service, nothing else.
    const CSP = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; "
      + "script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; "
      + "media-src 'self' blob: https:; font-src 'self' data:; worker-src 'self' blob:; "
      + "connect-src 'self' https://rxposug.com https://www.rxposug.com https://api.rxposug.com wss://api.rxposug.com https://api.open-meteo.com https://geocoding-api.open-meteo.com";
    win.webContents.session.webRequest.onHeadersReceived((details, cb) => {
      cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP], 'X-Content-Type-Options': ['nosniff'] } });
    });
  }

  app.on('second-instance', () => showWindow());

  // ---------- tray, taskbar badge and notifications (src/badges.js) ----------
  let tray = null, keepInTray = false, quitting = false, unread = 0;
  app.on('before-quit', () => { quitting = true; });
  function showWindow() {
    if (!win) return;
    if (!win.isVisible()) win.show();
    if (win.isMinimized()) win.restore();
    win.focus();
  }
  function showTray() {
    if (tray) return;
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png')).resize({ width: 16, height: 16 }));
    tray.setToolTip('RxPOS');
    tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open RxPOS', click: showWindow }, { type: 'separator' }, { label: 'Quit RxPOS', click: () => { quitting = true; app.quit(); } }]));
    tray.on('click', showWindow);
    if (!readState().trayHint) {
      tray.displayBalloon?.({ title: 'RxPOS is still running', content: 'New messages and calls will still pop up. Right-click this icon to quit.', iconType: 'info' });
      try { fs.writeFileSync(stateFile, JSON.stringify({ ...readState(), trayHint: true })); } catch {}
    }
  }
  ipcMain.on('rxpos:tray', (_e, on) => { keepInTray = !!on; if (!on && tray) { tray.destroy(); tray = null; } });
  ipcMain.on('rxpos:badge', (_e, n, png) => {
    unread = n | 0;
    app.setBadgeCount?.(unread);
    if (process.platform === 'win32' && win) win.setOverlayIcon(unread && png ? nativeImage.createFromDataURL(png) : null, unread ? `${unread} unread` : '');
    tray?.setToolTip(unread ? `RxPOS · ${unread} unread` : 'RxPOS');
  });
  ipcMain.on('rxpos:attention', () => { if (win && !win.isFocused()) win.flashFrame(true); });
  ipcMain.on('rxpos:show', showWindow);

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      // Refresh = sync now and update the page in place (src/refresh.jsx); Reload app restarts the page
      { label: 'File', submenu: [
        { label: 'Refresh', accelerator: 'F5', click: (_i, w) => w?.webContents.executeJavaScript("window.dispatchEvent(new Event('rxpos-refresh'))").catch(() => {}) },
        { label: 'Refresh', accelerator: 'CmdOrCtrl+R', visible: false, acceleratorWorksWhenHidden: true, click: (_i, w) => w?.webContents.executeJavaScript("window.dispatchEvent(new Event('rxpos-refresh'))").catch(() => {}) },
        { label: 'Reload app', accelerator: 'CmdOrCtrl+Shift+R', click: (_i, w) => w?.webContents.reloadIgnoringCache() },
        { type: 'separator' }, { role: 'quit' },
      ] },
      // DevTools only in development, never in a packaged production build (1.7)
      { label: 'View', submenu: [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { role: 'togglefullscreen' }, ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }])] },
    ])
  );

  if (process.platform === 'win32') app.setAppUserModelId('io.github.rxpos');
  app.whenReady().then(() => {
    updater.register(); // newest downloaded build, served under the installed files' addresses
    createWindow();
    app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
  });
  app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
}
