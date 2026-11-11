import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/product.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/network/cloud_api.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/health_tips.dart';
import '../../../core/rules/ids.dart';
import '../../auth/application/session_controller.dart';
import '../../extras/domain/extras.dart';
import '../domain/balances.dart';
import '../domain/reminders.dart';

/// Whether the cloud can send SMS for this pharmacy.
final smsReadyProvider = FutureProvider.autoDispose<bool>((ref) async {
  try {
    return (await ref.watch(cloudApiProvider).config())['sms'] == true;
  } catch (_) {
    return false;
  }
});

Future<void> _open(String phone, String text) => launchUrl(Uri.parse(whatsappLink(phone, text)), mode: LaunchMode.externalApplication);

/// Reminders (src/pages/Reminders.jsx): refills due (prescriptions and chronic medicines) and debtors, by WhatsApp
/// (free) or SMS; select several to SMS them at once; each client's "last reminded".
class RemindersScreen extends ConsumerStatefulWidget {
  const RemindersScreen({super.key});
  @override
  ConsumerState<RemindersScreen> createState() => _RemindersScreenState();
}

class _RemindersScreenState extends ConsumerState<RemindersScreen> {
  String _tab = 'refills';
  final _selected = <String>{};
  bool _sending = false;

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    final rx = ref.watch(tableProvider('prescriptions')).value;
    final customers = ref.watch(tableProvider('customers')).value ?? const [];
    final sales = ref.watch(tableProvider('sales')).value ?? const [];
    final payments = ref.watch(tableProvider('payments')).value ?? const [];
    final smsReady = ref.watch(smsReadyProvider).value ?? false;
    final win = ref.watch(balanceWindowProvider).value; // stage 4: a device keeping recent history
    if (d == null || rx == null) return const Center(child: CircularProgressIndicator());
    final st = d.settings;
    final saleList = sales.map(Sale.fromRecord).toList();
    final byId = {for (final c in customers) '${c['id']}': c};
    final refills = refillsDue(rx, saleList, d.products, byId.keys.toSet());
    final debts = [for (final c in customers) (c, customerBalance('${c['id']}', saleList, payments, win: win))].where((x) => x.$2 > 0.5).toList()..sort((a, b) => b.$2.compareTo(a.$2));
    final rows = _tab == 'refills'
        ? [for (final r in refills) (key: r.key, c: byId[r.customerId]!, medicine: r.medicine, due: r.due, days: r.days, amount: 0.0)]
        : [for (final (c, a) in debts) (key: '${c['id']}', c: c, medicine: '', due: '', days: 0, amount: a)];
    String message(({String key, Map<String, Object?> c, String medicine, String due, int days, double amount}) r) => fillTemplate(
        '${st.raw[_tab == 'refills' ? 'smsRefill' : 'smsDebt'] ?? (_tab == 'refills' ? defaultRefillMessage : defaultDebtMessage)}', {
      'name': '${r.c['name']}'.split(' ').first, 'pharmacy': st.name, 'medicine': r.medicine, 'date': r.due, 'amount': st.money(r.amount), 'phone': st.phone,
    });
    Future<void> markSent(List<Map<String, Object?>> list, String channel) async {
      final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
      await ref.read(recordStoreProvider).update((x) {
        for (final c in list) {
          x.put('customers', {...c, 'lastReminderAt': x.now});
        }
        x.audit(user, 'Reminder sent', '${list.length} ${_tab == 'refills' ? 'refill' : 'payment'} reminder(s) by $channel', d.branch);
      });
    }

    Future<void> smsTo(List<({String key, Map<String, Object?> c, String medicine, String due, int days, double amount})> list) async {
      final withPhone = list.where((r) => normalizePhone('${r.c['phone'] ?? ''}').length >= 12).toList();
      if (withPhone.isEmpty) return say(context, 'None of these customers has a phone number', error: true);
      if (!await confirmAction(context, 'Send ${withPhone.length} SMS?', 'Each customer gets their own personalised message. SMS charges from Africa’s Talking apply.', 'Send SMS')) return;
      setState(() => _sending = true);
      final sent = <Map<String, Object?>>[];
      for (final r in withPhone) {
        try {
          await ref.read(cloudApiProvider).sendSms([normalizePhone('${r.c['phone']}')], message(r));
          sent.add(r.c);
        } catch (e) {
          if (context.mounted) say(context, '$e'.replaceFirst('Exception: ', ''), error: true);
          break;
        }
      }
      if (sent.isNotEmpty) await markSent(sent, 'SMS');
      if (!mounted) return;
      setState(() {
        _sending = false;
        _selected.clear();
      });
      if (sent.isNotEmpty && context.mounted) say(context, '${sent.length} SMS sent');
    }

