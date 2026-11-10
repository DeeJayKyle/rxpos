
import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:rxpos/core/platform.dart';

import '../../../core/live/live_connection.dart';
import '../../../core/notify/os_notifications.dart';
import '../../../core/data/device_settings.dart';
import '../../../core/data/pharmacy_providers.dart';
import '../../../core/database/app_database.dart';
import '../../../core/network/files.dart';
import '../../../core/presentation/export.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/sound/sounds.dart';
import '../../stock/domain/stock_form.dart' show dateFormats;
import '../../../core/sync/sync_config.dart';
import '../../../core/theme/theme_choice.dart';
import '../../sync_status/application/sync_controller.dart';
import '../../../core/update/app_updates.dart';
import 'font_picker.dart';
import 'keyboard_settings.dart';

/// This device (src/pages/Device.jsx): its branch and look, sync & storage (waiting changes, refused changes, ready to
/// work offline, download everything again), text size and rotation, the date format, and notification sounds.
class DeviceScreen extends ConsumerStatefulWidget {
  const DeviceScreen({super.key});
  @override
  ConsumerState<DeviceScreen> createState() => _DeviceScreenState();
}

class _DeviceScreenState extends ConsumerState<DeviceScreen> {
  int _tick = 0;
  bool _busy = false;

  Widget _section(String title, IconData icon, List<Widget> children) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [Icon(icon, size: 18), const SizedBox(width: 8), Expanded(child: Text(title, style: Theme.of(context).textTheme.titleMedium))]),
            const SizedBox(height: 8),
            ...children,
          ]),
        ),
      );

  Widget _choice(String value, List<(String, String)> options, ValueChanged<String> onChanged) => SegmentedButton<String>(
        showSelectedIcon: false,
        segments: [for (final (v, l) in options) ButtonSegment(value: v, label: Text(l))],
        selected: {options.any((o) => o.$1 == value) ? value : options.first.$1},
        onSelectionChanged: (v) => onChanged(v.first),
      );

  @override
  Widget build(BuildContext context) {
    final branches = ref.watch(tableProvider('branches')).value ?? const [];
    final branch = ref.watch(deviceBranchProvider).value;
    final premium = ref.watch(premiumUiProvider).value ?? false;
    final zoom = double.tryParse(ref.watch(deviceValueProvider(zoomKey)).value ?? '') ?? 1;
    final rotation = ref.watch(deviceValueProvider(rotationKey)).value ?? 'auto';
    final dateFormat = ref.watch(deviceValueProvider('dateFormat')).value ?? 'dmy';
    final sounds = SoundPrefs.parse(ref.watch(deviceValueProvider(soundPrefsKey)).value);
    final sync = ref.watch(syncControllerProvider);
    final db = ref.watch(appDatabaseProvider);
    final products = ref.watch(tableProvider('products')).value?.length ?? 0;
    Future<void> setSounds(SoundPrefs p) => ref.read(deviceValueProvider(soundPrefsKey).notifier).set(p.encode());
    final wide = MediaQuery.sizeOf(context).width >= 900;
    final cards = <Widget>[
      _section('This device', Icons.devices_outlined, [
        DropdownButtonFormField<String>(
          initialValue: branches.any((b) => b['id'] == branch) ? branch : null,
          decoration: const InputDecoration(labelText: 'Branch this device works as'),
          items: [for (final b in branches) DropdownMenuItem(value: '${b['id']}', child: Text('${b['name']}'))],
          onChanged: (v) => ref.read(deviceBranchProvider.notifier).set(v!),
        ),
        SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Premium UI (Midnight Pro)'), value: premium, onChanged: (v) => ref.read(premiumUiProvider.notifier).set(v)),
      ]),
      _section('Sync & storage', Icons.storage_outlined, [
        const Text('This app keeps the pharmacy on this device and works without internet; changes go to the cloud when it is reachable.'),
        const SizedBox(height: 8),
        FutureBuilder(
          key: ValueKey('facts-$_tick-${sync.pending}-${sync.lastSync}'),
          future: Future.wait([db.select(db.outbox).get(), db.select(db.rejectedOps).get(), SyncConfig.load(db)]),
          builder: (_, snap) {
            final d = snap.data;
            if (d == null) return const SizedBox.shrink();
            final pending = (d[0] as List).length;
            final rejected = (d[1] as List<RejectedRow>);
            final cfg = d[2] as SyncConfig;
            final data = cfg.lastSync != null && products > 0;
            return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('$pending change${pending == 1 ? '' : 's'} waiting for the cloud${cfg.lastSync == null ? '' : ' · last synced ${cfg.lastSync!.replaceFirst('T', ' ').split('.').first}'}'),
              Text('Device id: ${cfg.deviceId}', style: Theme.of(context).textTheme.bodySmall),
              if (rejected.isNotEmpty)
                Card(
                  color: Theme.of(context).colorScheme.errorContainer,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('${rejected.length} change${rejected.length == 1 ? ' was' : 's were'} refused by the cloud', style: const TextStyle(fontWeight: FontWeight.w700)),
                      const Text("They are kept here so nothing disappears silently. Usually the person who made them didn't have permission (ask an administrator to make the change), or the record was too large."),
                      for (final r in rejected.reversed.take(8)) Text('${r.t} · ${r.id} · ${r.at.replaceFirst('T', ' ').split('.').first} — ${r.reason ?? ''}', style: Theme.of(context).textTheme.bodySmall),
                      TextButton(
                        onPressed: () async {
                          if (!await confirmAction(context, 'Clear the refused changes?', 'Only clear them once someone has made them again with the right permission. They are not sent anywhere.', 'Clear')) return;
                          await db.delete(db.rejectedOps).go();
                          setState(() => _tick++);
                        },
                        child: const Text('Reviewed: clear the list'),
                      ),
                    ]),
                  ),
                ),
              const SizedBox(height: 8),
              Row(children: [
                Icon(data ? Icons.check_circle : Icons.warning_amber, size: 16, color: data ? Colors.green : Colors.orange),
                const SizedBox(width: 6),
                Expanded(child: Text(data ? 'Ready to work offline' : 'Not ready to work offline yet', style: const TextStyle(fontWeight: FontWeight.w700))),
              ]),
              Text(data ? 'Pharmacy downloaded ($products medicines)' : 'Downloading the pharmacy… keep the internet on'),
              const Text('You stay signed in on this device, so it opens without the internet.'),
              const SizedBox(height: 4),
              Text("Without internet, sales, stock, prescriptions and reports keep working. Mobile Money requests, SMS, AI prescription reading, drug information look-ups and Google sign-in need the internet; a Mobile Money payment can still be recorded with the customer's transaction ID.",
                  style: Theme.of(context).textTheme.bodySmall),
            ]);
          },
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: _busy
              ? null
              : () async {
                  if (!await confirmAction(context, 'Download everything again?',
                      'This device downloads the whole pharmacy from the cloud again and adds anything it is missing. Nothing is deleted and unsent sales are sent first. It can take a few minutes and uses about as much data as the first download, so use Wi-Fi on a phone.',
                      'Download everything')) {
                    return;
                  }
                  setState(() => _busy = true);
                  final r = await ref.read(syncControllerProvider.notifier).downloadEverything();
                  if (!mounted) return;
                  setState(() => _busy = false);
                  say(this.context, r.error ?? 'Done: everything checked against the cloud');
                },
          icon: const Icon(Icons.cloud_download_outlined),
          label: const Text('Download everything again'),
        ),
      ]),
      _section('Screen', Icons.screenshot_monitor, [
        Text('Text and button size · ${(zoom * 100).round()}%'),
        Slider(
          key: const Key('zoom'),
          min: 0.8,
          max: 1.6,
          divisions: 16,
          value: zoom.clamp(0.8, 1.6),
          onChanged: (v) => ref.read(deviceValueProvider(zoomKey).notifier).set(v.toStringAsFixed(2)),
        ),
        if (zoom != 1) TextButton(onPressed: () => ref.read(deviceValueProvider(zoomKey).notifier).set(null), child: const Text('Back to 100%')),
        if (onAndroid) ...[
          const SizedBox(height: 8),
          const Text('Rotation'),
          const SizedBox(height: 4),
          _choice(rotation, const [('auto', 'Turns with the phone'), ('portrait', 'Stay upright'), ('landscape', 'Stay sideways')], (v) => ref.read(deviceValueProvider(rotationKey).notifier).set(v)),
        ],
      ]),
      const FontsCard(),
      _section('Dates', Icons.calendar_month_outlined, [
        Text('How dates are typed and shown in Add Stock and when correcting deliveries on this device. An expiry can also be typed as month and year (06/2028 = 30 June 2028).',
            style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 8),
        _choice(dateFormat, dateFormats, (v) => ref.read(deviceValueProvider('dateFormat').notifier).set(v)),
      ]),
      _section('Notification sounds', Icons.volume_up_outlined, [
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          title: const Text('Play sounds on this device'),
          value: sounds.on,
          onChanged: (v) => setSounds(sounds.copyWith(on: v)),
        ),
        Text('Volume · ${(sounds.volume * 100).round()}%'),
        Slider(
          min: 0,
          max: 1,
          divisions: 20,
          value: sounds.volume,
          onChanged: sounds.on ? (v) => setSounds(sounds.copyWith(volume: v)) : null,
          onChangeEnd: (_) => ref.read(soundsProvider).play('message'),
        ),
        for (final (kind, label, _) in soundKinds)
          Row(children: [
            Expanded(child: Text('$label${sounds.toneFor(kind) == 'custom' ? ' · ${sounds.names[kind] ?? 'your file'}' : ''}')),
            DropdownButton<String>(
              key: Key('sound-$kind'),
              value: sounds.toneFor(kind),
              onChanged: !sounds.on
                  ? null
                  : (tone) async {
                      if (tone == null) return;
                      if (tone == 'custom' && onWeb) {
                        if (context.mounted) say(context, 'Your own sound files work in the installed app; in the browser, choose one of the tones');
                        return;
                      }
                      if (tone == 'custom') {
                        final fs = await pickFiles(extensions: const ['mp3', 'wav', 'ogg', 'm4a'], multiple: false);
                        if (fs.isEmpty) return;
                        if (fs.first.bytes.length > 1500000) {
                          if (context.mounted) say(context, 'Choose a sound under 1.5 MB (a short clip works best)');
                          return;
                        }
                        await (await Sounds.customFile(kind)).writeAsBytes(fs.first.bytes, flush: true);
                        await setSounds(sounds.copyWith(tones: {...sounds.tones, kind: 'custom'}, names: {...sounds.names, kind: fs.first.name}));
                        await ref.read(soundsProvider).play(kind, tone: 'custom');
                        if (context.mounted) say(context, '"${fs.first.name}" will play for ${label.toLowerCase()}');
                        return;
                      }
                      await setSounds(sounds.copyWith(tones: {...sounds.tones, kind: tone}));
                      if (tone != 'off') await ref.read(soundsProvider).play(kind, tone: tone);
                    },
              items: [
                for (final e in tones.entries.where((e) => e.key != 'ringback')) DropdownMenuItem(value: e.key, child: Text(e.value.$1)),
                DropdownMenuItem(value: 'custom', child: Text(sounds.toneFor(kind) == 'custom' ? 'My file (change…)' : 'My own file…')),
                const DropdownMenuItem(value: 'off', child: Text('Silent')),
              ],
            ),
            IconButton(
              tooltip: 'Play it',
              onPressed: !sounds.on || sounds.toneFor(kind) == 'off' ? null : () => ref.read(soundsProvider).play(kind, tone: sounds.toneFor(kind)),
              icon: const Icon(Icons.play_arrow),
            ),
          ]),
        Text('Your own sound can be any short MP3, WAV, OGG or M4A file under 1.5 MB.', style: Theme.of(context).textTheme.bodySmall),
      ]),
      _section('When RxPOS is in the background', Icons.notifications_active_outlined, [
        Text(onAndroid
            ? 'New messages, calls and stock alerts pop up in the phone’s notification shade, with the unread count on the app icon.'
            : 'New messages, calls and stock alerts pop up in the corner of the screen.'),
        const SizedBox(height: 8),
        const _NotifyPermission(),
        if (onAndroid)
          SwitchListTile(
            key: const Key('badges'),
            contentPadding: EdgeInsets.zero,
            title: const Text('Show the unread count on the app icon'),
            value: ref.watch(deviceValueProvider(badgesKey)).value != '0',
            onChanged: (v) => ref.read(deviceValueProvider(badgesKey).notifier).set(v ? '1' : '0'),
          ),
      ]),
      _section('App version', Icons.info_outline, [
        FutureBuilder<PackageInfo>(
          future: PackageInfo.fromPlatform(),
          builder: (_, v) => Text(onWeb ? 'RxPOS 2.0.$webBuild (web, build $webBuild)' : v.data == null ? 'RxPOS' : 'RxPOS ${v.data!.version} (build ${v.data!.buildNumber})', key: const Key('app-version')),
        ),
        const SizedBox(height: 4),
        Text('Live connection: ${ref.watch(liveProvider).up ? 'on (changes from other devices arrive at once)' : 'off (syncing every few seconds instead)'}', key: const Key('live-state')),
        const SizedBox(height: 4),
        Text(updateText(ref.watch(appUpdaterProvider), ref.watch(updatePlatformProvider)), key: const Key('update-state')),
        if (ref.watch(updatePlatformProvider) != null)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              key: const Key('update-now'),
              onPressed: const {'checking', 'downloading'}.contains(ref.watch(appUpdaterProvider).status) ? null : () => ref.read(appUpdaterProvider.notifier).updateNow(),
              icon: const Icon(Icons.system_update_alt),
              label: Text(ref.watch(appUpdaterProvider).status == 'ready' ? 'Update now' : 'Check for updates'),
            ),
          ),
      ]),
      _section('Keyboard', Icons.keyboard_outlined, const [KeyboardSettings()]),
    ];
    return PageFrame(
      title: 'This device',
      subtitle: 'Only changes this ${onAndroid ? 'phone or tablet' : 'computer'}. Everyone else keeps their own setup.',
      scroll: true,
      child: wide
          ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(child: Column(children: [for (var i = 0; i < cards.length; i += 2) cards[i]])),
              const SizedBox(width: 12),
              Expanded(child: Column(children: [for (var i = 1; i < cards.length; i += 2) cards[i]])),
            ])
          : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: cards),
    );
  }
}

