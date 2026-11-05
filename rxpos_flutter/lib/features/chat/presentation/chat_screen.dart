// Chat & Messages (src/pages/Chat.jsx): the team's General chat, private chats with each colleague and conversations
// with clients. Team and private messages sync to every device and carry photos, PDFs, videos, audio, spreadsheets and
// voice notes; each message has a menu (react, reply, copy, forward, pin, star, edit within 24 h, info, delete for
// everyone within 48 h or just on this device). Messages to clients go out on WhatsApp or SMS, and their replies can be
// recorded to keep the history together.
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/data/device_settings.dart';
import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/network/cloud_api.dart';
import '../../../core/network/files.dart';
import '../../../core/presentation/widgets.dart';
import '../../auth/application/session_controller.dart';
import '../../auth/domain/session.dart';
import '../../extras/domain/extras.dart';
import '../../people/presentation/messages_screens.dart' show smsReadyProvider;
import '../../sync_status/application/sync_controller.dart';
import '../domain/chat.dart' as chat;

const _attachTypes = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'mp4', 'mov', 'webm', 'mp3', 'm4a', 'ogg', 'wav', 'csv', 'xls', 'xlsx', 'ods', 'doc', 'docx', 'ppt', 'pptx'];

String _time(String iso) {
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return '';
  final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
  return '$h:${d.minute.toString().padLeft(2, '0')} ${d.hour < 12 ? 'AM' : 'PM'}';
}

String _when(String iso) {
  final d = DateTime.tryParse(iso)?.toLocal();
  return d == null ? '' : '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')} ${_time(iso)}';
}

String _initials(String name) => name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).map((w) => w[0]).take(2).join().toUpperCase();

String fileSize(num n) => n > 1048576 ? '${(n / 1048576).toStringAsFixed(1)} MB' : '${(n / 1024).round().clamp(1, 1 << 30)} KB';