    final chosen = rows.where((r) => _selected.contains(r.key)).toList();
    return PageFrame(
      title: 'Reminders',
      subtitle: 'Bring patients back on time and collect what is owed',
      actions: [
        if (chosen.isNotEmpty) FilledButton.icon(onPressed: !smsReady || _sending ? null : () => smsTo(chosen), icon: const Icon(Icons.send), label: Text('SMS ${chosen.length} selected')),
      ],
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (!smsReady) const Card(child: Padding(padding: EdgeInsets.all(10), child: Text('WhatsApp reminders work now. To send SMS automatically, add your Africa’s Talking keys to the cloud.'))),
        Row(children: [
          SegmentedButton<String>(
            segments: [ButtonSegment(value: 'refills', label: Text('Refills due (${refills.length})')), ButtonSegment(value: 'debts', label: Text('Debtors (${debts.length})'))],
            selected: {_tab},
            onSelectionChanged: (v) => setState(() {
              _tab = v.first;
              _selected.clear();
            }),
          ),
          const Spacer(),
          if (rows.isNotEmpty)
            Checkbox(value: chosen.length == rows.length, onChanged: (on) => setState(() => on == true ? _selected.addAll(rows.map((r) => r.key)) : _selected.clear())),
          if (rows.isNotEmpty) const Text('Select all'),
        ]),
        Expanded(
          child: rows.isEmpty
              ? EmptyState(_tab == 'refills' ? 'No refills due in the next 7 days. Mark medicines as “Chronic” or set a refill interval on prescriptions.' : 'Nobody owes you money 🎉')
              : ListView(children: [
                  for (final r in rows)
                    () {
                      final phone = normalizePhone('${r.c['phone'] ?? ''}');
                      return ListTile(
                        leading: Checkbox(value: _selected.contains(r.key), onChanged: (on) => setState(() => on == true ? _selected.add(r.key) : _selected.remove(r.key))),
                        title: Text('${r.c['name']}'),
                        subtitle: Text([
                          '${r.c['phone'] ?? ''}'.isEmpty ? 'no phone' : '${r.c['phone']}',
                          if (_tab == 'refills') '${r.medicine} · ${r.days < 0 ? '${-r.days} days overdue' : r.days == 0 ? 'due today' : 'due in ${r.days} days'}',
                          'last reminded ${r.c['lastReminderAt'] == null ? '—' : dayOf('${r.c['lastReminderAt']}')}',
                        ].join(' · ')),
                        trailing: Wrap(spacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                          if (_tab == 'debts') Text(st.money(r.amount), style: TextStyle(fontWeight: FontWeight.w700, color: Colors.orange.shade800)),
                          IconButton(tooltip: 'WhatsApp', icon: const Icon(Icons.chat_outlined), onPressed: phone.length < 12 ? null : () async {
                            await _open(phone, message(r));
                            await markSent([r.c], 'WhatsApp');
                          }),
                          IconButton(tooltip: 'SMS', icon: const Icon(Icons.sms_outlined), onPressed: !smsReady || _sending || phone.length < 12 ? null : () => smsTo([r])),
                        ]),
                      );
                    }(),
                ]),
        ),
        Text('Edit the message wording in Settings → Messages. Placeholders: {name} {pharmacy} {medicine} {date} {amount}.', style: Theme.of(context).textTheme.bodySmall),
      ]),
    );
  }
}

