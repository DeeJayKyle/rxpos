// Cleaning up a photo of an invoice before it is read (pure: works on the RGBA pixels of a canvas; tested in
// tests/unit-invoice-match.mjs). Phone photos of invoices are often taken in a shop: a shadow across half the page,
// grey paper, faint ballpoint or a carbon copy. Two steps make the writing stand out, the way a scanner would:
//   1. even out the light: the paper's brightness is measured in a grid of patches and each pixel is lifted by its
//      patch (shadows and grey corners become white paper; the colour of stamps and pens is kept)
//   2. stretch the contrast: the darkest ink to near black, the paper to white
// Nothing is guessed or drawn in: only brightness changes.

/** Even out the light and stretch the contrast of RGBA pixels in place. Returns the same array. */
export function enhancePixels(px, width, height) {
  if (!px || !width || !height) return px;
  const lum = (i) => (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
  // 1. paper brightness per patch: the brightest pixels of the patch (sampled)
  const cell = Math.max(8, Math.ceil(Math.max(width, height) / 40));
  const gw = Math.ceil(width / cell), gh = Math.ceil(height / cell);
  const grid = new Float32Array(gw * gh);
  const step = Math.max(1, Math.floor(cell / 8));
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const vals = [];
    for (let y = gy * cell; y < Math.min(height, (gy + 1) * cell); y += step) for (let x = gx * cell; x < Math.min(width, (gx + 1) * cell); x += step) vals.push(lum((y * width + x) * 4));
    vals.sort((a, b) => a - b);
    grid[gy * gw + gx] = vals[Math.floor(vals.length * 0.9)] || 255; // the 90th percentile: paper, not a stray bright speck
  }
  // the middle value of each patch and its neighbours: a patch covered by a stamp or a thick line takes the paper
  // around it, while the edge of a shadow stays sharp (an average would let the light side bleed into the shadow)
  const paper = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const v = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && xx >= 0 && yy < gh && xx < gw) v.push(grid[yy * gw + xx]); }
    v.sort((a, b) => a - b);
    paper[y * gw + x] = v[v.length >> 1];
  }
  const at = (x, y) => { // the paper's brightness at a pixel, from the four patches around it
    const fx = Math.min(gw - 1, Math.max(0, x / cell - 0.5)), fy = Math.min(gh - 1, Math.max(0, y / cell - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
    const top = paper[y0 * gw + x0] * (1 - tx) + paper[y0 * gw + x1] * tx, bot = paper[y1 * gw + x0] * (1 - tx) + paper[y1 * gw + x1] * tx;
    return top * (1 - ty) + bot * ty;
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const gain = Math.min(3, 255 / Math.max(40, at(x, y))); // at most 3× (a dark table edge outside the page stays dark)
    const i = (y * width + x) * 4;
    px[i] = Math.min(255, px[i] * gain); px[i + 1] = Math.min(255, px[i + 1] * gain); px[i + 2] = Math.min(255, px[i + 2] * gain);
  }
  // 2. contrast: the darkest 0.5% of the page to black, the brightest 2% (the paper, now even) to white
  const hist = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 16) hist[Math.round(lum(i))]++; // every 4th pixel is plenty
  const total = hist.reduce((a, b) => a + b, 0);
  let lo = 0, hi = 255, acc = 0;
  for (; lo < 255; lo++) { acc += hist[lo]; if (acc > total * 0.005) break; }
  for (acc = 0; hi > 0; hi--) { acc += hist[hi]; if (acc > total * 0.02) break; }
  if (hi - lo < 30) return px; // a blank or flat page: leave it
  const k = 255 / (hi - lo);
  for (let i = 0; i < px.length; i += 4) for (let c = 0; c < 3; c++) px[i + c] = Math.max(0, Math.min(255, (px[i + c] - lo) * k));
  return px;
}
