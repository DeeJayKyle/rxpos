// This device → Fonts: a font pack (heading and body fonts that go together) or any two fonts (fonts.dart).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/fonts.dart';

class FontsCard extends ConsumerWidget {
  const FontsCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = Theme.of(context);
    final c = ref.watch(fontsProvider).value ?? const FontChoice();
    final s = ref.watch(loadedFontsProvider);
    final ctl = ref.read(fontsProvider.notifier);
    final wanted = {c.heading, c.body}..remove(systemFont);
    final loading = wanted.where(s.loading.contains).toList();
    final failed = wanted.where(s.failed.contains).toList();
    String label(String f) => f == systemFont ? 'System font' : f;
    final families = fontFiles.keys.toList()..sort();
    DropdownMenuItem<String> item(String f) => DropdownMenuItem(value: f, child: Text(label(f), overflow: TextOverflow.ellipsis));

    return Card(
      key: const Key('fonts-card'),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [const Icon(Icons.font_download_outlined, size: 18), const SizedBox(width: 8), Expanded(child: Text('Fonts', style: t.textTheme.titleMedium))]),
          const SizedBox(height: 4),
          Text('A pack of fonts that go well together, or any two. A new font is downloaded once, then kept on this device.', style: t.textTheme.bodySmall),
          if (loading.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Row(children: [
            const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
            const SizedBox(width: 8),
            Expanded(child: Text('Downloading ${loading.join(' and ')}…')),
          ])),
          if (failed.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Row(children: [
            Icon(Icons.wifi_off, size: 16, color: t.colorScheme.error),
            const SizedBox(width: 8),
            Expanded(child: Text('Could not download ${failed.join(' and ')}: check the internet. The app keeps its font until then.', style: TextStyle(color: t.colorScheme.error))),
            TextButton(onPressed: () => ctl.choose(c), child: const Text('Try again')),
          ])),
          const SizedBox(height: 12),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final p in fontPacks)
              SizedBox(
                width: 230,
                child: _PackTile(pack: p, selected: c.pack == p.id, ready: s, onTap: () => ctl.choose(FontChoice.ofPack(p))),
              ),
          ]),
          const SizedBox(height: 16),
          Text('Or choose any two', style: t.textTheme.titleSmall),
          const SizedBox(height: 8),
          Wrap(spacing: 12, runSpacing: 12, children: [
            SizedBox(width: 240, child: DropdownButtonFormField<String>(
              key: const Key('font-heading'),
              initialValue: c.heading,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Headings', isDense: true),
              items: [item(systemFont), for (final f in families) item(f)],
              onChanged: (v) => ctl.choose(FontChoice(pack: 'custom', heading: v ?? systemFont, body: c.body)),
            )),
            SizedBox(width: 240, child: DropdownButtonFormField<String>(
              key: const Key('font-body'),
              initialValue: c.body,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Text, lists and figures', isDense: true),
              items: [item(systemFont), for (final f in families) item(f)],
              onChanged: (v) => ctl.choose(FontChoice(pack: 'custom', heading: c.heading, body: v ?? systemFont)),
            )),
          ]),
        ]),
      ),
    );
  }
}

class _PackTile extends StatelessWidget {
  const _PackTile({required this.pack, required this.selected, required this.ready, required this.onTap});
  final FontPack pack;
  final bool selected;
  final FontsState ready;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    // a sample in the pack's own fonts once they are on this device
    String? fam(String f) => f != systemFont && ready.ready.contains(f) ? f : null;
    final pair = pack.heading == pack.body ? pack.heading : '${pack.heading} + ${pack.body}';
    return Material(
      color: selected ? t.colorScheme.primaryContainer : t.colorScheme.surfaceContainerHighest.withValues(alpha: .5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: selected ? t.colorScheme.primary : t.dividerColor, width: selected ? 2 : 1)),
      child: InkWell(
        key: Key('font-pack-${pack.id}'),
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(pack.name, style: TextStyle(fontFamily: fam(pack.heading), fontWeight: FontWeight.w700, fontSize: 16))),
              if (selected) Icon(Icons.check_circle, size: 18, color: t.colorScheme.primary),
            ]),
            Text(pack.id == 'system' ? 'Nothing to download' : pair, style: t.textTheme.labelSmall),
            const SizedBox(height: 4),
            Text(pack.description, style: TextStyle(fontFamily: fam(pack.body), fontSize: 12.5)),
          ]),
        ),
      ),
    );
  }
}
