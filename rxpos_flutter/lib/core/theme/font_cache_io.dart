// Windows and Android: a downloaded font file is kept in the app's own folder, so the fonts work offline afterwards.
import 'dart:io';
import 'dart:typed_data';

import 'package:path_provider/path_provider.dart';

Future<File> _file(String name) async => File('${(await getApplicationSupportDirectory()).path}${Platform.pathSeparator}fonts${Platform.pathSeparator}$name');

Future<Uint8List?> readCachedFont(String name) async {
  try {
    final f = await _file(name);
    return await f.exists() ? await f.readAsBytes() : null;
  } catch (_) {
    return null;
  }
}

Future<void> writeCachedFont(String name, Uint8List bytes) async {
  try {
    final f = await _file(name);
    await f.parent.create(recursive: true);
    await f.writeAsBytes(bytes, flush: true);
  } catch (_) {/* not kept: downloaded again next time */}
}
