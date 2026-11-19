// What's Written™ · © 2026 Jayant Singh Amethia
// Finds handwriting in a photo of a projected slide and cuts it into pieces
// a line-level handwriting model can read. Pure canvas code, no dependencies.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
}
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

// Longest run of indexes where arr[i] >= thr
function longestRun(arr, thr) {
  let best = [0, -1], s = -1;
  for (let i = 0; i <= arr.length; i++) {
    if (i < arr.length && arr[i] >= thr) { if (s < 0) s = i; }
    else if (s >= 0) { if (i - 1 - s > best[1] - best[0]) best = [s, i - 1]; s = -1; }
  }
  return best;
}

/** Find the bright projection screen / board. Returns {x0,y0,x1,y1} in image pixels. */
export function findScreen(px, W, H) {
  const bright = new Uint8Array(W * H);
  // brightness threshold adapts to the photo: the screen is the brightest large area
  const vs = []; for (let p = 0; p < px.length; p += 4 * 37) vs.push(Math.max(px[p], px[p + 1], px[p + 2]) / 255);
  vs.sort((a, b) => a - b);
  const vThr = Math.min(0.62, vs[Math.floor(vs.length * 0.85)] * 0.72);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    const [, s, v] = rgb2hsv(px[p], px[p + 1], px[p + 2]);
    bright[i] = v > vThr && s < 0.65 ? 1 : 0;
  }
  const rows = new Float32Array(H);
  for (let y = 0; y < H; y++) { let c = 0; for (let x = 0; x < W; x++) c += bright[y * W + x]; rows[y] = c / W; }
  let [y0, y1] = longestRun(rows, 0.45);
  if (y1 - y0 < H * 0.12) return { x0: 0, y0: 0, x1: W - 1, y1: H - 1, found: false };
  const cols = new Float32Array(W);
  for (let x = 0; x < W; x++) { let c = 0; for (let y = y0; y <= y1; y++) c += bright[y * W + x]; cols[x] = c / (y1 - y0 + 1); }
  let [x0, x1] = longestRun(cols, 0.5);
  if (x1 - x0 < W * 0.2) { x0 = 0; x1 = W - 1; }
  return { x0, y0, x1, y1, found: true };
}

/**
 * Ink mask inside the region: 1 where there is handwriting.
 * Prefers coloured ink (his pen) over dark printed text; falls back to dark ink.
 */
export function inkMask(px, W, H, r) {
  const n = W * H, mask = new Uint8Array(n);
  // background hue/value = median of bright pixels in region
  const hues = [], vals = [];
  for (let y = r.y0; y <= r.y1; y += 3) for (let x = r.x0; x <= r.x1; x += 3) {
    const p = (y * W + x) * 4; const [h, s, v] = rgb2hsv(px[p], px[p + 1], px[p + 2]);
    if (v > 0.55) { hues.push(s > 0.08 ? h : -1); vals.push(v); }
  }
  hues.sort((a, b) => a - b); vals.sort((a, b) => a - b);
  const bgHue = hues.filter(h => h >= 0)[Math.floor(hues.filter(h => h >= 0).length / 2)] ?? -1;
  const bgV = vals[Math.floor(vals.length / 2)] ?? 0.9;
  let colored = 0, dark = 0;
  const col = new Uint8Array(n), drk = new Uint8Array(n);
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    const i = y * W + x, p = i * 4; const [h, s, v] = rgb2hsv(px[p], px[p + 1], px[p + 2]);
    if (s > 0.35 && v > 0.2 && v < bgV * 0.92 && bgHue >= 0 && hueDist(h, bgHue) > 70) { col[i] = 1; colored++; }
    if (v < bgV * 0.74 && s < 0.55) { drk[i] = 1; dark++; }
  }
  const area = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
  const useColored = colored > area * 0.0015;
  const src = useColored ? col : drk;
  for (let i = 0; i < n; i++) mask[i] = src[i];
  return { mask, mode: useColored ? 'colored' : 'dark', bgHue, bgV };
}

