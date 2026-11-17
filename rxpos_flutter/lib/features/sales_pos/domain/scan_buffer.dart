/// A keyboard-wedge barcode scanner types a whole code in a burst (a few ms per key) and ends it with Enter; a person
/// types far slower. This collects the characters that arrive close together and hands back the code on the Enter.
/// Pure: the caller passes each key's time stamp, so it is tested without a clock.
class ScanBuffer {
  ScanBuffer({this.maxGap = const Duration(milliseconds: 30), this.minLength = 4});

  /// The longest pause between two keys of one scan (and before its Enter).
  final Duration maxGap;

  /// A shorter burst is not taken for a scan (two quick keys and Enter are a person).
  final int minLength;

  final _chars = StringBuffer();
  Duration? _last;

  /// What has been collected so far (for tests).
  String get pending => _chars.toString();

  /// One key down at [at]: a printable [character], or [enter]. Returns the scanned code when this Enter ends a fast
  /// burst of at least [minLength] characters, else null.
  /// A key with no character (Shift, which a scanner sends for capitals) is let through without breaking the burst.
  String? key({String? character, bool enter = false, required Duration at}) {
    if (!enter && (character == null || character.isEmpty)) return null;
    final last = _last;
    if (last == null || at - last > maxGap || at < last) _chars.clear(); // too slow: a new burst starts here
    _last = at;
    if (enter) {
      final code = _chars.toString();
      reset();
      return code.length >= minLength ? code : null;
    }
    if (character == null || character.length != 1 || character.codeUnitAt(0) < 0x20 || character.codeUnitAt(0) == 0x7f) {
      reset(); // a control or modifier key is not part of a code
      return null;
    }
    _chars.write(character);
    return null;
  }

  void reset() {
    _chars.clear();
    _last = null;
  }
}
