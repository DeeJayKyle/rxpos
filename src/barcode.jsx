// Code 128 barcode encoder + SVG renderer (readable by every USB/Bluetooth barcode scanner).
// All-digit codes of even length use code set C (twice as compact); everything else uses code set B.
const PATTERNS = (
  '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 ' +
  '123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 ' +
  '232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 ' +
  '313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 ' +
  '111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 ' +
  '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 ' +
  '114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'
).split(' ');
const START_B = 104, START_C = 105, STOP = 106;

/** → array of module widths (bar, space, bar, …) or null if the text can't be encoded */
export function code128(text) {
  const s = String(text ?? '');
  if (!s || /[^\x20-\x7e]/.test(s)) return null;
  const useC = /^\d+$/.test(s) && s.length % 2 === 0 && s.length >= 4;
  const codes = [useC ? START_C : START_B];
  if (useC) for (let i = 0; i < s.length; i += 2) codes.push(Number(s.slice(i, i + 2)));
  else for (const ch of s) codes.push(ch.charCodeAt(0) - 32);
  const check = codes.reduce((sum, c, i) => sum + c * (i || 1), 0) % 103;
  codes.push(check, STOP);
  return codes.flatMap((c) => [...PATTERNS[c]].map(Number));
}

/** SVG barcode. `height` and `module` (narrowest bar width) are in SVG units; it scales to its container. */
export function Barcode({ value, height = 40, module = 2, showText = true, className = '' }) {
  const widths = code128(value);
  if (!widths) return <span className="muted small">No barcode</span>;
  const quiet = 10 * module;
  const total = widths.reduce((a, w) => a + w, 0) * module + quiet * 2;
  const bars = [];
  let x = quiet;
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push(<rect key={i} x={x} y="0" width={w * module} height={height} />);
    x += w * module;
  });
  const textH = showText ? 14 : 0;
  return (
    <svg className={'barcode ' + className} viewBox={`0 0 ${total} ${height + textH}`} preserveAspectRatio="none" role="img" aria-label={`Barcode ${value}`}>
      <rect width={total} height={height + textH} fill="#fff" />
      <g fill="#000">{bars}</g>
      {showText && <text x={total / 2} y={height + 12} textAnchor="middle" fontSize="12" fontFamily="ui-monospace, Consolas, monospace" fill="#000">{value}</text>}
    </svg>
  );
}

/** A new internal barcode for products that have none: "20" + 10 digits (in-store range, even length → compact). */
export const newInternalBarcode = (existing) => {
  for (;;) {
    const code = '20' + String(Math.floor(Math.random() * 1e10)).padStart(10, '0');
    if (!existing.has(code)) return code;
  }
};
