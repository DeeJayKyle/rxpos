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
  if (RegExp(r'^\d{4}-\d{2}$').hasMatch(s)) return '$s-01'; // a month alone means its first day, as in React
  final d = DateTime.tryParse(s);
  return d == null ? '' : localDate(d);
}

String monthOf(String? v) {
  final d = dayOf(v);
  return d.length >= 7 ? d.substring(0, 7) : d;
}

// JavaScript reads "2026-11-05" as UTC midnight, and so does this, so day differences are whole days. A month alone
// ("2026-11", from a month/year expiry) is its first day, as in [dayOf]. Null when [s] is not a date.
final _plainMonth = RegExp(r'^\d{4}-\d{2}$');
DateTime? _js(String s) {
  final v = s.trim();
  final iso = _plainMonth.hasMatch(v) ? '$v-01T00:00:00Z' : _plainDate.hasMatch(v) ? '${v}T00:00:00Z' : v;
  return DateTime.tryParse(iso)?.toUtc();
}

/// What [daysUntil] gives for a date it cannot read: so far ahead that it never counts as expired or expiring.
const noExpiry = 1 << 30;

/// Whole days from today to [date] (0 today, negative when past). Like src/dates.js daysUntil.
/// An unreadable [date] means "no expiry" ([noExpiry]), never "expired".
int daysUntil(String date, {DateTime? now}) {
  final d = _js(date);
  if (d == null) return noExpiry;
  final diff = d.difference(_js(today(now))!);
  return (diff.inMilliseconds / 864e5).ceil();
}

/// Whole days since [date]; 0 when [date] cannot be read.
int daysSince(String date, {DateTime? now}) {
  final d = _js(date);
  if (d == null) return 0;
  return ((now ?? DateTime.now()).toUtc().difference(d).inMilliseconds / 864e5).floor();
}
