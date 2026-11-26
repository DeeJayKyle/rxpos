// The only bridge between the Windows app's page and the app itself: self-updates (electron/updater.cjs), tray, taskbar badge
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rxposShell', {
  ready: () => ipcRenderer.send('rxpos:ready'),
  check: () => ipcRenderer.invoke('rxpos:check'),
  apply: () => ipcRenderer.send('rxpos:apply'),
  setTray: (on) => ipcRenderer.send('rxpos:tray', on),
  setBadge: (n, png) => ipcRenderer.send('rxpos:badge', n, png),
  attention: () => ipcRenderer.send('rxpos:attention'),
  show: () => ipcRenderer.send('rxpos:show'),
  onUpdateReady: (fn) => ipcRenderer.on('rxpos:update-ready', (_e, info) => fn(info)),
  // the key that encrypts the pharmacy on this PC, kept with Windows' protection (src/vault.js)
  protect: (s) => ipcRenderer.invoke('rxpos:protect', s),
  unprotect: (s) => ipcRenderer.invoke('rxpos:unprotect', s),
});
