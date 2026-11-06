// Calendar (src/pages/Calendar.jsx): the month with team events (also repeating ones), refills due and expiring
// stock; the chosen day's agenda (Today jumps back), each item to Google Calendar; add, edit and delete events;
// the private subscription link (copy, Google, Apple / Outlook / phone) and the .ics file.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/network/cloud_api.dart';
import '../../../core/presentation/export.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/ids.dart';
import '../../auth/application/session_controller.dart';
import '../domain/calendar.dart';

const _months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const _days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

Color kindColor(String kind) => switch (kind) { 'refill' => Colors.deepPurple, 'expiry' => Colors.orange.shade800, _ => Colors.teal };

String longDay(String day) {
  final d = DateTime.parse(day);
  return '${_days[d.weekday - 1]}, ${d.day} ${_months[d.month - 1]}';
}

class CalendarScreen extends ConsumerStatefulWidget {
  const CalendarScreen({super.key});
  @override
  ConsumerState<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends ConsumerState<CalendarScreen> {
  late String _month = today().substring(0, 7), _day = today();
  String? _link;
  bool _linkFailed = false;

  @override
  void initState() {
    super.initState();
    ref.read(cloudApiProvider).get('/api/calendar-link').then((j) {
      if (mounted) setState(() => j['url'] is String ? _link = '${j['url']}' : _linkFailed = true);
    }, onError: (Object _) {
      if (mounted) setState(() => _linkFailed = true);
    });
  }

  Future<void> _open(String url) => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);

  Future<void> _edit(Map<String, Object?>? e, String branch) async {
    final v = await showDialog<Map<String, Object?>>(context: context, builder: (_) => _EventDialog(event: e, day: _day));
    if (v == null) return;
    final by = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
    if (v['_delete'] == true) {
      await ref.read(recordStoreProvider).update((x) {
        x.del('events', '${e!['id']}');
        x.audit(by, 'Calendar event deleted', '${e['title']}', branch);
      });
      return;
    }
    final isNew = e == null;
    final rec = <String, Object?>{...?e, ...v, 'id': e?['id'] ?? uid(), 'createdBy': (e?['createdBy'] ?? '') == '' ? by : e!['createdBy']}..remove('note');
    await ref.read(recordStoreProvider).update((x) {
      x.put('events', rec);
      x.audit(by, isNew ? 'Calendar event added' : 'Calendar event changed', '${rec['title']} · ${rec['date']}', branch);
    });
    if (!mounted) return;
    say(context, isNew ? 'Event added. It syncs to every device and subscribed calendars.' : 'Event saved');
    setState(() => _day = '${rec['date']}');
  }

