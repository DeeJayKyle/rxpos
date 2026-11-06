// What runs in the background while the app is open (src/engage.jsx AlertWatcher, MessageWatcher, WeatherLogger,
// HourlyReminder; src/pages/Weekly.jsx WeeklyPopup; src/reorder.js AutoReorder):
//  • a pop-up with a sound when an alert appears or grows, at most once per kind per day (at the till only urgent ones)
//  • a pop-up for new team messages and client replies (not while Chat is open)
//  • the outside temperature and humidity logged every 6 hours from the weather
//  • at the top of each hour a soft chime with what needs doing; room and fridge readings at 06, 12, 18; greetings with
//    the day's health tip (and WHO alerts nearby) at 08, 14 and 16, also posted to the team chat
//  • last week at a glance, once at the start of each week
//  • reorder levels from sales, automatically once a week
// Nothing pops up in quiet hours.
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/data/device_settings.dart';
import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/notify/os_notifications.dart';
import '../../../core/database/app_database.dart';
import '../../../core/entities/sale.dart';
import '../../../core/network/cloud_api.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/health_tips.dart';
import '../../../core/sync/sync_config.dart';
import '../../alerts/application/alerts_provider.dart';
import '../../alerts/domain/alerts.dart';
import '../../alerts/presentation/notification_bell.dart';
import '../../auth/application/session_controller.dart';
import '../../chat/domain/chat.dart';
import '../../extras/domain/extras.dart';
import '../../purchases/domain/reorder.dart';
import '../../reports/domain/weekly.dart';
import '../../storage/application/weather_controller.dart';
import '../application/popups.dart';
import '../domain/engage.dart';

/// Switched off in tests that don't look at it (pop-ups would cover what they tap).
final engageOnProvider = Provider<bool>((_) => true);

/// The time the reminders follow (replaced in tests).
final engageClockProvider = Provider<DateTime Function()>((_) => DateTime.now);

String _hm(DateTime d) => '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

Widget alertList(BuildContext context, List<Alert> items, VoidCallback close) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
      for (final a in items)
        InkWell(
          onTap: () {
            close();
            context.go(a.to);
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(children: [Icon(a.icon, size: 15, color: toneColor(context, a.tone)), const SizedBox(width: 8), Expanded(child: Text(a.text))]),
          ),
        ),
    ]);

class EngageWatchers extends ConsumerStatefulWidget {
  const EngageWatchers({super.key, required this.location});
  final String location;
  @override
  ConsumerState<EngageWatchers> createState() => EngageWatchersState();
}

class EngageWatchersState extends ConsumerState<EngageWatchers> {
  Timer? _alertTimer, _hourTimer, _weeklyTimer, _reorderTimer;
  String? _since; // the newest message seen
  Map<String, Object?>? _who; // WHO alerts, kept for 3 hours
  DateTime? _whoAt;
  final _subs = <ProviderSubscription<Object?>>[];

  bool get _selling => widget.location.startsWith('/pos');

  /// The number on the app icon: unread chat and transfers on their way here (src/App.jsx setBadge).
  int get _unread {
    final c = ref.read(navCountsProvider);
    return (c['chat'] ?? 0) + (c['transfers'] ?? 0);
  }

  /// Also as a system notification while RxPOS is in the background.
  void _system(String title, String body) => ref.read(systemNoticesProvider).notify(title, body, count: _unread);
  DateTime _now() => ref.read(engageClockProvider)();

  @override
  void initState() {
    super.initState();
    if (!ref.read(engageOnProvider)) return;
    _subs.add(ref.listenManual<List<Alert>>(alertsProvider, (_, next) => _alertsChanged(next), fireImmediately: true));
    _subs.add(ref.listenManual<AsyncValue<List<Map<String, Object?>>>>(tableProvider('messages'), (_, next) {
      final rows = next.value;
      if (rows != null) _messages(rows);
    }, fireImmediately: true));
    _subs.add(ref.listenManual<WeatherState>(weatherProvider, (_, next) => _logWeather(next), fireImmediately: true));
    _subs.add(ref.listenManual<Map<String, int>>(navCountsProvider, (_, next) => ref.read(systemNoticesProvider).countIs((next['chat'] ?? 0) + (next['transfers'] ?? 0))));
    _armHour();
    _weeklyTimer = Timer(const Duration(seconds: 9), _weekly);
    _reorderTimer = Timer(const Duration(seconds: 20), _autoReorder);
  }

