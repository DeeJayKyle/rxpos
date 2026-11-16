// A kit's icon (1.10.0, src/kits.js KIT_ICONS): the lucide drawing for its name, on the kit's colour
import { TestTube, Syringe, Bandage, Baby, HeartPulse, Pill, Package, Stethoscope, Droplet, ShieldPlus } from 'lucide-react';

const ICONS = { 'test-tube': TestTube, syringe: Syringe, bandage: Bandage, baby: Baby, 'heart-pulse': HeartPulse, pill: Pill, package: Package, stethoscope: Stethoscope, droplet: Droplet, 'shield-plus': ShieldPlus };

export const kitIconOf = (name) => ICONS[name] || Package;

/** the icon alone (decorative: the kit's name is always written next to it) */
export function KitGlyph({ icon, size = 16 }) {
  const I = kitIconOf(icon);
  return <I size={size} aria-hidden="true" />;
}

/** the icon in a round badge of the kit's colour */
export default function KitIcon({ icon, color, size = 18, className = '' }) {
  return <span className={'kit-icon ' + className} style={{ '--kit': color || '#be185d' }} aria-hidden="true"><KitGlyph icon={icon} size={size} /></span>;
}
