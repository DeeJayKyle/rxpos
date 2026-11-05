// Prescriptions and refills (src/pages/Prescriptions.jsx): a refill is recorded while refills remain; the last one
// completes the prescription; the next refill is due refillDays after the last dispensing.
import '../../../core/data/record_store.dart';
import '../../../core/rules/dates.dart';

int _i(Object? v) => (v as num?)?.toInt() ?? 0;

bool canRecordRefill(Map<String, Object?> r) => r['status'] != 'Cancelled' && r['status'] != 'Completed' && _i(r['refillsUsed']) < _i(r['refillsAllowed']);

/// The next refill date (YYYY-MM-DD) for a dispensed prescription with refillDays, else null.
String? nextRefillDue(Map<String, Object?> r) {
  final days = _i(r['refillDays']);
  if (days <= 0 || r['status'] != 'Dispensed') return null;
  final from = DateTime.tryParse('${r['dispensedOn'] ?? r['date']}');
  return from == null ? null : localDate(from.add(Duration(days: days)));
}

class RefillProblem implements Exception {
  RefillProblem(this.message);
  final String message;
  @override
  String toString() => message;
}

Future<Map<String, Object?>> recordRefill(RecordStore store, Map<String, Object?> r, {required String user, required String patient, DateTime? now}) {
  if (!canRecordRefill(r)) {
    throw RefillProblem(_i(r['refillsAllowed']) > 0 ? 'All refills on this prescription have been used. A new prescription is needed.' : 'This prescription allows no refills. A new prescription is needed.');
  }
  final used = _i(r['refillsUsed']) + 1, allowed = _i(r['refillsAllowed']);
  return store.update((d) {
    final next = d.put('prescriptions', {...r, 'refillsUsed': used, 'refillDates': [...((r['refillDates'] as List?) ?? const []), today(now)],
      'dispensedOn': today(now), 'status': allowed > 0 && used >= allowed ? 'Completed' : 'Dispensed'});
    d.audit(user, 'Prescription refilled', '$patient: refill $used${allowed > 0 ? '/$allowed' : ''}');
    return next;
  });
}
