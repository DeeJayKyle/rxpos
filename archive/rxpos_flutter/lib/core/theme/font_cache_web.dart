// The website keeps nothing on the computer: the browser's own cache serves a font file again.
import 'dart:typed_data';

Future<Uint8List?> readCachedFont(String name) async => null;
Future<void> writeCachedFont(String name, Uint8List bytes) async {}
