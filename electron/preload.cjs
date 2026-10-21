// The only bridge between the Windows app's page and the app itself: self-updates (electron/updater.cjs)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rxposShell', {
  ready: () => ipcRenderer.send('rxpos:ready'),
  check: () => ipcRenderer.invoke('rxpos:check'),
  apply: () => ipcRenderer.send('rxpos:apply'),
  onUpdateReady: (fn) => ipcRenderer.on('rxpos:update-ready', (_e, info) => fn(info)),
});
