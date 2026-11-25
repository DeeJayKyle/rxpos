// Design systems (retired 17 Nov 2026: only the 15 two-colour themes remain): each is a palette (themes.dart), a surface style and
// a set of design tokens (design_tokens.dart). Picking one sets all three at once; picking a theme or a style
// afterwards leaves the design system. Nothing here touches what the app does, only how it looks and how big things
// are to tap. Every palette is made readable (WCAG AA) when it is applied.
import 'design_tokens.dart';

class DesignSystem {
  const DesignSystem(this.id, this.name, this.group, this.description, {required this.palette, required this.surface, required this.tokens, this.forTouch = false, this.vivid = false});
  /// figures as solid colour tiles (the Vivid colour level)
  final bool vivid;
  final String id, name, description;
  /// 'pos' (efficiency and tap targets) or 'colourful' (looks)
  final String group;
  final String palette, surface;
  final DesignTokens tokens;
  /// best on a touch screen (recommended on Android tablets)
  final bool forTouch;
}

const designGroups = [('pos', 'Point of sale & efficiency'), ('colourful', 'Modern & colourful'), ('showcase', 'Showcase')];

/// None since the 15 two-colour themes (the owner's choice, 17 Nov 2026: only those themes in the app). A device that had
/// one keeps its theme list and moves to a theme by itself (Look.parse).
const designSystems = <DesignSystem>[];

DesignSystem? designById(String id) => designSystems.where((d) => d.id == id).firstOrNull;
