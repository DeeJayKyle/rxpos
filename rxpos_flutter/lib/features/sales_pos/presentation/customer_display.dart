// The customer display (src/components/CustomerDisplay.jsx): the sale as the cashier builds it, in large text for the
// client, with the pharmacy's name and logo. It only shows; it can change nothing. In the browser it is a second
// window fed by the till over a BroadcastChannel (no sign-in); in the Windows and Android apps it is a page showing the
// retail till's sale (for a second screen mirroring this one, or a tablet turned to the client).
import '../../../core/presentation/pharmacy_logo.dart' show pharmacyLogoProvider;
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/widgets.dart' show Money;
import '../../../core/rules/money.dart';
import '../../../core/web/display_channel_stub.dart' if (dart.library.js_interop) '../../../core/web/display_channel_web.dart';
import '../application/sale_controller.dart';
import '../domain/cart.dart';

export '../../../core/web/display_channel_stub.dart' if (dart.library.js_interop) '../../../core/web/display_channel_web.dart';

/// What the display shows for a sale on the till (the same fields as the classic app's).
Map<String, Object?> displayMessage(SaleState s, PharmacySettings st, {String logo = ''}) {
  final t = totalsOf(s.lines, discount: s.discount, settings: st);
  final tendered = s.tendered;
  return {
    'pharmacy': st.name, 'logo': logo,
    'lines': [for (final l in s.lines) {'name': l.name, 'qty': l.pack != null ? '${formatQty(l.qty / l.pack!.size)} ${l.pack!.name}' : formatQty(l.qty), 'amount': st.money(l.price * l.qty)}],
    'discount': t.discount > 0 ? st.money(t.discount) : '',
    'total': st.money(t.total),
    'paid': tendered != null ? st.money(tendered) : '',
    'change': tendered != null && tendered > t.total ? st.money(tendered - t.total) : '',
  };
}

/// The thank-you after a sale (receipt record from the till).
Map<String, Object?> displayDone(Map<String, Object?> sale, PharmacySettings st, {String logo = ''}) {
  final total = (sale['total'] as num?)?.toDouble() ?? 0, tendered = (sale['tendered'] as num?)?.toDouble() ?? 0;
  return {
    'pharmacy': st.name, 'logo': logo, 'done': true, 'total': st.money(total),
    'paid': tendered > 0 ? st.money(tendered) : '', 'change': tendered > total ? st.money(tendered - total) : '',
  };
}

class CustomerDisplayScreen extends ConsumerStatefulWidget {
  const CustomerDisplayScreen({super.key});
  @override
  ConsumerState<CustomerDisplayScreen> createState() => _CustomerDisplayState();
}

class _CustomerDisplayState extends ConsumerState<CustomerDisplayScreen> {
  Map<String, Object?>? _msg;
  void Function()? _stop;

  @override
  void initState() {
    super.initState();
    if (displayChannelAvailable) _stop = displayListen((m) => mounted && m['hello'] != true ? setState(() => _msg = m) : null);
  }

  @override
  void dispose() {
    _stop?.call();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    var m = _msg;
    if (!displayChannelAvailable) {
      final d = ref.watch(pharmacyProvider).value;
      if (d != null) m = displayMessage(ref.watch(saleControllerProvider(false)), d.settings, logo: ref.watch(pharmacyLogoProvider) ?? '');
    }
    final t = Theme.of(context);
    final big = t.textTheme.headlineMedium;
    final lines = ((m?['lines'] as List?) ?? const []).cast<Map>();
    String v(String k) => '${m?[k] ?? ''}';
    Widget row(String a, String b, {TextStyle? style}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(children: [Expanded(child: Text(a, style: style)), Text(b, style: style)]),
        );
    final logo = v('logo');
    return Scaffold(
      key: const Key('customer-display'),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(40, 28, 40, 28),
          child: DefaultTextStyle.merge(
            style: t.textTheme.titleLarge!,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                if (logo.startsWith('data:image'))
                  Padding(padding: const EdgeInsets.only(right: 14), child: Image.memory(base64Decode(logo.split(',').last), height: 52))
                else if (logo.startsWith('http'))
                  Padding(padding: const EdgeInsets.only(right: 14), child: Image.network(logo, height: 52, errorBuilder: (_, _, _) => const SizedBox.shrink())),
                Expanded(child: Text(v('pharmacy').isEmpty ? 'Welcome' : v('pharmacy'), style: big?.copyWith(fontWeight: FontWeight.w800))),
              ]),
              const SizedBox(height: 20),
              Expanded(
                child: m?['done'] == true
                    ? Center(child: Text('Thank you!', style: t.textTheme.displayMedium?.copyWith(fontWeight: FontWeight.w800, color: t.colorScheme.primary)))
                    : lines.isEmpty
                        ? Center(child: Text('Welcome. Your items will show here.', style: TextStyle(color: t.hintColor)))
                        : ListView(children: [
                            for (final l in lines)
                              Card(child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                                child: Row(children: [Expanded(child: Text('${l['name']}')), Text('${l['qty']}'), const SizedBox(width: 24), SizedBox(width: 170, child: Text('${l['amount']}', textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w700)))]),
                              )),
                          ]),
              ),
              if (m != null && (lines.isNotEmpty || m['done'] == true))
                Card(child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(children: [
                    if (v('discount').isNotEmpty) row('Discount', '− ${v('discount')}'),
                    row('Total', v('total'), style: big?.copyWith(fontWeight: FontWeight.w900, color: t.colorScheme.primary)),
                    if (v('paid').isNotEmpty) row('Paid', v('paid')),
                    if (v('change').isNotEmpty) row('Change', v('change'), style: t.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                  ]),
                )),
            ]),
          ),
        ),
      ),
    );
  }
}
