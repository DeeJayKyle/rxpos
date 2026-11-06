// Keeps the installed apps on the newest pilot build (src/update.js for the new apps). The cloud serves a version file
// per platform at /api/app/flutter-<windows|android>.json ({ build, label, file, size, sha256 }) and the installer it
// names (worker/index.js appFile; uploaded by .github/workflows/flutter-apps.yml). Checked 20 s after start and every
// 10 minutes; a newer build is downloaded and its checksum checked, then:
//   Windows  installed silently when nothing is in progress (no input for 90 s and nothing being typed, or the
//            window in the background), or straight away with "Update"; the installer opens the app again
//   Android  the system installer opens when the person taps "Update" (Android always asks to confirm)
// The open sale, held sales and drafts are kept on the device, so nothing is lost by the switch.
import 'dart:async';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:open_filex/open_filex.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';

import '../data/device_settings.dart';
import '../network/dio_client.dart';
import '../sync/sync_engine.dart';

/// Which installer this device takes ('windows' / 'android'); null where the app doesn't update itself (tests, other
/// systems).
final updatePlatformProvider = Provider<String?>((_) => Platform.isWindows ? 'windows' : Platform.isAndroid ? 'android' : null);

/// This app's build number (0 in a development copy, which never updates itself).
final currentBuildProvider = FutureProvider<int>((_) async => int.tryParse((await PackageInfo.fromPlatform()).buildNumber) ?? 0);

/// Where downloaded installers are kept until they are used.
final updateFolderProvider = Provider<Future<String> Function()>((_) => () async => (await getTemporaryDirectory()).path);

/// Downloads an installer (url → file), reporting progress from 0 to 1.
final updateDownloadProvider = Provider<Future<void> Function(String url, String path, void Function(double) progress)>((ref) {
  return (url, path, progress) => ref.read(dioProvider).download(url, path,
      options: Options(receiveTimeout: const Duration(minutes: 4)), onReceiveProgress: (got, total) => total > 0 ? progress(got / total) : null);
});

