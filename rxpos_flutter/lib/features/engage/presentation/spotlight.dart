// The idle screen (src/engage.jsx Spotlight): when nobody has touched the app for a while (Settings → idle minutes,
// 3 by default; 0 switches it off), the pharmacy's own "shop window": medicines worth recommending (short expiry, top
// margin, slow movers, premium) mixed with health tips, each with a picture and a one-tap WhatsApp share. Browse with
// the arrows, a swipe, the thumbnails or ← → and space; it moves on every 8 seconds. Any tap outside the card, or Esc,
// closes it. Never during a sale, and never prescription-only or controlled medicines (it faces customers).
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/data/device_settings.dart';
import '../../../core/data/pharmacy_providers.dart';
import '../../../core/entities/sale.dart';
import '../../../core/presentation/widgets.dart';
import '../../dashboard/domain/insights.dart';
import '../../extras/domain/extras.dart';
import '../domain/engage.dart';
import 'watchers.dart';

class Spotlight extends ConsumerStatefulWidget {
  const Spotlight({super.key, required this.child});
  final Widget child;
  @override
  ConsumerState<Spotlight> createState() => _SpotlightState();
}

class _SpotlightState extends ConsumerState<Spotlight> {
  Timer? _idle, _next;
  ProviderSubscription<AsyncValue<PharmacyData>>? _sub;
  bool _shown = false, _paused = false;
  int _i = 0;

  bool get _on {
    final d = ref.read(pharmacyProvider).value;
    return ref.read(engageOnProvider) && d != null && d.features['promos'] != false && _minutes(d) > 0;
  }

  double _minutes(PharmacyData d) => (num.tryParse('${d.settings.raw['idleMinutes'] ?? ''}') ?? 3).toDouble();

  @override
  void initState() {
    super.initState();
    HardwareKeyboard.instance.addHandler(_key);
    // start counting once the pharmacy is loaded (and again when its idle minutes change)
    _sub = ref.listenManual<AsyncValue<PharmacyData>>(pharmacyProvider, (prev, next) {
      if (next.value != null && (prev?.value == null || _minutes(prev!.value!) != _minutes(next.value!)) && !_shown) _arm();
    }, fireImmediately: true);
  }

  @override
  void dispose() {
    HardwareKeyboard.instance.removeHandler(_key);
    _sub?.close();
    _idle?.cancel();
    _next?.cancel();
    super.dispose();
  }

  void _arm() {
    _idle?.cancel();
    if (!mounted || !_on) return;
    final d = ref.read(pharmacyProvider).value!;
    final ms = (_minutes(d) < .5 ? .5 : _minutes(d)) * 60000;
    _idle = Timer(Duration(milliseconds: ms.round()), () async {
      // never during a sale: a sale on the till waits for its customer
      final retail = await ref.read(deviceValueProvider('pos-sale-retail').future), wholesale = await ref.read(deviceValueProvider('pos-sale-wholesale').future);
      if (!mounted) return;
      if (retail != null || wholesale != null) return _arm();
      setState(() {
        _shown = true;
        _i = 0;
        _paused = false;
      });
      _auto();
    });
  }

  void _close() {
    _next?.cancel();
    if (mounted) setState(() => _shown = false);
    _arm();
  }

  void _auto() {
    _next?.cancel();
    if (_shown && !_paused) _next = Timer(const Duration(seconds: 8), () => _go(_i + 1));
  }

  void _go(int n) {
    if (!mounted) return;
    setState(() => _i = n);
    _auto();
  }

  bool _key(KeyEvent e) {
    if (!_shown) {
      if (e is KeyDownEvent) _arm();
      return false;
    }
    if (e is! KeyDownEvent) return false;
    if (e.logicalKey == LogicalKeyboardKey.arrowRight) {
      _go(_i + 1);
    } else if (e.logicalKey == LogicalKeyboardKey.arrowLeft) {
      _go(_i - 1);
    } else if (e.logicalKey == LogicalKeyboardKey.space) {
      setState(() => _paused = !_paused);
      _auto();
    } else if (e.logicalKey == LogicalKeyboardKey.tab || e.logicalKey == LogicalKeyboardKey.enter) {
      return false;
    } else {
      _close();
    }
    return true;
  }

  List<Slide> _slides(PharmacyData d) {
    final sales = (ref.watch(tableProvider('sales')).value ?? const []).map(Sale.fromRecord);
    return slidesFor(insights(d.products, d.stockOf, d.stock.batchesOf, sales, d.settings), DateTime.now());
  }

