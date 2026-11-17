import { LOGO_SVG } from './logomark.js';

export { LOGO_SVG };


/** The pharmacy's own logo (set by the owner) or the RxPOS mark */
export function BrandLogo({ src, size = 34 }) {
  return src ? <img className="logo-mark logo-img" src={src} alt="" style={{ width: size, height: size }} /> : <Logo size={size} />;
}

export function Logo({ size = 34, className = '' }) {
  return <span className={'logo-mark ' + className} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: LOGO_SVG }} aria-hidden="true" />;
}