  @override
  Widget build(BuildContext context) {
    final events = ref.watch(tableProvider('events')).value;
    final rx = ref.watch(tableProvider('prescriptions')).value;
    final d = ref.watch(pharmacyProvider).value;
    if (events == null || rx == null || d == null) return const Center(child: CircularProgressIndicator());
    final t = Theme.of(context);
    final now = today();
    final auto = autoEvents(
      prescriptions: rx,
      customerNames: {for (final c in d.customers) c.id: c.name},
      products: [for (final p in d.products) (id: p.id, name: p.name, stock: d.stockOf(p.id))],
      batchesOf: d.stock.batchesOf,
      today: now,
    );
    final cells = monthCells(_month);
    final mo = DateTime.parse('$_month-01');
    final agenda = onDay(events, auto, _day);

    final grid = Card(
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Row(children: [
            IconButton(tooltip: 'Previous month', onPressed: () => setState(() => _month = addMonths(_month, -1)), icon: const Icon(Icons.chevron_left)),
            Expanded(child: Text('${_months[mo.month - 1]} ${mo.year}', key: const Key('cal-month'), textAlign: TextAlign.center, style: t.textTheme.titleMedium)),
            TextButton(onPressed: () => setState(() {
                  _month = now.substring(0, 7);
                  _day = now;
                }), child: const Text('Today')),
            IconButton(tooltip: 'Next month', onPressed: () => setState(() => _month = addMonths(_month, 1)), icon: const Icon(Icons.chevron_right)),
          ]),
          Row(children: [for (final w in weekDays) Expanded(child: Center(child: Text(w, style: t.textTheme.labelSmall)))]),
          for (var r = 0; r < 6; r++)
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              for (final c in cells.sublist(r * 7, r * 7 + 7))
                Expanded(
                  child: Builder(builder: (context) {
                    final evs = onDay(events, auto, c);
                    final sel = c == _day, isToday = c == now, out = !c.startsWith(_month);
                    return InkWell(
                      key: ValueKey('cal-$c'),
                      onTap: () => setState(() => _day = c),
                      child: Container(
                        height: 74,
                        margin: const EdgeInsets.all(1),
                        padding: const EdgeInsets.all(3),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(6),
                          color: sel ? t.colorScheme.primary.withValues(alpha: .12) : null,
                          border: Border.all(color: isToday ? t.colorScheme.primary : t.dividerColor.withValues(alpha: .4), width: isToday ? 2 : 1),
                        ),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${int.parse(c.substring(8))}', style: t.textTheme.labelSmall?.copyWith(fontWeight: FontWeight.w700, color: out ? t.disabledColor : null)),
                          for (final e in evs.take(3))
                            Container(
                              width: double.infinity,
                              margin: const EdgeInsets.only(top: 1),
                              padding: const EdgeInsets.symmetric(horizontal: 2),
                              color: kindColor('${e['kind']}').withValues(alpha: .15),
                              child: Text('${(e['time'] ?? '') == '' ? '' : '${e['time']} '}${e['title']}', maxLines: 1, overflow: TextOverflow.clip, style: const TextStyle(fontSize: 9)),
                            ),
                          if (evs.length > 3) Text('+${evs.length - 3} more', style: const TextStyle(fontSize: 9)),
                        ]),
                      ),
                    );
                  }),
                ),
            ]),
        ]),
      ),
    );

    final day = Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
          Text(longDay(_day), key: const Key('cal-day'), style: t.textTheme.titleMedium),
          const SizedBox(height: 6),
          if (agenda.isEmpty) const Padding(padding: EdgeInsets.all(12), child: EmptyState('Nothing on this day')),
          for (final e in agenda)
            Container(
              margin: const EdgeInsets.only(bottom: 4),
              decoration: BoxDecoration(border: Border(left: BorderSide(width: 3, color: kindColor('${e['kind']}')))),
              child: ListTile(
                dense: true,
                title: Text('${(e['time'] ?? '') == '' ? '' : '${e['time']}${(e['endTime'] ?? '') == '' ? '' : '–${e['endTime']}'} · '}${e['title']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text([
                  kinds['${e['kind']}'] ?? '',
                  if ((e['repeat'] ?? 'none') != 'none' && '${e['repeat']}'.isNotEmpty) '↻ ${e['repeat']}',
                  if (notesOf(e).isNotEmpty) notesOf(e),
                ].join(' · ')),
                trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                  IconButton(tooltip: 'Add to Google Calendar', icon: const Icon(Icons.event_available, size: 18), onPressed: () => _open(googleLink(e))),
                  if (e['kind'] == 'event') TextButton(onPressed: () => _edit(events.firstWhere((x) => x['id'] == e['id']), d.branch), child: const Text('Edit')),
                ]),
              ),
            ),
        ]),
      ),
    );

    final link = _link;
    final sync = Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Text('Sync with your calendar', style: t.textTheme.titleMedium),
          const SizedBox(height: 6),
          if (link != null) ...[
            Text('Subscribe once and all events, refills and expiries appear in your calendar and update by themselves (Google checks every few hours).', style: t.textTheme.bodySmall),
            const SizedBox(height: 6),
            Row(children: [
              Expanded(child: SelectableText(link, key: const Key('cal-link'), style: const TextStyle(fontFamily: 'monospace', fontSize: 12))),
              TextButton.icon(
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: link));
                  if (context.mounted) say(context, 'Link copied');
                },
                icon: const Icon(Icons.copy, size: 16),
                label: const Text('Copy'),
              ),
            ]),
            Wrap(spacing: 8, runSpacing: 6, children: [
              FilledButton.icon(
                onPressed: () => _open('https://calendar.google.com/calendar/render?cid=${Uri.encodeComponent(link.replaceFirst(RegExp('^https:'), 'webcal:'))}'),
                icon: const Icon(Icons.event_available, size: 16),
                label: const Text('Add to Google Calendar'),
              ),
              OutlinedButton(onPressed: () => _open(link.replaceFirst(RegExp('^https:'), 'webcal:')), child: const Text('Apple / Outlook / phone')),
            ]),
            const SizedBox(height: 6),
            Text('Outlook: Add calendar → Subscribe from web → paste the link. Keep the link private: anyone with it can see these events.', style: t.textTheme.bodySmall),
          ] else
            Text(_linkFailed ? 'Go online to get your calendar subscription link.' : 'Connecting to the cloud…', style: t.textTheme.bodySmall),
          const SizedBox(height: 6),
          OutlinedButton.icon(
            onPressed: () async {
              final ics = icsFile([...events, ...auto.where((e) => '${e['date']}'.compareTo(now) >= 0)], '${d.settings.name} · RxPOS');
              final f = await saveDownload('rxpos-calendar-$now.ics', utf8.encode(ics));
              if (context.mounted) say(context, 'Saved ${f.path}');
            },
            icon: const Icon(Icons.download, size: 16),
            label: const Text('Download .ics file'),
          ),
          const SizedBox(height: 8),
          Wrap(spacing: 8, children: [
            for (final k in kinds.entries)
              Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2), color: kindColor(k.key).withValues(alpha: .15), child: Text(k.value, style: t.textTheme.labelSmall)),
          ]),
        ]),
      ),
    );

    return PageFrame(
      title: 'Calendar',
      subtitle: 'Team events, refills due and expiring stock, synced to every device and to Google / Outlook / phone calendars',
      actions: [FilledButton.icon(onPressed: () => _edit(null, d.branch), icon: const Icon(Icons.add), label: const Text('Add event'))],
      child: LayoutBuilder(
        builder: (context, c) => ListView(key: const Key('calendar-page'), children: [
          if (c.maxWidth >= 1000)
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(flex: 3, child: grid), Expanded(flex: 2, child: Column(children: [day, sync]))])
          else ...[grid, day, sync],
        ]),
      ),
    );
  }
}

