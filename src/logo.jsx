// RxPOS mark: a white medical cross with a two-tone capsule laid across it, on a teal–emerald tile.
// The same drawing is used for the app icon (build/icon.svg), favicon and splash screen.
export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="rxg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f766e"/><stop offset=".55" stop-color="#0d9488"/><stop offset="1" stop-color="#10b981"/></linearGradient>
    <linearGradient id="rxs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <clipPath id="rxc"><rect x="27" y="18" width="10" height="28" rx="5" transform="rotate(45 32 32)"/></clipPath>
  </defs>
  <rect width="64" height="64" rx="15" fill="url(#rxg)"/>
  <rect width="64" height="64" rx="15" fill="url(#rxs)"/>
  <path d="M26.5 12h11a2.5 2.5 0 0 1 2.5 2.5V24h9.5a2.5 2.5 0 0 1 2.5 2.5v11a2.5 2.5 0 0 1-2.5 2.5H40v9.5a2.5 2.5 0 0 1-2.5 2.5h-11a2.5 2.5 0 0 1-2.5-2.5V40h-9.5A2.5 2.5 0 0 1 12 37.5v-11A2.5 2.5 0 0 1 14.5 24H24v-9.5a2.5 2.5 0 0 1 2.5-2.5z" fill="#fff"/>
  <g clip-path="url(#rxc)"><rect x="18" y="18" width="28" height="14" fill="#0d9488"/><rect x="18" y="32" width="28" height="14" fill="#f59e0b"/></g>
  <rect x="27" y="18" width="10" height="28" rx="5" transform="rotate(45 32 32)" fill="none" stroke="#fff" stroke-width="1.6"/>
</svg>`;

/** The pharmacy's own logo (set by the owner) or the RxPOS mark */
export function BrandLogo({ src, size = 34 }) {
  return src ? <img className="logo-mark logo-img" src={src} alt="" style={{ width: size, height: size }} /> : <Logo size={size} />;
}

export function Logo({ size = 34, className = '' }) {
  return <span className={'logo-mark ' + className} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: LOGO_SVG }} aria-hidden="true" />;
}
