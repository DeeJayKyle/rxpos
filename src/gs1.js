// GS1 codes on medicine packs (workplan step 21): the 2D DataMatrix on a box carries the product number (GTIN, AI 01),
// the expiry (AI 17, YYMMDD), the batch (AI 10) and often a serial number (AI 21). Scanning it fills the medicine,
// batch and expiry at Add Stock and picks that batch at the till. Same rules in Dart:
// rxpos_flutter/lib/core/rules/gs1.dart; both are checked against tests/gs1-cases.json.
//
// What a scan can look like:
//   - a USB scanner or the camera: "0105012345678900" + "17271231" + "10ABC123" <GS> "21XYZ" (GS = \x1d separates a
//     variable-length field from the next), sometimes with a symbology prefix such as "]d2";
//   - a scanner that cannot type GS sends nothing there: a variable field then runs to the end, so with the usual
//     order (01, 17, 10 last) everything is still read; a serial printed before the batch then can't be separated;
//   - the printed text under the code: "(01)05012345678900(17)271231(10)ABC123".

const GS = '\x1d';
// fixed-length AIs this app reads or must skip (digits after the AI); anything else ends the reading
const FIXED = { '01': 14, '02': 14, '11': 6, '13': 6, '15': 6, '16': 6, '17': 6, '20': 2 };
const VARIABLE = { 10: 20, 21: 20, 22: 20, 240: 30, 241: 30, 30: 8, 37: 8, 710: 20, 711: 20, 712: 20, 713: 20, 714: 20 };

/** GTIN check digit (mod 10, weights 3/1 from the right) */
export function gtinValid(g) {
  if (!/^\d{8}$|^\d{12,14}$/.test(g)) return false;
  const d = g.split('').map(Number), check = d.pop();
  const sum = d.reverse().reduce((a, x, i) => a + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** YYMMDD → YYYY-MM-DD; a day of 00 means the last day of that month (GS1 rule) */
export function gs1Date(v) {
  if (!/^\d{6}$/.test(v || '')) return '';
  const y = 2000 + Number(v.slice(0, 2)), m = Number(v.slice(2, 4));
  let d = Number(v.slice(4, 6));
  if (m < 1 || m > 12) return '';
  if (d === 0) d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Read a scan. Returns { gtin, expiry, batch, serial } (expiry as YYYY-MM-DD, '' when absent) or null when it is not
 * a GS1 code with a valid product number (an ordinary barcode, a name being typed).
 */
export function parseGs1(raw) {
  let s = String(raw ?? '').trim().replace(/^\][A-Za-z]\d/, '').replace(/<GS>|\{GS\}/gi, GS);
  const f = {};
  if (s.startsWith('(')) {
    for (const m of s.matchAll(/\((\d{2,4})\)([^(]*)/g)) f[m[1]] = m[2].replace(new RegExp(GS, 'g'), '').trim();
  } else {
    if (!/^0[12]\d{14}/.test(s)) return null;
    while (s.length) {
      if (s[0] === GS) { s = s.slice(1); continue; }
      const ai2 = s.slice(0, 2), ai3 = s.slice(0, 3);
      if (FIXED[ai2]) { f[ai2] = s.slice(2, 2 + FIXED[ai2]); s = s.slice(2 + FIXED[ai2]); continue; }
      const ai = VARIABLE[ai3] ? ai3 : VARIABLE[ai2] ? ai2 : null;
      if (!ai) break;
      const rest = s.slice(ai.length), end = rest.indexOf(GS);
      f[ai] = (end < 0 ? rest : rest.slice(0, end)).slice(0, VARIABLE[ai]);
      s = end < 0 ? '' : rest.slice(end + 1);
    }
  }
  const gtin = f['01'] || f['02'] || '';
  if (!gtinValid(gtin)) return null;
  return { gtin, expiry: gs1Date(f['17']), batch: f['10'] || '', serial: f['21'] || '' };
}

/** The same product number, whatever its length (a GTIN-14 with a leading 0 is the EAN-13 printed on the box) */
export const sameGtin = (a, b) => {
  const x = String(a || '').trim(), y = String(b || '').trim();
  return /^\d{8,14}$/.test(x) && /^\d{8,14}$/.test(y) && x.padStart(14, '0') === y.padStart(14, '0');
};

/** The medicine with this product number as its barcode */
export const findByGtin = (products, gtin) => (products || []).find((p) => p.barcode && sameGtin(p.barcode, gtin)) || null;
