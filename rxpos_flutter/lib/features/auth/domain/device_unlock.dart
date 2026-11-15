// Device unlock with the operating system's own check: fingerprint / face (Android BiometricPrompt) or Windows Hello.
// RxPOS never sees or keeps biometric data: the system only answers "the person at this device passed". What RxPOS
// keeps is a random unlock key in the system's secure storage (Android Keystore, Windows Credential Manager), and a
// slow hash of that key next to the device's offline verifiers. Unlocking needs both: the system check passing, and
// the key in secure storage matching the hash.
//
// Rules (docs/SIGN-IN-AND-UNLOCK.md):
// * Set up only after a password sign-in on this device, and only after typing the password again.
// * One person per device and pharmacy: a fingerprint or Windows Hello cannot tell staff apart, so it cannot be shared.
// * Removed by: the person (password first), signing out with "forget me on this device", the account being disabled
//   or removed (when the device next syncs), a failed key check, and the 30-day offline limit (password needed again).
// * Not on the web: browsers have no access to the device's fingerprint reader without a server (WebAuthn) set-up.

/// What this device's system offers for unlocking.
enum UnlockKind { none, biometrics, windowsHello }

/// The system's own check (local_auth). Tests use a fake.
abstract class SystemCheck {
  /// What the system can check here (none on the web, or when nothing is enrolled).
  Future<UnlockKind> kind();

  /// Ask the system to check the person; true only when it passed (never throws).
  Future<bool> confirm(String reason);
}

/// The system's secure storage for the unlock keys (flutter_secure_storage). Tests use a fake.
abstract class KeyVault {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

/// A word for the method, in the person's terms.
String unlockName(UnlockKind k) => switch (k) {
      UnlockKind.biometrics => 'fingerprint or face unlock',
      UnlockKind.windowsHello => 'Windows Hello',
      UnlockKind.none => 'device unlock',
    };

/// For tests and the web: nothing to check with.
class NoSystemCheck implements SystemCheck {
  const NoSystemCheck();
  @override
  Future<UnlockKind> kind() async => UnlockKind.none;
  @override
  Future<bool> confirm(String reason) async => false;
}

/// Keys kept in memory (tests).
class MemoryVault implements KeyVault {
  final values = <String, String>{};
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String value) async => values[key] = value;
  @override
  Future<void> delete(String key) async => values.remove(key);
}
