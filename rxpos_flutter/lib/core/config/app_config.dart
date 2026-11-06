/// Where the RxPOS cloud lives. The Flutter app talks to the same cloud and the same sync protocol (v2) as the
/// existing React apps, so both can run side by side and no pharmacy data is migrated.
class AppConfig {
  const AppConfig({this.cloudUrl = configuredCloud});

  /// Same default as src/cloud.js DEFAULT_CLOUD in the React app.
  static const defaultCloud = 'https://rxposug.com';

  /// The cloud this build talks to: the default, unless a build sets another (--dart-define=RXPOS_CLOUD=…, the
  /// web smoke test against the cloud code run locally).
  static const configuredCloud = String.fromEnvironment('RXPOS_CLOUD', defaultValue: defaultCloud);

  final String cloudUrl;
}
