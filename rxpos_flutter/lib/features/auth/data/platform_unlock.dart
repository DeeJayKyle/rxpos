// The system's own unlock check and secure storage (see ../domain/device_unlock.dart). Android: BiometricPrompt
// (fingerprint or face, biometrics only) and the Android Keystore. Windows: Windows Hello and the Credential Manager.
// The web gets nothing here: browsers cannot use the fingerprint reader without a server set-up (WebAuthn).
import 'package:flutter/foundation.dart' show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';

import '../domain/device_unlock.dart';

bool get _supported => !kIsWeb && (defaultTargetPlatform == TargetPlatform.android || defaultTargetPlatform == TargetPlatform.windows);

class PlatformCheck implements SystemCheck {
  PlatformCheck();
  final _auth = LocalAuthentication();

  @override
  Future<UnlockKind> kind() async {
    if (!_supported) return UnlockKind.none;
    try {
      if (!await _auth.isDeviceSupported()) return UnlockKind.none;
      if (defaultTargetPlatform == TargetPlatform.windows) return UnlockKind.windowsHello;
      // Android: only when a fingerprint or face is enrolled (not the screen lock alone)
      return (await _auth.getAvailableBiometrics()).isEmpty ? UnlockKind.none : UnlockKind.biometrics;
    } catch (_) {
      return UnlockKind.none;
    }
  }

  @override
  Future<bool> confirm(String reason) async {
    if (!_supported) return false;
    try {
      return await _auth.authenticate(
        localizedReason: reason,
        // Android: fingerprint / face only (the screen-lock PIN is the device's, not this person's); Windows Hello
        // decides its own methods (face, fingerprint or the Hello PIN of the signed-in Windows user)
        biometricOnly: defaultTargetPlatform == TargetPlatform.android,
      );
    } catch (_) {
      return false; // cancelled, locked out by the system, not enrolled …: the person uses their PIN or password
    }
  }
}

class PlatformVault implements KeyVault {
  PlatformVault();
  final _store = const FlutterSecureStorage();

  @override
  Future<String?> read(String key) => _supported ? _store.read(key: key) : Future.value(null);
  @override
  Future<void> write(String key, String value) async {
    if (!_supported) throw UnsupportedError('No secure storage on this platform');
    await _store.write(key: key, value: value);
  }

  @override
  Future<void> delete(String key) async {
    if (_supported) await _store.delete(key: key);
  }
}
