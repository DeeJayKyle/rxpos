// Refill and payment reminders (src/pages/Reminders.jsx, src/rxrules.js): refills due from prescriptions with a
// refill interval (dispensed, not cancelled / completed / pending) and from chronic medicines bought by registered
// clients (last purchase + the medicine's refill days, 30 by default), due within 7 days or up to 30 days overdue;
// and clients who owe. Message templates for clients (src/pages/Messages.jsx).
import '../../../core/entities/product.dart';
import '../../../core/entities/sale.dart';
import '../../../core/rules/dates.dart';

const starterTemplates = [
  {'id': 'tpl-welcome', 'name': 'Welcome', 'text': 'Hello {name}, thank you for choosing {pharmacy}. Save this number for medicine questions and refills. Get well soon!'},
  {'id': 'tpl-offer', 'name': 'Special offer', 'text': 'Hello {name}! This week at {pharmacy}: ask about our offers on vitamins and family care. Visit us or reply on WhatsApp.'},
  {'id': 'tpl-holiday', 'name': 'Opening hours', 'text': 'Dear {name}, {pharmacy} is open from 8am to 10pm every day, including public holidays. We are here for you.'},
];

bool reminderActive(Map<String, Object?> r) => (num.tryParse('${r['refillDays'] ?? ''}') ?? 0) > 0 && !const {'Cancelled', 'Completed', 'Pending'}.contains(r['status']);

String _addDays(String date, int n) {
  final d = DateTime.tryParse(date);
  if (d == null) return '';
  return localDate(DateTime(d.year, d.month, d.day + n));
}

typedef RefillDue = ({String key, String customerId, String medicine, String due, int days});

List<RefillDue> refillsDue(Iterable<Map<String, Object?>> prescriptions, Iterable<Sale> sales, Iterable<Product> products, Set<String> customerIds, {DateTime? now}) {
  final out = <String, ({String customerId, String medicine, String due})>{};
  for (final r in prescriptions) {
    if (!reminderActive(r)) continue;
    final meds = r['medications'] is List
        ? (r['medications'] as List).map((m) => m is Map ? '${m['name']}' : '$m').join('\n')
        : '${r['medications'] ?? ''}';
    final first = meds.split('\n').first;
    out['${r['customerId']}|rx${r['id']}'] = (
      customerId: '${r['customerId']}', medicine: first.length > 60 ? first.substring(0, 60) : first,
      due: _addDays('${r['dispensedOn'] ?? r['date']}', (num.tryParse('${r['refillDays']}') ?? 0).round()),
    );
  }
  final chronic = {for (final p in products) if (p.raw['chronic'] == true) p.id: p};
  final last = <String, String>{};
  for (final s in sales) {
    if (s.status == 'refunded' || s.customerId.isEmpty || s.customerId == 'walk-in') continue;
    for (final i in s.items) {
      if (!chronic.containsKey(i.id)) continue;
      final k = '${s.customerId}|${i.id}';
      if ((last[k] ?? '').compareTo(s.date) < 0) last[k] = s.date;
    }
  }
  for (final e in last.entries) {
    final parts = e.key.split('|');
    final p = chronic[parts[1]]!;
    final days = (num.tryParse('${p.raw['refillDays'] ?? ''}') ?? 0).round();
    out[e.key] = (customerId: parts[0], medicine: p.name, due: _addDays(e.value, days > 0 ? days : 30));
  }
  return [
    for (final e in out.entries)
      if (customerIds.contains(e.value.customerId) && e.value.due.isNotEmpty)
        (key: e.key, customerId: e.value.customerId, medicine: e.value.medicine, due: e.value.due, days: daysUntil(e.value.due, now: now)),
  ].where((r) => r.days <= 7 && r.days >= -30).toList()
    ..sort((a, b) => a.due.compareTo(b.due));
}
