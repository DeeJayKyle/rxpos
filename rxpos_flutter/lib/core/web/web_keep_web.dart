// What the web app keeps in the browser, as the classic website did (src/webpolicy.js): nothing of the pharmacy. Its
// data lives in memory and comes fresh from the cloud. Only two kinds of small value are kept:
//   - this tab's sign-in (sessionStorage: a reload stays signed in; closing the tab forgets it)
//   - appearance and layout preferences (localStorage: no pharmacy or personal data in them)
import 'package:web/web.dart' as web;

const _tab = {'session', 'link'};
final _prefs = RegExp(r'^device:(look|fonts|navCollapsed|navRail|medicineOrder|orderMethod|zoom|pos-layout|pos-sale-w|pos-pay-h(-fold)?|pos-favs|tip:.*|sound.*)$');

web.Storage? _where(String key) => _tab.contains(key) ? web.window.sessionStorage : _prefs.hasMatch(key) ? web.window.localStorage : null;

/// Keep (or forget, with null) a value of the device's own store, when it is one the browser may keep.
void webKeep(String key, String? value) {
  final s = _where(key);
  if (s == null) return;
  value == null ? s.removeItem('rxpos:$key') : s.setItem('rxpos:$key', value);
}

/// What the browser kept, to put back in the (fresh, in-memory) store when the app starts.
Map<String, String> webKept() {
  final out = <String, String>{};
  for (final s in [web.window.localStorage, web.window.sessionStorage]) {
    for (var i = 0; i < s.length; i++) {
      final k = s.key(i);
      if (k == null || !k.startsWith('rxpos:')) continue;
      final key = k.substring(6);
      if (_where(key) == s) out[key] = s.getItem(k) ?? '';
    }
  }
  return out;
}
