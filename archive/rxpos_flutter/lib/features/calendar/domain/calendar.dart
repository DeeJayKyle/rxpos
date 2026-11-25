// Calendar rules (src/pages/Calendar.jsx): repeating events, refills due and expiring stock, the Google Calendar
// link for one event and the .ics file of them all. Events keep the React app's fields: id, title, date (YYYY-MM-DD),
// time / endTime (HH:MM, optional), repeat (none | daily | weekly | monthly | yearly), notes, createdBy.
import '../../../core/rules/fefo.dart';

const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const repeats = [('none', 'Does not repeat'), ('daily', 'Every day'), ('weekly', 'Every week'), ('monthly', 'Every month'), ('yearly', 'Every year')];
const kinds = {'event': 'Event', 'refill': 'Refill due', 'expiry': 'Expiry'};

String _p2(int n) => n.toString().padLeft(2, '0');
String isoDay(DateTime d) => '${d.year}-${_p2(d.month)}-${_p2(d.day)}';
DateTime _d(String day) => DateTime.utc(int.parse(day.substring(0, 4)), int.parse(day.substring(5, 7)), int.parse(day.substring(8, 10)));
String addDays(String day, int n) => isoDay(_d(day).add(Duration(days: n)));
String addMonths(String month, int n) {
  final d = DateTime.utc(int.parse(month.substring(0, 4)), int.parse(month.substring(5, 7)) + n);
  return '${d.year}-${_p2(d.month)}';
}

/// The notes of an event (older Flutter builds wrote `note`).
String notesOf(Map e) => '${e['notes'] ?? e['note'] ?? ''}';

/// Does a (possibly repeating) event fall on this day?
bool occurs(Map e, String day) {
  final date = '${e['date'] ?? ''}';
  if (date.length != 10 || day.compareTo(date) < 0) return false;
  final until = '${e['until'] ?? ''}';
  if (until.isNotEmpty && day.compareTo(until) > 0) return false;
  final r = '${e['repeat'] ?? 'none'}';
  if (r.isEmpty || r == 'none') return day == date;
  final a = _d(date), b = _d(day);
  return switch (r) {
    'daily' => true,
    'weekly' => b.difference(a).inDays % 7 == 0,
    'monthly' => a.day == b.day,
    'yearly' => a.day == b.day && a.month == b.month,
    _ => false,
  };
}

/// The 42 days (6 weeks from Monday) shown for a month 'YYYY-MM'.
List<String> monthCells(String month) {
  final first = _d('$month-01');
  final start = isoDay(first.subtract(Duration(days: first.weekday - 1)));
  return [for (var i = 0; i < 42; i++) addDays(start, i)];
}

String _hm(String t) => t.replaceAll(':', '');

String googleLink(Map e) {
  final d = '${e['date']}'.replaceAll('-', '');
  final time = '${e['time'] ?? ''}', end = '${e['endTime'] ?? ''}';
  final dates = time.isNotEmpty ? '${d}T${_hm(time)}00/${d}T${_hm(end.isNotEmpty ? end : time)}00' : '$d/${addDays('${e['date']}', 1).replaceAll('-', '')}';
  final r = '${e['repeat'] ?? 'none'}';
  final rec = r.isNotEmpty && r != 'none' ? '&recur=RRULE:FREQ=${r.toUpperCase()}' : '';
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=${Uri.encodeComponent('${e['title'] ?? ''}')}&dates=$dates&details=${Uri.encodeComponent(notesOf(e))}$rec';
}

String icsFile(List<Map> events, String name, {DateTime? now}) {
  String esc(Object? s) => '${s ?? ''}'.replaceAll(r'\', r'\\').replaceAll(';', r'\;').replaceAll(',', r'\,').replaceAll('\n', r'\n');
  final stamp = (now ?? DateTime.now()).toUtc().toIso8601String().replaceAll(RegExp(r'[-:]'), '').replaceFirst(RegExp(r'\.\d+'), '');
  final l = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RxPOS//EN', 'X-WR-CALNAME:${esc(name)}'];
  for (final e in events) {
    final d = '${e['date']}'.replaceAll('-', '');
    final time = '${e['time'] ?? ''}', end = '${e['endTime'] ?? ''}';
    l.addAll(['BEGIN:VEVENT', 'UID:${e['id']}@rxpos', 'DTSTAMP:$stamp']);
    if (time.isNotEmpty) {
      l.addAll(['DTSTART:${d}T${_hm(time)}00', 'DTEND:${d}T${_hm(end.isNotEmpty && end.compareTo(time) > 0 ? end : time)}00']);
    } else {
      l.addAll(['DTSTART;VALUE=DATE:$d', 'DTEND;VALUE=DATE:${addDays('${e['date']}', 1).replaceAll('-', '')}']);
    }
    final r = '${e['repeat'] ?? 'none'}';
    if (r.isNotEmpty && r != 'none') l.add('RRULE:FREQ=${r.toUpperCase()}');
    l.add('SUMMARY:${esc(e['title'])}');
    if (notesOf(e).isNotEmpty) l.add('DESCRIPTION:${esc(notesOf(e))}');
    l.add('END:VEVENT');
  }
  l.add('END:VCALENDAR');
  return l.join('\r\n');
}

String _num(double v) => v == v.roundToDouble() ? '${v.round()}' : '$v';

/// What RxPOS knows is coming: refills due (dispensed prescriptions with refill days) and stock expiring within 400 days.
List<Map<String, Object?>> autoEvents({
  required List<Map<String, Object?>> prescriptions,
  required Map<String, String> customerNames,
  required List<({String id, String name, double stock})> products,
  required List<BatchStock> Function(String productId) batchesOf,
  required String today,
}) {
  final out = <Map<String, Object?>>[];
  for (final p in prescriptions) {
    final days = num.tryParse('${p['refillDays'] ?? ''}');
    if (p['status'] != 'Dispensed' || days == null || days == 0) continue;
    final from = '${p['dispensedOn'] ?? p['date'] ?? ''}'.split('T').first;
    if (from.length != 10) continue;
    out.add({'id': 'rx-${p['id']}', 'kind': 'refill', 'date': addDays(from, days.toInt()), 'title': 'Refill due: ${customerNames['${p['customerId']}'] ?? 'patient'}', 'notes': '${p['medications'] ?? ''}'});
  }
  final limit = addDays(today, 400);
  for (final p in products) {
    if (p.stock <= 0) continue;
    for (final b in batchesOf(p.id)) {
      if (b.qty > 0 && b.expiry.isNotEmpty && b.expiry.compareTo(limit) <= 0) {
        out.add({'id': 'exp-${b.id}', 'kind': 'expiry', 'date': b.expiry, 'title': 'Expires: ${p.name} (${_num(b.qty)} left, batch ${b.batch})'});
      }
    }
  }
  return out;
}

/// Everything on a day: events (also repeating ones) and the automatic ones, by time.
List<Map<String, Object?>> onDay(List<Map<String, Object?>> events, List<Map<String, Object?>> auto, String day) {
  final all = [for (final e in events) if (occurs(e, day)) {...e, 'kind': 'event'}, ...auto.where((e) => e['date'] == day)];
  // a stable sort, like JavaScript's: same-time items keep their order
  final order = [for (var i = 0; i < all.length; i++) i]
    ..sort((a, b) {
      final c = '${all[a]['time'] ?? ''}'.compareTo('${all[b]['time'] ?? ''}');
      return c != 0 ? c : a.compareTo(b);
    });
  return [for (final i in order) all[i]];
}