  @override
  void didUpdateWidget(EngageWatchers oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!ref.read(engageOnProvider) || oldWidget.location == widget.location) return;
    // waiting alerts and last week's summary show once the till is left
    if (oldWidget.location.startsWith('/pos') && !_selling) {
      _alertsChanged(ref.read(alertsProvider));
      _weeklyTimer?.cancel();
      _weeklyTimer = Timer(const Duration(seconds: 9), _weekly);
    }
  }

  @override
  void dispose() {
    for (final t in [_alertTimer, _hourTimer, _weeklyTimer, _reorderTimer]) {
      t?.cancel();
    }
    for (final s in _subs) {
      s.close();
    }
    super.dispose();
  }

  Future<Map<String, Object?>?> _device(String k) async {
    try {
      final v = await ref.read(deviceValueProvider(k).future);
      return v == null ? null : (jsonDecode(v) as Map).cast<String, Object?>();
    } catch (_) {
      return null;
    }
  }

  // ---- alerts ----
  void _alertsChanged(List<Alert> alerts) {
    _alertTimer?.cancel();
    if (alerts.isEmpty) return;
    _alertTimer = Timer(const Duration(seconds: 4), () async {
      final d = await ref.read(pharmacyProvider.future);
      if (!mounted || quietNow(d.settings, _now())) return;
      final seen = announcedToday(await _device('announced'), today(_now()));
      final fresh = freshAlerts(ref.read(alertsProvider), seen.keys, selling: _selling);
      if (fresh.isEmpty) return;
      final keys = {...seen.keys, for (final a in fresh) a.key: a.n};
      await ref.read(deviceValueProvider('announced').notifier).set(jsonEncode({'day': seen.day, 'keys': keys}));
      final top = fresh.take(3).toList();
      ref.read(popupsProvider.notifier).show(Popup(
            id: 'alerts',
            tone: top.any((a) => a.tone == 'danger') ? 'danger' : 'warn',
            icon: Icons.notifications_active_outlined,
            title: fresh.length == 1 ? 'Needs attention' : '${fresh.length} things need attention',
            sound: 'alert',
            content: (c, close) => alertList(c, top, close),
          ));
      _system('RxPOS', top.map((a) => a.text).join('\n'));
    });
  }

  // ---- messages ----
  Future<void> _messages(List<Map<String, Object?>> all) async {
    final latest = all.fold<String>('', (a, m) => '${m['date']}'.compareTo(a) > 0 ? '${m['date']}' : a);
    if (_since == null) {
      _since = latest; // don't announce old messages on start
      return;
    }
    final since = _since!;
    if (latest.compareTo(since) > 0) _since = latest;
    final me = (await ref.read(sessionControllerProvider.future))?.userId ?? '';
    bool mine(Map<String, Object?> m) {
      final conv = '${m['conv'] ?? ''}';
      return m['auto'] != true && m['deleted'] != true && (m['call'] as Map?)?['status'] != 'done' && m['fromId'] != me &&
          (conv == 'team' || (conv.startsWith('dm:') && conv.contains(me)) || (conv.startsWith('client:') && m['channel'] == 'reply'));
    }

    final fresh = all.where((m) => '${m['date']}'.compareTo(since) > 0 && mine(m)).toList()..sort((a, b) => '${a['date']}'.compareTo('${b['date']}'));
    if (fresh.isEmpty || widget.location == '/chat' || !mounted) return;
    final m = fresh.last;
    final conv = '${m['conv']}';
    final where = conv == 'team' ? 'General' : conv.startsWith('dm:') ? 'Private' : 'Client reply';
    final call = m['call'] != null;
    final preview = messagePreview(m);
    ref.read(popupsProvider.notifier).show(Popup(
          id: 'msg',
          tone: call ? 'warn' : 'info',
          icon: call ? Icons.phone_missed_outlined : Icons.forum_outlined,
          title: call ? '${m['fromName']} tried to call you' : '${m['fromName'] ?? 'Message'} · $where',
          body: call ? 'Missed voice call' : '${fresh.length > 1 ? '(${fresh.length} new) ' : ''}${preview.length > 180 ? preview.substring(0, 180) : preview}',
          to: '/chat',
          sound: 'message',
        ));
    _system(call ? 'Missed call from ${m['fromName']}' : '${m['fromName']} · $where', call ? 'Open RxPOS to call back' : (preview.length > 120 ? preview.substring(0, 120) : preview));
  }

  // ---- outside readings every 6 hours ----
  Future<void> _logWeather(WeatherState w) async {
    if (w.data == null) return;
    final d = await ref.read(pharmacyProvider.future);
    if (d.features['weather'] == false) return;
    final store = ref.read(recordStoreProvider);
    final have = {for (final r in await store.rows('tempLogs')) '${r['id']}'};
    final add = weatherReadings(w.data, have, branch: d.branch, placeName: w.place?.name ?? '');
    if (add.isEmpty) return;
    await store.update((x) {
      for (final r in add) {
        x.put('tempLogs', r);
      }
    });
  }

  // ---- the hourly reminder and greetings ----
  void _armHour() {
    final now = _now();
    final next = DateTime(now.year, now.month, now.day, now.hour + 1);
    _hourTimer?.cancel();
    _hourTimer = Timer(next.difference(now) + const Duration(milliseconds: 800), () {
      _armHour();
      fireHour();
    });
  }

  /// What happens at the top of an hour (public so tests can call it at a chosen time).
  Future<void> fireHour() async {
    final d = await ref.read(pharmacyProvider.future);
    final now = _now();
    if (!mounted || quietNow(d.settings, now)) return;
    final h = now.hour;
    final s = d.settings.raw;
    if (s['dailyGreetings'] != false && greetSlots.contains(h)) return _greet(h, now);
    if (d.features['hourly'] == false || s['hourlyChime'] == false) return;
    final items = [
      if (readingSlots.contains(h) && d.features['weather'] != false)
        const Alert(key: 'read', tone: 'info', icon: Icons.thermostat, text: 'Time to record the room and fridge temperature & humidity', to: '/storage'),
      ...ref.read(alertsProvider).take(3),
    ];
    ref.read(popupsProvider.notifier).show(Popup(
          id: 'hour',
          icon: Icons.schedule,
          title: "It's ${_hm(now)}",
          sound: 'chime',
          ttl: const Duration(seconds: 20),
          content: (c, close) => items.isEmpty ? const Text('Nothing waiting on you. Enjoy the next hour.') : alertList(c, items, close),
        ));
    _system('RxPOS · ${_hm(now)}', items.isEmpty ? 'All clear.' : items.map((x) => x.text).join('\n'));
  }

  Future<List<({String title, String url, String date})>> _whoNear() async {
    if (_who == null || _whoAt == null || DateTime.now().difference(_whoAt!) > const Duration(hours: 3)) {
      try {
        _who = await ref.read(cloudApiProvider).get('/api/health-alerts');
        _whoAt = DateTime.now();
      } catch (_) {
        // keep the last answer
      }
    }
    return nearAlerts(_who).take(2).toList();
  }

  Future<void> _greet(int h, DateTime now) async {
    final d = await ref.read(pharmacyProvider.future);
    final me = await ref.read(sessionControllerProvider.future);
    final st = d.settings;
    final day = today(now);
    final tip = tipFor(day, h);
    final text = greetingMessage(pharmacy: st.name, phone: st.phone, slot: h, date: day);
    final who = await _whoNear();
    final alertText = who.isEmpty ? '' : '\n\n⚠️ Health alert (WHO): ${who.map((x) => x.title).join('; ')}';
    // one shared team post per pharmacy and slot (the same id on every device)
    await ref.read(recordStoreProvider).update((x) => x.put('messages', {
          'id': 'auto-$day-$h', 'date': now.toUtc().toIso8601String(), 'fromId': 'rxpos', 'fromName': 'RxPOS', 'conv': 'team', 'branchId': d.branch, 'channel': 'team', 'auto': true,
          'text': text.replaceFirst(RegExp(r'\n\n(Questions\?.*)$', dotAll: true), '') + alertText,
        }));
    if (!mounted) return;
    final hello = h == 8 ? 'Good morning' : 'Good afternoon';
    ref.read(popupsProvider.notifier).show(Popup(
          id: 'greet',
          tone: 'ok',
          icon: Icons.favorite_outline,
          wide: true,
          sticky: true,
          sound: 'chime',
          title: '$hello, ${(me?.userName ?? '').split(' ').first} · ${_hm(now)}',
          content: (c, _) => Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text.rich(TextSpan(children: [
              const TextSpan(text: 'Health tip · ', style: TextStyle(fontWeight: FontWeight.w700)),
              TextSpan(text: '${tip.text} '),
              TextSpan(text: 'Source: ${tip.source}', style: Theme.of(c).textTheme.bodySmall),
            ])),
            for (final x in who)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: InkWell(onTap: () => launchUrl(Uri.parse(x.url), mode: LaunchMode.externalApplication), child: Text('WHO alert · ${x.title} (${x.date})', style: TextStyle(color: Colors.orange.shade900))),
              ),
            const SizedBox(height: 4),
            Text("Share today's message with clients (one tap, free):", style: Theme.of(c).textTheme.bodySmall),
          ]),
          actions: [
            PopupAction('Share on WhatsApp', icon: Icons.share_outlined, primary: true, keep: true, onTap: () => launchUrl(Uri.parse(whatsappLink('', text)), mode: LaunchMode.externalApplication)),
            const PopupAction('Send to client list', icon: Icons.people_outline, to: '/messages'),
          ],
        ));
  }

  // ---- last week at a glance ----
  Future<void> _weekly() async {
    if (!mounted || _selling) return;
    final can = await ref.read(permissionsProvider.future);
    final d = await ref.read(pharmacyProvider.future);
    if (!can.contains('reports') || d.features['reports'] == false) return;
    final start = weekStart(_now(), -1);
    final key = 'weekly-${localDate(start)}';
    if (await ref.read(deviceValueProvider(key).future) != null) return;
    final sales = (await ref.read(recordStoreProvider).rows('sales')).map(Sale.fromRecord);
    final w = weeklyStats(sales, start);
    if (w.count == 0 && w.prevCount == 0) return;
    await ref.read(deviceValueProvider(key).notifier).set('1');
    if (!mounted) return;
    final st = d.settings;
    final up = w.total >= w.prevTotal;
    final change = w.prevTotal == 0 ? 100 : ((w.total - w.prevTotal) / w.prevTotal * 100).abs().round();
    final peak = w.byDay.fold<double>(1, (a, x) => x.$2 > a ? x.$2 : a);
    ref.read(popupsProvider.notifier).show(Popup(
          id: 'weekly',
          tone: 'ok',
          icon: Icons.bar_chart,
          title: 'Last week at a glance',
          sound: 'report',
          wide: true,
          sticky: true,
          content: (c, _) => Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Row(children: [
              Expanded(child: Text('${w.start} → ${w.end}', style: Theme.of(c).textTheme.bodySmall)),
              Icon(up ? Icons.trending_up : Icons.trending_down, size: 14, color: up ? Colors.green.shade700 : Theme.of(c).colorScheme.error),
              Text(' $change%'),
            ]),
            Text(st.money(w.total), key: const Key('weekly-total'), style: Theme.of(c).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
            Text('${w.count} sales · best day ${w.best.$1}', style: Theme.of(c).textTheme.bodySmall),
            SizedBox(
              height: 40,
              child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                for (final x in w.byDay)
                  Expanded(child: Container(margin: const EdgeInsets.symmetric(horizontal: 2), height: 4 + 36 * (x.$2 / peak), color: Theme.of(c).colorScheme.primary)),
              ]),
            ),
            if (w.top.isNotEmpty) Text('Top seller: ${w.top.first.name} (${st.money(w.top.first.amount)})'),
            if (w.risers.isNotEmpty) Text('Stood out: ${w.risers.first.name} ${w.risers.first.before > 0 ? 'up ${w.risers.first.growth.round()}%' : 'new this week'}'),
          ]),
          actions: const [PopupAction('Full weekly report', primary: true, to: '/weekly')],
        ));
  }

  // ---- reorder levels, once a week ----
  Future<void> _autoReorder() async {
    final d = await ref.read(pharmacyProvider.future);
    final st = d.settings.raw;
    final can = await ref.read(permissionsProvider.future);
    if (st['autoReorder'] == false || !can.contains('medicines.manage')) return;
    // not before this device has the pharmacy (it would stamp the blank defaults as newer than the pharmacy's own)
    final cfg = await SyncConfig.load(ref.read(appDatabaseProvider));
    final at = '${st['updatedAt'] ?? ''}';
    if (cfg.lastSync == null || at.isEmpty || at.startsWith('2000-01-01')) return;
    final last = DateTime.tryParse('${st['autoReorderAt'] ?? ''}');
    if (last != null && _now().difference(last) < const Duration(days: 7)) return;
    final store = ref.read(recordStoreProvider);
    final sales = (await store.rows('sales')).map(Sale.fromRecord).toList();
    int n(String k, int def) => (num.tryParse('${st[k] ?? ''}') ?? def).round();
    final changes = computeReorderLevels(sales, d.products, days: n('autoReorderDays', 30), lead: n('leadDays', 7), safety: n('safetyDays', 7), branch: d.branch);
    final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
    if (changes.isNotEmpty) {
      await applyReorderLevels(store, changes, user: user, branchId: d.branch, auto: true);
    } else {
      final rec = await store.settingsRecord();
      await store.update((x) => x.saveSettings({...rec, 'autoReorderAt': x.now}));
    }
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
