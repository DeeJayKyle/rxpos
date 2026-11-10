// Document numbers (workplan step 7), the same rules as src/docnumbers.js: R-NTD-03-000412 = kind, branch code,
// till, count. Each device has a till number in its pharmacy (given by the cloud, /api/till, kept in SyncConfig) and
// counts each kind of document in a `counters` record saved in the same transaction as the document (Edit.number),
// so numbers never repeat, even offline. Until a device has a till number the old clock-based style is used.
import 'ids.dart';

/// Receipts, proformas, deliveries, purchase orders, transfers, stock counts, returns to supplier.
const docKinds = ['R', 'PF', 'GRN', 'PO', 'TR', 'SC', 'RT'];

final _notCode = RegExp(r'[^A-Z0-9]');

/// A branch's code: its own `code` (set in the owner console), else the first three letters/digits of its name.
String branchCode(Map<String, Object?>? branch) {
  final own = '${branch?['code'] ?? ''}'.toUpperCase().replaceAll(_notCode, '');
  if (own.isNotEmpty) return own.length > 5 ? own.substring(0, 5) : own;
  final name = '${branch?['name'] ?? ''}'.toUpperCase().replaceAll(_notCode, '');
  if (name.isEmpty) return 'BR';
  return name.length > 3 ? name.substring(0, 3) : name;
}

String counterId(int till) => 'till-$till';

/// R-NTD-03-000412 (the till has at least 2 digits, the count at least 6).
String formatNumber(String kind, String code, int till, int n) => '$kind-$code-${'$till'.padLeft(2, '0')}-${'$n'.padLeft(6, '0')}';

/// The old clock-based number, only while a device has no till number yet.
String legacyNumber(String kind, {DateTime? now}) => docNumber(kind, now: now);
