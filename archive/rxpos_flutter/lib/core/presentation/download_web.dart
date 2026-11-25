// Saving a file in a browser: it downloads, into the browser's downloads folder.
import 'dart:js_interop';
import 'dart:typed_data';

import 'package:web/web.dart' as web;

Future<String> saveBytes(String filename, List<int> bytes) async {
  final blob = web.Blob([Uint8List.fromList(bytes).toJS].toJS);
  final url = web.URL.createObjectURL(blob);
  final a = web.HTMLAnchorElement()
    ..href = url
    ..download = filename;
  a.click();
  web.URL.revokeObjectURL(url);
  return 'Downloads/$filename';
}
