// The classic (React) RxPOS kept its unsent changes in this browser's IndexedDB "pharmapos", store "outbox" (same
// site). How many are waiting: read only, nothing is changed, and a browser that never ran the classic app is not
// given an empty database by asking.
import 'dart:async';
import 'dart:js_interop';

import 'package:web/web.dart' as web;

/// Throws when the classic app's database is there but cannot be read: that is not "nothing waiting".
Future<int> classicPending() async {
  final bool there;
  try {
    there = (await web.window.indexedDB.databases().toDart).toDart.any((d) => d.name == 'pharmapos');
  } catch (_) {
    return 0; // this browser cannot list its databases (or has no IndexedDB): it cannot hold the classic app's work
  }
  if (!there) return 0;
  final open = web.window.indexedDB.open('pharmapos');
  final db = await _done<web.IDBDatabase>(open);
  try {
    if (!db.objectStoreNames.contains('outbox')) return 0;
    final count = db.transaction('outbox'.toJS, 'readonly').objectStore('outbox').count();
    return (await _done<JSNumber>(count)).toDartInt;
  } finally {
    db.close();
  }
}

Future<T> _done<T extends JSAny?>(web.IDBRequest r) {
  final c = Completer<T>();
  r.onsuccess = ((web.Event _) => c.complete(r.result as T)).toJS;
  r.onerror = ((web.Event _) => c.completeError(StateError('IndexedDB: ${r.error?.message}'))).toJS;
  return c.future;
}
