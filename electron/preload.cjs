// The only bridge between the Windows app's page and the app itself: self-updates (electron/updater.cjs), tray, taskbar badge,
// and the receipt printer (electron/printer.cjs)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rxposShell', {
  ready: () => ipcRenderer.send('rxpos:ready'),
  check: () => ipcRenderer.invoke('rxpos:check'),
  apply: () => ipcRenderer.send('rxpos:apply'),
  setTray: (on) => ipcRenderer.send('rxpos:tray', on),
  setBadge: (n, png) => ipcRenderer.send('rxpos:badge', n, png),
  attention: () => ipcRenderer.send('rxpos:attention'),
  show: () => ipcRenderer.send('rxpos:show'),
  printers: () => ipcRenderer.invoke('rxpos:printers'),
  printRaw: (job) => ipcRenderer.invoke('rxpos:print-raw', job),
  onUpdateReady: (fn) => ipcRenderer.on('rxpos:update-ready', (_e, info) => fn(info)),
  // the key that encrypts the pharmacy on this PC, kept with Windows' protection (src/vault.js)
  protect: (s) => ipcRenderer.invoke('rxpos:protect', s),
  unprotect: (s) => ipcRenderer.invoke('rxpos:unprotect', s),
});