/// Only http(s) addresses are opened or shown (a crafted path can't smuggle another scheme in).
String? safeFileUrl(CloudApi api, String path) {
  final u = Uri.tryParse(api.fileUrl(path));
  return u != null && (u.scheme == 'http' || u.scheme == 'https') ? u.toString() : null;
}

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});
  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  String _tab = 'team', _conv = 'team', _q = '', _flash = '';
  String? _find; // null = closed
  bool _starredOnly = false, _opened = false, _recording = false, _atBottom = true;
  Map<String, Object?>? _replyTo, _editing;
  ({String name, double p})? _uploading;
  final _text = TextEditingController();
  final _input = FocusNode();
  final _scroll = ScrollController();
  final _keys = <String, GlobalKey>{};
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    // without a live line, look for new messages every 8 s while the chat is open
    _poll = Timer.periodic(const Duration(seconds: 8), (_) => ref.read(syncControllerProvider.notifier).runNow());
    _scroll.addListener(() {
      final at = _scroll.offset < 80;
      if (at != _atBottom) setState(() => _atBottom = at);
    });
    _text.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _poll?.cancel();
    _text.dispose();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _openConv(String c) => setState(() {
        if (c != _conv) {
          _replyTo = null;
          _editing = null;
          _find = null;
          _starredOnly = false;
        }
        _conv = c;
        _opened = true;
      });

  RecordStore get _store => ref.read(recordStoreProvider);
  void _syncSoon() => Future.delayed(const Duration(milliseconds: 300), () {
        if (mounted) ref.read(syncControllerProvider.notifier).runNow();
      });

  Map<String, String> _json(String? v) {
    try {
      return (jsonDecode(v ?? '{}') as Map).map((k, v) => MapEntry('$k', '$v'));
    } catch (_) {
      return {};
    }
  }

  Set<String> _hiddenSet(String? v) {
    try {
      return {for (final x in jsonDecode(v ?? '[]') as List) '$x'};
    } catch (_) {
      return {};
    }
  }

  @override
  Widget build(BuildContext context) {
    final rows = ref.watch(tableProvider('messages')).value;
    final me = ref.watch(sessionControllerProvider).value;
    final users = ref.watch(tableProvider('users')).value ?? const [];
    final customers = ref.watch(tableProvider('customers')).value ?? const [];
    final marksRows = ref.watch(tableProvider('chatMarks')).value ?? const [];
    final pinRows = ref.watch(tableProvider('chatPins')).value ?? const [];
    final reads = ref.watch(tableProvider('chatReads')).value ?? const [];
    final read = _json(ref.watch(deviceValueProvider('chat-read')).value);
    final hidden = _hiddenSet(ref.watch(deviceValueProvider('chat-hidden')).value);
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    final smsReady = ref.watch(smsReadyProvider).value ?? false;
    if (rows == null || me == null) return const Center(child: CircularProgressIndicator());

    final marks = <String, List<Map<String, Object?>>>{};
    for (final k in marksRows) {
      (marks['${k['msgId']}'] ??= []).add(k);
    }
    Map<String, Object?>? myMark(Map m) => marks['${m['id']}']?.where((k) => k['userId'] == me.userId).firstOrNull;
    final conv = _conv;
    final pins = pinRows.where((p) => p['conv'] == conv).toList()..sort((a, b) => '${b['at']}'.compareTo('${a['at']}'));
    final all = rows.where((m) => m['conv'] == conv && !hidden.contains('${m['id']}')).toList()..sort((a, b) => '${a['date']}'.compareTo('${b['date']}'));
    var messages = all;
    if (_starredOnly) messages = messages.where((m) => myMark(m)?['star'] == true).toList();
    if (_find case final f? when f.isNotEmpty) {
      final low = f.toLowerCase();
      messages = messages.where((m) => chat.messagePreview(m).toLowerCase().contains(low) || '${m['fromName']}'.toLowerCase().contains(low)).toList();
    }

    // read receipts: my "read up to" for this conversation (device), shared for team / private chats (the ticks)
    final last = all.isEmpty ? null : '${all.last['date']}';
    if (last != null && (read[conv] ?? '').compareTo(last) < 0) {
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        if (!mounted) return;
        await ref.read(deviceValueProvider('chat-read').notifier).set(jsonEncode({...read, conv: last}));
        if (!conv.startsWith('client:')) await chat.markRead(_store, conv, me.userId, last);
      });
    }

    int unread(String c) => rows.where((m) => m['conv'] == c && m['fromId'] != me.userId && m['deleted'] != true && '${m['date']}'.compareTo(read[c] ?? '') > 0).length;
    final staff = users.where((u) => u['id'] != me.userId && u['disabled'] != true).toList()..sort((a, b) => '${a['name']}'.compareTo('${b['name']}'));
    final ql = _q.toLowerCase();
    final clients = customers.where((c) => c['id'] != 'walk-in' && (ql.isEmpty || '${c['name']} ${c['phone']}'.toLowerCase().contains(ql))).take(100).toList();
    final client = conv.startsWith('client:') ? customers.where((c) => c['id'] == conv.substring(7)).firstOrNull : null;
    final phone = normalizePhone('${client?['whatsapp'] ?? ''}'.isNotEmpty ? '${client!['whatsapp']}' : '${client?['phone'] ?? ''}');
    final peer = conv.startsWith('dm:') ? users.where((u) => conv.contains('${u['id']}') && u['id'] != me.userId).firstOrNull : null;
    final readers = reads.where((r) => r['conv'] == conv && r['userId'] != me.userId).toList();
    List<Map<String, Object?>> seenBy(Map m) => readers.where((r) => '${r['at']}'.compareTo('${m['date']}') >= 0).toList();
    Map<String, Object?>? lastOf(String c) => rows.where((m) => m['conv'] == c).fold<Map<String, Object?>?>(null, (a, m) => a == null || '${m['date']}'.compareTo('${a['date']}') > 0 ? m : a);

    final title = conv == 'team' ? 'General' : peer != null ? '${peer['name']}' : '${client?['name'] ?? 'Direct message'}';
    final subtitle = conv == 'team'
        ? staff.isNotEmpty
            ? '${staff.length + 1} people · the whole team sees this'
            : 'Just you so far · add colleagues under Users & Roles'
        : peer != null
            ? '${peer['role'] ?? 'Colleague'}'
            : client != null
                ? ['${client['phone'] ?? ''}', '${client['whatsapp'] ?? ''}'].firstWhere((x) => x.isNotEmpty && x != 'null', orElse: () => 'No phone number saved')
                : '';

    Widget convRow(String id, String name, {Widget? icon}) {
      final l = lastOf(id), n = unread(id);
      return ListTile(
        key: ValueKey('conv-$id'),
        selected: conv == id,
        leading: icon ?? CircleAvatar(child: Text(_initials(name))),
        title: Text(name, style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(
          l == null ? 'No messages yet' : '${l['fromId'] == me.userId ? 'You: ' : ''}${chat.messagePreview(l).characters.take(48)}',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
          if (l != null) Text(_time('${l['date']}'), style: Theme.of(context).textTheme.labelSmall),
          if (n > 0) Badge(label: Text('$n')),
        ]),
        onTap: () => _openConv(id),
      );
    }

    final list = Card(
      child: Column(children: [
        if (can.contains('customers'))
          Padding(
            padding: const EdgeInsets.all(8),
            child: SegmentedButton<String>(
              segments: const [ButtonSegment(value: 'team', label: Text('Team')), ButtonSegment(value: 'clients', label: Text('Clients'))],
              selected: {_tab},
              onSelectionChanged: (v) => setState(() {
                _tab = v.first;
                if (_tab == 'team') _conv = 'team';
              }),
            ),
          ),
        Expanded(
          child: _tab == 'team'
              ? ListView(children: [
                  convRow('team', 'General', icon: const CircleAvatar(child: Icon(Icons.tag))),
                  if (staff.isNotEmpty) Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 4), child: Text('Private chats', style: Theme.of(context).textTheme.labelMedium)),
                  for (final u in staff) convRow(chat.dmId(me.userId, '${u['id']}'), '${u['name']}'),
                  if (staff.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('Add your colleagues under Users & Roles and you can message them here.')),
                ])
              : Column(children: [
                  Padding(padding: const EdgeInsets.symmetric(horizontal: 8), child: SearchField(hint: 'Find a client…', onChanged: (v) => setState(() => _q = v))),
                  Expanded(
                    child: clients.isEmpty
                        ? const EmptyState('No clients yet. They show up here once you add them in Customers or at the till.')
                        : ListView(children: [
                            for (final c in clients)
                              ListTile(
                                selected: conv == 'client:${c['id']}',
                                leading: const Icon(Icons.people_outline),
                                title: Text('${c['name']}'),
                                subtitle: Text('${c['phone'] ?? ''}'.isEmpty ? 'no phone' : '${c['phone']}'),
                                onTap: () => _openConv('client:${c['id']}'),
                              ),
                          ]),
                  ),
                ]),
        ),
      ]),
    );

    // the conversation
    String lastDay = '';
    final bubbles = <Widget>[];
    for (final m in messages) {
      final mine = m['fromId'] == me.userId;
      final day = chat.dayLabel('${m['date']}');
      if (day != lastDay) {
        lastDay = day;
        bubbles.add(Center(child: Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Chip(label: Text(day), visualDensity: VisualDensity.compact))));
      }
      final key = _keys.putIfAbsent('${m['id']}', GlobalKey.new);
      if (m['call'] is Map) {
        final missed = (m['call'] as Map)['status'] != 'done';
        bubbles.add(Center(
          key: key,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(missed && !mine ? Icons.phone_missed : mine ? Icons.call_made : Icons.call, size: 15, color: missed && !mine ? Theme.of(context).colorScheme.error : null),
              const SizedBox(width: 6),
              Text(mine ? (missed ? 'You called · no answer' : chat.callText(m['call'] as Map)) : chat.callText(m['call'] as Map)),
              const SizedBox(width: 6),
              Text(_time('${m['date']}'), style: Theme.of(context).textTheme.labelSmall),
            ]),
          ),
        ));
        continue;
      }
      final ms = marks['${m['id']}'] ?? const [];
      final reacts = ms.where((k) => '${k['emoji'] ?? ''}'.isNotEmpty).toList();
      final groups = {for (final k in reacts) '${k['emoji']}'}.toList();
      final seen = mine && client == null ? seenBy(m) : const <Map<String, Object?>>[];
      final allSeen = conv == 'team' ? seen.isNotEmpty && seen.length >= staff.length : seen.isNotEmpty;
      final channel = '${m['channel'] ?? 'team'}';
      final deleted = m['deleted'] == true;
      final att = m['attachment'] is Map ? (m['attachment'] as Map).cast<String, Object?>() : null;
      final text = '${m['text'] ?? ''}';
      final scheme = Theme.of(context).colorScheme;
      final pinned = pins.any((p) => p['msgId'] == m['id']);
      bubbles.add(Align(
        key: key,
        alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: GestureDetector(
            onLongPress: () => _menu(m, me, pins, myMark(m), client != null),
            onSecondaryTap: () => _menu(m, me, pins, myMark(m), client != null),
            onHorizontalDragEnd: (d) {
              if (!deleted && client == null && (d.primaryVelocity ?? 0) > 300) _startReply(m);
            },
            child: Card(
              color: _flash == m['id']
                  ? scheme.tertiaryContainer
                  : channel == 'reply'
                      ? scheme.secondaryContainer
                      : mine
                          ? scheme.primaryContainer
                          : null,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 6, 4, 6),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    Flexible(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        if (!mine && peer == null) Text('${m['fromName']}', style: TextStyle(fontWeight: FontWeight.w700, color: scheme.primary, fontSize: 12)),
                        if (m['forwarded'] == true && !deleted)
                          const Row(mainAxisSize: MainAxisSize.min, children: [Icon(Icons.forward, size: 12), SizedBox(width: 4), Text('Forwarded', style: TextStyle(fontSize: 11, fontStyle: FontStyle.italic))]),
                        if (m['replyTo'] is Map && !deleted)
                          InkWell(
                            onTap: () => _jumpTo('${(m['replyTo'] as Map)['id']}'),
                            child: Container(
                              margin: const EdgeInsets.symmetric(vertical: 4),
                              padding: const EdgeInsets.all(6),
                              decoration: BoxDecoration(border: Border(left: BorderSide(color: scheme.primary, width: 3)), color: scheme.surfaceContainerHighest),
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text('${(m['replyTo'] as Map)['fromName']}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
                                Text('${(m['replyTo'] as Map)['text']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12)),
                              ]),
                            ),
                          ),
                        if (deleted)
                          Row(mainAxisSize: MainAxisSize.min, children: [
                            const Icon(Icons.delete_outline, size: 13),
                            const SizedBox(width: 4),
                            Text(mine ? 'You deleted this message' : 'This message was deleted', style: const TextStyle(fontStyle: FontStyle.italic)),
                          ])
                        else ...[
                          if (att != null) _Attachment(att),
                          if (text.isNotEmpty && !(att?['voice'] == true && text == 'Voice note')) _highlight(text, _find),
                        ],
                      ]),
                    ),
                    IconButton(
                      tooltip: 'Message options',
                      visualDensity: VisualDensity.compact,
                      iconSize: 16,
                      onPressed: () => _menu(m, me, pins, myMark(m), client != null),
                      icon: const Icon(Icons.more_vert),
                    ),
                  ]),
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    if (myMark(m)?['star'] == true) const Icon(Icons.star, size: 11, color: Colors.amber),
                    if (pinned) const Icon(Icons.push_pin, size: 11),
                    Text(
                      '${channel == 'whatsapp' ? 'WhatsApp · ' : channel == 'sms' ? 'SMS · ' : channel == 'reply' ? 'client reply · ' : ''}'
                      '${mine && client != null ? 'by ${m['fromName']} · ' : ''}${m['editedAt'] != null && !deleted ? 'edited · ' : ''}${_time('${m['date']}')}',
                      style: Theme.of(context).textTheme.labelSmall,
                    ),
                    if (mine && client == null && !deleted)
                      Padding(
                        padding: const EdgeInsets.only(left: 4),
                        child: Icon(
                          seen.isNotEmpty ? Icons.done_all : Icons.check,
                          size: 14,
                          color: allSeen ? Colors.blue : null,
                          semanticLabel: allSeen ? 'Read' : seen.isNotEmpty ? 'Read by some' : 'Sent',
                        ),
                      ),
                  ]),
                  if (groups.isNotEmpty)
                    InkWell(
                      onTap: () => _info(m, me, users, marks),
                      child: Tooltip(
                        message: reacts.map((k) => '${k['userName'] ?? 'Someone'} ${k['emoji']}').join(', '),
                        child: Text('${groups.join()}${reacts.length > 1 ? ' ${reacts.length}' : ''}'),
                      ),
                    ),
                ]),
              ),
            ),
          ),
        ),
      ));
    }

    Widget? pinnedBar;
    if (pins.isNotEmpty && _find == null) {
      final pm = rows.where((m) => m['id'] == pins.first['msgId']).firstOrNull;
      if (pm != null) {
        pinnedBar = ListTile(
          dense: true,
          leading: const Icon(Icons.push_pin, size: 16),
          title: Text('${pins.length > 1 ? '${pins.length} pinned' : 'Pinned'} · ${chat.messagePreview(pm).characters.take(90)}', maxLines: 1, overflow: TextOverflow.ellipsis),
          trailing: Text('by ${pins.first['by']}', style: Theme.of(context).textTheme.labelSmall),
          onTap: () => _jumpTo('${pm['id']}'),
        );
      }
    }

    final main = Card(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        ListTile(
          leading: Row(mainAxisSize: MainAxisSize.min, children: [
            if (MediaQuery.sizeOf(context).width < 760) IconButton(tooltip: 'Back to chats', onPressed: () => setState(() => _opened = false), icon: const Icon(Icons.chevron_left)),
            client != null ? const Icon(Icons.people_outline) : conv == 'team' ? const CircleAvatar(radius: 16, child: Icon(Icons.tag, size: 16)) : CircleAvatar(radius: 16, child: Text(_initials(title), style: const TextStyle(fontSize: 12))),
          ]),
          title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Text(subtitle),
          trailing: Row(mainAxisSize: MainAxisSize.min, children: [
            if (client == null)
              IconButton(tooltip: 'Search this chat', isSelected: _find != null, onPressed: () => setState(() => _find = _find == null ? '' : null), icon: const Icon(Icons.search)),
            IconButton(tooltip: 'Starred messages', isSelected: _starredOnly, onPressed: () => setState(() => _starredOnly = !_starredOnly), icon: const Icon(Icons.star_border), selectedIcon: const Icon(Icons.star)),
            if (client != null && phone.length >= 12) IconButton(tooltip: 'Phone ${client['name']}', onPressed: () => launchUrl(Uri.parse('tel:+$phone')), icon: const Icon(Icons.phone)),
          ]),
        ),
        if (_find != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Row(children: [
              Expanded(
                child: TextField(
                  key: const ValueKey('chat-find'),
                  autofocus: true,
                  decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: 'Search messages…', isDense: true, suffixText: _find!.isEmpty ? null : '${messages.length} found'),
                  onChanged: (v) => setState(() => _find = v),
                ),
              ),
              IconButton(tooltip: 'Close search', onPressed: () => setState(() => _find = null), icon: const Icon(Icons.close)),
            ]),
          ),
        ?pinnedBar,
        const Divider(height: 1),
        Expanded(
          child: Stack(children: [
            messages.isEmpty
                ? EmptyState(_find != null || _starredOnly
                    ? (_find != null ? 'Nothing matches that search' : 'No starred messages here yet. Open a message’s menu and tap Star to keep it handy.')
                    : client != null
                        ? 'No messages with this client yet'
                        : peer != null
                            ? 'Say hi to ${'${peer['name']}'.split(' ').first}'
                            : 'Nothing here yet. Start the conversation.')
                : SingleChildScrollView(
                    controller: _scroll,
                    reverse: true,
                    padding: const EdgeInsets.all(8),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: bubbles),
                  ),
            if (!_atBottom)
              Positioned(
                right: 12,
                bottom: 12,
                child: FloatingActionButton.small(
                  heroTag: 'chat-down',
                  tooltip: 'Go to the newest message',
                  onPressed: () => _scroll.animateTo(0, duration: const Duration(milliseconds: 250), curve: Curves.easeOut),
                  child: const Icon(Icons.keyboard_arrow_down),
                ),
              ),
          ]),
        ),
        const Divider(height: 1),
        if (client != null) _clientCompose(client, phone, smsReady, me) else _teamCompose(me, peer),
      ]),
    );

    final wide = MediaQuery.sizeOf(context).width >= 760;
    return PageFrame(
      title: 'Chat',
      subtitle: 'Team messages sync to every device. Messages to clients go out on WhatsApp or SMS.',
      child: wide
          ? Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [SizedBox(width: 300, child: list), Expanded(child: main)])
          : (_opened ? main : list),
    );
  }

  Widget _highlight(String text, String? f) {
    final i = f == null || f.isEmpty ? -1 : text.toLowerCase().indexOf(f.toLowerCase());
    if (i < 0) return SelectableText(text);
    return Text.rich(TextSpan(children: [
      TextSpan(text: text.substring(0, i)),
      TextSpan(text: text.substring(i, i + f!.length), style: const TextStyle(backgroundColor: Colors.yellow, color: Colors.black)),
      TextSpan(text: text.substring(i + f.length)),
    ]));
  }

  // ---------------------------------------------------------------- composing

  Future<void> _log(Map<String, Object?> msg, Session me, {String? conv}) async {
    final branch = (await ref.read(pharmacyProvider.future)).branch;
    await chat.postMessage(_store, conv: conv ?? _conv, userId: me.userId, userName: me.userName, branchId: branch, extra: msg);
    _syncSoon();
  }

  Map<String, Object?> _replyPart(Session me) => _replyTo == null ? const {} : {'replyTo': chat.quoteOf(_replyTo!, me.userId)};

  Future<void> _sendTeam(Session me) async {
    final t = _text.text.trim();
    if (t.isEmpty) return;
    if (_editing case final e?) {
      await chat.editMessage(_store, e, t);
      setState(() {
        _editing = null;
        _text.clear();
      });
      _syncSoon();
      return;
    }
    final reply = _replyPart(me);
    _text.clear();
    setState(() => _replyTo = null);
    await _log({'text': t, 'channel': 'team', ...reply}, me);
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  Future<void> _sendFiles(Session me, List<({String name, List<int> bytes})> files, {Map<String, Object?> extra = const {}}) async {
    final api = ref.read(cloudApiProvider);
    for (final f in files) {
      try {
        setState(() => _uploading = (name: f.name, p: 0));
        final a = await uploadFile(api, f.bytes is Uint8List ? f.bytes as Uint8List : Uint8List.fromList(f.bytes), f.name, onProgress: (p) {
          if (mounted) setState(() => _uploading = (name: f.name, p: p));
        });
        final t = _text.text.trim();
        await _log({'text': t.isNotEmpty ? t : (extra['voice'] == true ? 'Voice note' : ''), 'channel': 'team', 'attachment': {...a, ...extra}, ..._replyPart(me)}, me);
        _text.clear();
        if (mounted) setState(() => _replyTo = null);
      } catch (e) {
        if (mounted) say(context, '$e'.replaceFirst('Exception: ', ''));
      }
    }
    if (mounted) setState(() => _uploading = null);
  }

  void _cancelCtx() => setState(() {
        _replyTo = null;
        if (_editing != null) {
          _editing = null;
          _text.clear();
        }
      });

  Widget _teamCompose(Session me, Map<String, Object?>? peer) {
    final ctx = _editing ?? _replyTo;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (_uploading case final u?)
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 6, 12, 0),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Sending ${u.name}… ${(u.p * 100).round()}%'), LinearProgressIndicator(value: u.p)]),
        ),
      if (ctx != null)
        ListTile(
          dense: true,
          leading: Icon(_editing != null ? Icons.edit : Icons.reply),
          title: Text(_editing != null ? 'Editing' : 'Replying to ${ctx['fromId'] == me.userId ? 'yourself' : ctx['fromName']}', style: const TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Text(chat.messagePreview(ctx).characters.take(120).toString(), maxLines: 1, overflow: TextOverflow.ellipsis),
          trailing: IconButton(tooltip: 'Cancel', onPressed: _cancelCtx, icon: const Icon(Icons.close)),
        ),
      if (_recording)
        _VoiceRecorder(
          onCancel: (msg) {
            setState(() => _recording = false);
            if (msg != null) say(context, msg);
          },
          onSend: (bytes, secs) {
            setState(() => _recording = false);
            final stamp = DateTime.now().toIso8601String().substring(0, 16).replaceAll(RegExp('[:T-]'), '');
            _sendFiles(me, [(name: 'voice-note-$stamp.m4a', bytes: bytes)], extra: {'voice': true, 'duration': secs});
          },
        )
      else
        Padding(
          padding: const EdgeInsets.all(8),
          child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            if (_editing == null)
              IconButton(
                tooltip: 'Attach a photo, PDF, video, audio or spreadsheet (up to 15 MB)',
                onPressed: _uploading != null
                    ? null
                    : () async {
                        final fs = await pickFiles(extensions: _attachTypes);
                        if (fs.isNotEmpty) await _sendFiles(me, [for (final f in fs) (name: f.name, bytes: f.bytes)]);
                      },
                icon: const Icon(Icons.attach_file),
              ),
            Expanded(
              child: CallbackShortcuts(
                bindings: {
                  const SingleActivator(LogicalKeyboardKey.enter): () => _sendTeam(me),
                  const SingleActivator(LogicalKeyboardKey.escape): _cancelCtx,
                },
                child: TextField(
                  key: const ValueKey('chat-input'),
                  controller: _text,
                  focusNode: _input,
                  minLines: 1,
                  maxLines: 5,
                  decoration: InputDecoration(hintText: _editing != null ? 'Edit your message' : peer != null ? 'Message ${'${peer['name']}'.split(' ').first}' : 'Message the team'),
                  onSubmitted: (_) => _sendTeam(me),
                ),
              ),
            ),
            const SizedBox(width: 6),
            if (_text.text.trim().isNotEmpty || _editing != null)
              IconButton.filled(tooltip: _editing != null ? 'Save' : 'Send', onPressed: () => _sendTeam(me), icon: Icon(_editing != null ? Icons.check : Icons.send))
            else
              IconButton.filled(tooltip: 'Record a voice note', onPressed: _uploading != null ? null : () => setState(() => _recording = true), icon: const Icon(Icons.mic)),
          ]),
        ),
    ]);
  }

  Widget _clientCompose(Map<String, Object?> client, String phone, bool smsReady, Session me) {
    final t = _text.text.trim();
    return Padding(
      padding: const EdgeInsets.all(8),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        TextField(key: const ValueKey('chat-input'), controller: _text, minLines: 2, maxLines: 4, decoration: InputDecoration(hintText: 'Message to ${client['name']}…')),
        const SizedBox(height: 6),
        Wrap(spacing: 8, runSpacing: 6, children: [
          FilledButton.icon(
            onPressed: phone.length < 12 || t.isEmpty
                ? null
                : () async {
                    await launchUrl(Uri.parse(whatsappLink(phone, t)), mode: LaunchMode.externalApplication);
                    _text.clear();
                    await _log({'text': t, 'channel': 'whatsapp', 'to': client['name']}, me);
                  },
            icon: const Icon(Icons.chat),
            label: const Text('WhatsApp'),
          ),
          Tooltip(
            message: smsReady ? '' : 'SMS is not set up yet',
            child: OutlinedButton.icon(
              onPressed: !smsReady || phone.length < 12 || t.isEmpty
                  ? null
                  : () async {
                      try {
                        await ref.read(cloudApiProvider).sendSms([phone], t);
                        _text.clear();
                        await _log({'text': t, 'channel': 'sms', 'to': client['name']}, me);
                        if (mounted) say(context, 'SMS sent');
                      } catch (e) {
                        if (mounted) say(context, '$e'.replaceFirst('Exception: ', ''));
                      }
                    },
              icon: const Icon(Icons.sms_outlined),
              label: const Text('SMS'),
            ),
          ),
          Tooltip(
            message: "Paste the client's WhatsApp/SMS reply to keep the history together",
            child: OutlinedButton.icon(
              onPressed: t.isEmpty
                  ? null
                  : () async {
                      _text.clear();
                      await _log({'text': t, 'channel': 'reply', 'fromName': client['name'], 'fromId': 'client:${client['id']}'}, me);
                    },
              icon: const Icon(Icons.edit_note),
              label: const Text('Record their reply'),
            ),
          ),
        ]),
      ]),
    );
  }

  // ---------------------------------------------------------------- message actions

  void _startReply(Map<String, Object?> m) {
    setState(() {
      _replyTo = m;
      _editing = null;
    });
    _input.requestFocus();
  }

  void _jumpTo(String id) {
    setState(() {
      _find = null;
      _starredOnly = false;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final c = _keys[id]?.currentContext;
      if (c == null) return;
      Scrollable.ensureVisible(c, alignment: 0.5, duration: const Duration(milliseconds: 300));
      setState(() => _flash = id);
      Future.delayed(const Duration(milliseconds: 1600), () {
        if (mounted) setState(() => _flash = '');
      });
    });
  }

  Future<void> _hideForMe(Map<String, Object?> m) async {
    final n = ref.read(deviceValueProvider('chat-hidden').notifier);
    await n.set(jsonEncode([..._hiddenSet(ref.read(deviceValueProvider('chat-hidden')).value), '${m['id']}']));
  }

  Future<void> _remove(Map<String, Object?> m, Session me) async {
    final mine = m['fromId'] == me.userId && m['call'] == null;
    if (mine && chat.ageHours(m) < chat.unsendHours && m['deleted'] != true) {
      final choice = await showDialog<String>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('Delete message?'),
          content: const Text('Delete it for everyone, or only hide it on this device?'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel')),
            TextButton(onPressed: () => Navigator.pop(c, 'me'), child: const Text('Delete for me')),
            FilledButton(style: FilledButton.styleFrom(backgroundColor: Theme.of(c).colorScheme.error), onPressed: () => Navigator.pop(c, 'all'), child: const Text('Delete for everyone')),
          ],
        ),
      );
      if (choice == 'all') {
        await chat.unsend(_store, m);
        _syncSoon();
      } else if (choice == 'me') {
        await _hideForMe(m);
      }
      return;
    }
    if (!mounted) return;
    if (await confirmAction(context, 'Delete for you?', 'It disappears from this device only. Others will still see it.', 'Delete for me')) await _hideForMe(m);
  }

  Future<void> _menu(Map<String, Object?> m, Session me, List<Map<String, Object?>> pins, Map<String, Object?>? my, bool isClient) async {
    final mine = m['fromId'] == me.userId, deleted = m['deleted'] == true;
    final pinned = pins.any((p) => p['msgId'] == m['id']);
    final text = '${m['text'] ?? ''}';
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (c) => SafeArea(
        child: ListView(shrinkWrap: true, children: [
          Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 8), child: Text(chat.messagePreview(m).characters.take(120).toString(), maxLines: 2, overflow: TextOverflow.ellipsis)),
          if (!deleted && !isClient)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Wrap(spacing: 4, children: [
                for (final r in chat.reactions)
                  ChoiceChip(label: Text(r, style: const TextStyle(fontSize: 20)), selected: my?['emoji'] == r, tooltip: 'React $r', onSelected: (_) => Navigator.pop(c, 'react:$r')),
              ]),
            ),
          if (!deleted && !isClient) ListTile(leading: const Icon(Icons.reply), title: const Text('Reply'), onTap: () => Navigator.pop(c, 'reply')),
          if (!deleted && text.isNotEmpty) ListTile(leading: const Icon(Icons.copy), title: const Text('Copy'), onTap: () => Navigator.pop(c, 'copy')),
          if (!deleted && !isClient) ListTile(leading: const Icon(Icons.forward), title: const Text('Forward'), onTap: () => Navigator.pop(c, 'forward')),
          if (!deleted)
            ListTile(leading: Icon(pinned ? Icons.push_pin_outlined : Icons.push_pin), title: Text(pinned ? 'Unpin' : 'Pin'), onTap: () => Navigator.pop(c, 'pin')),
          if (!deleted) ListTile(leading: const Icon(Icons.star_border), title: Text(my?['star'] == true ? 'Unstar' : 'Star'), onTap: () => Navigator.pop(c, 'star')),
          if (mine && !deleted && text.isNotEmpty && m['attachment'] == null && !isClient && chat.ageHours(m) < chat.editHours)
            ListTile(leading: const Icon(Icons.edit), title: const Text('Edit'), onTap: () => Navigator.pop(c, 'edit')),
          if (!isClient) ListTile(leading: const Icon(Icons.info_outline), title: const Text('Info'), onTap: () => Navigator.pop(c, 'info')),
          ListTile(
            leading: Icon(Icons.delete_outline, color: Theme.of(c).colorScheme.error),
            title: Text('Delete', style: TextStyle(color: Theme.of(c).colorScheme.error)),
            onTap: () => Navigator.pop(c, 'delete'),
          ),
        ]),
      ),
    );
    if (action == null || !mounted) return;
    final store = _store;
    switch (action) {
      case final a when a.startsWith('react:'):
        final e = a.substring(6);
        await chat.mark(store, m, {'emoji': my?['emoji'] == e ? '' : e}, userId: me.userId, userName: me.userName);
      case 'reply':
        _startReply(m);
      case 'copy':
        await Clipboard.setData(ClipboardData(text: text.isNotEmpty ? text : chat.messagePreview(m)));
        if (mounted) say(context, 'Copied');
      case 'forward':
        await _forward(m, me);
      case 'pin':
        await chat.togglePin(store, m, by: me.userName);
      case 'star':
        final on = my?['star'] != true;
        await chat.mark(store, m, {'star': on}, userId: me.userId, userName: me.userName);
        if (mounted) say(context, on ? 'Starred. Find it under ☆ at the top' : 'Star removed');
      case 'edit':
        setState(() {
          _editing = m;
          _replyTo = null;
          _text.text = text;
        });
        _input.requestFocus();
      case 'info':
        final users = await store.rows('users');
        final marks = <String, List<Map<String, Object?>>>{'${m['id']}': (await store.rows('chatMarks')).where((k) => k['msgId'] == m['id']).toList()};
        if (mounted) await _info(m, me, users, marks);
      case 'delete':
        await _remove(m, me);
    }
  }

  Future<void> _forward(Map<String, Object?> m, Session me) async {
    final users = (await _store.rows('users')).where((u) => u['id'] != me.userId && u['disabled'] != true).toList()..sort((a, b) => '${a['name']}'.compareTo('${b['name']}'));
    if (!mounted) return;
    final opts = [('team', 'General (whole team)'), for (final u in users) (chat.dmId(me.userId, '${u['id']}'), '${u['name']}')];
    final pick = <String>{};
    final targets = await showDialog<Set<String>>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, set) => AlertDialog(
          title: const Text('Forward to…'),
          content: SizedBox(
            width: 380,
            child: ListView(shrinkWrap: true, children: [
              Text(chat.messagePreview(m).characters.take(160).toString(), style: Theme.of(c).textTheme.bodySmall),
              for (final (id, name) in opts)
                CheckboxListTile(
                  value: pick.contains(id),
                  secondary: Icon(id == 'team' ? Icons.tag : Icons.person_outline),
                  title: Text(name),
                  onChanged: (v) => set(() => v == true ? pick.add(id) : pick.remove(id)),
                ),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel')),
            FilledButton.icon(onPressed: pick.isEmpty ? null : () => Navigator.pop(c, pick), icon: const Icon(Icons.forward), label: Text('Forward${pick.length > 1 ? ' to ${pick.length}' : ''}')),
          ],
        ),
      ),
    );
    if (targets == null || targets.isEmpty) return;
    for (final c in targets) {
      await _log({'text': m['text'], 'channel': 'team', 'forwarded': true, if (m['attachment'] != null) 'attachment': m['attachment']}, me, conv: c);
    }
    if (mounted) say(context, 'Forwarded to ${targets.length} chat${targets.length > 1 ? 's' : ''}');
  }

  Future<void> _info(Map<String, Object?> m, Session me, List<Map<String, Object?>> users, Map<String, List<Map<String, Object?>>> marks) async {
    final reads = (await _store.rows('chatReads')).where((r) => r['conv'] == m['conv'] && r['userId'] != me.userId && '${r['at']}'.compareTo('${m['date']}') >= 0).toList();
    final reacts = (marks['${m['id']}'] ?? const []).where((k) => '${k['emoji'] ?? ''}'.isNotEmpty).toList();
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Message info'),
        content: SizedBox(
          width: 380,
          child: ListView(shrinkWrap: true, children: [
            Text(chat.messagePreview(m).characters.take(200).toString(), style: Theme.of(c).textTheme.bodySmall),
            const SizedBox(height: 8),
            Text('Sent ${_when('${m['date']}')} by ${m['fromName']}${m['editedAt'] != null ? ' · edited ${_when('${m['editedAt']}')}' : ''}'),
            if (m['fromId'] == me.userId) ...[
              const SizedBox(height: 12),
              const Row(children: [Icon(Icons.done_all, size: 15, color: Colors.blue), SizedBox(width: 4), Text('Read by', style: TextStyle(fontWeight: FontWeight.w700))]),
              for (final r in reads) Text('• ${users.where((u) => u['id'] == r['userId']).firstOrNull?['name'] ?? 'Colleague'}'),
              if (reads.isEmpty) const Text('Nobody yet'),
            ],
            if (reacts.isNotEmpty) ...[
              const SizedBox(height: 12),
              const Text('Reactions', style: TextStyle(fontWeight: FontWeight.w700)),
              for (final k in reacts) Text('${k['emoji']} ${k['userId'] == me.userId ? 'You' : k['userName']}'),
            ],
          ]),
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('Close'))],
      ),
    );
  }
}

