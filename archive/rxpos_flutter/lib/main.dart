import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_web_plugins/url_strategy.dart';

import 'app.dart';
import 'core/crash/crash_screen.dart';

void main() {
  // on the web, addresses without '#' (rxposug.com/inventory), so links, reloads and the back button work
  usePathUrlStrategy();
  WidgetsFlutterBinding.ensureInitialized();
  final container = ProviderContainer();
  watchErrors(container); // private crash reports to the pharmacy's cloud; a broken screen shows the recovery screen
  runApp(UncontrolledProviderScope(container: container, child: const RxposApp()));
}
