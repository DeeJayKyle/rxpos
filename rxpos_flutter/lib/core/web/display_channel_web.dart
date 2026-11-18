// The customer display in the browser (src/components/CustomerDisplay.jsx): a second window that listens to the till
// over a BroadcastChannel; the same messages as the classic app.
import 'dart:convert';
import 'dart:js_interop';

import 'package:web/web.dart' as web;

const _name = 'rxpos-display';
web.BroadcastChannel? _out;

bool get displayChannelAvailable => true;

void displaySend(Map<String, Object?> msg) {
  try {
    (_out ??= web.BroadcastChannel(_name)).postMessage(jsonEncode(msg).toJS);
  } catch (_) {
    // the window was closed
  }
}

void Function() displayListen(void Function(Map<String, Object?> msg) on) {
  final ch = web.BroadcastChannel(_name);
  ch.onmessage = ((web.MessageEvent e) {
    final d = e.data;
    try {
      final m = d.isA<JSString>() ? jsonDecode((d as JSString).toDart) : null;
      if (m is Map) on(m.cast<String, Object?>());
    } catch (_) {
      // not ours
    }
  }).toJS;
  ch.postMessage(jsonEncode({'hello': true}).toJS);
  return () => ch.close();
}

void openDisplayWindow() {
  // the app's own address (it may live in a folder, as on rxposug.com)
  web.window.open('${web.document.baseURI}display', 'rxpos-display', 'popup,width=1024,height=720');
}