class _EventDialog extends StatefulWidget {
  const _EventDialog({required this.event, required this.day});
  final Map<String, Object?>? event;
  final String day;
  @override
  State<_EventDialog> createState() => _EventDialogState();
}

class _EventDialogState extends State<_EventDialog> {
  late final e = widget.event;
  late final _title = TextEditingController(text: '${e?['title'] ?? ''}');
  late final _time = TextEditingController(text: '${e?['time'] ?? ''}');
  late final _end = TextEditingController(text: '${e?['endTime'] ?? ''}');
  late final _notes = TextEditingController(text: e == null ? '' : notesOf(e!));
  late String _date = '${e?['date'] ?? widget.day}';
  late String _repeat = '${e?['repeat'] ?? 'none'}'.isEmpty ? 'none' : '${e?['repeat'] ?? 'none'}';
  final _form = GlobalKey<FormState>();

  @override
  void dispose() {
    for (final c in [_title, _time, _end, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  /// "9:5" / "0930" / "09:30" → "09:30"; '' stays ''; null when not a time.
  static String? hhmm(String s) {
    final v = s.trim();
    if (v.isEmpty) return '';
    final m = RegExp(r'^(\d{1,2}):?(\d{2})$').firstMatch(v);
    if (m == null) return null;
    final h = int.parse(m[1]!), mi = int.parse(m[2]!);
    if (h > 23 || mi > 59) return null;
    return '${h.toString().padLeft(2, '0')}:${mi.toString().padLeft(2, '0')}';
  }

  String? _checkTime(String? s) => hhmm(s ?? '') == null ? 'A time like 14:30' : null;

  void _save() {
    if (!_form.currentState!.validate()) return;
    Navigator.pop(context, {'title': _title.text.trim(), 'date': _date, 'time': hhmm(_time.text), 'endTime': hhmm(_end.text), 'repeat': _repeat, 'notes': _notes.text.trim()});
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: Text(e == null ? 'Add event' : 'Edit event'),
        content: SizedBox(
          width: 460,
          child: Form(
            key: _form,
            child: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                TextFormField(
                  key: const Key('event-title'),
                  controller: _title,
                  autofocus: true,
                  decoration: const InputDecoration(labelText: 'What', hintText: 'e.g. NDA inspection, supplier delivery, staff meeting'),
                  validator: (s) => (s ?? '').trim().isEmpty ? 'Required' : null,
                ),
                const SizedBox(height: 8),
                Wrap(spacing: 12, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.end, children: [
                  DateBox(key: const Key('event-date'), label: 'Date', value: _date, onChanged: (v) => setState(() => _date = v)),
                  SizedBox(
                    width: 200,
                    child: DropdownButtonFormField<String>(
                      key: const Key('event-repeat'),
                      isExpanded: true,
                      initialValue: _repeat,
                      decoration: const InputDecoration(labelText: 'Repeats'),
                      items: [for (final (v, l) in repeats) DropdownMenuItem(value: v, child: Text(l))],
                      onChanged: (v) => setState(() => _repeat = v ?? 'none'),
                    ),
                  ),
                ]),
                Row(children: [
                  Expanded(child: TextFormField(key: const Key('event-time'), controller: _time, decoration: const InputDecoration(labelText: 'Starts (optional)', hintText: '14:30'), validator: _checkTime)),
                  const SizedBox(width: 12),
                  Expanded(child: TextFormField(key: const Key('event-end'), controller: _end, decoration: const InputDecoration(labelText: 'Ends', hintText: '15:30'), validator: _checkTime)),
                ]),
                TextFormField(key: const Key('event-notes'), controller: _notes, minLines: 2, maxLines: 4, decoration: const InputDecoration(labelText: 'Notes')),
              ]),
            ),
          ),
        ),
        actions: [
          if (e != null)
            TextButton.icon(
              style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
              onPressed: () async {
                if (await confirmAction(context, 'Delete "${e!['title']}"?', 'It is removed from every device and subscribed calendar.', 'Delete') && context.mounted) {
                  Navigator.pop(context, {'_delete': true});
                }
              },
              icon: const Icon(Icons.delete_outline),
              label: const Text('Delete'),
            ),
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(onPressed: _save, child: const Text('Save')),
        ],
      );
}
