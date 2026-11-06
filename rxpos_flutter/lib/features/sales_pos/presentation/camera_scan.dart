import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

/// Android: scan a barcode with the camera; the first code read is returned.
Future<String?> scanBarcode(BuildContext context) => Navigator.of(context).push<String>(MaterialPageRoute(
      builder: (c) {
        var done = false;
        return Scaffold(
          appBar: AppBar(title: const Text('Scan a barcode')),
          body: MobileScanner(onDetect: (capture) {
            final code = capture.barcodes.map((b) => b.rawValue).whereType<String>().firstOrNull;
            if (code != null && !done) {
              done = true;
              Navigator.pop(c, code);
            }
          }),
        );
      },
    ));

/// Android: keep the camera open and add every barcode read ("Scan items into the sale", like the React till).
/// [onCode] returns what to show ("Calmex added") or null when no medicine has that code. The same code is read
/// again only after a short pause, so one box held in front of the camera is added once.
Future<void> scanContinuous(BuildContext context, {required String title, required Future<String?> Function(String code) onCode}) =>
    Navigator.of(context).push<void>(MaterialPageRoute(builder: (_) => _ContinuousScan(title: title, onCode: onCode)));

class _ContinuousScan extends StatefulWidget {
  const _ContinuousScan({required this.title, required this.onCode});
  final String title;
  final Future<String?> Function(String code) onCode;
  @override
  State<_ContinuousScan> createState() => _ContinuousScanState();
}

class _ContinuousScanState extends State<_ContinuousScan> {
  String _last = '', _msg = 'Point the camera at a barcode';
  DateTime _at = DateTime(2000);
  int _count = 0;

  Future<void> _read(String code) async {
    final now = DateTime.now();
    if (code == _last && now.difference(_at) < const Duration(milliseconds: 1500)) return;
    _last = code;
    _at = now;
    final said = await widget.onCode(code);
    if (!mounted) return;
    setState(() {
      if (said != null) _count++;
      _msg = said ?? 'No medicine has the barcode $code';
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(widget.title), actions: [TextButton(onPressed: () => Navigator.pop(context), child: Text('Done ($_count)'))]),
        body: Stack(children: [
          MobileScanner(onDetect: (capture) {
            final code = capture.barcodes.map((b) => b.rawValue).whereType<String>().firstOrNull;
            if (code != null) _read(code);
          }),
          Positioned(left: 16, right: 16, bottom: 24, child: Card(child: Padding(padding: const EdgeInsets.all(14), child: Text(_msg, textAlign: TextAlign.center)))),
        ]),
      );
}
