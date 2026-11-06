// Not on the web: system notifications go through the device (os_notifications.dart).
String webPermission() => 'denied';
Future<String> webAsk() async => 'denied';
void webShow(String title, String body) {}
