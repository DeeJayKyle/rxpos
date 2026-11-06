// The ten design systems (This device → Theme → Design system): each is a palette (themes.dart), a surface style and
// a set of design tokens (design_tokens.dart). Picking one sets all three at once; picking a theme or a style
// afterwards leaves the design system. Nothing here touches what the app does, only how it looks and how big things
// are to tap. Every palette is made readable (WCAG AA) when it is applied.
import 'package:flutter/material.dart';

import 'design_tokens.dart';

class DesignSystem {
  const DesignSystem(this.id, this.name, this.group, this.description, {required this.palette, required this.surface, required this.tokens, this.forTouch = false});
  final String id, name, description;
  /// 'pos' (efficiency and tap targets) or 'colourful' (looks)
  final String group;
  final String palette, surface;
  final DesignTokens tokens;
  /// best on a touch screen (recommended on Android tablets)
  final bool forTouch;
}

const designGroups = [('pos', 'Point of sale & efficiency'), ('colourful', 'Modern & colourful')];

const designSystems = <DesignSystem>[
  // ---- point of sale & transactional ----
  DesignSystem('split-pane', 'Split-Pane Hybrid Grid', 'pos',
      'Medicines and the sale side by side, the sale and payment always in full view: nothing to scroll or unfold to finish a sale.',
      palette: 'split-pane', surface: 'flat',
      tokens: DesignTokens(radius: 10, controlRadius: 8, chipRadius: 8, gap: 6, cardPadding: 8, tileWidth: 190, tileHeight: 112, splitPane: true, motionMs: 140)),
  DesignSystem('target-tap', 'Target Tap Ergonomic', 'pos',
      'Everything you tap is at least 64 × 64 px with room between, and each medicine card is marked with the colour of its therapeutic area.',
      palette: 'target-tap', surface: 'flat', forTouch: true,
      tokens: DesignTokens(radius: 16, controlRadius: 14, chipRadius: 14, tapTarget: 64, gap: 14, cardPadding: 14, tileWidth: 260, tileHeight: 150,
          textScale: 1.08, colorCoded: true)),
  DesignSystem('nightlife', 'Nightlife Contrast', 'pos',
      'Low-glare charcoal (#121212) for evening and night shifts, bright text, and glowing borders on whatever you are working on.',
      palette: 'nightlife', surface: 'flat',
      tokens: DesignTokens(radius: 12, controlRadius: 10, chipRadius: 10, glow: Color(0xFF22D3EE))),
  DesignSystem('daylight', 'Daylight Retail', 'pos',
      'Crisp whites, firm grey borders and deep text, matte with no gradients or shine, to stay readable in bright daylight and outdoors.',
      palette: 'daylight', surface: 'flat',
      tokens: DesignTokens(radius: 10, controlRadius: 8, chipRadius: 8, borderWidth: 1.5, textScale: 1.05, headingWeight: FontWeight.w900)),
  DesignSystem('hud', 'Hardware Diagnostic HUD', 'pos',
      'A status bar over every page shows the cloud connection, the receipt printer, the barcode scanner and the camera, with short alerts for stock and unsent work.',
      palette: 'hud', surface: 'flat',
      tokens: DesignTokens(radius: 8, controlRadius: 6, chipRadius: 6, gap: 6, cardPadding: 8, hud: true, glow: Color(0xFF22C55E))),
  // ---- modern, classy, colourful ----
  DesignSystem('brutalist', 'Neo-Brutalist Pop', 'colourful',
      'Saturated colour, thick black borders, hard offset shadows with no blur, and heavy type.',
      palette: 'brutalist', surface: 'flat',
      tokens: DesignTokens(radius: 4, controlRadius: 4, chipRadius: 4, borderWidth: 2.5, ink: Colors.black, hardShadow: 4, headingWeight: FontWeight.w900,
          headingSpacing: -.5)),
  DesignSystem('holo', 'Aurora Glow / Holographic', 'colourful',
      'Sweeping pastel gradients of mint, lavender and soft peach behind frosted glass panels.',
      palette: 'holo', surface: 'aurora',
      tokens: DesignTokens(radius: 20, controlRadius: 14, chipRadius: 20, glassAlpha: .62,
          backdrop: [Color(0xFFD1FAE5), Color(0xFFEDE4FF), Color(0xFFFFE4D6)], glows: [Color(0x55C4B5FD), Color(0x4499F6E4)])),
  DesignSystem('retrowave', 'Retrowave Cyber-Tech', 'colourful',
      'Deep indigo with hot pink, electric cyan and neon violet, glowing edges and a synthwave horizon grid.',
      palette: 'retrowave', surface: 'aurora',
      tokens: DesignTokens(radius: 10, controlRadius: 8, chipRadius: 8, glow: Color(0xFFFF2E97), glassAlpha: .78,
          backdrop: [Color(0xFF140B2E), Color(0xFF1E0F45), Color(0xFF2A0C4F)], glows: [Color(0x44FF2E97), Color(0x3300E5FF), Color(0x339D4EDD)],
          grid: Color(0x3300E5FF))),
  DesignSystem('bauhaus', 'Editorial Bauhaus', 'colourful',
      'Square blocks of cobalt, mustard and crimson on warm paper, firm black rules and refined serif headings.',
      palette: 'bauhaus', surface: 'flat',
      tokens: DesignTokens(radius: 0, controlRadius: 0, chipRadius: 0, borderWidth: 2, ink: Color(0xFF111111), headingWeight: FontWeight.w700,
          headingFamily: 'Georgia', headingSpacing: -.3)),
  DesignSystem('sunset', 'Sunset Glassmorphic', 'colourful',
      'A deep orange-to-purple gradient behind translucent frosted panels with white text.',
      palette: 'sunset', surface: 'aurora',
      tokens: DesignTokens(radius: 18, controlRadius: 14, chipRadius: 18, glassAlpha: .16,
          backdrop: [Color(0xFFB4410E), Color(0xFF9D174D), Color(0xFF4C1D95)], glows: [Color(0x40FFB86B), Color(0x30F472B6)])),
];

DesignSystem? designById(String id) => designSystems.where((d) => d.id == id).firstOrNull;
