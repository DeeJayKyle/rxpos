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
