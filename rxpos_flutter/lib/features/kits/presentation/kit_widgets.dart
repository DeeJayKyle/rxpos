// A kit's icon, colour and KIT badge (1.10, as the React app's src/components/KitIcon.jsx): a kit never looks like an
// ordinary medicine at the till.
import 'package:flutter/material.dart';

/// The React app's lucide icon names, drawn with the nearest Material icon
const kitIconData = <String, IconData>{
  'test-tube': Icons.science_outlined,
  'syringe': Icons.vaccines_outlined,
  'bandage': Icons.healing_outlined,
  'baby': Icons.child_friendly_outlined,
  'heart-pulse': Icons.monitor_heart_outlined,
  'pill': Icons.medication_outlined,
  'package': Icons.inventory_2_outlined,
  'stethoscope': Icons.medical_services_outlined,
  'droplet': Icons.water_drop_outlined,
  'shield-plus': Icons.health_and_safety_outlined,
};

/// '#be185d' → a Color (the kit colours are all 700-level: white reads on each)
Color kitColor(String hex) {
  final h = hex.replaceFirst('#', '');
  return Color(int.tryParse(h.length == 6 ? 'ff$h' : 'ffbe185d', radix: 16) ?? 0xffbe185d);
}

/// The kit's icon on its colour
class KitIcon extends StatelessWidget {
  const KitIcon({super.key, required this.icon, required this.color, this.size = 16});
  final String icon, color;
  final double size;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(4),
    decoration: BoxDecoration(color: kitColor(color), borderRadius: BorderRadius.circular(7)),
    child: Icon(kitIconData[icon] ?? Icons.inventory_2_outlined, size: size, color: Colors.white),
  );
}

/// "KIT" in white on the kit's colour
class KitBadge extends StatelessWidget {
  const KitBadge({super.key, required this.color});
  final String color;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(left: 6),
    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
    decoration: BoxDecoration(color: kitColor(color), borderRadius: BorderRadius.circular(99)),
    child: const Text('KIT', style: TextStyle(color: Colors.white, fontSize: 10.5, fontWeight: FontWeight.w800, letterSpacing: .8)),
  );
}
