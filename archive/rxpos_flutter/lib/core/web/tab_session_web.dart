// A sign-in without "Remember me" lasts as long as this browser tab (reloading or opening a page by its address keeps
// it); closing the tab or the browser signs out, as before.
import 'package:web/web.dart' as web;

const _key = 'rxpos-tab-signed-in';
void markTabSignedIn() => web.window.sessionStorage.setItem(_key, '1');
bool tabSignedIn() => web.window.sessionStorage.getItem(_key) == '1';
