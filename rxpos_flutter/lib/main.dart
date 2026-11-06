import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/crash/crash_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final container = ProviderContainer();
  watchErrors(container); // private crash reports to the pharmacy's cloud; a broken screen shows the recovery screen
  runApp(UncontrolledProviderScope(container: container, child: const RxposApp()));
}
