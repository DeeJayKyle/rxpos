// The theme menu in the top bar (src/App.jsx ThemePicker): Light / Dark / System, the accent colour, the colour themes
// the owner allows for this pharmacy, the colour level (Calm / Vivid) and the surface style. Kept on this device.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/pharmacy_providers.dart';
import '../theme/theme_choice.dart';
import '../theme/themes.dart';

class ThemeMenuButton extends StatelessWidget {
  const ThemeMenuButton({super.key});
  @override
  Widget build(BuildContext context) => IconButton(
        key: const Key('theme-menu'),
        tooltip: 'Theme',
        icon: const Icon(Icons.palette_outlined),
        onPressed: () => showDialog<void>(context: context, builder: (_) => const ThemeMenu()),
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
              // the ten design systems, folded into one row (the current one named) so the menu stays short
              ExpansionTile(
                key: const Key('design-systems'),
                initiallyExpanded: false,
                leading: const Icon(Icons.dashboard_customize_outlined),
                title: Text('Design system', style: t.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w800)),
                subtitle: Text(look.designSystem?.name ?? 'None: the theme and style below'),
                childrenPadding: const EdgeInsets.only(bottom: 6),
                children: [
                  for (final (g, gname) in designGroups) ...[
                    Padding(padding: const EdgeInsets.fromLTRB(16, 2, 16, 2), child: Text(gname, style: t.textTheme.labelSmall?.copyWith(color: t.colorScheme.onSurfaceVariant))),
                    for (final d in designSystems.where((d) => d.group == g))
                      ListTile(
                        key: ValueKey('design-${d.id}'),
                        dense: true,
                        selected: look.design == d.id,
                        leading: _DesignSwatch(d),
                        title: Row(children: [
                          Flexible(child: Text(d.name, overflow: TextOverflow.ellipsis)),
                          if (d.forTouch && tokensOf(context).touch) ...[
                            const SizedBox(width: 6),
                            Text('Best for this device', style: t.textTheme.labelSmall?.copyWith(color: t.colorScheme.tertiary, fontWeight: FontWeight.w700)),
                          ],
                        ]),
                        subtitle: Text(d.description, maxLines: 2, overflow: TextOverflow.ellipsis),
                        trailing: look.design == d.id ? const Icon(Icons.check_circle, size: 20) : null,
                        onTap: () {
                          ctl.designSystem(d.id);
                          close();
                        },
                      ),
                  ],
                  if (look.design.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: TextButton.icon(key: const Key('design-off'), onPressed: () {
                        ctl.designSystem('');
                        close();
                      }, icon: const Icon(Icons.undo, size: 18), label: const Text('Leave the design system (keep its colours)')),
                    ),
                ],
              ),
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
              head('Accent'),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Wrap(spacing: 10, children: [
                  for (final (id, name) in [('', 'Theme colour'), for (final a in accents) (a.$1, a.$2)])
                    Tooltip(
                      message: name,
                      child: InkWell(
                        key: ValueKey('accent-${id.isEmpty ? 'theme' : id}'),
                        customBorder: const CircleBorder(),
                        onTap: () => ctl.accent(id),
                        child: Container(
                          width: 30,
                          height: 30,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(color: look.accent == id ? t.colorScheme.onSurface : Colors.transparent, width: 2.5),
                            gradient: LinearGradient(colors: [Color(withAccent(current, id).primary), Color(withAccent(current, id).primary2)]),
                          ),
                        ),
                      ),
                    ),
                ]),
              ),
              head('Theme'),
              for (final p in allowed)
                ListTile(
                  key: ValueKey('theme-${p.id}'),
                  dense: true,
                  selected: p.id == look.theme && !look.system,
                  leading: swatch(p),
                  title: Text(p.name),
                  subtitle: p.inspired.isNotEmpty && p.inspired != p.name ? Text(p.inspired) : null,
                  trailing: Icon(p.dark ? Icons.dark_mode_outlined : Icons.light_mode_outlined, size: 14),
                  onTap: () {
                    ctl.pick(p.id);
                    close();
                  },
                ),
              head('Colour'),
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
              head('Style'),
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
          ),
        ),
      ),
    );
  }
}

/// A small preview of a design system: its backdrop or page colour, a panel, and its two brand colours.
class _DesignSwatch extends StatelessWidget {
  const _DesignSwatch(this.d);
  final DesignSystem d;
  @override
  Widget build(BuildContext context) {
    final p = paletteById(d.palette);
    final t = d.tokens;
    final r = BorderRadius.circular(t.radius.clamp(0, 8));
    return Container(
      width: 44,
      height: 32,
      decoration: BoxDecoration(
        borderRadius: r,
        border: Border.all(color: t.ink ?? t.glow ?? Color(p.borderStrong), width: t.ink != null ? 2 : 1),
        color: Color(p.bg),
        gradient: t.backdrop.length > 1 ? LinearGradient(colors: t.backdrop) : null,
        boxShadow: t.hardShadow > 0 ? [BoxShadow(color: t.ink ?? Colors.black, offset: const Offset(2, 2))] : t.glow != null ? [BoxShadow(color: t.glow!.withValues(alpha: .6), blurRadius: 6)] : null,
      ),
      padding: const EdgeInsets.all(5),
      child: Row(children: [
        Expanded(child: Container(decoration: BoxDecoration(color: Color(p.surface).withValues(alpha: t.glassAlpha ?? 1), borderRadius: r))),
        const SizedBox(width: 3),
        Column(children: [
          Expanded(child: Container(width: 8, color: Color(p.primary))),
          Expanded(child: Container(width: 8, color: Color(p.primary2))),
        ]),
      ]),
    );
  }
}
