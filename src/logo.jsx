import { LOGO_SVG } from './logomark.js';

export { LOGO_SVG };


/** The pharmacy's own logo (set by the owner) or the RxPOS mark */
export function BrandLogo({ src, size = 34 }) {
  return src ? <img className="logo-mark logo-img" src={src} alt="" style={{ width: size, height: size }} /> : <Logo size={size} />;
}

export function Logo({ size = 34, className = '' }) {
  return <span className={'logo-mark ' + className} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: LOGO_SVG }} aria-hidden="true" />;
}

// E6 (UI batch 3): the pharmacy's own logo: the one the owner set (branding), else the one the pharmacy uploaded in
// Settings → Pharmacy (a file in the pharmacy's cloud, `settings.logo`). Files are read from the cloud this device
// syncs with (setFileBase, set by the app once it knows it).
let fileBase = '';
export const setFileBase = (url) => { fileBase = url || ''; };
export function pharmacyLogo(db) {
  const owner = db?.license?.[0]?.branding?.logo;
  if (owner) return owner;
  const p = db?.settings?.logo;
  if (!p) return '';
  try { return new URL(p, fileBase || (typeof location !== 'undefined' ? location.href : 'https://rxpos.invalid/')).href; } catch { return ''; }
}