/** Remove specks: connected components smaller than minArea pixels. */
export function despeckle(mask, W, H, r, minArea) {
  const seen = new Uint8Array(W * H), stack = [];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    const s = y * W + x; if (!mask[s] || seen[s]) continue;
    const comp = []; stack.push(s); seen[s] = 1;
    while (stack.length) {
      const i = stack.pop(); comp.push(i);
      const cx = i % W, cy = (i - cx) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < r.x0 || ny < r.y0 || nx > r.x1 || ny > r.y1) continue;
        const j = ny * W + nx; if (mask[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    let bx0 = W, by0 = H, bx1 = 0, by1 = 0;
    for (const i of comp) { const cx = i % W, cy = (i - cx) / W; if (cx < bx0) bx0 = cx; if (cx > bx1) bx1 = cx; if (cy < by0) by0 = cy; if (cy > by1) by1 = cy; }
    const boxA = (bx1 - bx0 + 1) * (by1 - by0 + 1), fill = comp.length / boxA;
    const regionH = r.y1 - r.y0 + 1;
    const solid = comp.length > 300 && fill > 0.42;           // filled shapes are not pen strokes
    const huge = (by1 - by0 + 1) > regionH * 0.3;            // taller than any handwritten line
    if (comp.length < minArea || solid || huge) for (const i of comp) mask[i] = 0;
  }
}

/** Cut the mask into text-line bands, then each band into word groups. */
export function segment(mask, W, H, r) {
  const rows = new Float32Array(H);
  for (let y = r.y0; y <= r.y1; y++) { let c = 0; for (let x = r.x0; x <= r.x1; x++) c += mask[y * W + x]; rows[y] = c; }
  // smooth
  const sm = new Float32Array(H), k = 3;
  for (let y = r.y0; y <= r.y1; y++) { let s = 0, m = 0; for (let d = -k; d <= k; d++) { const yy = y + d; if (yy >= r.y0 && yy <= r.y1) { s += rows[yy]; m++; } } sm[y] = s / m; }
  let peak = 0; for (let y = r.y0; y <= r.y1; y++) if (sm[y] > peak) peak = sm[y];
  const thr = Math.max(0.6, peak * 0.1);
  let bands = [], s = -1;
  for (let y = r.y0; y <= r.y1 + 1; y++) {
    const on = y <= r.y1 && sm[y] > thr;
    if (on && s < 0) s = y; else if (!on && s >= 0) { bands.push([s, y - 1]); s = -1; }
  }
  if (!bands.length) return [];
  // merge bands separated by small gaps (i-dots, descenders)
  const hts = bands.map(b => b[1] - b[0] + 1).sort((a, b) => a - b);
  const medH = hts[Math.floor(hts.length / 2)] || 10;
  const merged = [bands[0]];
  for (const b of bands.slice(1)) {
    const last = merged[merged.length - 1];
    if (b[0] - last[1] < medH * 0.2 || (b[1] - b[0] < medH * 0.25 && b[0] - last[1] < medH * 0.5)) last[1] = Math.max(last[1], b[1]);
    else merged.push(b);
  }
  bands = merged.filter(b => b[1] - b[0] + 1 >= Math.max(6, medH * 0.3));

  const pieces = [];
  bands.forEach(([y0, y1], li) => {
    const h = y1 - y0 + 1;
    const cols = new Uint16Array(W);
    for (let x = r.x0; x <= r.x1; x++) { let c = 0; for (let y = y0; y <= y1; y++) c += mask[y * W + x]; cols[x] = c; }
    // group columns into chunks; split where the gap is wider than ~1.2 line heights
    const gapMax = Math.max(8, h * 1.2);
    let x0 = -1, lastInk = -1;
    const flush = () => { if (x0 >= 0) pieces.push({ line: li, x0, x1: lastInk, y0, y1 }); x0 = -1; };
    for (let x = r.x0; x <= r.x1; x++) {
      if (cols[x] > 0) { if (x0 < 0) x0 = x; else if (x - lastInk > gapMax) { flush(); x0 = x; } lastInk = x; }
    }
    flush();
  });
  // drop pieces glued to the bottom edge of the screen (heads, desks), and tiny marks
  return pieces.filter(p => p.y1 < r.y1 - 3).filter(p => (p.x1 - p.x0 + 1) * (p.y1 - p.y0 + 1) > 120 && (p.x1 - p.x0) > 6);
}

/** Render a piece as black ink on white, padded — the look the model was trained on. */
export function pieceCanvas(mask, W, piece, targetH = 96) {
  const pad = Math.round((piece.y1 - piece.y0 + 1) * 0.35) + 4;
  const w = piece.x1 - piece.x0 + 1 + pad * 2, h = piece.y1 - piece.y0 + 1 + pad * 2;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = piece.x0 - pad + x, sy = piece.y0 - pad + y;
    let on = false;
    for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1 && !on; dx++) {
      const xx = sx + dx, yy = sy + dy; if (xx >= 0 && yy >= 0 && xx < W && mask[yy * W + xx]) on = true;
    }
    const o = (y * w + x) * 4, v = on ? 0 : 255;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // thicken thin strokes slightly by scaling with smoothing
  const sc = clamp(targetH / h, 0.5, 4);
  const out = document.createElement('canvas'); out.width = Math.round(w * sc); out.height = Math.round(h * sc);
  const o2 = out.getContext('2d'); o2.imageSmoothingEnabled = true; o2.drawImage(c, 0, 0, out.width, out.height);
  return out;
}

