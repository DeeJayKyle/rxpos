// The next-gen widgets (lib/widgets, lib/theme/rxpos_theme.dart): the clinical safety pill reacts to the cart, the FEFO
// badge shows the traffic light, bento cards lay out by width, every one renders in OLED Black and Daylight Clinical
// without overflow, with 48 dp touch targets. Fictional medicines.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/core/theme/themes.dart';
import 'package:rxpos/theme/rxpos_theme.dart';
import 'package:rxpos/widgets/bento_card.dart';
import 'package:rxpos/widgets/clinical_safety_pill.dart';
import 'package:rxpos/widgets/fefo_batch_badge.dart';
import 'package:rxpos/widgets/glow_status_chip.dart';

const products = [
  Product(id: 'war', name: 'Warfarin 5mg Tablets', generic: 'warfarin'),
  Product(id: 'ibu', name: 'Ibuprofen 400mg Tablets', generic: 'ibuprofen'),
  Product(id: 'pcm', name: 'Paracetamol 500mg Tablets', generic: 'paracetamol'),
];

Widget host(Widget child, {String palette = oledPaletteId, double width = 400}) => MaterialApp(
      theme: buildTheme(paletteById(palette), touch: true),
      home: Scaffold(body: Center(child: SizedBox(width: width, child: child))),
    );

void main() {
  test('OLED Black is a pitch-black canvas with raised cards; Daylight Clinical a calm canvas with white cards', () {
    final o = buildTheme(paletteById(oledPaletteId));
    expect(o.scaffoldBackgroundColor, const Color(0xFF000000));
    expect(o.cardTheme.color, const Color(0xFF0B0E14));
    final d = buildTheme(paletteById(daylightClinicalPaletteId));
    expect(d.scaffoldBackgroundColor, const Color(0xFFF5F7FA));
    expect(d.cardTheme.color, const Color(0xFFFFFFFF));
    // whatever surface style the device chose, the next-gen palettes keep flat bento cards (no glow on OLED)
    expect(buildTheme(paletteById(oledPaletteId), surface: 'aurora').extension<DesignTokens>()!.glows, isEmpty);
    expect(buildTheme(paletteById(oledPaletteId), surface: 'aurora').extension<DesignTokens>()!.radius, kBentoRadius);
  });

  for (final palette in [oledPaletteId, daylightClinicalPaletteId]) {
    testWidgets('safety: all clear is a badge, a major interaction a pill that opens to show it ($palette)', (t) async {
      await t.pumpWidget(host(const Column(children: [SafetyBadge(productIds: ['pcm'], products: products), ClinicalSafetyPill(productIds: ['pcm'], products: products)]), palette: palette));
      expect(find.text('SAFETY'), findsOneWidget); // all clear: the badge, no pill row
      expect(find.byType(InkWell), findsNothing);
      await t.pumpWidget(host(const Column(children: [SafetyBadge(productIds: ['war', 'ibu'], products: products), ClinicalSafetyPill(productIds: ['war', 'ibu'], products: products)]), palette: palette));
      expect(find.text('SAFETY'), findsNothing);
      expect(find.textContaining('1 safety check'), findsOneWidget);
      await t.tap(find.textContaining('1 safety check'));
      await t.pump();
      expect(find.textContaining('MAJOR · INTERACTION'), findsOneWidget);
      expect(find.textContaining('bleeding risk'), findsWidgets);
      expect(t.getSize(find.byType(InkWell).first).height, greaterThanOrEqualTo(kMinTouch));
    });
  }

  testWidgets('safety pill: an allergy recorded for the customer; nothing for an empty cart', (t) async {
    await t.pumpWidget(host(const ClinicalSafetyPill(productIds: ['ibu'], products: products, customerName: 'Test Client', allergies: 'NSAIDs')));
    expect(find.textContaining('NSAID / aspirin allergy recorded for Test Client'), findsOneWidget);
    await t.pumpWidget(host(const ClinicalSafetyPill(productIds: [], products: products)));
    expect(find.byType(InkWell), findsNothing);
  });

  testWidgets('FEFO badge: green, amber with days, red and blocked', (t) async {
    final today = DateTime(2026, 11, 13);
    await t.pumpWidget(host(Column(children: [
      FefoBatchBadge(expiry: '2027-08-31', today: today),
      FefoBatchBadge(expiry: '2026-12-20', batch: 'AMX01', today: today),
      FefoBatchBadge(expiry: '2026-10-01', today: today),
      FefoBatchBadge(expiry: '', today: today),
    ])));
    expect(find.text('Exp 08/27'), findsOneWidget);
    expect(find.text('AMX01 · Exp 37d'), findsOneWidget);
    expect(find.text('Expired · blocked'), findsOneWidget);
  });

  testWidgets('bento grid: one column on a phone, a card spanning two on a wide counter', (t) async {
    Widget grid(double w) => host(BentoGrid(children: [
          const BentoCard(label: 'Sales today', span: 2, child: Text('UGX 1,250,000')),
          const BentoCard(label: 'Expiring', child: Text('12')),
          const BentoCard(label: 'Low stock', child: GlowStatusChip(label: '3 to reorder', status: 'warn')),
        ]), width: w);
    await t.pumpWidget(grid(360));
    final phone = t.getSize(find.ancestor(of: find.text('UGX 1,250,000'), matching: find.byType(SizedBox)).first).width;
    expect(phone, 360);
    t.view.physicalSize = const Size(1400, 900);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(grid(1300));
    final wide = t.getSize(find.ancestor(of: find.text('UGX 1,250,000'), matching: find.byType(SizedBox)).first).width;
    final one = t.getSize(find.ancestor(of: find.text('12'), matching: find.byType(SizedBox)).first).width;
    expect(wide, closeTo(one * 2 + kBentoGap, 0.5));
    expect(find.text('LOW STOCK'), findsOneWidget);
  });
}
