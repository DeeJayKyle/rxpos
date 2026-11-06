// Notification sounds (src/notify.jsx): the same built-in tones as the React app, made here as WAV audio (sine,
// triangle or square notes with a quick rise and a soft fade), or the device's own short file for a kind of notice.
// What plays for what, the volume and on / off are this device's choice only.
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../data/device_settings.dart';

typedef Note = (double freq, double at, double len, String wave);

final tones = <String, (String, List<Note>)>{
  'duo': ('Two-note', [(1046.5, 0, .12, 'sine'), (1318.5, .1, .25, 'sine')]),
  'pop': ('Pop', [(620, 0, .07, 'triangle'), (930, .05, .12, 'triangle')]),
  'marimba': ('Marimba', [(784, 0, .35, 'triangle'), (988, .12, .35, 'triangle'), (1175, .24, .5, 'triangle')]),
  'bell': ('Bell', [(1318.5, 0, 1.2, 'sine'), (2637, 0, .5, 'sine'), (1975.5, .02, .8, 'sine')]),
  'chime': ('Soft chime', [(880, 0, .9, 'sine'), (1318.5, .18, .9, 'sine')]),
  'drop': ('Water drop', [(1400, 0, .08, 'sine'), (900, .05, .18, 'sine')]),
  'alert': ('Alert', [(880, 0, .25, 'sine'), (660, .22, .35, 'sine')]),
  'pulse': ('Pulse', [(523.3, 0, .1, 'square'), (523.3, .16, .1, 'square'), (523.3, .32, .1, 'square')]),
  'report': ('Fanfare', [(523.3, 0, .2, 'sine'), (659.3, .15, .2, 'sine'), (784, .3, .4, 'sine')]),
  'ring': ('Classic ring', [(740, 0, .35, 'sine'), (880, .38, .35, 'sine'), (740, 1.2, .35, 'sine'), (880, 1.58, .35, 'sine')]),
  'trill': ('Old phone', [
    for (var i = 0; i < 12; i++) (i.isOdd ? 1200.0 : 960.0, i * .07, .06, 'square'),
  ]),
  'ringback': ('Ringback', [(425, 0, 1, 'sine'), (440, 0, 1, 'sine')]),
};

/// kind, label, default tone
const soundKinds = [
  ('message', 'New message', 'duo'),
  ('alert', 'Stock & storage alerts', 'alert'),
  ('chime', 'Hourly reminder & greetings', 'chime'),
  ('ring', 'Incoming call', 'ring'),
  ('report', 'Weekly report', 'report'),
];

const _rate = 22050;

/// A tone as 16-bit mono WAV bytes (the React app's oscillator + gain envelope, worked out sample by sample).
Uint8List toneWav(String tone, {double volume = 0.7}) {
  final notes = (tones[tone] ?? tones['alert']!).$2;
  final end = notes.map((n) => n.$2 + n.$3 + 0.05).reduce(max);
  final samples = Float64List((end * _rate).ceil());
  for (final (f, at, len, wave) in notes) {
    final peak = (wave == 'square' ? 0.06 : 0.25) * volume + 0.0002;
    final start = (at * _rate).round(), n = ((len + 0.05) * _rate).round();
    for (var i = 0; i < n && start + i < samples.length; i++) {
      final t = i / _rate;
      // exponential rise to the peak in 15 ms, then an exponential fall to 0.0001 at [len]
      final g = t < 0.015 ? 0.0001 * pow(peak / 0.0001, t / 0.015) : t < len ? peak * pow(0.0001 / peak, (t - 0.015) / (len - 0.015)) : 0.0;
      final ph = (f * t) % 1.0;
      final s = switch (wave) { 'square' => ph < .5 ? 1.0 : -1.0, 'triangle' => 1 - 4 * (ph - .5).abs(), _ => sin(2 * pi * ph) };
      samples[start + i] += s * g;
    }
  }
  final data = ByteData(44 + samples.length * 2);
  void str(int o, String s) => [for (var i = 0; i < 4; i++) data.setUint8(o + i, s.codeUnitAt(i))];
  str(0, 'RIFF');
  data.setUint32(4, 36 + samples.length * 2, Endian.little);
  str(8, 'WAVE');
  str(12, 'fmt ');
  data
    ..setUint32(16, 16, Endian.little)
    ..setUint16(20, 1, Endian.little)
    ..setUint16(22, 1, Endian.little)
    ..setUint32(24, _rate, Endian.little)
    ..setUint32(28, _rate * 2, Endian.little)
    ..setUint16(32, 2, Endian.little)
    ..setUint16(34, 16, Endian.little);
  str(36, 'data');
  data.setUint32(40, samples.length * 2, Endian.little);
  for (var i = 0; i < samples.length; i++) {
    data.setInt16(44 + i * 2, (samples[i].clamp(-1.0, 1.0) * 32767).round(), Endian.little);
  }
  return data.buffer.asUint8List();
}

