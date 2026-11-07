// The RxPOS owner console is the classic app's page at /owner on the same site. It reads the owner's key from this
// tab's session storage (as the classic sign-in leaves it), so the owner signing in here goes straight there.
import 'package:web/web.dart' as web;

bool openOwnerConsole(String token) {
  web.window.sessionStorage.setItem('rxpos-owner-key', token);
  web.window.location.assign('/owner');
  return true;
}
