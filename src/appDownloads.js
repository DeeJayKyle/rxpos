// Download links for the RxPOS apps, shown on the web sign-in page: the React app's own Windows installer and Android
// app from the newest GitHub release (.github/workflows/build.yml publishes RxPOS-Setup.exe and RxPOS-Android.apk
// under these fixed names), so the links always point at the newest release without a new web build.

export const RELEASES_PAGE = 'https://github.com/DeeJayKyle/rxpos/releases/latest';
export const WINDOWS_FILE = 'RxPOS-Setup.exe';
export const ANDROID_FILE = 'RxPOS-Android.apk';

/** Which device the browser runs on: 'windows' | 'android' | 'apple' (iPhone, iPad, Mac: no app yet) | 'other' */
export function deviceOf(ua = '') {
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(ua)) return 'apple';
  if (/Windows/i.test(ua)) return 'windows';
  return 'other';
}

/** The two downloads: direct links to the newest release's files */
export function downloadLinks(releases = RELEASES_PAGE) {
  const one = (file, name) => ({ name, url: `${releases}/download/${file}`, direct: true });
  return { windows: one(WINDOWS_FILE, 'Windows'), android: one(ANDROID_FILE, 'Android') };
}
