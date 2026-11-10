// Settings (src/pages/Settings.jsx): Pharmacy (this device's overrides of the Owner's details), Payment methods,
// Receipts & stock, Messages & recovery, Alerts & storage, Online & Mobile Money, Data & backup.
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/data/device_settings.dart';
import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/network/cloud_api.dart';
import '../../../core/presentation/export.dart';
import '../../../core/rules/ids.dart';
import '../../../core/rules/pharmacy_settings.dart';
import '../../../core/sync/merge.dart' show pharmacyFields;
import '../../../core/presentation/widgets.dart';
import '../../auth/application/session_controller.dart';
import '../../sync_status/application/sync_controller.dart';
import 'report_schedules.dart';

const defaultPlace = {'name': 'Kampala, Uganda', 'lat': 0.3476, 'lon': 32.5825};

/// Storage limits with their defaults (src/weather.js storageLimits).
Map<String, num> storageLimitsOf(Map<String, Object?> s) {
  num v(String k, num d) => (num.tryParse('${s[k] ?? ''}') ?? 0) == 0 ? d : num.parse('${s[k]}');
  return {'roomMin': v('roomMin', 15), 'roomMax': v('roomMax', 25), 'fridgeMin': v('fridgeMin', 2), 'fridgeMax': v('fridgeMax', 8), 'hotAlert': v('hotAlert', 30), 'humidityMax': v('humidityMax', 65)};
}