/// Messages & SMS (src/pages/Messages.jsx): own message templates (and today's health tip) sent to chosen clients by
/// WhatsApp, one tap each, or by SMS; each message is logged in the client's conversation.
class MessagesScreen extends ConsumerStatefulWidget {
  const MessagesScreen({super.key});
  @override
  ConsumerState<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends ConsumerState<MessagesScreen> {
  String _tab = 'send', _tplId = '', _audience = 'all';
  final _text = TextEditingController();
  final _picked = <String>{};
  int? _queue;
  bool _init = false;

  List<Map<String, Object?>> _templates(PharmacySettings s) =>
      ((s.raw['messageTemplates'] as List?) ?? const []).isNotEmpty ? [for (final t in (s.raw['messageTemplates'] as List).cast<Map>()) t.cast<String, Object?>()] : starterTemplates;

  Future<void> _saveTemplates(List<Map<String, Object?>> next) async {
    final store = ref.read(recordStoreProvider);
    final shared = await store.settingsRecord();
    await store.update((d) => d.saveSettings({...shared, 'messageTemplates': next}));
  }

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    final sales = ref.watch(tableProvider('sales')).value ?? const [];
    final customers = ref.watch(tableProvider('customers')).value ?? const [];
    final payments = ref.watch(tableProvider('payments')).value ?? const [];
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    final smsReady = ref.watch(smsReadyProvider).value ?? false;
    if (d == null) return const Center(child: CircularProgressIndicator());
    final s = d.settings;
    final templates = _templates(s);
    if (!_init && templates.isNotEmpty) {
      _init = true;
      _tplId = '${templates.first['id']}';
      _text.text = '${templates.first['text']}';
    }
    final saleList = sales.map(Sale.fromRecord).toList();
    final chronicIds = {for (final Product p in d.products) if (p.raw['chronic'] == true) p.id};
    final chronicBuyers = {for (final x in saleList) if (x.items.any((i) => chronicIds.contains(i.id))) x.customerId};
    String phoneOf(Map<String, Object?> c) => normalizePhone('${(c['whatsapp'] ?? '') == '' ? c['phone'] ?? '' : c['whatsapp']}');
    final win = ref.watch(balanceWindowProvider).value;
    double owes(Map<String, Object?> c) => customerBalance('${c['id']}', saleList, payments, win: win);
    final withPhone = customers.where((c) => c['id'] != 'walk-in' && phoneOf(c).length >= 12).toList();
    final groups = {
      'all': ('All clients with a phone', withPhone),
      'chronic': ('Chronic-medicine patients', withPhone.where((c) => chronicBuyers.contains(c['id']) || c['chronic'] == true).toList()),
      'debtors': ('Clients who owe money', withPhone.where((c) => owes(c) > 0).toList()),
      'pick': ('Choose clients…', withPhone.where((c) => _picked.contains(c['id'])).toList()),
    };
    final list = groups[_audience]!.$2;
    Map<String, String> vars(Map<String, Object?> c) => {'name': '${c['name']}'.split(' ').first, 'pharmacy': s.name, 'amount': s.money(owes(c)), 'date': today(), 'medicine': ''};
    Future<void> log(Map<String, Object?> c, String channel, String body) async {
      final session = await ref.read(sessionControllerProvider.future);
      await ref.read(recordStoreProvider).update((x) => x.put('messages', {
            'id': uid(), 'date': x.now, 'fromId': session?.userId ?? '', 'fromName': session?.userName ?? '', 'conv': 'client:${c['id']}', 'channel': channel, 'to': c['name'], 'text': body,
            'branchId': d.branch,
          }));
    }

    final tip = greetingMessage(pharmacy: s.name, phone: s.phone, slot: DateTime.now().hour < 12 ? 8 : 14, date: today());
    final th = Theme.of(context);
    return PageFrame(
      title: 'Messages & SMS',
      subtitle: 'Send your clients a note on WhatsApp (free, one tap each) or by SMS',
      scroll: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Align(
          alignment: Alignment.centerLeft,
          child: SegmentedButton<String>(
            segments: [const ButtonSegment(value: 'send', label: Text('Send a message')), ButtonSegment(value: 'templates', label: Text('Templates (${templates.length})'))],
            selected: {_tab},
            onSelectionChanged: (v) => setState(() => _tab = v.first),
          ),
        ),
        const SizedBox(height: 8),
        if (_tab == 'send')
          Wrap(spacing: 16, runSpacing: 16, children: [
            SizedBox(
              width: 520,
              child: Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text('Message', style: th.textTheme.titleMedium),
                Wrap(spacing: 6, runSpacing: 6, children: [
                  for (final t in templates)
                    ChoiceChip(label: Text('${t['name']}'), selected: _tplId == t['id'], onSelected: (_) => setState(() {
                      _tplId = '${t['id']}';
                      _text.text = '${t['text']}';
                    })),
                  ChoiceChip(avatar: const Icon(Icons.favorite_outline, size: 16), label: const Text("Today's health tip"), selected: _tplId == 'tip', onSelected: (_) => setState(() {
                    _tplId = 'tip';
                    _text.text = tip;
                  })),
                ]),
                TextField(key: const Key('message-text'), controller: _text, maxLines: 6, onChanged: (_) => setState(() => _tplId = ''),
                    decoration: const InputDecoration(hintText: 'Write your message. Placeholders: {name} {pharmacy} {amount} {date}')),
                Text('${_text.text.length} characters · ${(_text.text.length / 160).ceil().clamp(1, 99)} SMS each · placeholders: {name} {pharmacy} {amount} {date}', style: th.textTheme.bodySmall),
                if (list.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text('Preview for ${list.first['name']}: ${fillTemplate(_text.text, vars(list.first))}')),
              ]))),
            ),
            SizedBox(
              width: 460,
              child: Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text('Who gets it', style: th.textTheme.titleMedium),
                DropdownButton<String>(
                  value: _audience,
                  isExpanded: true,
                  items: [for (final e in groups.entries) DropdownMenuItem(value: e.key, child: Text('${e.value.$1}${e.key == 'pick' ? '' : ' (${e.value.$2.length})'}'))],
                  onChanged: (v) => setState(() {
                    _audience = v ?? 'all';
                    _queue = null;
                  }),
                ),
                if (_audience == 'pick')
                  for (final c in withPhone)
                    CheckboxListTile(dense: true, value: _picked.contains(c['id']), title: Text('${c['name']}'), subtitle: Text('${c['phone'] ?? ''}'),
                        onChanged: (on) => setState(() => on == true ? _picked.add('${c['id']}') : _picked.remove(c['id']))),
                if (_audience == 'pick' && withPhone.isEmpty) const Text('No clients with a phone number yet'),
                Text('${list.length} client${list.length == 1 ? '' : 's'} selected. Only clients with a phone number are listed.', style: th.textTheme.bodySmall),
                const SizedBox(height: 8),
                if (_queue != null && _queue! < list.length)
                  Card(
                    color: th.colorScheme.secondaryContainer,
                    child: Padding(padding: const EdgeInsets.all(8), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('WhatsApp ${_queue! + 1} of ${list.length}: ${list[_queue!]['name']}'),
                      Row(children: [
                        FilledButton.icon(onPressed: () async {
                          final c = list[_queue!];
                          final body = fillTemplate(_text.text, vars(c));
                          await _open(phoneOf(c), body);
                          await log(c, 'whatsapp', body);
                          if (_queue! + 1 >= list.length) {
                            final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
                            await ref.read(recordStoreProvider).update((x) => x.audit(user, 'Client messages sent (WhatsApp)', '${list.length} clients', d.branch));
                            if (!context.mounted) return;
                            say(context, 'Done: ${list.length} WhatsApp message${list.length > 1 ? 's' : ''} prepared');
                            setState(() => _queue = null);
                          } else {
                            setState(() => _queue = _queue! + 1);
                          }
                        }, icon: const Icon(Icons.chat_outlined), label: const Text('Open WhatsApp')),
                        TextButton(onPressed: () => setState(() => _queue = null), child: const Text('Stop')),
                      ]),
                    ])),
                  )
                else
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    FilledButton.icon(onPressed: () {
                      if (_text.text.trim().isEmpty || list.isEmpty) return say(context, 'Write a message and choose who gets it', error: true);
                      setState(() => _queue = 0);
                    }, icon: const Icon(Icons.chat_outlined), label: const Text('Send by WhatsApp')),
                    OutlinedButton.icon(
                      onPressed: !smsReady ? null : () async {
                        if (_text.text.trim().isEmpty || list.isEmpty) return say(context, 'Write a message and choose who gets it', error: true);
                        if (!await confirmAction(context, 'Send ${list.length} SMS?', 'SMS are charged by your SMS provider (Africa’s Talking).', 'Send SMS')) return;
                        var ok = 0;
                        for (final c in list) {
                          final body = fillTemplate(_text.text, vars(c));
                          try {
                            await ref.read(cloudApiProvider).sendSms([normalizePhone('${c['phone'] ?? c['whatsapp'] ?? ''}')], body);
                            await log(c, 'sms', body);
                            ok++;
                          } catch (e) {
                            if (context.mounted) say(context, '${c['name']}: ${'$e'.replaceFirst('Exception: ', '')}', error: true);
                          }
                        }
                        final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
                        await ref.read(recordStoreProvider).update((x) => x.audit(user, 'Client messages sent (SMS)', '$ok of ${list.length}', d.branch));
                        if (context.mounted) say(context, '$ok SMS sent');
                      },
                      icon: const Icon(Icons.sms_outlined),
                      label: Text(smsReady ? 'Send by SMS' : 'SMS is not set up for this pharmacy'),
                    ),
                    TextButton.icon(onPressed: () => launchUrl(Uri.parse('https://wa.me/?text=${Uri.encodeComponent(fillTemplate(_text.text, {'name': 'there', 'pharmacy': s.name, 'amount': '', 'date': today()}))}'),
                        mode: LaunchMode.externalApplication), icon: const Icon(Icons.groups_outlined), label: const Text('Share to a WhatsApp group / status')),
                  ]),
              ]))),
            ),
          ]),
        if (_tab == 'templates') ...[
          if (can.contains('settings.manage'))
            Align(alignment: Alignment.centerLeft, child: FilledButton.icon(onPressed: () => _editTemplate(null, templates), icon: const Icon(Icons.add), label: const Text('New template'))),
          const SizedBox(height: 8),
          Wrap(spacing: 12, runSpacing: 12, children: [
            for (final t in templates)
              SizedBox(
                width: 320,
                child: Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${t['name']}', style: th.textTheme.titleMedium),
                  Text('${t['text']}', style: th.textTheme.bodySmall),
                  Wrap(spacing: 4, children: [
                    TextButton(onPressed: () => setState(() {
                      _tab = 'send';
                      _tplId = '${t['id']}';
                      _text.text = '${t['text']}';
                    }), child: const Text('Use')),
                    if (can.contains('settings.manage')) ...[
                      TextButton(onPressed: () => _editTemplate(t, templates), child: const Text('Edit')),
                      IconButton(tooltip: 'Delete', icon: Icon(Icons.delete_outline, color: th.colorScheme.error), onPressed: () async {
                        if (!await confirmAction(context, 'Delete "${t['name']}"?', 'The template is removed.', 'Delete')) return;
                        await _saveTemplates(templates.where((x) => x['id'] != t['id']).toList());
                      }),
                    ],
                  ]),
                ]))),
              ),
          ]),
        ],
        const SizedBox(height: 8),
        Text('To call a client, use the phone button next to them in Customers or Chat.', style: th.textTheme.bodySmall),
      ]),
    );
  }

  Future<void> _editTemplate(Map<String, Object?>? t, List<Map<String, Object?>> templates) async {
    final v = await editRecord(context, title: t == null ? 'New template' : 'Edit template', initial: t ?? const {}, fields: const [
      FormFieldSpec('name', 'Name', required: true),
      FormFieldSpec('text', 'Message ({name} {pharmacy} {amount} {date})', kind: FieldKind.multiline, required: true),
    ]);
    if (v == null) return;
    final rec = {'id': t?['id'] ?? 'tpl-${uid()}', 'name': '${v['name']}'.trim(), 'text': '${v['text']}'.trim()};
    await _saveTemplates(t == null ? [...templates, rec] : [for (final x in templates) x['id'] == t['id'] ? rec : x]);
    if (mounted) say(context, 'Template saved');
  }
}
