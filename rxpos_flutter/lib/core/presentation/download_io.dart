// Saving a file on Windows (Downloads) and Android (the app's downloads folder).
import 'dart:io';

import 'package:path_provider/path_provider.dart';

Future<String> saveBytes(String filename, List<int> bytes) async {
  final dir = await getDownloadsDirectory() ?? await getApplicationDocumentsDirectory();
  final f = File('${dir.path}${Platform.pathSeparator}$filename');
  await f.writeAsBytes(bytes, flush: true);
  return f.path;
}
