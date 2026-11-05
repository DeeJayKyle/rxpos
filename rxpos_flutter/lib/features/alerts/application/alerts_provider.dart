// Today's alerts and the menu counts, from what is on this device (src/engage.jsx useAlerts, src/App.jsx counts).
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/device_settings.dart';
import '../../../core/data/pharmacy_providers.dart';
import '../../../core/entities/sale.dart';
import '../../auth/application/session_controller.dart';
import '../../chat/domain/chat.dart';
import '../../dashboard/domain/insights.dart';
import '../../extras/domain/extras.dart';
import '../../storage/application/weather_controller.dart';
import '../domain/alerts.dart';

final alertsProvider = Provider.autoDispose<List<Alert>>((ref) {
  final d = ref.watch(pharmacyProvider).value;
  final sales = ref.watch(tableProvider('sales')).value;
  final rx = ref.watch(tableProvider('prescriptions')).value;
  final events = ref.watch(tableProvider('events')).value;
  final logs = ref.watch(tableProvider('tempLogs')).value;
  final can = ref.watch(permissionsProvider).value ?? const <String>{};
  if (d == null || sales == null || rx == null || events == null || logs == null) return const [];
  final weatherOn = d.features['weather'] != false;
  final wx = weatherOn ? ref.watch(weatherProvider).data : null;
  final ins = insights(d.products, d.stockOf, d.stock.batchesOf, sales.map(Sale.fromRecord), d.settings);
  return todaysAlerts(
    products: d.products,
    stockOf: d.stockOf,
    batchesOf: d.stock.batchesOf,
    expiryWarnDays: d.settings.expiryWarnDays.round(),
    slowCount: ins.slow.length,
    prescriptions: rx,
    events: events,
    tempLogs: logs.where((r) => (r['branchId'] ?? 'main') == d.branch).toList(),
    limits: storageLimits(d.settings),
    can: can,
    weather: wx,
    weatherOn: weatherOn,
  );
});

/// The numbers beside menu items: expiring + expired medicines, low stock, transfers on their way here, unread chat.
final navCountsProvider = Provider.autoDispose<Map<String, int>>((ref) {
  final d = ref.watch(pharmacyProvider).value;
  final transfers = ref.watch(tableProvider('transfers')).value ?? const [];
  final messages = ref.watch(tableProvider('messages')).value ?? const [];
  final me = ref.watch(sessionControllerProvider).value;
  final readRaw = ref.watch(deviceValueProvider('chat-read')).value;
  if (d == null) return const {};
  final e = expiryCountsOf(d);
  Map<String, String> read;
  try {
    read = (jsonDecode(readRaw ?? '{}') as Map).map((k, v) => MapEntry('$k', '$v'));
  } catch (_) {
    read = const {};
  }
  return {
    'expiry': e,
    'low': d.products.where((p) => d.stockOf(p.id) > 0 && p.reorder > 0 && d.stockOf(p.id) <= p.reorder).length,
    'transfers': transfers.where((t) => t['toId'] == d.branch && t['status'] == 'In transit').length,
    'chat': me == null ? 0 : unreadCount(messages, me.userId, read),
  };
});

int expiryCountsOf(PharmacyData d) {
  final soon = <String>{}, expired = <String>{};
  final now = DateTime.now();
  final warn = d.settings.expiryWarnDays.round();
  for (final p in d.products) {
    if (!(d.stockOf(p.id) > 0)) continue;
    for (final b in d.stock.batchesOf(p.id)) {
      if (!(b.qty > 0) || b.expiry.isEmpty) continue;
      final exp = DateTime.tryParse(b.expiry);
      if (exp == null) continue;
      final days = DateTime.utc(exp.year, exp.month, exp.day).difference(DateTime.utc(now.year, now.month, now.day)).inDays;
      if (days < 0) {
        expired.add(p.id);
      } else if (days <= warn) {
        soon.add(p.id);
      }
    }
  }
  return soon.length + expired.length;
}
