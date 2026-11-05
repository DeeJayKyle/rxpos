import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/device_settings.dart';
import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/database/app_database.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/sync/merge.dart';
import '../../../core/sync/sync_config.dart';
import '../../../core/theme/theme_choice.dart';
import '../../auth/application/session_controller.dart';
import '../../sync_status/application/sync_controller.dart';

/// Settings: receipts and stock rules, payment methods. The pharmacy's details (name, currency, tax, markups) come from
/// the RxPOS owner console and are shown here read-only (the cloud refuses changes to them from devices).
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final st = ref.watch(settingsProvider).value;
    if (st == null) return const Center(child: CircularProgressIndicator());
    final rec = st.raw;
    Future<void> save(Map<String, Object?> patch) async {
      final by = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
      await ref.read(recordStoreProvider).update((d) {
        d.saveSettings({...rec, ...patch});
        d.audit(by, 'Settings changed', patch.keys.join(', '));
      });
      if (context.mounted) say(context, 'Settings saved');
    }

    return PageFrame(
      title: 'Settings',
      scroll: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Pharmacy (from the RxPOS owner console)', style: Theme.of(context).textTheme.titleMedium),
          for (final k in pharmacyFields) if (rec[k] != null && '${rec[k]}'.isNotEmpty) Text('$k: ${rec[k]}'),
          if (pharmacyFields.every((k) => rec[k] == null)) Text('${st.name} · ${st.currency}'),
        ]))),
        const SizedBox(height: 12),
        Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text('Receipts & stock', style: Theme.of(context).textTheme.titleMedium)),
            FilledButton(onPressed: () async {
              final v = await editRecord(context, title: 'Receipts & stock', initial: {
                'expiryWarnDays': st.expiryWarnDays, 'clientCapture': st.clientCapture, 'receiveUnit': st.receiveUnit, 'sellUnitRetail': st.sellUnitRetail,
                'sellUnitWholesale': st.sellUnitWholesale, 'autoPrint': st.autoPrint, 'receiptFooter': rec['receiptFooter'] ?? '',
              }, fields: const [
                FormFieldSpec('expiryWarnDays', 'Warn about expiry (days before)', kind: FieldKind.number),
                FormFieldSpec('clientCapture', 'Client at the till', kind: FieldKind.choice, options: [('off', 'Not asked'), ('optional', 'Optional'), ('required', 'Required')]),
                FormFieldSpec('receiveUnit', 'Add Stock receives medicines with packs in', kind: FieldKind.choice, options: [('pack', 'Packs (the largest pack)'), ('unit', 'Single units')]),
                FormFieldSpec('sellUnitRetail', 'Retail till sells in', kind: FieldKind.choice, options: [('unit', 'Single units'), ('pack', 'Packs')]),
                FormFieldSpec('sellUnitWholesale', 'Wholesale till sells in', kind: FieldKind.choice, options: [('pack', 'Packs'), ('unit', 'Single units')]),
                FormFieldSpec('autoPrint', 'Print the receipt after every sale', kind: FieldKind.flag),
                FormFieldSpec('receiptFooter', 'Receipt footer'),
              ]);
              if (v != null) await save(v);
            }, child: const Text('Change')),
          ]),
          Text('Expiry warning ${st.expiryWarnDays.round()} days · client ${st.clientCapture} · receive in ${st.receiveUnit}s · retail sells ${st.sellUnitRetail}s · wholesale sells ${st.sellUnitWholesale}s'),
        ]))),
        const SizedBox(height: 12),
        Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text('Payment methods', style: Theme.of(context).textTheme.titleMedium)),
            OutlinedButton(onPressed: () async {
              final v = await editRecord(context, title: 'Add a payment method', fields: const [
                FormFieldSpec('name', 'Name', required: true),
                FormFieldSpec('type', 'Kind', kind: FieldKind.choice, required: true, options: [('cash', 'Cash (with change)'), ('momo', 'Mobile Money'), ('credit', 'Credit'), ('other', 'Other')]),
              ]);
              if (v == null) return;
              final id = '${v['name']}'.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-');
              await save({'paymentMethods': [for (final m in st.methods) m.toJson(), {'id': id, 'name': v['name'], 'type': v['type']}]});
            }, child: const Text('Add')),
          ]),
          for (final m in st.methods) ListTile(dense: true, title: Text(m.name), subtitle: Text(m.type)),
        ]))),
      ]),
    );
  }
}

/// This device: which branch it works as, its look, sync and storage.
class DeviceScreen extends ConsumerWidget {
  const DeviceScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final branches = ref.watch(tableProvider('branches')).value ?? const [];
    final branch = ref.watch(deviceBranchProvider).value;
    final premium = ref.watch(premiumUiProvider).value ?? false;
    final db = ref.watch(appDatabaseProvider);
    return PageFrame(
      title: 'This device',
      scroll: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        DropdownButtonFormField<String>(
          initialValue: branches.any((b) => b['id'] == branch) ? branch : null,
          decoration: const InputDecoration(labelText: 'Branch this device works as'),
          items: [for (final b in branches) DropdownMenuItem(value: '${b['id']}', child: Text('${b['name']}'))],
          onChanged: (v) => ref.read(deviceBranchProvider.notifier).set(v!),
        ),
        SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Premium UI (Midnight Pro)'), value: premium, onChanged: (v) => ref.read(premiumUiProvider.notifier).set(v)),
        const Divider(),
        FutureBuilder(
          future: Future.wait([db.select(db.records).get(), db.select(db.outbox).get(), SyncConfig.load(db)]),
          builder: (_, snap) {
            final d = snap.data;
            if (d == null) return const SizedBox.shrink();
            final records = (d[0] as List<RecordRow>);
            final cfg = d[2] as SyncConfig;
            return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Records on this device: ${records.length}'),
              Text('Changes waiting to be sent: ${(d[1] as List).length}'),
              Text('Device id: ${cfg.deviceId}'),
              Text('Last synced: ${cfg.lastSync ?? 'not yet'}'),
            ]);
          },
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(onPressed: () => ref.read(syncControllerProvider.notifier).downloadEverything(), icon: const Icon(Icons.cloud_download_outlined), label: const Text('Download everything again')),
      ]),
    );
  }
}

/// Audit log: who did what and when (newest first), searchable.
class AuditScreen extends ConsumerStatefulWidget {
  const AuditScreen({super.key});
  @override
  ConsumerState<AuditScreen> createState() => _AuditScreenState();
}

class _AuditScreenState extends ConsumerState<AuditScreen> {
  String _q = '';
  @override
  Widget build(BuildContext context) {
    final rows = ref.watch(tableProvider('audit')).value;
    if (rows == null) return const Center(child: CircularProgressIndicator());
    final q = _q.trim().toLowerCase();
    final list = rows.where((a) => q.isEmpty || '${a['user']} ${a['action']} ${a['details']}'.toLowerCase().contains(q)).toList()
      ..sort((a, b) => '${b['date']}'.compareTo('${a['date']}'));
    return PageFrame(
      title: 'Audit log',
      subtitle: '${list.length} entries',
      actions: [SearchField(onChanged: (v) => setState(() => _q = v), hint: 'Person, action, details…')],
      child: ListView.separated(
        itemCount: list.length > 500 ? 500 : list.length,
        separatorBuilder: (_, _) => const Divider(height: 1),
        itemBuilder: (_, i) {
          final a = list[i];
          return ListTile(dense: true, title: Text('${a['action']} · ${a['user']}'), subtitle: Text('${'${a['date']}'.replaceFirst('T', ' ').split('.').first} · ${a['details'] ?? ''}'));
        },
      ),
    );
  }
}