/// This device's sound choices.
class SoundPrefs {
  const SoundPrefs({this.on = true, this.volume = 0.7, this.tones = const {}, this.names = const {}});
  factory SoundPrefs.parse(String? v) {
    try {
      final j = (jsonDecode(v ?? '{}') as Map).cast<String, Object?>();
      return SoundPrefs(
        on: j['on'] != false,
        volume: (j['volume'] as num?)?.toDouble() ?? 0.7,
        tones: ((j['tones'] as Map?) ?? const {}).map((k, v) => MapEntry('$k', '$v')),
        names: ((j['names'] as Map?) ?? const {}).map((k, v) => MapEntry('$k', '$v')),
      );
    } catch (_) {
      return const SoundPrefs();
    }
  }
  final bool on;
  final double volume;
  final Map<String, String> tones, names;

  String toneFor(String kind) => tones[kind] ?? soundKinds.firstWhere((k) => k.$1 == kind, orElse: () => ('', '', 'alert')).$3;
  SoundPrefs copyWith({bool? on, double? volume, Map<String, String>? tones, Map<String, String>? names}) =>
      SoundPrefs(on: on ?? this.on, volume: volume ?? this.volume, tones: tones ?? this.tones, names: names ?? this.names);
  String encode() => jsonEncode({'on': on, 'volume': volume, 'tones': tones, 'names': names});
}

const soundPrefsKey = 'sounds';

class Sounds {
  Sounds(this._ref);
  final Ref _ref;
  AudioPlayer? _player;

  Future<SoundPrefs> prefs() async => SoundPrefs.parse(await _ref.read(deviceValueProvider(soundPrefsKey).future));

  static Future<File> customFile(String kind) async => File('${(await appSupportDir()).path}${Platform.pathSeparator}sound-$kind');

  /// Play the sound for [kind] (or try [tone]); silent when sounds are off on this device (a [tone] test always plays).
  Future<void> play(String kind, {String? tone, double? volume}) async {
    try {
      final p = await prefs();
      if (tone == null && !p.on) return;
      final choice = tone ?? p.toneFor(kind);
      final vol = (volume ?? p.volume).clamp(0.0, 1.0);
      if (choice == 'off' || vol == 0) return;
      final player = _player ??= AudioPlayer();
      await player.stop();
      if (choice == 'custom') {
        final f = await customFile(kind);
        if (await f.exists()) {
          await player.setVolume(vol);
          await player.play(DeviceFileSource(f.path));
          Future.delayed(const Duration(seconds: 4), player.stop); // long files are cut to 4 s
          return;
        }
      }
      final t = tones.containsKey(choice) ? choice : soundKinds.firstWhere((k) => k.$1 == kind, orElse: () => ('', '', 'alert')).$3;
      final f = File('${(await getTemporaryDirectory()).path}${Platform.pathSeparator}rxpos-tone-$t-${(vol * 100).round()}.wav');
      if (!await f.exists()) await f.writeAsBytes(toneWav(t, volume: vol));
      await player.setVolume(1);
      await player.play(DeviceFileSource(f.path));
    } catch (_) {
      // no audio on this device
    }
  }
}

final soundsProvider = Provider<Sounds>((ref) => Sounds(ref));

/// This app's own files folder. On Windows it is pinned to where it has always been (%APPDATA%\RxPOS\RxPOS New):
/// the folder Windows would pick follows the product name, and the app was renamed from "RxPOS New" to "RxPOS".
Future<Directory> appSupportDir() async {
  final appData = Platform.isWindows ? Platform.environment['APPDATA'] : null;
  if (appData != null && appData.isNotEmpty) return Directory('$appData\\RxPOS\\RxPOS New').create(recursive: true);
  return getApplicationSupportDirectory();
}
