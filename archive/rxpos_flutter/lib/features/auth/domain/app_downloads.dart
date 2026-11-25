// Download links for the RxPOS apps, shown on the web sign-in page (src/appDownloads.js says the same).
// The cloud already serves the latest released Windows and Android apps for the installed apps' own updates
// (scripts/publish-flutter-update.sh → /api/app/flutter-<platform>.json → /api/app/<file>), so the links always point
// at the newest release. If the cloud can't answer, the release page is offered.

const releasesPage = 'https://github.com/DeeJayKyle/rxpos/releases/latest';

/// The device the browser runs on.
enum WebDevice { windows, android, apple, other }

/// "85 MB"
String sizeText(num bytes) => bytes > 0 ? '${(bytes / 1048576).round().clamp(1, 1 << 30)} MB' : '';

class AppDownload {
  const AppDownload({required this.name, required this.url, this.version = '', this.size = '', this.direct = false});
  final String name, url, version, size;
  /// a file the cloud serves (else the release page)
  final bool direct;
}

/// The two downloads from the cloud's version files ({build, label, file, size}), or the release page when a file is
/// missing or its name is not one the cloud serves. [base]: the cloud's address.
({AppDownload windows, AppDownload android}) downloadLinks(String base, Map<String, Object?>? windows, Map<String, Object?>? android) {
  final b = base.replaceFirst(RegExp(r'/+$'), '');
  AppDownload one(Map<String, Object?>? m, String ext, String name) {
    final f = m?['file'];
    if (f is! String || !RegExp('^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\\.$ext\$').hasMatch(f)) return AppDownload(name: name, url: releasesPage);
    return AppDownload(name: name, url: '$b/api/app/$f', version: '${m?['label'] ?? ''}', size: sizeText((m?['size'] as num?) ?? 0), direct: true);
  }

  return (windows: one(windows, 'exe', 'Windows'), android: one(android, 'apk', 'Android'));
}
