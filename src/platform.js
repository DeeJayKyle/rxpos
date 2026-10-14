// Which version of RxPOS is running: the Windows app (Electron), the Android app (Capacitor) or the web.
export const isElectron = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron');
export const isAndroid = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
export const isNative = isElectron || isAndroid;
export const isWeb = !isNative;
export const platformName = isElectron ? 'Desktop app' : isAndroid ? 'Android app' : 'Browser';
export const isTouch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

/** On the web every pharmacy has its own address, e.g. rxpos.pages.dev/pharmcare-hub → "pharmcare-hub". */
export function pharmacySlugFromUrl() {
  if (isNative || typeof location === 'undefined') return '';
  const first = location.pathname.split('/').filter(Boolean)[0] || '';
  return /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(first) && first !== 'index.html' ? first : '';
}
