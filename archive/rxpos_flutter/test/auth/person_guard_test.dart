// Audit P2-7, option 1 (core/network/cloud_api.dart): which cloud calls act as a person, so a borrowed sign-in confirms
// with its own password first (the same list as the classic app's `personal` calls in src/cloud.js).
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/network/cloud_api.dart';

void main() {
  test('personal: two-step sign-in, sessions, the calendar and daily stock links, sending reports and the summary', () {
    for (final p in ['/api/2fa', '/api/2fa/reset', '/api/sessions/others', '/api/sessions/end', '/api/calendar-link', '/api/daily-stock-link']) {
      expect(personalCall(p, post: true), isTrue, reason: p);
    }
    expect(personalCall('/api/reports/send', post: true), isTrue);
    expect(personalCall('/api/summary', post: true), isTrue);
  });
  test('not personal: the till keeps working (settings, Mobile Money, SMS, previews, AI)', () {
    for (final p in ['/api/config', '/api/pay/request', '/api/sms', '/api/ai/invoice']) {
      expect(personalCall(p, post: true), isFalse, reason: p);
    }
    expect(personalCall('/api/reports/send?id=x', post: false), isFalse, reason: 'a preview');
    expect(personalCall('/api/summary', post: false), isFalse, reason: 'a preview');
  });
}
