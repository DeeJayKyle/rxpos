// Which kind of device this is, safe on the web (where dart:io's Platform would throw).
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;

bool get onWeb => kIsWeb;
bool get onAndroid => !kIsWeb && Platform.isAndroid;
bool get onWindows => !kIsWeb && Platform.isWindows;
String get osName => kIsWeb ? 'web' : Platform.operatingSystem;
