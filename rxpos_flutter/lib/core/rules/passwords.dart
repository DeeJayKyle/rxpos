// Passwords, as the React app stores them (src/store.jsx makePassword / verifyPassword): PBKDF2-HMAC-SHA256, 100,000
// iterations, a random 16-byte salt (base64), the 32-byte result in hex. Older accounts may still have the legacy
// unsalted SHA-256 of "pharmapos:" + password. The cloud checks the same fields at sign-in.
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

String _hex(List<int> b) => b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();

/// PBKDF2 with HMAC-SHA256 (RFC 8018).
Uint8List pbkdf2Sha256(List<int> password, List<int> salt, int iterations, int length) {
  final hmac = Hmac(sha256, password);
  final out = BytesBuilder();
  for (var block = 1; out.length < length; block++) {
    var u = hmac.convert([...salt, block >> 24 & 255, block >> 16 & 255, block >> 8 & 255, block & 255]).bytes;
    final t = List<int>.of(u);
    for (var i = 1; i < iterations; i++) {
      u = hmac.convert(u).bytes;
      for (var j = 0; j < t.length; j++) {
        t[j] ^= u[j];
      }
    }
    out.add(t);
  }
  return Uint8List.fromList(out.toBytes().sublist(0, length));
}

String pbkdf2Hex(String password, String saltBase64, {int iterations = 100000}) =>
    _hex(pbkdf2Sha256(utf8.encode(password), base64.decode(saltBase64), iterations, 32));

/// The fields to store on a user record for a new or changed password.
Map<String, Object?> makePassword(String password, {Random? random}) {
  final r = random ?? Random.secure();
  final salt = base64.encode(List<int>.generate(16, (_) => r.nextInt(256)));
  return {'algo': 'pbkdf2', 'salt': salt, 'hash': pbkdf2Hex(password, salt)};
}

bool verifyPassword(Map<String, Object?> user, String password) {
  final hash = user['hash'];
  if (hash is! String || hash.isEmpty) return false;
  if (user['algo'] == 'pbkdf2') return pbkdf2Hex(password, '${user['salt']}') == hash;
  return _hex(sha256.convert(utf8.encode('pharmapos:$password')).bytes) == hash;
}
