// Chat (src/pages/Chat.jsx): the team's General chat, private chats between two colleagues ("dm:<a>:<b>", ids
// sorted), and client conversations ("client:<id>") whose messages go out on WhatsApp or SMS. Reactions and stars are
// one chatMarks record per message and person; pins are chatPins; "read up to" is chatReads (shared, for the ticks).
import '../../../core/data/record_store.dart';
import '../../../core/rules/ids.dart';

const reactions = ['👍', '❤️', '😂', '😮', '🙏', '✅'];
const editHours = 24, unsendHours = 48;

String dmId(String a, String b) => 'dm:${([a, b]..sort()).join(':')}';

double ageHours(Map<String, Object?> m, {DateTime? now}) {
  final d = DateTime.tryParse('${m['date']}');
  return d == null ? 0 : (now ?? DateTime.now()).toUtc().difference(d.toUtc()).inSeconds / 3600;
}

String callText(Map c) {
  final secs = (c['secs'] as num?)?.round() ?? 0;
  return c['status'] == 'done' ? 'Voice call · ${secs ~/ 60}:${(secs % 60).toString().padLeft(2, '0')}' : c['status'] == 'declined' || c['status'] == 'busy' ? 'Call not answered' : 'Missed voice call';
}

/// One line about a message, for pop-ups, replies and the pinned bar.
String messagePreview(Map<String, Object?>? m) {
  if (m == null) return '';
  if (m['deleted'] == true) return 'This message was deleted';
  if (m['call'] is Map) return '📞 ${callText(m['call'] as Map)}';
  if (m['attachment'] case final Map a) {
    final kind = a['voice'] == true ? '🎤 Voice note' : '${a['type']}'.startsWith('image/') ? '📷 Photo' : '📎 ${a['name']}';
    final t = '${m['text'] ?? ''}';
    return '$kind${t.isNotEmpty && t != 'Voice note' ? ': $t' : ''}';
  }
  return '${m['text'] ?? ''}';
}

/// "Today", "Yesterday", a weekday within the week, else a date.
String dayLabel(String iso, {DateTime? now}) {
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return '';
  final t = now ?? DateTime.now();
  final diff = DateTime(t.year, t.month, t.day).difference(DateTime(d.year, d.month, d.day)).inDays;
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (diff == 0) return 'Today';
  if (diff == 1) return 'Yesterday';
  if (diff < 7) return days[d.weekday - 1];
  return '${d.day} ${months[d.month - 1]}${d.year == t.year ? '' : ' ${d.year}'}';
}

/// Unread team / private messages for a person ([read]: conversation → read up to).
int unreadCount(Iterable<Map<String, Object?>> messages, String userId, Map<String, String> read) => messages
    .where((m) => m['fromId'] != userId && m['deleted'] != true && (m['conv'] == 'team' || ('${m['conv']}'.startsWith('dm:') && '${m['conv']}'.contains(userId))) &&
        '${m['date']}'.compareTo(read['${m['conv']}'] ?? '') > 0)
    .length;

/// What a reply carries of the message it answers.
Map<String, Object?> quoteOf(Map<String, Object?> m, String userId) {
  final p = messagePreview(m);
  return {'id': m['id'], 'fromName': m['fromId'] == userId ? 'You' : m['fromName'], 'text': p.length > 140 ? p.substring(0, 140) : p};
}

/// React with an emoji or star a message: one chatMarks record per message and person (removed when empty).
Future<void> mark(RecordStore store, Map<String, Object?> m, Map<String, Object?> patch, {required String userId, required String userName}) async {
  final id = '${m['id']}:$userId';
  final old = await store.get('chatMarks', id) ?? {'id': id, 'msgId': m['id'], 'userId': userId, 'userName': userName, 'conv': m['conv']};
  final next = {...old, ...patch};
  await store.update((d) {
    if ('${next['emoji'] ?? ''}'.isEmpty && next['star'] != true) {
      d.del('chatMarks', id);
    } else {
      d.put('chatMarks', next);
    }
  });
}

Future<void> togglePin(RecordStore store, Map<String, Object?> m, {required String by}) async {
  final id = '${m['conv']}:${m['id']}';
  final have = await store.get('chatPins', id);
  await store.update((d) => have != null ? d.del('chatPins', id) : d.put('chatPins', {'id': id, 'conv': m['conv'], 'msgId': m['id'], 'by': by, 'at': d.now}));
}

/// Delete for everyone: the message stays as "deleted" (no text, no attachment, no quote).
Future<void> unsend(RecordStore store, Map<String, Object?> m) =>
    store.update((d) => d.put('messages', {...m, 'text': '', 'deleted': true, 'deletedAt': d.now}..remove('attachment')..remove('replyTo')));

Future<void> editMessage(RecordStore store, Map<String, Object?> m, String text) => store.update((d) => d.put('messages', {...m, 'text': text, 'editedAt': d.now}));

/// A new message in a conversation.
Future<Map<String, Object?>> postMessage(RecordStore store, {required String conv, required String userId, required String userName, required String branchId,
    Map<String, Object?> extra = const {}}) => store.update((d) => d.put('messages', {'id': uid(), 'date': d.now, 'fromId': userId, 'fromName': userName, 'conv': conv, 'branchId': branchId, ...extra}));

/// My "read up to" for a conversation (shared, so colleagues see the blue ticks).
Future<void> markRead(RecordStore store, String conv, String userId, String at) =>
    store.update((d) => d.put('chatReads', {'id': '$conv:$userId', 'conv': conv, 'userId': userId, 'at': at}));
