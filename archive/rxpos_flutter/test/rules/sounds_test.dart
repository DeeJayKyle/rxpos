// Built-in notification tones made as WAV audio (src/notify.jsx TONES).
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/sound/sounds.dart';

void main() {
  test('every tone is a playable 16-bit mono WAV of the right length', () {
    for (final t in tones.keys) {
      final w = toneWav(t);
      final b = ByteData.sublistView(w);
      expect(String.fromCharCodes(w.sublist(0, 4)), 'RIFF');
      expect(String.fromCharCodes(w.sublist(8, 12)), 'WAVE');
      expect(b.getUint16(22, Endian.little), 1, reason: 'mono');
      expect(b.getUint32(40, Endian.little), w.length - 44);
      var peak = 0;
      for (var i = 44; i < w.length; i += 2) {
        final v = b.getInt16(i, Endian.little).abs();
        if (v > peak) peak = v;
      }
      expect(peak, greaterThan(500), reason: '$t is audible');
    }
    final ring = toneWav('ring');
    expect((ring.length - 44) / 2 / 22050, closeTo(1.58 + .35 + .05, 0.01), reason: 'the ring lasts as long as its notes');
  });

  test('sound choices are read back with defaults', () {
    final p = SoundPrefs.parse('{"on":false,"volume":0.3,"tones":{"message":"pop"}}');
    expect(p.on, isFalse);
    expect(p.volume, 0.3);
    expect(p.toneFor('message'), 'pop');
    expect(p.toneFor('ring'), 'ring');
    expect(SoundPrefs.parse('bad').on, isTrue);
    expect(SoundPrefs.parse(p.encode()).toneFor('message'), 'pop');
  });
}
