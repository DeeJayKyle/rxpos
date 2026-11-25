// Chat rules (src/pages/Chat.jsx): private chat ids, previews, unread counts, replies, reactions / stars, unsend.
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/features/chat/domain/chat.dart';

void main() {
  test('a private chat has one id whoever opens it', () {
    expect(dmId('u2', 'u1'), 'dm:u1:u2');
    expect(dmId('u1', 'u2'), dmId('u2', 'u1'));
  });

  test('previews of calls, attachments, voice notes and deleted messages', () {
    expect(messagePreview({'deleted': true, 'text': 'x'}), 'This message was deleted');
    expect(messagePreview({'call': {'status': 'done', 'secs': 75}}), '📞 Voice call · 1:15');
    expect(messagePreview({'call': {'status': 'busy'}}), '📞 Call not answered');
    expect(messagePreview({'call': {'status': 'missed'}}), '📞 Missed voice call');
    expect(messagePreview({'text': 'Voice note', 'attachment': {'voice': true, 'type': 'audio/mp4'}}), '🎤 Voice note');
    expect(messagePreview({'text': 'shelf', 'attachment': {'type': 'image/jpeg', 'name': 'a.jpg'}}), '📷 Photo: shelf');
    expect(messagePreview({'text': '', 'attachment': {'type': 'application/pdf', 'name': 'list.pdf'}}), '📎 list.pdf');
  });

  test('unread counts team and my private chats, not my own or deleted messages', () {
    final msgs = [
      {'conv': 'team', 'fromId': 'u2', 'date': '2026-01-02T10:00:00Z'},
      {'conv': 'team', 'fromId': 'u2', 'date': '2026-01-01T10:00:00Z'},
      {'conv': 'team', 'fromId': 'u1', 'date': '2026-01-03T10:00:00Z'},
      {'conv': 'dm:u1:u2', 'fromId': 'u2', 'date': '2026-01-03T10:00:00Z'},
      {'conv': 'dm:u2:u3', 'fromId': 'u2', 'date': '2026-01-03T10:00:00Z'},
      {'conv': 'team', 'fromId': 'u3', 'date': '2026-01-04T10:00:00Z', 'deleted': true},
    ];
    expect(unreadCount(msgs, 'u1', {'team': '2026-01-01T12:00:00Z'}), 2);
  });

  test('day labels', () {
    final now = DateTime(2026, 3, 10, 12);
    expect(dayLabel(DateTime(2026, 3, 10, 8).toIso8601String(), now: now), 'Today');
    expect(dayLabel(DateTime(2026, 3, 9, 23).toIso8601String(), now: now), 'Yesterday');
    expect(dayLabel(DateTime(2026, 3, 6).toIso8601String(), now: now), 'Friday');
    expect(dayLabel(DateTime(2026, 1, 6).toIso8601String(), now: now), '6 Jan');
    expect(dayLabel(DateTime(2025, 1, 6).toIso8601String(), now: now), '6 Jan 2025');
  });

  test('a reply quotes "You" for my own message and keeps 140 characters', () {
    final q = quoteOf({'id': 'm1', 'fromId': 'u1', 'fromName': 'Tia', 'text': 'x' * 200}, 'u1');
    expect(q['fromName'], 'You');
    expect((q['text']! as String).length, 140);
  });

  test('reactions and stars share one mark that goes when empty; unsend clears the content', () async {
    final db = AppDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    final store = RecordStore(db);
    final m = await postMessage(store, conv: 'team', userId: 'u1', userName: 'Tia', branchId: 'main', extra: {'text': 'hi', 'channel': 'team', 'attachment': {'path': 'p'}});
    await mark(store, m, {'emoji': '👍'}, userId: 'u1', userName: 'Tia');
    await mark(store, m, {'star': true}, userId: 'u1', userName: 'Tia');
    expect((await store.rows('chatMarks')).single, containsPair('emoji', '👍'));
    await mark(store, m, {'emoji': ''}, userId: 'u1', userName: 'Tia');
    expect((await store.rows('chatMarks')).single['star'], true);
    await mark(store, m, {'star': false}, userId: 'u1', userName: 'Tia');
    expect(await store.rows('chatMarks'), isEmpty);

    await togglePin(store, m, by: 'Tia');
    expect((await store.rows('chatPins')).single['msgId'], m['id']);
    await togglePin(store, m, by: 'Tia');
    expect(await store.rows('chatPins'), isEmpty);

    await unsend(store, m);
    final after = await store.get('messages', '${m['id']}');
    expect(after!['deleted'], true);
    expect(after['text'], '');
    expect(after.containsKey('attachment'), isFalse);
  });
}