/// An attachment inside a bubble: a photo, a voice note / audio player, or a file to open.
class _Attachment extends ConsumerWidget {
  const _Attachment(this.a);
  final Map<String, Object?> a;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final url = safeFileUrl(ref.watch(cloudApiProvider), '${a['path'] ?? ''}');
    final type = '${a['type'] ?? ''}', name = '${a['name'] ?? 'Attachment'}';
    if (url == null || '${a['path'] ?? ''}'.isEmpty) return Text('$name (can’t be shown)', style: const TextStyle(fontStyle: FontStyle.italic));
    void open() => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (type.startsWith('image/')) {
      return InkWell(
        onTap: open,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: Image.network(url, height: 220, fit: BoxFit.cover, errorBuilder: (_, _, _) => Text('📷 $name')),
        ),
      );
    }
    if (type.startsWith('audio/')) return _AudioPlayer(url: url, voice: a['voice'] == true, secs: (a['duration'] as num?)?.round());
    final icon = RegExp('sheet|excel|csv|spreadsheet').hasMatch(type)
        ? Icons.table_chart_outlined
        : RegExp('pdf|word|document|presentation').hasMatch(type)
            ? Icons.description_outlined
            : type.startsWith('video/')
                ? Icons.movie_outlined
                : Icons.insert_drive_file_outlined;
    return InkWell(
      onTap: open,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 26),
          const SizedBox(width: 8),
          Flexible(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(name, style: const TextStyle(fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis),
              Text(fileSize((a['size'] as num?) ?? 0), style: Theme.of(context).textTheme.labelSmall),
            ]),
          ),
          const SizedBox(width: 8),
          const Icon(Icons.download, size: 16),
        ]),
      ),
    );
  }
}

