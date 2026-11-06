// Attachment links only ever open as http(s) (src/safeurl.js, tests/unit-safeurl.mjs).
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/network/cloud_api.dart';
import 'package:rxpos/features/chat/presentation/chat_screen.dart';

void main() {
  final api = CloudApi(Dio(), 'https://rxposug.com');
  test('a file path resolves to https on the cloud; other schemes are refused', () {
    expect(safeFileUrl(api, '/api/files/t/abc/sig'), 'https://rxposug.com/api/files/t/abc/sig');
    expect(safeFileUrl(api, 'https://other.example/x'), 'https://other.example/x');
    for (final bad in ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'blob:https://x/abc', 'file:///etc/passwd', 'httpx:evil']) {
      final u = safeFileUrl(api, bad);
      expect(u == null || u.startsWith('https://rxposug.com/'), isTrue, reason: '$bad → $u');
    }
  });
}