/// Number settings and their defaults when left empty (Settings.jsx submitSettings).
const _numbers = {
  'taxRate': 0, 'decimals': 0, 'retailMarkup': 50, 'wholesaleMarkup': 25, 'priceRound': 0, 'minMargin': 20, 'expiryWarnDays': 90, 'paperWidth': 80, 'leadDays': 7,
  'coverDays': 30, 'deadDays': 90, 'idleMinutes': 3, 'quietFrom': 21, 'quietTo': 7,
};

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key, this.tab = 'general'});
  final String tab;
  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  late String _tab = widget.tab;
  final Map<String, Object?> _s = {};
  final Set<String> _dirty = {};
  List<Map<String, Object?>>? _methods;
  int _gen = 0; // bumps to rebuild the text fields after a reset
  String? _preview, _busy;
  List<Map<String, Object?>>? _places;
  String _placeQ = '';

  static const _tabs = [
    ('general', 'Pharmacy'), ('payments', 'Payment methods'), ('receipts', 'Receipts & stock'), ('messages', 'Messages & recovery'),
    ('alerts', 'Alerts & storage'), ('online', 'Online & Mobile Money'), ('backup', 'Data & backup'),
  ];

  void _set(String k, Object? v) => setState(() {
        _s[k] = v;
        _dirty.add(k);
      });

  Object? _num(String k) {
    final v = _s[k];
    if (v is num) return v;
    final t = '${v ?? ''}'.trim();
    final n = num.tryParse(t);
    return t.isEmpty ? (_numbers[k] ?? 0) : (n ?? 0);
  }

  Future<void> _save() async {
    final store = ref.read(recordStoreProvider);
    final me = await ref.read(sessionControllerProvider.future);
    try {
      if (_tab == 'general') {
        final shared = await store.settingsRecord();
        final existing = readOverrides(await ref.read(deviceValueProvider(overridesKey).future));
        final current = {...shared, ...existing};
        final next = validatePharmacyDefaults({
          ...current,
          for (final k in _dirty.where(pharmacyFields.contains)) k: _numbers.containsKey(k) ? _num(k) : _s[k],
        });
        final over = editOverrides(shared, current, next, existing);
        await ref.read(deviceValueProvider(overridesKey).notifier).set(over.isEmpty ? null : jsonEncode(over));
        _dirty.removeWhere(pharmacyFields.contains);
        if (mounted) say(context, 'Saved on this device only.');
        return;
      }
      final patch = <String, Object?>{
        for (final k in _dirty.where((k) => !pharmacyFields.contains(k))) k: _numbers.containsKey(k) ? _num(k) : _s[k],
        if (_tab == 'payments' && _methods != null) 'paymentMethods': _methods,
      };
      if (_methods != null && _methods!.any((m) => '${m['name']}'.trim().isEmpty)) throw const FormatException('Give every payment method a name');
      if (patch.isEmpty) {
        if (mounted) say(context, 'Nothing changed');
        return;
      }
      await store.update((d) async {
        d.saveSettings({...await store.settingsRecord(), ...patch});
        d.audit(me?.userName ?? '', 'Settings changed', _tab);
      });
      _dirty.removeWhere((k) => !pharmacyFields.contains(k));
      if (mounted) say(context, 'Settings saved. Shared preferences sync to other devices.');
    } on FormatException catch (e) {
      if (mounted) say(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final shared = ref.watch(settingsProvider).value;
    final overStored = ref.watch(deviceValueProvider(overridesKey));
    final d = ref.watch(pharmacyProvider).value;
    if (shared == null || d == null || overStored.isLoading) return const Center(child: CircularProgressIndicator());
    final over = readOverrides(overStored.value);
    final merged = {...shared.raw, ...over};
    for (final e in merged.entries) {
      if (!_dirty.contains(e.key)) _s[e.key] = e.value;
    }
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    return PageFrame(
      title: 'Settings',
      subtitle: d.settings.name,
      scroll: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: SegmentedButton<String>(
            showSelectedIcon: false,
            segments: [for (final (k, l) in _tabs) ButtonSegment(value: k, label: Text(l))],
            selected: {_tab},
            onSelectionChanged: (v) => setState(() => _tab = v.first),
          ),
        ),
        const SizedBox(height: 12),
        ...switch (_tab) {
          'general' => _general(shared.raw, over, d),
          'payments' => _payments(shared.raw),
          'receipts' => _receipts(),
          'messages' => _messages(),
          'alerts' => _alerts(d.features, can),
          'online' => _online(),
          _ => _backup(can, shared.raw),
        },
      ]),
    );
  }

  Widget _card(String title, IconData icon, List<Widget> children, {bool save = true}) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [Icon(icon, size: 18), const SizedBox(width: 8), Expanded(child: Text(title, style: Theme.of(context).textTheme.titleMedium))]),
            const SizedBox(height: 8),
            ...children,
            if (save) Align(alignment: Alignment.centerRight, child: Padding(padding: const EdgeInsets.only(top: 12), child: FilledButton(onPressed: _save, child: const Text('Save')))),
          ]),
        ),
      );

  Widget _grid(List<Widget> fields) => LayoutBuilder(
        builder: (_, c) {
          final w = c.maxWidth >= 720 ? (c.maxWidth - 12) / 2 : c.maxWidth;
          return Wrap(spacing: 12, runSpacing: 10, children: [for (final f in fields) SizedBox(width: w, child: f)]);
        },
      );

  Widget _field(String k, String label, {bool number = false, String? hint, int lines = 1}) => TextFormField(
        key: ValueKey('set-$k-$_gen-$_tab'),
        initialValue: _s[k] == null ? '' : '${_s[k] is double && (_s[k] as double) == (_s[k] as double).roundToDouble() ? (_s[k] as double).toInt() : _s[k]}',
        keyboardType: number ? const TextInputType.numberWithOptions(decimal: true) : null,
        minLines: lines,
        maxLines: lines,
        decoration: InputDecoration(labelText: label, hintText: hint, border: const OutlineInputBorder(), isDense: true),
        onChanged: (v) => _set(k, v),
      );

  Widget _choice<T>(String k, String label, T value, List<(T, String)> options) => DropdownButtonFormField<T>(
        key: ValueKey('set-$k-$_gen'),
        initialValue: options.any((o) => o.$1 == value) ? value : options.first.$1,
        isExpanded: true,
        decoration: InputDecoration(labelText: label, border: const OutlineInputBorder(), isDense: true),
        items: [for (final (v, t) in options) DropdownMenuItem(value: v, child: Text(t, overflow: TextOverflow.ellipsis))],
        onChanged: (v) => _set(k, v),
      );

  Widget _check(String k, String label, {bool onByDefault = true}) => CheckboxListTile(
        contentPadding: EdgeInsets.zero,
        controlAffinity: ListTileControlAffinity.leading,
        title: Text(label),
        value: onByDefault ? _s[k] != false : _s[k] == true,
        onChanged: (v) => _set(k, v == true),
      );

  Text _muted(String t) => Text(t, style: Theme.of(context).textTheme.bodySmall);

  // ---------------------------------------------------------------- tabs

  List<Widget> _general(Map<String, Object?> shared, Map<String, Object?> over, PharmacyData d) {
    final banks = ref.watch(tableProvider('banks')).value ?? const [];
    final branches = ref.watch(tableProvider('branches')).value ?? const [];
    return [
      _card('Pharmacy details · this device', Icons.store_outlined, save: false, [
        _muted('Owner sets the shared defaults for every device. Edits here override them only on this device until you reset them.'),
        _muted('${over.length} local override(s) · Owner pharmacy name: ${shared['name'] ?? 'My Pharmacy'}'),
        const SizedBox(height: 10),
        _grid([
          for (final (k, label, number, _) in pharmacyFieldSpecs.where((f) => f.$1 != 'priceRound' && f.$1 != 'nonCashBankId')) _field(k, label, number: number),
          _choice<num>('priceRound', 'Round worked-out prices', num.tryParse('${_s['priceRound'] ?? 0}') ?? 0, [(0, 'To the nearest unit'), for (final n in [10, 50, 100, 500]) (n, 'Up to the next $n')]),
          if (banks.isNotEmpty)
            _choice<String>('nonCashBankId', 'Non-cash sales go to', '${_s['nonCashBankId'] ?? 'cash-drawer'}', [for (final b in banks) ('${b['id']}', '${b['name']}')]),
          if (branches.length > 1 && d.features['branches'] != false)
            DropdownButtonFormField<String>(
              initialValue: branches.any((b) => b['id'] == d.branch) ? d.branch : null,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'This device works as branch', border: OutlineInputBorder(), isDense: true),
              items: [for (final b in branches) DropdownMenuItem(value: '${b['id']}', child: Text('${b['name']}'))],
              onChanged: (v) async {
                await ref.read(deviceBranchProvider.notifier).set(v!);
                if (mounted) say(context, 'Branch changed for this device');
              },
            ),
        ]),
        const SizedBox(height: 8),
        _muted('Branches, features and administrator accounts are managed by your RxPOS provider.'),
        const SizedBox(height: 12),
        Wrap(alignment: WrapAlignment.end, spacing: 8, children: [
          OutlinedButton.icon(
            onPressed: over.isEmpty
                ? null
                : () async {
                    await ref.read(deviceValueProvider(overridesKey).notifier).set(null);
                    setState(() {
                      _dirty.removeWhere(pharmacyFields.contains);
                      _gen++;
                    });
                    if (mounted) say(context, 'Owner defaults restored on this device.');
                  },
            icon: const Icon(Icons.restore),
            label: const Text('Use Owner defaults'),
          ),
          FilledButton(onPressed: _save, child: const Text('Save for this device')),
        ]),
      ]),
    ];
  }

  List<Widget> _payments(Map<String, Object?> shared) {
    final stored = (shared['paymentMethods'] as List?)?.cast<Map>() ?? const [];
    _methods ??= [for (final m in stored.isNotEmpty ? stored : (defaultSettings()['paymentMethods']! as List).cast<Map>()) m.cast<String, Object?>()];
    final methods = _methods!;
    void change(List<Map<String, Object?>> next) => setState(() {
          _methods = next;
          _dirty.add('paymentMethods');
        });
    return [
      _card('Payment methods at the POS', Icons.credit_card, [
        _muted('Add or remove ways customers can pay. The type decides how RxPOS treats it: Cash asks for the amount tendered and gives change; '
            'Mobile Money can send a payment request to the customer\'s phone; Credit puts the balance on the customer\'s account; Other just records it.'),
        const SizedBox(height: 8),
        for (var i = 0; i < methods.length; i++)
          Padding(
            key: ValueKey('pm-${methods[i]['id']}-$_gen'),
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(children: [
              Expanded(
                flex: 3,
                child: TextFormField(
                  initialValue: '${methods[i]['name'] ?? ''}',
                  decoration: const InputDecoration(labelText: 'Name shown on the POS & receipt', border: OutlineInputBorder(), isDense: true),
                  onChanged: (v) => change([for (var j = 0; j < methods.length; j++) j == i ? {...methods[j], 'name': v} : methods[j]]),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 2,
                child: DropdownButtonFormField<String>(
                  initialValue: '${methods[i]['type'] ?? 'other'}',
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Type', border: OutlineInputBorder(), isDense: true),
                  items: const [
                    DropdownMenuItem(value: 'cash', child: Text('Cash')),
                    DropdownMenuItem(value: 'momo', child: Text('Mobile Money')),
                    DropdownMenuItem(value: 'credit', child: Text('Credit (pay later)')),
                    DropdownMenuItem(value: 'other', child: Text('Other (card, bank, insurance…)', overflow: TextOverflow.ellipsis)),
                  ],
                  onChanged: (v) => change([for (var j = 0; j < methods.length; j++) j == i ? {...methods[j], 'type': v} : methods[j]]),
                ),
              ),
              IconButton(
                tooltip: 'Move up',
                onPressed: i == 0 ? null : () => change([...methods]..insert(i - 1, methods[i])..removeAt(i + 1)),
                icon: const Icon(Icons.arrow_upward),
              ),
              IconButton(
                tooltip: 'Delete',
                onPressed: methods.length <= 1 ? null : () => change([...methods]..removeAt(i)),
                icon: const Icon(Icons.delete_outline),
              ),
            ]),
          ),
        Wrap(spacing: 8, children: [
          OutlinedButton.icon(onPressed: () => change([...methods, {'id': uid(), 'name': '', 'type': 'other'}]), icon: const Icon(Icons.add), label: const Text('Add payment method')),
          OutlinedButton.icon(
            onPressed: () {
              change([for (final m in (defaultSettings()['paymentMethods']! as List).cast<Map>()) m.cast<String, Object?>()]);
              setState(() => _gen++);
            },
            icon: const Icon(Icons.restore),
            label: const Text('Defaults'),
          ),
        ]),
      ]),
    ];
  }

  List<Widget> _receipts() => [
        _card('Receipts, expiry & reordering', Icons.print_outlined, [
          _grid([
            _choice<num>('paperWidth', 'Receipt printer paper', num.tryParse('${_s['paperWidth'] ?? 80}') ?? 80, [(80, '80 mm thermal'), (58, '58 mm thermal'), (210, 'A4 / normal printer')]),
            _field('receiptFooter', 'Receipt footer message'),
            _choice<String>('receiveUnit', 'Add Stock receives medicines with packs in', '${_s['receiveUnit'] ?? 'pack'}', [('pack', 'Packs (the largest pack, e.g. boxes)'), ('unit', 'Single units')]),
            _choice<String>('sellUnitRetail', 'Retail till sells in', '${_s['sellUnitRetail'] ?? 'unit'}', [('unit', 'Single units (tablets, bottles…)'), ('pack', 'Packs')]),
            _choice<String>('sellUnitWholesale', 'Wholesale till sells in', '${_s['sellUnitWholesale'] ?? 'pack'}', [('pack', 'Packs (the largest pack)'), ('unit', 'Single units')]),
            _field('expiryWarnDays', 'Warn about expiry (days before)', number: true),
            _field('leadDays', 'Supplier lead time (days)', number: true),
            _field('coverDays', 'Reorder enough stock for (days)', number: true),
            _field('deadDays', 'Dead stock after no sales for (days)', number: true),
            _field('autoReorderDays', 'Use sales from the last (days)', number: true, hint: '30'),
            _field('safetyDays', 'Safety stock (extra days of sales)', number: true, hint: '7'),
          ]),
          _check('autoPrint', 'Print the receipt automatically after each sale', onByDefault: false),
          _check('blindCashUp', 'Blind cash-up: staff count the cash before they see what the drawer should hold', onByDefault: false),
          _check('autoReorder', 'Set reorder levels automatically every week from sales'),
          _muted("Stock is always counted in single units. A medicine's packs are set in Medicine List → Packs; each line in Add Stock or at the till can still be switched between packs and units."),
          const SizedBox(height: 6),
          _muted('Tip: in the print dialog choose your thermal printer, set margins to “None” and scale to 100%.'),
        ]),
      ];

  List<Widget> _messages() => [
        _card('Reminder messages (WhatsApp & SMS)', Icons.sms_outlined, [
          _muted('Placeholders: {name} {pharmacy} {medicine} {date} {amount}. Keep SMS under 160 characters to pay for one message.'),
          const SizedBox(height: 8),
          _field('smsRefill', 'Refill reminder', lines: 3),
          _muted('${'${_s['smsRefill'] ?? ''}'.length} characters'),
          const SizedBox(height: 8),
          _field('smsDebt', 'Payment reminder', lines: 3),
          _muted('${'${_s['smsDebt'] ?? ''}'.length} characters'),
          const SizedBox(height: 16),
          Text('Password recovery & client details', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          _grid([
            _field('adminWhatsApp', "Administrator's WhatsApp (staff who forget their password message this number)", hint: '07XX XXX XXX'),
            _choice<String>('clientCapture', 'Client details at the POS', '${_s['clientCapture'] ?? 'optional'}', [
              ('off', 'Off: walk-in sales only'), ('optional', 'Optional: cashier may add/choose a client'), ('required', 'Required: every sale needs a client'),
            ]),
          ]),
        ]),
      ];

  Future<void> _summary(bool send) async {
    setState(() => _busy = send ? 'send' : 'preview');
    try {
      final api = ref.read(cloudApiProvider);
      final r = send ? await api.post('/api/summary', const {}) : await api.get('/api/summary');
      setState(() => _preview = '${r['text'] ?? ''}');
      if (send && mounted) {
        final n = (r['sent'] as num?)?.toInt() ?? 0;
        say(context, n > 0 ? 'Summary emailed to $n address${n > 1 ? 'es' : ''}' : '${r['error'] ?? 'Add an email address first, then save'}');
      }
    } catch (e) {
      if (mounted) say(context, '$e'.replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _findPlace() async {
    if (_placeQ.trim().isEmpty) return;
    try {
      final r = await Dio().get<Map<String, Object?>>('https://geocoding-api.open-meteo.com/v1/search',
          queryParameters: {'count': 6, 'language': 'en', 'format': 'json', 'name': _placeQ.trim()});
      setState(() => _places = [
            for (final x in ((r.data?['results'] as List?) ?? const []).cast<Map>())
              {'name': [x['name'], x['admin1'], x['country']].where((v) => v != null && '$v'.isNotEmpty).join(', '), 'lat': x['latitude'], 'lon': x['longitude']},
          ]);
    } catch (_) {
      if (mounted) say(context, 'Could not search places. Check the internet.');
    }
  }

  List<Widget> _alerts(Map<String, bool> features, Set<String> can) {
    final lim = storageLimitsOf(_s);
    final place = (_s['weatherPlace'] as Map?) ?? defaultPlace;
    return [
      if (can.contains('reports')) ...[
        _card('Daily summary for the owner', Icons.summarize_outlined, [
          _muted("Every evening at 9 pm: the day's sales and how they were paid, profit, expenses, refunds, each branch, best sellers, and stock expiring or running low."),
          const SizedBox(height: 8),
          _field('summaryEmails', 'Email it to (up to 5 addresses, separated by commas)', hint: 'owner@example.com'),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            OutlinedButton(onPressed: _busy != null ? null : () => _summary(false), child: Text(_busy == 'preview' ? 'Loading…' : "Preview today's summary")),
            OutlinedButton(onPressed: _busy != null ? null : () => _summary(true), child: Text(_busy == 'send' ? 'Sending…' : 'Email it now')),
            if (_preview != null)
              OutlinedButton(
                onPressed: () => launchUrl(Uri.parse('https://wa.me/?text=${Uri.encodeComponent(_preview!)}'), mode: LaunchMode.externalApplication),
                child: const Text('Share on WhatsApp'),
              ),
          ]),
          if (_preview != null) Padding(padding: const EdgeInsets.only(top: 8), child: SelectableText(_preview!, style: const TextStyle(fontFamily: 'monospace'))),
        ]),
        const SizedBox(height: 12),
      ],
      const ReportSchedulesCard(),
      const SizedBox(height: 12),
      _card('Idle promotions & reminders', Icons.notifications_active_outlined, [
        if (features['promos'] != false) _field('idleMinutes', 'Show product promotions after the app is idle for (minutes, 0 = never)', number: true),
        if (features['hourly'] != false) ...[
          _check('hourlyChime', "Hourly time reminder with today's to-dos"),
          _check('hourlySound', 'Play a soft chime'),
          _check('dailyGreetings', 'Daily greeting, health tip and WHO health alerts to the team at 8 am, 2 pm and 4 pm (with one-tap sharing to clients on WhatsApp)'),
          _grid([_field('quietFrom', 'Quiet from (hour, 0-23)', number: true), _field('quietTo', 'Quiet until (hour, 0-23)', number: true)]),
        ],
        const SizedBox(height: 8),
        _muted('Pop-ups with a sound appear for short-expiry and low stock, slow movers, hot weather (from ${lim['hotAlert']}°C), rain forecasts and new messages.'),
        if (features['weather'] != false) ...[
          const SizedBox(height: 16),
          Text('Weather location', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          _choice<String>('weatherMode', 'Weather location', '${_s['weatherMode'] ?? 'device'}', [('device', 'Where each device is (its internet connection)'), ('fixed', 'A fixed town (choose below)')]),
          if (_s['weatherMode'] == 'fixed') ...[
            const SizedBox(height: 6),
            _muted('Town: ${place['name']}. Weather from Open-Meteo (free, no account).'),
            Row(children: [
              Expanded(
                child: TextField(
                  decoration: const InputDecoration(hintText: 'Search your town, e.g. Mbarara', isDense: true),
                  onChanged: (v) => _placeQ = v,
                  onSubmitted: (_) => _findPlace(),
                ),
              ),
              TextButton.icon(onPressed: _findPlace, icon: const Icon(Icons.search), label: const Text('Find')),
            ]),
            if (_places != null)
              Wrap(spacing: 6, children: [
                for (final p in _places!)
                  ActionChip(
                    label: Text('${p['name']}'),
                    onPressed: () {
                      _set('weatherPlace', p);
                      setState(() => _places = null);
                    },
                  ),
                if (_places!.isEmpty) _muted('No place found'),
              ]),
          ],
          const SizedBox(height: 16),
          Text('Storage limits', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          _grid([
            for (final (k, l) in const [
              ('roomMin', 'Room: lowest (°C)'), ('roomMax', 'Room: highest (°C)'), ('fridgeMin', 'Fridge: lowest (°C)'), ('fridgeMax', 'Fridge: highest (°C)'),
              ('hotAlert', 'Hot-weather alert from (°C)'), ('humidityMax', 'Humidity: highest (%)'),
            ])
              _field(k, l, number: true, hint: '${lim[k]}'),
          ]),
        ],
      ]),
    ];
  }

  List<Widget> _online() {
    final sync = ref.watch(syncControllerProvider);
    final me = ref.watch(sessionControllerProvider).value;
    final cfg = ref.watch(_cloudConfigProvider);
    Widget status(bool ok, String t) => Row(children: [Icon(ok ? Icons.check_circle : Icons.cancel, size: 16, color: ok ? Colors.green : Colors.grey), const SizedBox(width: 6), Expanded(child: Text(t))]);
    return [
      _card('Online sync', Icons.cloud_outlined, save: false, [
        const Text("RxPOS works offline on this device and syncs automatically: your changes go up within seconds, and other devices' changes come down while the app is open."),
        const SizedBox(height: 8),
        Text('Pharmacy: ${me?.pharmacy.isNotEmpty == true ? me!.pharmacy : _s['name'] ?? ''}'),
        Text('Signed in as ${me?.email ?? ''}'),
        Text('Status: ${sync.label}${sync.lastSync == null ? '' : ' · last sync ${sync.lastSync!.replaceFirst('T', ' ').split('.').first}'}'),
        if (sync.error != null) Text(sync.error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        Align(alignment: Alignment.centerRight, child: FilledButton(onPressed: () => ref.read(syncControllerProvider.notifier).runNow(), child: const Text('Sync now'))),
      ]),
      const SizedBox(height: 12),
      _card('Mobile Money & SMS', Icons.phone_android, save: false, [
        cfg.when(
          loading: () => const Text('Checking…'),
          error: (e, _) => Text('$e'.replaceFirst('Exception: ', ''), style: TextStyle(color: Theme.of(context).colorScheme.error)),
          data: (c) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            status(c['mtn'] == true, 'MTN MoMo ${c['mtn'] == true ? 'connected (${c['mtnEnv'] ?? ''})' : '– not set up'}'),
            status(c['airtel'] == true, 'Airtel Money ${c['airtel'] == true ? 'connected (${c['airtelEnv'] ?? ''})' : '– not set up'}'),
            status(c['sms'] == true, 'SMS (Africa’s Talking) ${c['sms'] == true ? 'connected' : '– not set up'}'),
          ]),
        ),
        const SizedBox(height: 8),
        _muted('Merchant keys are added by your RxPOS provider. Until then, the POS can still record Mobile Money payments with the transaction ID, and reminders go out by WhatsApp.'),
      ]),
    ];
  }

  Future<void> _downloadBackup(Map<String, Object?> shared) async {
    final store = ref.read(recordStoreProvider);
    final out = <String, Object?>{for (final t in syncedTables) t: await store.rows(t), 'settings': shared};
    final day = DateTime.now().toIso8601String().substring(0, 10);
    final f = await saveDownload('rxpos-backup-$day.json', utf8.encode(jsonEncode(out)));
    if (mounted) say(context, 'Backup saved: ${f.path}');
  }

  List<Widget> _backup(Set<String> can, Map<String, Object?> shared) => [
        _card('Backup', Icons.backup_outlined, save: false, [
          const Text('All data is kept on this device and in the RxPOS cloud. You can also download a copy to keep on a USB stick or Google Drive.'),
          const SizedBox(height: 8),
          Align(alignment: Alignment.centerLeft, child: FilledButton(onPressed: () => _downloadBackup(shared), child: const Text('Download a backup'))),
        ]),
        if (can.contains('settings.manage')) ...[const SizedBox(height: 12), const _DailyStockSheet()],
        if (can.contains('data.reset')) ...[
          const SizedBox(height: 12),
          _card('Restore default settings', Icons.gpp_maybe_outlined, save: false, [
            _muted('Receipt, stock, message, alert and payment-method settings go back to factory defaults. Pharmacy name, address, phone, TIN and licence are kept. '
                "To erase or restore a pharmacy's data, contact your RxPOS provider."),
            Align(
              alignment: Alignment.centerRight,
              child: OutlinedButton.icon(
                onPressed: () async {
                  if (!await confirmAction(context, 'Restore default settings?', 'All settings except your pharmacy details go back to factory defaults on every device.', 'Restore defaults')) return;
                  final store = ref.read(recordStoreProvider);
                  final me = await ref.read(sessionControllerProvider.future);
                  final next = restoredSettings(await store.settingsRecord());
                  await store.update((d) {
                    d.saveSettings(next);
                    d.audit(me?.userName ?? '', 'Settings restored to defaults', '');
                  });
                  setState(() {
                    _dirty.clear();
                    _s.clear();
                    _methods = null;
                    _gen++;
                  });
                  if (mounted) say(context, 'Default settings restored');
                },
                icon: const Icon(Icons.restore),
                label: const Text('Restore defaults'),
              ),
            ),
          ]),
        ],
      ];
}

final _cloudConfigProvider = FutureProvider.autoDispose<Map<String, Object?>>((ref) => ref.watch(cloudApiProvider).config());

/// The private link a Google Sheet reads every day's stock figures from (worker/dailystock.js).
class _DailyStockSheet extends ConsumerStatefulWidget {
  const _DailyStockSheet();
  @override
  ConsumerState<_DailyStockSheet> createState() => _DailyStockSheetState();
}

class _DailyStockSheetState extends ConsumerState<_DailyStockSheet> {
  String? _link;
  bool _loading = true, _busy = false;

  @override
  void initState() {
    super.initState();
    ref.read(cloudApiProvider).get('/api/daily-stock-link').then((r) {
      if (mounted) {
        setState(() {
          _link = '${r['url'] ?? ''}'.isEmpty ? null : '${r['url']}';
          _loading = false;
        });
      }
    }).catchError((Object _) {
      if (mounted) setState(() => _loading = false);
    });
  }

  Future<void> _renew() async {
    if (_link != null && !await confirmAction(context, 'Make a new link?', 'The old link stops working at once: paste the new formula into your sheet.', 'Make a new link')) return;
    setState(() => _busy = true);
    try {
      final r = await ref.read(cloudApiProvider).post('/api/daily-stock-link', const {});
      setState(() => _link = '${r['url'] ?? ''}');
    } catch (e) {
      if (mounted) say(context, '$e'.replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final formula = _link == null ? '' : '=IMPORTDATA("$_link")';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [const Icon(Icons.table_chart_outlined, size: 18), const SizedBox(width: 8), Expanded(child: Text('Daily stock sheet (Google Sheets)', style: Theme.of(context).textTheme.titleMedium))]),
          const SizedBox(height: 8),
          Text("Every day's sales, opening and closing stock value, purchases (stock added at cost), cost of stock sold, profit and expenses, worked out by the cloud from all "
              'your devices. Paste the formula into an empty tab of your Google Sheet: it refreshes by itself. Anyone who can open the sheet can read these daily totals (nothing else).',
              style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 8),
          if (_loading)
            const Text('Loading…')
          else if (_link != null) ...[
            SelectableText(formula, style: const TextStyle(fontFamily: 'monospace')),
            const SizedBox(height: 8),
            Wrap(spacing: 8, children: [
              FilledButton.icon(
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: formula));
                  if (context.mounted) say(context, 'Formula copied');
                },
                icon: const Icon(Icons.copy),
                label: const Text('Copy formula'),
              ),
              OutlinedButton.icon(onPressed: _busy ? null : _renew, icon: const Icon(Icons.refresh), label: const Text('Make a new link')),
            ]),
          ] else
            FilledButton.icon(onPressed: _busy ? null : _renew, icon: const Icon(Icons.table_chart_outlined), label: const Text('Create the link')),
        ]),
      ),
    );
  }
}