/** Whole pipeline: canvas with the photo -> { region, mode, pieces:[{line,x0..,canvas}] } */
export function findHandwriting(canvas) {
  const W = canvas.width, H = canvas.height;
  const px = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const region = findScreen(px, W, H);
  const { mask, mode } = inkMask(px, W, H, region);
  despeckle(mask, W, H, region, Math.max(12, Math.round(W * H / 60000)));
  const dense = p => { let c = 0; for (let y = p.y0; y <= p.y1; y++) for (let x = p.x0; x <= p.x1; x++) c += mask[y * W + x]; return c / ((p.x1 - p.x0 + 1) * (p.y1 - p.y0 + 1)); };
  const pieces = segment(mask, W, H, region).filter(p => dense(p) < 0.35)   // solid blobs are not writing
    .map(p => ({ ...p, canvas: pieceCanvas(mask, W, p) }));
  return { region, mode, pieces, mask };
}

// ---------- word clean-up with the course dictionary ----------
export function levenshtein(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i), cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

export function makeCorrector(dict) {
  const fixes = new Map((dict.fixes || []).map(f => [String(f.wrong).toLowerCase(), String(f.right)]));
  const vocab = new Set();
  for (const t of dict.terms || []) for (const w of String(t).toLowerCase().split(/[^a-zäöüß-]+/)) if (w.length >= 4) vocab.add(w);
  for (const f of dict.fixes || []) for (const w of String(f.right).toLowerCase().split(/\s+/)) if (w.length >= 4) vocab.add(w);
  const vlist = [...vocab];
  return text => text.split(/(\s+)/).map(tok => {
    const m = tok.match(/^([^A-Za-zÄÖÜäöüß]*)([A-Za-zÄÖÜäöüß-]+)([^A-Za-zÄÖÜäöüß]*)$/);
    if (!m) return tok;
    const [, pre, word, post] = m, low = word.toLowerCase();
    if (fixes.has(low)) return pre + fixes.get(low) + post;
    if (low.length < 4 || vocab.has(low)) return tok;
    let best = null, bd = 99;
    for (const v of vlist) { if (Math.abs(v.length - low.length) > 2) continue; const d = levenshtein(low, v); if (d < bd) { bd = d; best = v; } }
    const allow = low.length >= 8 ? 2 : 1;
    if (best && bd <= allow) { const out = word[0] === word[0].toUpperCase() ? best[0].toUpperCase() + best.slice(1) : best; return pre + out + post; }
    return tok;
  }).join('');
}