/// Runs an installer: Windows silently (then this app quits), Android through the system installer.
final updateInstallProvider = Provider<Future<void> Function(String platform, String path)>((_) => (platform, path) async {
      if (platform == 'windows') {
        await Process.start(path, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CLOSEAPPLICATIONS'], mode: ProcessStartMode.detached);
        exit(0);
      }
      final r = await OpenFilex.open(path, type: 'application/vnd.android.package-archive');
      if (r.type != ResultType.done) throw Exception(r.message.isEmpty ? 'The installer did not open' : r.message);
    });

/// The time, for the idle check (tests move it on).
final updateClockProvider = Provider<DateTime Function()>((_) => DateTime.now);

/// The build this device came from before its last update (shown once as "RxPOS updated").
const updatedFromKey = 'updatedFrom';

const checkEvery = Duration(minutes: 10), firstCheck = Duration(seconds: 20), idleFor = Duration(seconds: 90);

class UpdateState {
  const UpdateState({this.status = 'current', this.latest, this.percent = 0, this.error = ''});

  /// current | checking | downloading | ready | error
  final String status;
  final Map<String, Object?>? latest;
  final double percent;
  final String error;

  String get label => '${latest?['label'] ?? latest?['build'] ?? ''}';
}

class AppUpdater extends Notifier<UpdateState> {
  Timer? _first, _every, _idle;
  DateTime _lastInput = DateTime.fromMillisecondsSinceEpoch(0);
  String? _file;
  bool _applying = false, _hooked = false;
  AppLifecycleListener? _life;
  DateTime Function() _clock = DateTime.now;

  @override
  UpdateState build() {
    final platform = ref.watch(updatePlatformProvider);
    ref.onDispose(_stop);
    if (platform == null) return const UpdateState();
    _clock = ref.read(updateClockProvider);
    _lastInput = _clock();
    GestureBinding.instance.pointerRouter.addGlobalRoute(_onPointer);
    HardwareKeyboard.instance.addHandler(_onKey);
    _hooked = true;
    _first = Timer(firstCheck, check);
    _every = Timer.periodic(checkEvery, (_) => check());
    if (platform == 'windows') {
      _idle = Timer.periodic(const Duration(seconds: 15), (_) => _applyIfIdle());
      _life = AppLifecycleListener(onHide: () => _applyIfIdle(background: true), onShow: check);
    } else {
      _life = AppLifecycleListener(onShow: check);
    }
    return const UpdateState();
  }

  void _onPointer(PointerEvent e) {
    if (e is PointerDownEvent) _lastInput = _clock();
  }

  bool _onKey(KeyEvent e) {
    _lastInput = _clock();
    return false;
  }

  void _stop() {
    _first?.cancel();
    _every?.cancel();
    _idle?.cancel();
    _life?.dispose();
    if (_hooked) {
      GestureBinding.instance.pointerRouter.removeGlobalRoute(_onPointer);
      HardwareKeyboard.instance.removeHandler(_onKey);
      _hooked = false;
    }
  }

  String _url(String file) => '${syncBase(ref.read(appConfigProvider).cloudUrl)}/api/app/$file';

  /// Ask the cloud for the newest build; download it when it is newer than this one.
  Future<UpdateState> check() async {
    final platform = ref.read(updatePlatformProvider);
    if (platform == null || state.status == 'checking' || state.status == 'downloading' || state.status == 'ready') return state;
    final mine = await ref.read(currentBuildProvider.future);
    if (mine <= 0) return state;
    state = UpdateState(status: 'checking', latest: state.latest);
    try {
      final r = await ref.read(dioProvider).get<Object?>('${_url('flutter-$platform.json')}?t=${DateTime.now().millisecondsSinceEpoch}',
          options: Options(validateStatus: (_) => true, receiveTimeout: const Duration(seconds: 15)));
      final latest = r.statusCode == 200 && r.data is Map ? (r.data as Map).cast<String, Object?>() : null;
      final build = (latest?['build'] as num?)?.toInt() ?? 0;
      final file = '${latest?['file'] ?? ''}';
      if (latest == null || build <= mine || !RegExp(r'^RxPOS-New-\d+\.(exe|apk)$').hasMatch(file)) {
        return state = UpdateState(latest: latest);
      }
      state = UpdateState(status: 'downloading', latest: latest);
      final path = '${await ref.read(updateFolderProvider)()}${Platform.pathSeparator}$file';
      if (!await _good(path, latest)) {
        await ref.read(updateDownloadProvider)(_url(file), path, (p) {
          if (p > state.percent + 0.01) state = UpdateState(status: 'downloading', latest: latest, percent: p);
        });
        if (!await _good(path, latest)) {
          try {
            await File(path).delete();
          } catch (_) {}
          throw Exception('The download was damaged. It will try again by itself.');
        }
      }
      _file = path;
      return state = UpdateState(status: 'ready', latest: latest);
    } catch (e) {
      return state = UpdateState(status: 'error', latest: state.latest, error: _why(e));
    }
  }

  static String _why(Object e) {
    if (e is DioException) return 'No connection to the cloud: it will try again by itself.';
    return '$e'.replaceFirst('Exception: ', '');
  }

  Future<bool> _good(String path, Map<String, Object?> latest) async {
    final f = File(path);
    if (!await f.exists() || await f.length() != (latest['size'] as num?)?.toInt()) return false;
    return '${await sha256.bind(f.openRead()).first}' == latest['sha256'];
  }

  bool get _busy {
    final w = FocusManager.instance.primaryFocus?.context?.widget;
    return w is EditableText && w.controller.text.isNotEmpty;
  }

  void _applyIfIdle({bool background = false}) {
    if (state.status != 'ready') return;
    if (background || (_clock().difference(_lastInput) >= idleFor && !_busy)) unawaited(apply());
  }

  /// Switch to the downloaded build now ("Update"; on Windows also by itself when nothing is in progress).
  Future<void> apply() async {
    final platform = ref.read(updatePlatformProvider), file = _file;
    if (state.status != 'ready' || platform == null || file == null || _applying) return;
    _applying = true;
    try {
      await ref.read(deviceValueProvider(updatedFromKey).notifier).set('${await ref.read(currentBuildProvider.future)}');
      await ref.read(updateInstallProvider)(platform, file);
    } catch (e) {
      state = UpdateState(status: 'error', latest: state.latest, error: _why(e));
      _file = null;
    } finally {
      _applying = false;
    }
  }

  /// "Check for updates" (This device): check now, and install at once if a build is ready.
  Future<UpdateState> updateNow() async {
    if (state.status == 'error') state = UpdateState(latest: state.latest);
    if (state.status != 'ready') await check();
    if (state.status == 'ready') await apply();
    return state;
  }
}

final appUpdaterProvider = NotifierProvider<AppUpdater, UpdateState>(AppUpdater.new);

/// What This device says about updates.
String updateText(UpdateState u, String? platform) => switch (u.status) {
      _ when platform == null => 'This copy is updated by installing a new build.',
      'checking' => 'Looking for a new version…',
      'downloading' => 'Downloading version ${u.label}… ${(u.percent * 100).round()}%',
      'ready' => platform == 'android' ? 'Version ${u.label} is ready: tap Update to install it.' : 'Version ${u.label} is ready. It installs by itself when nothing is in progress, or now with Update.',
      'error' => u.error,
      _ => 'Up to date. New versions are fetched by themselves.',
    };
