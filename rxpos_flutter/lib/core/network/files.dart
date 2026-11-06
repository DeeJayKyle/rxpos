// Files the app sends to the pharmacy's cloud (src/attach.jsx, src/invoiceScan.js, src/pages/Scan.jsx): photos made
// smaller as JPEG, PDF pages as images, and uploads in 600 KB pieces to /api/files (kept in the pharmacy's cloud,
// read back by path).
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:image/image.dart' as img;
import 'package:printing/printing.dart';

import 'cloud_api.dart';

const maxFileBytes = 15 * 1024 * 1024;
const _piece = 600 * 1024;

/// A photo made smaller ([max] pixels on its longest side) as a JPEG data URL.
String shrinkPhoto(Uint8List bytes, {int max = 1280, int quality = 82}) {
  final decoded = img.decodeImage(bytes);
  if (decoded == null) throw Exception('That file is not a photo');
  final k = min(1.0, max / (decoded.width > decoded.height ? decoded.width : decoded.height));
  final small = k < 1 ? img.copyResize(decoded, width: (decoded.width * k).round(), height: (decoded.height * k).round(), interpolation: img.Interpolation.average) : decoded;
  return 'data:image/jpeg;base64,${base64Encode(img.encodeJpg(small, quality: quality))}';
}

/// A data URL → its bytes.
Uint8List dataUrlBytes(String dataUrl) => base64Decode(dataUrl.substring(dataUrl.indexOf(',') + 1));

/// A chosen file (photo or PDF) → page images ready to read (the first [maxPages] pages of a PDF). [total]: the PDF's
/// page count.
Future<({List<String> pages, int total})> filePages(String name, Uint8List bytes, {int maxPages = 6, int px = 2000}) async {
  if (name.toLowerCase().endsWith('.pdf')) {
    final out = <String>[];
    var total = 0;
    await for (final page in Printing.raster(bytes, dpi: 200)) {
      total++;
      if (out.length < maxPages) out.add(shrinkPhoto(await page.toPng(), max: px, quality: 92));
    }
    return (pages: out, total: total);
  }
  return (pages: [shrinkPhoto(bytes, max: px)], total: 1);
}

/// Let the person choose photos and / or PDFs.
Future<List<({String name, Uint8List bytes})>> pickFiles({List<String> extensions = const ['jpg', 'jpeg', 'png', 'webp', 'pdf'], bool multiple = true}) async {
  final files = await FilePicker.pickFiles(type: FileType.custom, allowedExtensions: extensions);
  return [for (final f in (multiple ? files : files.take(1))) (name: f.name, bytes: await f.readAsBytes())];
}

String mimeOf(String name) {
  final ext = name.split('.').last.toLowerCase();
  return const {
        'csv': 'text/csv', 'xls': 'application/vnd.ms-excel', 'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'pdf': 'application/pdf',
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp', 'mp4': 'video/mp4', 'mp3': 'audio/mpeg', 'm4a': 'audio/mp4', 'ogg': 'audio/ogg',
        'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }[ext] ??
      'application/octet-stream';
}

/// Upload a file to the pharmacy's cloud → {path, name, type, size}.
Future<Map<String, Object?>> uploadFile(CloudApi api, Uint8List bytes, String name, {String? type, void Function(double)? onProgress}) async {
  if (bytes.length > maxFileBytes) throw Exception('$name is too big. Files can be up to 15 MB.');
  final r = Random.secure();
  final id = List.generate(24, (_) => '0123456789abcdef'[r.nextInt(16)]).join();
  final chunks = max(1, (bytes.length / _piece).ceil());
  var path = '';
  for (var n = 0; n < chunks; n++) {
    final part = bytes.sublist(n * _piece, min(bytes.length, (n + 1) * _piece));
    final j = await api.post('/api/files', {'id': id, 'n': n, 'chunks': chunks, 'size': bytes.length, 'name': name, 'type': type ?? mimeOf(name), 'data': base64Encode(part)});
    if ('${j['path'] ?? ''}'.isNotEmpty) path = '${j['path']}';
    onProgress?.call((n + 1) / chunks);
  }
  return {'path': path, 'name': name, 'type': type ?? mimeOf(name), 'size': bytes.length};
}
