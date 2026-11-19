// smartcrop.js — subject-aware cropping.
//
// When a photo lands in a panel whose shape differs from the photo, a centre
// crop often cuts the subject in half. Saltline instead measures a saliency
// map of the photo — saturated colours, local contrast and warm skin-like
// tones count most, with a gentle bias toward the upper two thirds where
// faces usually are — and picks the crop window of the panel's aspect that
// holds the most of it. The reader is an integral image, so each candidate
// window costs one lookup and the whole search runs in a few milliseconds.
//
// The result is only a starting point: dragging a panel or scrolling on it
// overrides the crop, and the Smart Crop button re-runs the search.

const SALIENCY_W = 128; // saliency maps are computed at this width

// computeSaliency returns { map, w, h } — a Float32Array of per-cell scores
// for the image, normalised so the mean cell scores about 1.
export function computeSaliency(image) {
  const w = SALIENCY_W;
  const h = Math.max(8, Math.round((SALIENCY_W * image.naturalHeight) / image.naturalWidth));
  const canvas = computeSaliency._canvas ?? (computeSaliency._canvas = document.createElement('canvas'));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;

  const lum = new Float32Array(w * h);
  const map = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 255000;
  }
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const r = d[i * 4] / 255;
      const g = d[i * 4 + 1] / 255;
      const b = d[i * 4 + 2] / 255;
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const saturation = mx === 0 ? 0 : (mx - mn) / mx;
      const right = lum[y * w + Math.min(w - 1, x + 1)];
      const down = lum[Math.min(h - 1, y + 1) * w + x];
      const contrast = Math.min(1, (Math.abs(lum[i] - right) + Math.abs(lum[i] - down)) * 3.2);
      // Warm, mid-bright, red-dominant cells read as skin in a small map.
      const skin = r > 0.32 && r > g * 1.08 && g > b * 1.05 && lum[i] > 0.18 && lum[i] < 0.92 ? 1 : 0;
      const heightBias = 1 - 0.35 * (y / Math.max(1, h - 1)); // favour the upper field
      const score = (0.42 * saturation + 0.33 * contrast + 0.8 * skin + 0.08) * heightBias;
      map[i] = score;
      total += score;
    }
  }
  const mean = total / (w * h) || 1;
  for (let i = 0; i < map.length; i++) map[i] /= mean;
  return { map, w, h };
}

// integralOf builds the summed-area table of a saliency map.
function integralOf(sal) {
  const { map, w, h } = sal;
  const table = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += map[y * w + x];
      table[(y + 1) * (w + 1) + x + 1] = table[y * (w + 1) + x + 1] + rowSum;
    }
  }
  return table;
}

function windowSum(table, w, x0, y0, x1, y1) {
  const W = w + 1;
  return table[y1 * W + x1] - table[y0 * W + x1] - table[y1 * W + x0] + table[y0 * W + x0];
}

// bestCrop searches windows of the panel's aspect ratio at several scales and
// returns the crop { sx, sy, sw, sh } in source pixels that keeps the most
// salient part of the photo. Windows are scored by saliency density with a
// mild preference for larger windows, so a clear single subject is framed
// tightly while a busy scene keeps more of itself.
export function bestCrop(image, saliency, aspect) {
  const srcW = image.naturalWidth;
  const srcH = image.naturalHeight;
  const table = integralOf(saliency);
  const { w, h } = saliency;

  // The saliency centroid: windows are rewarded for keeping it inside, so a
  // tight crop frames the subject instead of slicing through it.
  let csx = 0;
  let csy = 0;
  let ctotal = 0;
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const v = saliency.map[yy * w + xx];
      csx += (xx + 0.5) * v;
      csy += (yy + 0.5) * v;
      ctotal += v;
    }
  }
  const centroidX = ctotal ? csx / ctotal : w / 2;
  const centroidY = ctotal ? csy / ctotal : h / 2;

  let best = null;
  for (const scale of [1, 0.86, 0.72, 0.58]) {
    // Largest window of this aspect that fits the photo, shrunk by scale.
    let winW = srcW;
    let winH = winW / aspect;
    if (winH > srcH) {
      winH = srcH;
      winW = winH * aspect;
    }
    winW *= scale;
    winH *= scale;
    const gw = Math.max(4, Math.round((winW / srcW) * w));
    const gh = Math.max(4, Math.round((winH / srcH) * h));
    const stepX = Math.max(1, Math.floor((w - gw) / 14));
    const stepY = Math.max(1, Math.floor((h - gh) / 14));
    for (let gy = 0; gy + gh <= h; gy += stepY) {
      for (let gx = 0; gx + gw <= w; gx += stepX) {
        const density = windowSum(table, w, gx, gy, gx + gw, gy + gh) / (gw * gh);
        const dcx = (gx + gw / 2 - centroidX) / w;
        const dcy = (gy + gh / 2 - centroidY) / h;
        const anchor = Math.exp(-(dcx * dcx + dcy * dcy) / 0.045);
        const score = density * (0.6 + 0.4 * scale) * (0.78 + 0.34 * anchor);
        if (!best || score > best.score) {
          best = { score, sx: (gx / w) * srcW, sy: (gy / h) * srcH, sw: winW, sh: winH };
        }
      }
    }
  }
  return best;
}

// cropAroundFocus is the cheap fallback used while a photo is still loading
// its saliency: a full-aspect window centred on the saliency centroid.
export function cropAroundFocus(image, saliency, aspect) {
  const { map, w, h } = saliency;
  let sx = 0;
  let sy = 0;
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = map[y * w + x];
      sx += (x + 0.5) * v;
      sy += (y + 0.5) * v;
      total += v;
    }
  }
  const fx = total ? sx / total / w : 0.5;
  const fy = total ? sy / total / h : 0.42;
  const srcW = image.naturalWidth;
  const srcH = image.naturalHeight;
  let winW = srcW;
  let winH = winW / aspect;
  if (winH > srcH) {
    winH = srcH;
    winW = winH * aspect;
  }
  const x = Math.min(srcW - winW, Math.max(0, fx * srcW - winW / 2));
  const y = Math.min(srcH - winH, Math.max(0, fy * srcH - winH / 2));
  return { sx: x, sy: y, sw: winW, sh: winH };
}
