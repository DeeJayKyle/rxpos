import 'package:json_annotation/json_annotation.dart';

// Records come from the cloud as written by any RxPOS version, so values can be loose: a price saved as text
// ("4000"), a barcode saved as a number, a flag saved as "true". These read them the way the React app does
// (Number(x) || 0, String(x ?? ''), !!x).

/// Any value → a number (text is parsed; anything else is 0), like `Number(x) || 0`.
double toNum(Object? v) {
  if (v is num) return v.isFinite ? v.toDouble() : 0;
  if (v is String) return double.tryParse(v.trim()) ?? 0;
  if (v is bool) return v ? 1 : 0;
  return 0;
}

/// Any value → text (null → ''), like `String(x ?? '')`.
String toStr(Object? v) {
  if (v == null) return '';
  if (v is double && v == v.roundToDouble()) return v.toInt().toString();
  return v.toString();
}

/// Any value → true/false, like `!!x` (but "false" / "0" text is false too).
bool toFlag(Object? v) {
  if (v is bool) return v;
  if (v is num) return v != 0;
  if (v is String) return v.isNotEmpty && v != 'false' && v != '0';
  return v != null;
}

/// Numbers are written back as whole numbers when they are whole (2000, not 2000.0), as JavaScript writes them.
Object numOut(double v) => v == v.roundToDouble() && v.abs() < 9e15 ? v.toInt() : v;

class Num implements JsonConverter<double, Object?> {
  const Num();
  @override
  double fromJson(Object? json) => toNum(json);
  @override
  Object toJson(double object) => numOut(object);
}

class Str implements JsonConverter<String, Object?> {
  const Str();
  @override
  String fromJson(Object? json) => toStr(json);
  @override
  Object toJson(String object) => object;
}

/// Optional text: null stays null (a sale line booked without a batch has batchId null, not '').
class OptStr implements JsonConverter<String?, Object?> {
  const OptStr();
  @override
  String? fromJson(Object? json) => json == null ? null : toStr(json);
  @override
  Object? toJson(String? object) => object;
}

class Flag implements JsonConverter<bool, Object?> {
  const Flag();
  @override
  bool fromJson(Object? json) => toFlag(json);
  @override
  Object toJson(bool object) => object;
}

/// The converters every entity uses.
const recordConverters = <JsonConverter<dynamic, dynamic>>[Num(), Str(), OptStr(), Flag()];