class _AudioPlayer extends StatefulWidget {
  const _AudioPlayer({this.url, this.file, this.voice = false, this.secs});
  final String? url, file;
  final bool voice;
  final int? secs;
  @override
  State<_AudioPlayer> createState() => _AudioPlayerState();
}

class _AudioPlayerState extends State<_AudioPlayer> {
  AudioPlayer? _player;
  bool _playing = false;
  Duration _pos = Duration.zero, _len = Duration.zero;
  final _subs = <StreamSubscription<Object?>>[];

  AudioPlayer _ready() {
    if (_player case final p?) return p;
    final p = _player = AudioPlayer();
    _subs
      ..add(p.onPositionChanged.listen((d) => mounted ? setState(() => _pos = d) : null))
      ..add(p.onDurationChanged.listen((d) => mounted ? setState(() => _len = d) : null))
      ..add(p.onPlayerComplete.listen((_) => mounted ? setState(() {
            _playing = false;
            _pos = Duration.zero;
          }) : null));
    return p;
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    _player?.dispose();
    super.dispose();
  }

  Future<void> _toggle() async {
    final p = _ready();
    try {
      if (_playing) {
        await p.pause();
      } else if (_pos > Duration.zero) {
        await p.resume();
      } else {
        await p.play(widget.file != null ? DeviceFileSource(widget.file!) : UrlSource(widget.url!));
      }
      if (mounted) setState(() => _playing = !_playing);
    } catch (_) {
      if (mounted && widget.url != null) await launchUrl(Uri.parse(widget.url!), mode: LaunchMode.externalApplication);
    }
  }