/// Audit log (src/pages/Audit.jsx): who did what, when and where; by person, action, from a date and search; CSV.
class AuditScreen extends ConsumerStatefulWidget {
  const AuditScreen({super.key});
  @override
  ConsumerState<AuditScreen> createState() => _AuditScreenState();
}

class _AuditScreenState extends ConsumerState<AuditScreen> {
  String _q = '', _who = '', _action = '', _from = '';
  @override
  Widget build(BuildContext context) {
    final rows = ref.watch(tableProvider('audit')).value;
    final branches = ref.watch(tableProvider('branches')).value ?? const [];
    final st = ref.watch(settingsProvider).value;
    if (rows == null || st == null) return const Center(child: CircularProgressIndicator());
    final users = {for (final a in rows) if ('${a['user'] ?? ''}'.isNotEmpty) '${a['user']}'}.toList()..sort();
    final actions = {for (final a in rows) '${a['action'] ?? ''}'}.toList()..sort();
    String branch(Object? id) => '${branches.where((b) => b['id'] == ('${id ?? ''}'.isEmpty ? 'main' : id)).firstOrNull?['name'] ?? ''}';
    final q = _q.trim().toLowerCase();
    final list = rows
        .where((a) => (_who.isEmpty || a['user'] == _who) && (_action.isEmpty || a['action'] == _action) && (_from.isEmpty || dayOf('${a['date']}').compareTo(_from) >= 0) &&
            (q.isEmpty || '${a['user']} ${a['action']} ${a['details']}'.toLowerCase().contains(q)))
        .toList()
      ..sort((a, b) => '${b['date']}'.compareTo('${a['date']}'));
    return PageFrame(
      title: 'Audit Log',
      subtitle: 'Sign-ins, refunds, discounts, price changes, stock adjustments, write-offs, transfers and user changes',
      actions: [
        DropdownButton<String>(
          value: _who,
          items: [const DropdownMenuItem(value: '', child: Text('Everyone')), for (final u in users) DropdownMenuItem(value: u, child: Text(u))],
          onChanged: (v) => setState(() => _who = v ?? ''),
        ),
        DropdownButton<String>(
          value: _action,
          items: [const DropdownMenuItem(value: '', child: Text('All actions')), for (final a in actions) DropdownMenuItem(value: a, child: Text(a))],
          onChanged: (v) => setState(() => _action = v ?? ''),
        ),
        DateBox(label: 'From date', value: _from, onChanged: (v) => setState(() => _from = v)),
        SearchField(onChanged: (v) => setState(() => _q = v), hint: 'Person, action, details…', width: 220),
        ExportButtons(
          name: 'audit-log',
          settings: st,
          csv: () => [for (final a in list) {'date': a['date'], 'user': a['user'], 'action': a['action'], 'details': a['details'], 'branch': branch(a['branchId'])}],
        ),
      ],
      child: list.isEmpty
          ? const EmptyState('No activity recorded yet')
          : ListView.separated(
              itemCount: list.length > 1000 ? 1000 : list.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final a = list[i];
                return ListTile(
                  dense: true,
                  title: Text('${a['action']} · ${a['user']}'),
                  subtitle: Text('${'${a['date']}'.replaceFirst('T', ' ').split('.').first} · ${a['details'] ?? ''}${branches.length > 1 ? ' · ${branch(a['branchId'])}' : ''}'),
                );
              },
            ),
    );
  }
}

class _NotifyPermission extends ConsumerStatefulWidget {
  const _NotifyPermission();
  @override
  ConsumerState<_NotifyPermission> createState() => _NotifyPermissionState();
}

class _NotifyPermissionState extends ConsumerState<_NotifyPermission> {
  String? _perm;

  @override
  void initState() {
    super.initState();
    ref.read(osNotifyProvider).permission().then((p) {
      if (mounted) setState(() => _perm = p);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_perm == 'granted') {
      return const Row(key: Key('notify-allowed'), children: [Icon(Icons.check_circle, color: Colors.green, size: 18), SizedBox(width: 6), Flexible(child: Text('Notifications are allowed'))]);
    }
    return OutlinedButton.icon(
      key: const Key('notify-allow'),
      onPressed: _perm == null ? null : () async {
        final p = await ref.read(osNotifyProvider).ask();
        if (mounted) setState(() => _perm = p);
      },
      icon: const Icon(Icons.notifications_active_outlined),
      label: Text(_perm == 'denied' ? 'Notifications are blocked: allow them in the system settings' : 'Allow notifications'),
    );
  }
}
