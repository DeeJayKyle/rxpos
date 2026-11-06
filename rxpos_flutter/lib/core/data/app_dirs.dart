// Where this app keeps its own files on the device.
import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// This app's own files folder. On Windows it is pinned to where it has always been (%APPDATA%\RxPOS\RxPOS New):
/// the folder Windows would pick follows the product name, and the app was renamed from "RxPOS New" to "RxPOS".
Future<Directory> appSupportDir() async {
  final appData = Platform.isWindows ? Platform.environment['APPDATA'] : null;
  if (appData != null && appData.isNotEmpty) return Directory('$appData\\RxPOS\\RxPOS New').create(recursive: true);
  return getApplicationSupportDirectory();
}

/// The folder of the device database. On Windows it is the app's own folder, not Documents (where versions up to
/// 1.0 kept it: visible to everyone, and often copied by OneDrive while open). Elsewhere it stays where it was.
Future<Directory> databaseDir() async {
  final docs = await getApplicationDocumentsDirectory();
  if (!Platform.isWindows) return docs;
  return settleDatabase(from: docs, to: await appSupportDir());
}

/// Moves the database [name].sqlite (with its -wal and -shm files) from [from] to [to], before it is opened, and
/// returns the folder to open it in. It never overwrites: when [to] already has the database, that one is used. The
/// files are copied first and only then removed from [from]; if the copy fails, [from] keeps the database and is used.
Future<Directory> settleDatabase({required Directory from, required Directory to, String name = 'rxpos'}) async {
  File f(Directory d, String ext) => File('${d.path}${Platform.pathSeparator}$name.sqlite$ext');
  const parts = ['-wal', '-shm', '']; // the main file last: until it is in place, [to] has no database
  if (await f(to, '').exists() || !await f(from, '').exists()) return to;
  final moved = <File>[];
  try {
    await to.create(recursive: true);
    for (final ext in parts) {
      final src = f(from, ext);
      if (!await src.exists()) continue;
      final part = await src.copy('${f(to, ext).path}.part');
      if (await part.length() != await src.length()) throw const FileSystemException('incomplete copy');
      moved.add(await part.rename(f(to, ext).path));
    }
  } catch (_) {
    for (final m in moved) {
      try {
        await m.delete();
      } catch (_) {}
    }
    for (final ext in parts) {
      try {
        await File('${f(to, ext).path}.part').delete();
      } catch (_) {}
    }
    return from;
  }
  for (final ext in parts) {
    try {
      await f(from, ext).delete();
    } catch (_) {} // a copy left behind is harmless: [to] has the database now and is used from here on
  }
  return to;
}
