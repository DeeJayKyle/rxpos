// The RxPOS owner console is a page of the classic app (rxposug.com/classic/#/owner). It reads the owner's key from
// this tab's session storage (as the classic sign-in leaves it), so the owner signing in here goes straight there.
import 'package:web/web.dart' as web;

const ownerConsoleAddress = '/classic/#/owner';

bool openOwnerConsole(String token) {
  web.window.sessionStorage.setItem('rxpos-owner-key', token);
  web.window.location.assign(ownerConsoleAddress);
  return true;
}

/// The classic RxPOS app (kept at rxposug.com/classic/), at [pharmacy]'s address when given.
bool openClassicApp([String pharmacy = '']) {
  web.window.location.assign('/classic/${Uri.encodeComponent(pharmacy)}');
  return true;
}
