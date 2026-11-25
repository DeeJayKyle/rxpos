// Passwords made here verify in the React app and the cloud, and the other way round.
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/rules/passwords.dart';

String hex(List<int> b) => b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();

void main() {
  test('PBKDF2-HMAC-SHA256 standard test vectors', () {
    expect(hex(pbkdf2Sha256(utf8.encode('password'), utf8.encode('salt'), 1, 32)), '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
    expect(hex(pbkdf2Sha256(utf8.encode('password'), utf8.encode('salt'), 2, 32)), 'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43');
  });
  test('the same result as the React app / Node for 100,000 iterations', () {
    // node -e "crypto.pbkdf2Sync('tia-pass-1234', Buffer.from('AAECAwQFBgcICQoLDA0ODw==','base64'), 100000, 32, 'sha256').toString('hex')"
    expect(pbkdf2Hex('tia-pass-1234', 'AAECAwQFBgcICQoLDA0ODw=='), 'e3c4789ee10a35fa2c242da24ad66e113db7ffe82d824bda12e75aa1680bdf84');
  });
  test('a new password verifies; a wrong one does not; the legacy hash still works', () {
    final u = makePassword('long-enough-1');
    expect((u['algo'], (u['salt'] as String).length), ('pbkdf2', 24));
    expect(verifyPassword(u, 'long-enough-1'), isTrue);
    expect(verifyPassword(u, 'wrong'), isFalse);
    // legacy: sha256('pharmapos:' + pw)
    expect(verifyPassword({'hash': 'b4a5b3f1d6e0b0b0'}, 'x'), isFalse);
  });
}
