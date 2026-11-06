import 'dart:math';

import 'package:uuid/uuid.dart';

const _uuid = Uuid();
final _rnd = Random.secure();

/// A new record id (random UUID v4, as the React app's crypto.randomUUID()).
String uid() => _uuid.v4();

/// A short document number: prefix + the time in base 36 + one random character, e.g. "R1A2B3CX" (src/pages/POS.jsx).
String docNumber(String prefix, {DateTime? now}) {
  final t = (now ?? DateTime.now()).millisecondsSinceEpoch.toRadixString(36).toUpperCase();
  return prefix + t.substring(t.length > 6 ? t.length - 6 : 0) + _rnd.nextInt(36).toRadixString(36).toUpperCase();
}