  String _fmt(Duration d) => '${d.inMinutes}:${(d.inSeconds % 60).toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final total = _len > Duration.zero ? _len : Duration(seconds: widget.secs ?? 0);
    return SizedBox(
      width: 240,
      child: Row(children: [
        if (widget.voice) const Icon(Icons.mic, size: 14),
        IconButton(tooltip: _playing ? 'Pause' : 'Play', onPressed: _toggle, icon: Icon(_playing ? Icons.pause : Icons.play_arrow)),
        Expanded(child: LinearProgressIndicator(value: total.inMilliseconds == 0 ? 0 : (_pos.inMilliseconds / total.inMilliseconds).clamp(0, 1))),
        const SizedBox(width: 6),
        Text(_fmt(_playing || _pos > Duration.zero ? _pos : total), style: Theme.of(context).textTheme.labelSmall),
      ]),
    );
  }
}

/// Record a voice note (up to 3 minutes, AAC .m4a), listen to it, then send or discard.
class _VoiceRecorder extends StatefulWidget {
  const _VoiceRecorder({required this.onSend, required this.onCancel});
  final void Function(Uint8List bytes, int secs) onSend;
  final void Function(String? message) onCancel;
  @override
  State<_VoiceRecorder> createState() => _VoiceRecorderState();
}