  @override
  Widget build(BuildContext context) {
    final body = Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: (_) => _shown ? null : _arm(),
      onPointerHover: (_) => _shown ? null : _arm(),
      onPointerSignal: (_) => _shown ? null : _arm(),
      child: widget.child,
    );
    final d = ref.watch(pharmacyProvider).value;
    if (!_shown || d == null) return body;
    final slides = _slides(d);
    if (slides.isEmpty) return body;
    final n = slides.length;
    final s = slides[((_i % n) + n) % n];
    final st = d.settings;
    final t = Theme.of(context);
    final hour = DateTime.now().hour;
    final kind = s.isTip ? ('Health tip', Icons.favorite_outline, Colors.lightBlue) : slideKinds[s.item!.kind]!;
    final MaterialColor color = kind.$3;
    final share = s.isTip
        ? '💚 Health tip from ${st.name.isEmpty ? 'your pharmacy' : st.name}: ${s.tip!.text} (${s.tip!.source})'
        : shareText(s.item!.p, st);
    final card = GestureDetector(
      key: const Key('spotlight-card'),
      onTap: () {}, // taps on the card keep it open
      onHorizontalDragEnd: (e) {
        final v = e.primaryVelocity ?? 0;
        if (v.abs() > 200) _go(v < 0 ? _i + 1 : _i - 1);
      },
      child: Container(
        constraints: const BoxConstraints(maxWidth: 820),
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(24), gradient: LinearGradient(colors: [color.shade700, color.shade900])),
        child: LayoutBuilder(builder: (context, c) {
          final art = Icon(s.isTip ? tipArt(s.tip!.text) : medicineArt(s.item!.p.form, s.item!.p.name), size: c.maxWidth < 500 ? 96 : 160, color: Colors.white.withValues(alpha: .95));
          final text = Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Row(children: [
              Icon(kind.$2, size: 15, color: Colors.white70),
              const SizedBox(width: 6),
              Text(s.isTip ? '${hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'} health tip' : 'Available now', style: const TextStyle(color: Colors.white70)),
            ]),
            const SizedBox(height: 8),
            if (s.isTip) ...[
              Text(s.tip!.text, style: t.textTheme.headlineSmall?.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Text('Source: ${s.tip!.source}. Ask the pharmacist if you have questions.', style: const TextStyle(color: Colors.white70)),
            ] else ...[
              Text(s.item!.p.name, style: t.textTheme.headlineMedium?.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
              if (s.item!.p.generic.isNotEmpty && s.item!.p.generic != s.item!.p.name)
                Text('${s.item!.p.generic}${s.item!.p.form.isNotEmpty ? ' · ${s.item!.p.form}' : ''}', style: const TextStyle(color: Colors.white70)),
              const SizedBox(height: 8),
              Text(st.money(s.item!.p.price), style: t.textTheme.headlineSmall?.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
              Text('In stock at ${st.name.isEmpty ? 'our pharmacy' : st.name} — ask our pharmacist for advice.', style: const TextStyle(color: Colors.white70)),
            ],
            const SizedBox(height: 14),
            FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: color.shade900),
              onPressed: () => launchUrl(Uri.parse(whatsappLink('', share)), mode: LaunchMode.externalApplication),
              icon: const Icon(Icons.share_outlined),
              label: Text(s.isTip ? 'Share this tip' : 'Share on WhatsApp'),
            ),
          ]);
          return c.maxWidth < 500 ? Column(mainAxisSize: MainAxisSize.min, children: [art, const SizedBox(height: 12), text]) : Row(children: [art, const SizedBox(width: 24), Expanded(child: text)]);
        }),
      ),
    );
    return Stack(children: [
      body,
      Positioned.fill(
        child: Material(
          type: MaterialType.transparency,
          child: GestureDetector(
          key: const Key('spotlight'),
          behavior: HitTestBehavior.opaque,
          onTap: _close,
          child: ColoredBox(
            color: const Color(0xF20B1220),
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(children: [
                  Row(children: [
                    Expanded(
                      child: Row(children: [
                        for (var j = 0; j < n; j++)
                          Expanded(child: Container(height: 4, margin: const EdgeInsets.symmetric(horizontal: 2), color: j <= ((_i % n) + n) % n ? Colors.white : Colors.white24)),
                      ]),
                    ),
                    const SizedBox(width: 8),
                    Text('${((_i % n) + n) % n + 1} / $n', style: const TextStyle(color: Colors.white70)),
                    IconButton(
                      tooltip: _paused ? 'Play' : 'Pause',
                      color: Colors.white,
                      icon: Icon(_paused ? Icons.play_arrow : Icons.pause),
                      onPressed: () {
                        setState(() => _paused = !_paused);
                        _auto();
                      },
                    ),
                    TextButton.icon(onPressed: _close, style: TextButton.styleFrom(foregroundColor: Colors.white), icon: const Icon(Icons.close), label: const Text('Close')),
                  ]),
                  Expanded(
                    child: Row(children: [
                      IconButton(tooltip: 'Previous', color: Colors.white, iconSize: 32, icon: const Icon(Icons.chevron_left), onPressed: () => _go(_i - 1)),
                      Expanded(child: Center(child: SingleChildScrollView(child: card))),
                      IconButton(tooltip: 'Next', color: Colors.white, iconSize: 32, icon: const Icon(Icons.chevron_right), onPressed: () => _go(_i + 1)),
                    ]),
                  ),
                  SizedBox(
                    height: 64,
                    child: ListView(scrollDirection: Axis.horizontal, children: [
                      for (final (j, x) in slides.indexed)
                        Padding(
                          padding: const EdgeInsets.all(4),
                          child: InkWell(
                            onTap: () => _go(j),
                            child: Container(
                              width: 120,
                              padding: const EdgeInsets.all(6),
                              decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), border: Border.all(color: j == ((_i % n) + n) % n ? Colors.white : Colors.white24)),
                              child: Row(children: [
                                Icon(x.isTip ? tipArt(x.tip!.text) : medicineArt(x.item!.p.form, x.item!.p.name), color: Colors.white, size: 22),
                                const SizedBox(width: 6),
                                Expanded(child: Text(x.isTip ? 'Health tip' : x.item!.p.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 11))),
                              ]),
                            ),
                          ),
                        ),
                    ]),
                  ),
                  Text('${st.name} · tap outside or press Esc to get back to work', style: const TextStyle(color: Colors.white54)),
                ]),
              ),
            ),
          ),
          ),
        ),
      ),
    ]);
  }
}
