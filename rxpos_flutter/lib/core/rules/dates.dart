// Dates in the device's local time (Uganda is UTC+3: UTC dates would roll over at 3 am). Ported from src/dates.js.

String _p2(int n) => n.toString().padLeft(2, '0');

/// YYYY-MM-DD of a moment in local time.
String localDate([DateTime? d]) {
  final x = (d ?? DateTime.now()).toLocal();
  return '${x.year}-${_p2(x.month)}-${_p2(x.day)}';
}

String today([DateTime? now]) => localDate(now);

final _plainDate = RegExp(r'^\d{4}-\d{2}-\d{2}$');

/// The local day a record belongs to: plain dates stay as they are, timestamps are converted.
String dayOf(String? v) {
  final s = v ?? '';
  if (_plainDate.hasMatch(s)) return s;
  if (s.isEmpty) return '';
  final d = DateTime.tryParse(s);
  return d == null ? '' : localDate(d);
}

String monthOf(String? v) {
  final d = dayOf(v);
  return d.length >= 7 ? d.substring(0, 7) : d;
}

// JavaScript reads "2026-11-05" as UTC midnight, and so does this, so day differences are whole days.
DateTime _js(String s) => DateTime.parse(_plainDate.hasMatch(s) ? '${s}T00:00:00Z' : s).toUtc();

/// Whole days from today to [date] (0 today, negative when past). Like src/dates.js daysUntil.
int daysUntil(String date, {DateTime? now}) {
  final diff = _js(date).difference(_js(today(now)));
  return (diff.inMilliseconds / 864e5).ceil();
}

/// Whole days since [date].
int daysSince(String date, {DateTime? now}) =>
    ((now ?? DateTime.now()).toUtc().difference(_js(date)).inMilliseconds / 864e5).floor();
