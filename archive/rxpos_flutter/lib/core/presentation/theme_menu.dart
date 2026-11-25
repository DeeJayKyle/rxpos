// The theme menu in the top bar (src/App.jsx ThemePicker): Light / Dark / System, the accent colour, the colour themes
// the owner allows for this pharmacy, the colour level (Calm / Vivid) and the surface style. Kept on this device.
import 'package:flutter/material.dart';
import 'app_dialog.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'dart:convert';

import '../data/device_settings.dart';
import '../data/pharmacy_providers.dart';
import '../theme/theme_choice.dart';
import '../theme/themes.dart';

class ThemeMenuButton extends ConsumerWidget {
  const ThemeMenuButton({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => IconButton(
        key: const Key('theme-menu'),
        tooltip: 'Theme',
        icon: const Icon(Icons.palette_outlined),
        // closing the menu, however it closes, puts the chosen theme back
        onPressed: () => showAppDialog<void>(context: context, builder: (_) => const ThemeMenu()).whenComplete(() => ref.read(themePreviewProvider.notifier).show(null)),
      );
}

class ThemeMenu extends ConsumerWidget {
  const ThemeMenu({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final look = ref.watch(lookProvider).value ?? const Look();
    final branding = ref.watch(brandingProvider);
    final allowed = allowedPalettes(branding);
    final ctl = ref.read(lookProvider.notifier);
    final t = Theme.of(context);
    final current = paletteById(look.theme);
    final mode = look.system ? 'system' : current.dark ? 'dark' : 'light';
    Widget head(String s) => Padding(padding: const EdgeInsets.fromLTRB(16, 12, 16, 6), child: Text(s, style: t.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w800)));
    // every section folds (the owner's request, 2026-11-20): at first only the set with the theme in use is open;
    // what the person opens or folds is kept on this device (src/App.jsx ThemePicker)
    Map<String, Object?> folds;
    try {
      folds = (jsonDecode(ref.watch(deviceValueProvider('theme-folds')).value ?? '{}') as Map).cast<String, Object?>();
    } catch (_) {
      folds = {};
    }
    bool isOpen(String id, bool dflt) => folds[id] is bool ? folds[id]! as bool : dflt;
    List<Widget> sec(String id, String title, bool dflt, List<Widget> body) => [
          InkWell(
            key: ValueKey('theme-sec-$id'),
            onTap: () => ref.read(deviceValueProvider('theme-folds').notifier).set(jsonEncode({...folds, id: !isOpen(id, dflt)})),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(10, 10, 16, 6),
              child: Row(children: [
                AnimatedRotation(turns: isOpen(id, dflt) ? 0 : -.25, duration: const Duration(milliseconds: 150), child: const Icon(Icons.expand_more, size: 18)),
                const SizedBox(width: 4),
                Expanded(child: Text(title, style: t.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w800))),
              ]),
            ),
          ),
          if (isOpen(id, dflt)) ...body,
        ];
    Widget swatch(Palette p) => Container(
          width: 34,
          height: 22,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: Color(p.borderStrong)),
            gradient: LinearGradient(colors: [Color(p.surface), Color(p.surface), Color(p.primary), Color(p.primary), Color(p.primary2)], stops: const [0, .45, .45, .72, .72]),
          ),
        );
    void close() => Navigator.pop(context);
    return Align(
      alignment: Alignment.topRight,
      child: Padding(
        padding: const EdgeInsets.only(top: 56, right: 8, left: 8),
        child: Material(
          elevation: 8,
          borderRadius: BorderRadius.circular(12),
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: 380, maxHeight: (MediaQuery.sizeOf(context).height - 72).clamp(200, 620)),
            child: ListView(key: const Key('theme-list'), shrinkWrap: true, padding: const EdgeInsets.only(bottom: 8), children: [
              head('Appearance'),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: SegmentedButton<String>(
                  showSelectedIcon: false,
                  segments: const [
                    ButtonSegment(value: 'light', icon: Icon(Icons.light_mode_outlined, size: 16), label: Text('Light')),
                    ButtonSegment(value: 'dark', icon: Icon(Icons.dark_mode_outlined, size: 16), label: Text('Dark')),
                    ButtonSegment(value: 'system', icon: Icon(Icons.devices_outlined, size: 16), label: Text('System')),
                  ],
                  selected: {mode},
                  onSelectionChanged: (v) => v.first == 'system' ? ctl.followSystem() : ctl.base(v.first == 'dark', allowed, preferred: '${branding?['defaultTheme'] ?? ''}'),
                ),
              ),
              // the themes by group (themes.dart paletteGroups): Light, Dashboard looks, Dark
              for (final g in paletteGroups)
                if (allowed.any((p) => (p.group.isEmpty ? 'Light' : p.group) == g)) ...sec('set:$g', g, allowed.length <= 8 || allowed.any((p) => (p.group.isEmpty ? 'Light' : p.group) == g && (p.id == look.theme || '${p.id}-dark' == look.theme)), [
              for (final p in allowed.where((p) => (p.group.isEmpty ? 'Light' : p.group) == g))
                // the pointer on a theme previews it (2026-11-18); leaving it puts the chosen one back
                MouseRegion(
                  onEnter: (_) => ref.read(themePreviewProvider.notifier).show(p.id),
                  onExit: (_) => ref.read(themePreviewProvider.notifier).show(null),
                  child: ListTile(
                  key: ValueKey('theme-${p.id}'),
                  dense: true,
                  selected: (p.id == look.theme || '${p.id}-dark' == look.theme) && !look.system,
                  leading: swatch(p),
                  title: Text(p.name),
                  subtitle: p.inspired.isNotEmpty && p.inspired != p.name ? Text(p.inspired) : null,
                  trailing: Icon(p.dark ? Icons.dark_mode_outlined : Icons.light_mode_outlined, size: 14),
                  onTap: () {
                    // 1.17.0: while in Dark, a theme opens as its dark twin
                    ctl.pick(current.dark && !p.dark ? (twinOf(p.id, true) ?? p.id) : p.id);
                    close();
                  },
                ),
                ),
                ]),
              ...sec('gradient', 'Gradient', false, [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: SegmentedButton<String>(
                  key: const Key('gradient-choice'),
                  showSelectedIcon: false,
                  segments: const [ButtonSegment(value: 'off', label: Text('Off')), ButtonSegment(value: 'soft', label: Text('Soft')), ButtonSegment(value: 'bold', label: Text('Bold'))],
                  selected: {look.gradient},
                  onSelectionChanged: (v) => ctl.gradient(v.first),
                ),
              ),
              // 1.18.0 (src/gradients.js): gradient buttons, and a ready gradient for the menu and the page bands
              SwitchListTile(
                key: const Key('grad-accents'),
                dense: true,
                title: const Text('Gradient buttons'),
                subtitle: const Text('The main buttons in the theme\'s two colours'),
                value: look.gradAccents,
                onChanged: ctl.gradAccents,
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 4),
                child: Wrap(spacing: 6, runSpacing: 6, children: [
                  ChoiceChip(key: const Key('preset-none'), label: const Text('No preset'), selected: look.preset.isEmpty, onSelected: (_) => ctl.preset('')),
                  for (final (id, name, a, b) in gradientPresets)
                    ChoiceChip(
                      key: ValueKey('preset-$id'),
                      avatar: Container(width: 16, height: 16, decoration: BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: [Color(a), Color(b)]))),
                      label: Text(name),
                      selected: look.preset == id,
                      onSelected: (_) => ctl.preset(id),
                    ),
                ]),
              ),
              ]),
              ...sec('colour', 'Colour', false, [
              for (final (id, name, hint) in colourLevels)
                ListTile(
                  key: ValueKey('level-$id'),
                  dense: true,
                  selected: look.level == id,
                  leading: Icon(look.level == id ? Icons.check_circle : Icons.circle_outlined, size: 20),
                  title: Text(name),
                  subtitle: Text(hint),
                  onTap: () {
                    ctl.level(id);
                    close();
                  },
                ),
              ]),
              ...sec('style', 'Style', false, [
              for (final (id, name, hint) in surfaceStyles)
                ListTile(
                  key: ValueKey('style-$id'),
                  dense: true,
                  selected: look.surface == id,
                  leading: Icon(look.surface == id ? Icons.check_circle : Icons.circle_outlined, size: 20),
                  title: Text(name),
                  subtitle: Text(hint),
                  onTap: () {
                    ctl.surface(id);
                    close();
                  },
                ),
              ]),
            ]),
          ),
        ),
      ),
    );
  }
}

