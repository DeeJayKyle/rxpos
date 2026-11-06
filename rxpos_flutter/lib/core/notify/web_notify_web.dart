// Browser notifications (the web app): the browser asks once; RxPOS's notices then appear like any site's.
import 'dart:js_interop';

import 'package:web/web.dart' as web;

String webPermission() => web.Notification.permission;

Future<String> webAsk() async {
  final r = await web.Notification.requestPermission().toDart;
  return r.toDart;
}

void webShow(String title, String body) {
  if (web.Notification.permission == 'granted') web.Notification(title, web.NotificationOptions(body: body, icon: 'icons/Icon-192.png'));
}
