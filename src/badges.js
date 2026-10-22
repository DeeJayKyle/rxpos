// Notices outside the app window: a system notification when RxPOS is in the background, and the unread count on the
// app icon (Windows taskbar, an installed web app's icon, or the Android launcher dot that comes with a notification).
import { isAndroid, isElectron } from './platform.js';
import { deviceSettings } from './device.js';

let ln = null, androidPerm = 'default', nextId = 1;
const plugin = async () => (ln ??= (await import('@capacitor/local-notifications')).LocalNotifications);

if (isAndroid) plugin().then((p) => p.checkPermissions()).then((r) => { androidPerm = r.display === 'granted' ? 'granted' : r.display === 'denied' ? 'denied' : 'default'; }).catch(() => {});

export function notifyPermission() {
  if (isAndroid) return androidPerm;
  return 'Notification' in window ? Notification.permission : 'denied';
}
export async function askNotifyPermission() {
  try {
    if (isAndroid) { const r = await (await plugin()).requestPermissions(); androidPerm = r.display === 'granted' ? 'granted' : 'denied'; return androidPerm; }
    if ('Notification' in window) return await Notification.requestPermission();
  } catch { /* not supported here */ }
  return 'denied';
}

/** Show a notification from the system (only when RxPOS isn't on screen, unless `always`) */
export async function notifyOS(title, body = '', { tag = title, always = false } = {}) {
  if (!always && document.visibilityState !== 'hidden' && document.hasFocus()) return;
  try {
    if (isAndroid) {
      if (androidPerm !== 'granted') return;
      await (await plugin()).schedule({ notifications: [{ id: nextId++ % 100000, title, body: String(body).slice(0, 240), group: 'rxpos', autoCancel: true }] });
      return;
    }
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const n = new Notification(title, { body: String(body).slice(0, 240), icon: './favicon.svg', tag: 'rxpos-' + tag });
    n.onclick = () => { window.focus(); window.rxposShell?.show?.(); n.close(); };
    if (isElectron) window.rxposShell?.attention?.();
  } catch { /* the system refused */ }
}

/** The number on the app icon */
export function setBadge(n) {
  const count = deviceSettings().badges === false ? 0 : Math.max(0, n | 0);
  try {
    if (isElectron) window.rxposShell?.setBadge?.(count, count ? badgeImage(count) : '');
    else if ('setAppBadge' in navigator) (count ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {});
    if (isAndroid && !count) plugin().then((p) => p.removeAllDeliveredNotifications()).catch(() => {});
  } catch { /* not supported */ }
}

/** The red number drawn over the taskbar icon on Windows */
function badgeImage(n) {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#e5484d'; g.beginPath(); g.arc(16, 16, 16, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.font = `bold ${n > 9 ? 17 : 21}px Segoe UI, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(n > 99 ? '99+' : String(n), 16, 17);
  return c.toDataURL('image/png');
}
