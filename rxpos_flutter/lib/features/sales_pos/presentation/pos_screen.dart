import 'package:flutter/material.dart';

/// The till: medicines, the sale, totals and payment. Built in milestone 1, step "Till".
class PosScreen extends StatelessWidget {
  const PosScreen({super.key, this.wholesale = false});

  final bool wholesale;

  @override
  Widget build(BuildContext context) => Scaffold(body: Center(child: Text(wholesale ? 'POS – Wholesale' : 'POS – Retail')));
}