class _VoiceRecorderState extends State<_VoiceRecorder> {
  final _rec = AudioRecorder();
  String _state = 'starting'; // recording | ready
  String? _path;
  int _secs = 0;
  DateTime _start = DateTime.now();
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _begin();
  }

  Future<void> _begin() async {
    try {
      if (!await _rec.hasPermission()) {
        widget.onCancel('Allow the microphone to record voice notes.');
        return;
      }
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}/voice-${DateTime.now().millisecondsSinceEpoch}.m4a';
      await _rec.start(const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 32000, numChannels: 1, echoCancel: true, noiseSuppress: true), path: path);
      _start = DateTime.now();
      if (!mounted) return;
      setState(() => _state = 'recording');
      _tick = Timer.periodic(const Duration(milliseconds: 250), (_) {
        final s = DateTime.now().difference(_start).inSeconds;
        if (s != _secs && mounted) setState(() => _secs = s);
        if (s >= 180) _stop();
      });
    } catch (_) {
      widget.onCancel('Allow the microphone to record voice notes.');
    }
  }

  Future<void> _stop() async {
    _tick?.cancel();
    if (_state != 'recording') return;
    final p = await _rec.stop();
    if (mounted) {
      setState(() {
        _path = p;
        _state = 'ready';
      });
    }
  }

  @override
  void dispose() {
    _tick?.cancel();
    _rec.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = '${_secs ~/ 60}:${(_secs % 60).toString().padLeft(2, '0')}';
    return Padding(
      padding: const EdgeInsets.all(8),
      child: Row(children: [
        if (_state != 'ready') ...[
          const Icon(Icons.fiber_manual_record, color: Colors.red, size: 14),
          const SizedBox(width: 6),
          Expanded(child: Text('Recording… $t')),
          TextButton.icon(onPressed: () => widget.onCancel(null), icon: const Icon(Icons.close), label: const Text('Cancel')),
          FilledButton.icon(onPressed: _stop, icon: const Icon(Icons.stop), label: const Text('Stop')),
        ] else ...[
          Expanded(child: _path == null ? const Text('Nothing was recorded') : _AudioPlayer(file: _path, secs: _secs)),
          IconButton(tooltip: 'Discard', onPressed: () => widget.onCancel(null), icon: const Icon(Icons.delete_outline)),
          FilledButton.icon(
            onPressed: _path == null
                ? null
                : () async {
                    final bytes = await File(_path!).readAsBytes();
                    widget.onSend(bytes, _secs);
                  },
            icon: const Icon(Icons.send),
            label: const Text('Send'),
          ),
        ],
      ]),
    );
  }
}
