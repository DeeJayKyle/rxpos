/// Where the RxPOS cloud lives. The Flutter app talks to the same cloud and the same sync protocol (v2) as the
/// existing React apps, so both can run side by side and no pharmacy data is migrated.
class AppConfig {
  const AppConfig({this.cloudUrl = defaultCloud});

  /// Same default as src/cloud.js DEFAULT_CLOUD in the React app.
  static const defaultCloud = 'https://rxposug.com';

  final String cloudUrl;
}
