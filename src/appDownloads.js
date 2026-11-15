// Download links for the RxPOS apps, shown on the web sign-in page (both web versions say the same).
// The cloud already serves the latest released Windows and Android apps for the installed apps' own updates
// (scripts/publish-flutter-update.sh → /api/app/flutter-<platform>.json → /api/app/<file>), so the links always
// point at the newest release without a new web build. If the cloud can't answer, the release page is offered.

export const RELEASES_PAGE = 'https://github.com/DeeJayKyle/rxpos/releases/latest';

/** Which device the browser runs on: 'windows' | 'android' | 'apple' (iPhone, iPad, Mac: no app yet) | 'other' */
export function deviceOf(ua = '') {
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(ua)) return 'apple';
  if (/Windows/i.test(ua)) return 'windows';
  return 'other';
}

/** "85 MB" */
export const sizeText = (bytes) => (bytes > 0 ? `${Math.max(1, Math.round(bytes / 1048576))} MB` : '');

/**
 * The two downloads from the cloud's version files ({ build, label, file, size }), or the release page when a file
 * is missing or its name is not one the cloud serves. base: the cloud's address (no trailing slash).
 */
export function downloadLinks(base, windows, android) {
  const ok = (m, ext) => m && typeof m.file === 'string' && new RegExp(`^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\\.${ext}$`).test(m.file);
  const one = (m, ext, name) => ok(m, ext)
    ? { name, url: `${base}/api/app/${m.file}`, version: String(m.label || ''), size: sizeText(Number(m.size)), direct: true }
    : { name, url: RELEASES_PAGE, version: '', size: '', direct: false };
  return { windows: one(windows, 'exe', 'Windows'), android: one(android, 'apk', 'Android') };
}
