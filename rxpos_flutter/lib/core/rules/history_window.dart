// Which records a device keeping recent history holds (faster sync, stage 4: docs/SYNC-HISTORY-WINDOW.md).
// The Dart copy of the React app's src/historywindow.js: the cloud sends a windowed device exactly the records this
// rule keeps, and the device drops the rest when its window moves forward, so the two must never disagree. Checked
// against the React app on the shared cases (../tests/window-cases.json, test/rules/history_window_test.dart).
//
// A record of a windowed table is kept when it is dated from the window start W, when it makes a balance entry
// dated from W (an old sale refunded since), when it is an open item (an unpaid sale or purchase, an advance not yet
// deducted, a transfer on its way, a shift still open), or when it has no date at all. Every other table is kept
// whole: medicines, batches, clients, suppliers, staff, roles, branches, banks, insurers, settings…
import 'package:flutter/foundation.dart' show kIsWeb;

import 'balances.dart';
import 'insurance.dart';

/// The tables that only keep their recent part on a device with a window: the ones that grow every day
const windowed = {
  'sales', 'movements', 'payments', 'purchases', 'expenses', 'bankTx', 'supplierReturns', 'transfers', 'audit', //
  'messages', 'events', 'tempLogs', 'quizResults', 'anomalies', 'attendance', 'payrolls', 'salaryAdvances', 'proformas', 'shifts',
};

/// Whether a device keeps only recent history unless the owner chose otherwise on This device. Off while the Flutter
/// apps' figures with a window are checked against real pharmacies, as the React app's were (docs/SYNC-SPEED-PLAN.md).
const windowByDefault = false;

/// How many months of history a device keeps unless the owner chose otherwise (0 = everything): with the window on,
/// the apps keep 12 months and the web app 1 (docs/SYNC-SPEED-PLAN.md, the owner's decisions G and H)
int defaultHistoryMonths() => !windowByDefault
    ? 0
    : kIsWeb
    ? 1
    : 12;

String _s(Object? v) => (v == null || v == false || v == '' || v == 0) ? '' : '$v';

/// The date a record belongs to (its own date, or when it was made)
String recordDate(Map<String, Object?> r) {
  for (final k in const ['date', 'at', 'startedAt', 'createdAt']) {
    final v = _s(r[k]);
    if (v.isNotEmpty) return v;
  }
  return '';
}

double _n(Object? v) => v is num ? v.toDouble() : (v is String ? double.tryParse(v.trim()) ?? 0 : 0);

/// Still open: needed on the device whatever its age
bool isOpenItem(String t, Map<String, Object?> r) {
  final status = _s(r['status']);
  switch (t) {
    case 'sales':
      return r['status'] != 'refunded' && clientOwes(r) > 0.5;
    case 'purchases':
      return _n(r['total']) - _n(r['paid'] ?? r['total']) > 0.5;
    case 'salaryAdvances':
      return _s(r['payrollId']).isEmpty;
    case 'transfers':
      return RegExp('transit|pending|draft', caseSensitive: false).hasMatch(status);
    case 'shifts':
      return _s(r['closedAt']).isEmpty && !RegExp('closed', caseSensitive: false).hasMatch(status);
    default:
      return false;
  }
}

/// Does a balance entry of this record fall from W?
bool hasEntryFrom(String t, Map<String, Object?> r, String w) => entriesOf(t, r).any((e) => e.date.compareTo(w) >= 0);

/// Does a device with window start [w] keep this record? (w empty: no window, everything is kept)
bool keeps(String t, Map<String, Object?>? r, String? w) {
  if (w == null || w.isEmpty || !windowed.contains(t) || r == null || (r['deleted'] != null && r['deleted'] != false && r['deleted'] != 0)) return true;
  final d = recordDate(r);
  return d.isEmpty || d.compareTo(w) >= 0 || hasEntryFrom(t, r, w) || isOpenItem(t, r);
}

/// The window start for a device keeping [months] months, as of [now]: the first day of the month [months] back,
/// e.g. '2026-10-01' (whole months: the window moves once a month, and every device with the same setting shares the
/// cloud's brought-forward figures and ready-made chunks); '' for everything (0 or null months). As src/sync.js windowStart.
String windowStart(int? months, [DateTime? now]) {
  final m = months ?? 0;
  if (m <= 0) return '';
  final n = (now ?? DateTime.now()).toUtc();
  return DateTime.utc(n.year, n.month - m, 1).toIso8601String().substring(0, 10);
}
