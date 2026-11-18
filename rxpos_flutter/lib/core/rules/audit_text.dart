// The audit log in plain sentences (UI batch 3, F6) and "Edited by … · 2 h ago" (F5): the same rules as src/auditText.js.

const _verbs = {
  'Refund': 'refunded', 'Signed in': 'signed in', 'Price changed': 'changed a price:', 'Expired write-off': 'wrote off expired stock:',
  'Settings changed': 'changed a setting:', 'Sale edited': 'edited a sale:', 'Sale check reviewed': 'checked a sale:', 'Inventory edited': 'edited stock:',
  'Stock adjusted': 'adjusted stock:', 'Shelf assigned': 'put medicines on a shelf:', 'Medicines changed': 'changed medicines:', 'Draft discarded': 'discarded a draft:',
  'Purchase orders created': 'created purchase orders:', 'Purchase order marked sent': 'sent a purchase order:', 'Invoices scanned': 'scanned invoices:',
};

/// "Amina refunded R102, UGX 5,000 · reason: wrong item"
String auditSentence(Map<String, Object?> a) {
  final who = '${a['user'] ?? ''}'.isEmpty ? 'Someone' : '${a['user']}';
  final d = '${a['details'] ?? ''}', action = '${a['action'] ?? ''}';
  if (action == 'Refund') {
    final p = d.split(' · ');
    return '$who refunded ${p[0]}${p.length > 1 ? ', ${p[1]}' : ''}${p.length > 2 ? ' · reason: ${p[2]}' : ''}${p.length > 3 ? ' · ${p.skip(3).join(' · ')}' : ''}';
  }
  if (action == 'Signed in') return '$who signed in${d.isEmpty ? '' : ' on $d'}';
  final verb = _verbs[action] ?? (action.isEmpty ? '' : '${action[0].toLowerCase()}${action.substring(1)}${d.isEmpty ? '' : ':'}');
  return '$who $verb${d.isEmpty ? '' : ' $d'}';
}

const auditKinds = [('sales', 'Sales & refunds'), ('stock', 'Stock & prices'), ('people', 'Staff & sign-ins'), ('settings', 'Settings'), ('other', 'Other')];

String auditKind(Map<String, Object?> a) {
  final x = '${a['action'] ?? ''}'.toLowerCase();
  if (RegExp('refund|sale|discount|proforma|day').hasMatch(x)) return 'sales';
  if (RegExp('stock|price|write-off|batch|medicine|shelf|purchase|invoice|transfer|count|inventory|kit').hasMatch(x)) return 'stock';
  if (RegExp('sign|user|role|password|pin|two-step').hasMatch(x)) return 'people';
  if (x.contains('setting')) return 'settings';
  return 'other';
}

/// "2 h ago", "just now", "3 days ago"
String agoText(String iso, [DateTime? now]) {
  final t = DateTime.tryParse(iso);
  if (t == null) return '';
  final m = (now ?? DateTime.now()).difference(t).inMinutes;
  if (m < 0) return '';
  if (m < 1) return 'just now';
  if (m < 60) return '$m min ago';
  if (m < 1440) return '${(m / 60).round()} h ago';
  final d = (m / 1440).round();
  return d == 1 ? 'yesterday' : '$d days ago';
}

/// F5: "Edited by Amina · 2 h ago" for a record that carries editedBy / editedAt; '' when it never was
String editedLine(Map<String, Object?>? r) {
  final by = '${r?['editedBy'] ?? ''}';
  if (by.isEmpty) return '';
  final at = agoText('${r?['editedAt'] ?? ''}');
  return 'Edited by $by${at.isEmpty ? '' : ' · $at'}';
}

/// What an edit adds to a record: who and when
Map<String, Object?> editStamp(String who) => {'editedBy': who, 'editedAt': DateTime.now().toUtc().toIso8601String()};
