// Menu counts and notifications highlight only while new (lib/core/rules/seen.dart, as src/seen.js).
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/rules/seen.dart';

void main() {
  test('a count is new until its page is opened; a higher count is new again; a fall is remembered', () {
    expect(unreadCount(42, null), 42);
    final seen = nextSeen({}, {'low': 42}, read: 'low')!;
    expect(unreadCount(42, seen['low']), 0);
    expect(unreadCount(43, seen['low']), 43);
    expect(nextSeen(seen, {'low': 30})!['low'], 30);
    expect(nextSeen(seen, {'low': 50}), isNull, reason: 'nothing to change until the page is opened');
  });
  test('an alert is new until the bell is opened; a changed text is new again', () {
    final seen = {'expiry': '22 batches expiring'};
    expect(alertUnread('expiry', '22 batches expiring', seen), isFalse);
    expect(alertUnread('expiry', '23 batches expiring', seen), isTrue);
  });
}
