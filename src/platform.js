// Which version of RxPOS is running: the Windows app (Electron), the Android app (Capacitor) or the web.
export const isElectron = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron');
export const isAndroid = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
export const isNative = isElectron || isAndroid;
export const isWeb = !isNative;
export const platformName = isElectron ? 'Desktop app' : isAndroid ? 'Android app' : 'Browser';
export const isTouch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

/** On the web every pharmacy has its own address, e.g. rxposug.com/citycare-ntinda (or /classic/citycare-ntinda) → "citycare-ntinda". */
export function pharmacySlugFromUrl() {
  if (isNative || typeof location === 'undefined') return '';
  // the classic app also lives at rxposug.com/classic/ (the site itself is the new app): skip that part of the address
  const parts = location.pathname.split('/').filter(Boolean);
  const first = (parts[0] === 'classic' ? parts[1] : parts[0]) || '';
  return /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(first) && first !== 'index.html' ? first : '';
}
