// Surface styles: a look-and-feel layer the user switches, independent of the colour theme (themes.js). Each style
// only changes how surfaces are rendered (backgrounds, borders, shadows, blur) via CSS under [data-surface="…"] in
// styles.css; the colour tokens and text colours stay the theme's, so contrast is preserved across every palette and
// in light and dark. (See the four styles below.)
export const STYLES = [
  { id: 'flat', name: 'Flat', hint: 'The standard clean look' },
  { id: 'glass', name: 'Glassmorphism', hint: 'Frosted, translucent panels' },
  { id: 'clay', name: 'Claymorphism', hint: 'Soft, puffy, rounded' },
  { id: 'skeuomorphism', name: 'Skeuomorphism', hint: 'Tactile, with depth and bevels' },
  { id: 'neumorphism', name: 'Neumorphism', hint: 'Soft extruded, low contrast' },
];
export const styleById = (id) => STYLES.find((s) => s.id === id) || STYLES[0];

/** Apply a surface style to the page (a data attribute on <html>; CSS does the rest). */
export function applyStyle(id) {
  document.documentElement.dataset.surface = styleById(id).id;
}

const KEY = 'rxpos-surface-style';
export const savedStyle = () => { try { return styleById(localStorage.getItem(KEY)).id; } catch { return 'flat'; } };
export const saveStyle = (id) => { try { localStorage.setItem(KEY, styleById(id).id); } catch { /* storage blocked */ } };
