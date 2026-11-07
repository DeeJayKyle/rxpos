// The website opens the app for the app's own pages (functions/flutter-routes.js); that list must name every screen.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/presentation/screens.dart';

void main() {
  test("the site's list of app pages matches the app's screens", () {
    final js = File('../functions/flutter-routes.js').readAsStringSync();
    final listed = {for (final m in RegExp(r"'([a-z-]+)'").allMatches(js.substring(js.indexOf('['))) ) m.group(1)!};
    final firsts = {for (final s in screens) if (s.path != '/') s.path.split('/')[1], 'sign-in'};
    expect(listed, firsts);
  });
}
