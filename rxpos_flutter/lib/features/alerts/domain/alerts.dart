// Today's alerts (src/engage.jsx useAlerts): stock below zero, expired and expiring stock, low stock, slow movers,
// refills due, today's events, an out-of-range storage reading, hot weather and rain. Each has a tone (danger = urgent,
// warn = needs attention, info = for information), a page to open and a count (an alert is announced again when its
// count grows).
import 'package:flutter/material.dart';

import '../../../core/entities/product.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/fefo.dart';
import '../../../core/rules/stock.dart';
import '../../calendar/domain/calendar.dart';
import '../../storage/domain/weather.dart';

class Alert {
  const Alert({required this.key, required this.tone, required this.icon, required this.text, required this.to, this.why = '', this.n = 1});
  final String key, tone, text, to, why;
  final IconData icon;
  final int n;
}

const toneHeads = [('danger', 'Urgent'), ('warn', 'Needs attention'), ('info', 'For information')];

String _s(int n, String one, String many) => n > 1 ? many : one;

List<Alert> todaysAlerts({
  required List<Product> products,
  required double Function(String id) stockOf,
  required List<BatchStock> Function(String id) batchesOf,
  required int expiryWarnDays,
  required int slowCount,
  required List<Map<String, Object?>> prescriptions,
  required List<Map<String, Object?>> events,
  required List<Map<String, Object?>> tempLogs,
  required Limits limits,
  required Set<String> can,
  Map<String, Object?>? weather,
  bool weatherOn = true,
  DateTime? now,
}) {
  final t = today(now);
  final out = <Alert>[];
  final inv = can.contains('inventory.view');
  final e = expiryBatches(products, batchesOf, stockOf, expiryWarnDays < 30 ? expiryWarnDays : 30, now: now);
  final expired = {for (final x in e.expired) x.$1.id}.length, soon = {for (final x in e.soon) x.$1.id}.length;
  final low = products.where((p) => isLowStock(p, stockOf(p.id))).length;
  final oversold = products.where((p) => stockOf(p.id) < 0).length;
  final refills = prescriptions.where((r) {
    final days = num.tryParse('${r['refillDays'] ?? ''}');
    final from = '${r['dispensedOn'] ?? r['date'] ?? ''}'.split('T').first;
    return r['status'] == 'Dispensed' && days != null && days != 0 && from.length == 10 && addDays(from, days.toInt()).compareTo(t) <= 0;
  }).length;
  if (oversold > 0 && inv) {
    out.add(Alert(key: 'oversold', tone: 'danger', icon: Icons.remove_shopping_cart_outlined, text: '$oversold medicine${_s(oversold, ' shows', 's show')} stock below zero',
        why: 'More was sold than the system holds: usually two devices selling the last units while offline, or a delivery not yet entered. Count them and correct the stock.', to: '/stock-count', n: oversold));
  }
  if (expired > 0 && inv) {
    out.add(Alert(key: 'expired', tone: 'danger', icon: Icons.event_busy_outlined, text: '$expired item${_s(expired, '', 's')} expired but still in stock',
        why: 'Expired batches can only be sold with a recorded reason. Return them to the supplier or write them off.', to: '/expiry', n: expired));
  }
  if (soon > 0 && inv) {
    out.add(Alert(key: 'expiring', tone: 'warn', icon: Icons.event_busy_outlined, text: '$soon item${_s(soon, ' expires', 's expire')} within 30 days: sell first',
        why: 'Sales already use the earliest-expiring batch first. Promote these or return them before they expire.', to: '/expiry', n: soon));
  }
  if (low > 0 && inv) {
    out.add(Alert(key: 'low', tone: 'warn', icon: Icons.inventory_outlined, text: '$low item${_s(low, '', 's')} at or below reorder level', why: 'In stock, but at or below the fixed reorder level set on each medicine.', to: '/reorder', n: low));
  }
  if (slowCount > 0 && inv) {
    out.add(Alert(key: 'slow', tone: 'info', icon: Icons.timer_outlined, text: '$slowCount${slowCount >= 10 ? '+' : ''} slow-moving items: recommend or promote them', why: 'In stock with no recent sales.', to: '/reorder', n: slowCount));
  }
  if (refills > 0 && can.contains('prescriptions')) {
    out.add(Alert(key: 'refills', tone: 'info', icon: Icons.repeat, text: '$refills refill${_s(refills, '', 's')} due: remind the patients', why: 'Dispensed prescriptions whose refill interval has passed.', to: '/reminders', n: refills));
  }
  for (final ev in events.where((x) => x['date'] == t)) {
    final time = '${ev['time'] ?? ''}';
    out.add(Alert(key: 'ev-${ev['id']}', tone: 'info', icon: Icons.calendar_today_outlined, text: '${time.isEmpty ? '' : '$time · '}${ev['title']}', to: '/calendar'));
  }
  final readings = tempLogs.where((r) => r['place'] != 'Outside').toList()..sort((a, b) => '${b['at']}'.compareTo('${a['at']}'));
  final last = readings.firstOrNull;
  if (last != null) {
    final temp = ((last['temp'] as num?) ?? num.tryParse('${last['temp']}') ?? 0).toDouble();
    final bad = last['place'] == 'Fridge' ? temp < limits.fridgeMin || temp > limits.fridgeMax : temp > limits.roomMax;
    if (bad) {
      out.add(Alert(key: 'reading-${last['id']}', tone: 'danger', icon: Icons.thermostat, text: '${last['place']} reading ${last['temp']}°C is out of range',
          why: 'The last storage temperature reading is outside the safe range set in Settings.', to: '/storage'));
    }
  }
  if (weather != null && weatherOn) {
    num? at(String k, int i) => ((weather['daily'] as Map?)?[k] as List?)?.elementAtOrNull(i) as num?;
    final cur = ((weather['current'] as Map?)?['temperature_2m']) as num?, max = at('temperature_2m_max', 1);
    if ((cur != null && cur >= limits.hotAlert) || (max != null && max >= limits.hotAlert)) {
      out.add(Alert(key: 'hot', tone: 'danger', icon: Icons.wb_sunny_outlined, to: '/storage',
          text: cur != null && cur >= limits.hotAlert ? "It's ${cur.round()}°C outside: keep medicines cool and check the room thermometer" : 'Up to ${max!.round()}°C expected today: keep medicines cool'));
    }
    final rainToday = at('precipitation_probability_max', 1), rainTomorrow = at('precipitation_probability_max', 2);
    if (rainToday != null && rainToday >= 60) {
      out.add(Alert(key: 'rain', tone: 'info', icon: Icons.umbrella_outlined, text: 'Rain likely today ($rainToday%): protect deliveries and keep stock off the floor', to: '/storage'));
    } else if (rainTomorrow != null && rainTomorrow >= 60) {
      out.add(Alert(key: 'rain-tomorrow', tone: 'info', icon: Icons.umbrella_outlined, text: 'Rain likely tomorrow ($rainTomorrow%)', to: '/storage'));
    }
  }
  return out;
}
