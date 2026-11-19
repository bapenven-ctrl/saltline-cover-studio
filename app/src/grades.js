// grades.js — the colour pipeline of Saltline Cover Studio.
//
// Every panel of a cover passes through the same three-stage pipeline:
//   1. auto grade   — a per-photo correction measured from the photo itself
//                     (black/white point stretch plus a grey-world white
//                     balance sampled from its bright, near-neutral pixels);
//   2. gradient map — the photo's luminance is re-coloured through one of the
//                     studio's grade ramps, the Vice City sunset / neon look;
//   3. poster ink   — luminance is snapped toward a small set of ink bands and
//                     blended with the mapped colour, which is what turns a
//                     photograph into flat poster art; deep shadows then get a
//                     halftone dot screen, and the finished panel is sealed
//                     with film grain and a vignette.
//
// The pipeline is deterministic: the grain comes from a seeded generator, so
// the same photo with the same settings always draws the same cover.

// A grade ramp: stops of [luminance 0..1, [r, g, b]] from shadow to highlight.
export const GRADES = [
  {
    id: 'sunset',
    name: 'Sunset',
    stops: [
      [0.0, [26, 10, 46]],
      [0.22, [88, 24, 92]],
      [0.45, [196, 44, 108]],
      [0.68, [244, 110, 62]],
      [0.86, [252, 186, 92]],
      [1.0, [255, 240, 196]],
    ],
  },
  {
    id: 'neon',
    name: 'Neon',
    stops: [
      [0.0, [8, 8, 32]],
      [0.25, [22, 62, 128]],
      [0.48, [10, 168, 178]],
      [0.7, [198, 52, 168]],
      [0.88, [248, 120, 200]],
      [1.0, [240, 252, 255]],
    ],
  },
  {
    id: 'golden',
    name: 'Golden',
    stops: [
      [0.0, [30, 16, 10]],
      [0.25, [96, 48, 22]],
      [0.5, [188, 102, 40]],
      [0.72, [238, 164, 76]],
      [0.9, [252, 214, 140]],
      [1.0, [255, 246, 220]],
    ],
  },
  {
    id: 'miami',
    name: 'Miami',
    stops: [
      [0.0, [10, 34, 44]],
      [0.24, [16, 96, 104]],
      [0.46, [64, 186, 160]],
      [0.66, [240, 130, 170]],
      [0.85, [252, 196, 150]],
      [1.0, [255, 248, 232]],
    ],
  },
  {
    id: 'ultraviolet',
    name: 'Ultraviolet',
    stops: [
      [0.0, [16, 6, 38]],
      [0.26, [58, 20, 110]],
      [0.5, [124, 44, 196]],
      [0.72, [226, 62, 160]],
      [0.9, [250, 150, 210]],
      [1.0, [226, 240, 255]],
    ],
  },
  {
    id: 'noir',
    name: 'Noir Heat',
    stops: [
      [0.0, [12, 10, 14]],
      [0.28, [52, 34, 34]],
      [0.52, [128, 56, 44]],
      [0.74, [204, 116, 72]],
      [0.9, [232, 188, 138]],
      [1.0, [250, 240, 224]],
    ],
  },
];

export function gradeById(id) {
  return GRADES.find((g) => g.id === id) ?? GRADES[0];
}

// buildLut expands a grade's stops into a 256-entry RGB lookup table.
export function buildLut(grade) {
  const lut = new Uint8Array(256 * 3);
  const stops = grade.stops;
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) {
        a = stops[s];
        b = stops[s + 1];
        break;
      }
    }
    const span = Math.max(1e-6, b[0] - a[0]);
    const f = Math.min(1, Math.max(0, (t - a[0]) / span));
    for (let c = 0; c < 3; c++) {
      lut[i * 3 + c] = Math.round(a[1][c] + (b[1][c] - a[1][c]) * f);
    }
  }
  return lut;
}

// analyzeAutoGrade measures a photo (as ImageData) and returns the correction
// the pipeline applies before the gradient map: a black/white point stretch
// from the 1st and 99th luminance percentiles, and per-channel gains that pull
// the average of the photo's bright near-neutral pixels toward neutral grey.
export function analyzeAutoGrade(imageData) {
  const d = imageData.data;
  const hist = new Uint32Array(256);
  let count = 0;
  for (let i = 0; i < d.length; i += 16) {
    const lum = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    hist[Math.max(0, Math.min(255, lum | 0))]++;
    count++;
  }
  const atPercentile = (p) => {
    let seen = 0;
    const target = count * p;
    for (let v = 0; v < 256; v++) {
      seen += hist[v];
      if (seen >= target) return v;
    }
    return 255;
  };
  const lo = atPercentile(0.01);
  const hi = Math.max(lo + 32, atPercentile(0.99));

  let sr = 0;
  let sg = 0;
  let sb = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 16) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    if (mx > 168 && mx - mn < 42) {
      sr += r;
      sg += g;
      sb += b;
      n++;
    }
  }
  let gainR = 1;
  let gainG = 1;
  let gainB = 1;
  if (n > 24) {
    const mr = sr / n;
    const mg = sg / n;
    const mb = sb / n;
    const mean = (mr + mg + mb) / 3;
    const clampGain = (v) => Math.min(1.28, Math.max(0.78, v));
    gainR = clampGain(mean / Math.max(1, mr));
    gainG = clampGain(mean / Math.max(1, mg));
    gainB = clampGain(mean / Math.max(1, mb));
  }
  return { lo, hi, gainR, gainG, gainB };
}

// mulberry32: a tiny seeded PRNG so film grain is identical on every render.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// gradePanelPixels runs stages 1–3 over one panel's pixels in place.
//   lut       — from buildLut
//   auto      — from analyzeAutoGrade, or null to skip stage 1
//   ink       — 0..1, how hard the poster-ink banding bites
//   width/height — panel size, for the vignette falloff
export function gradePanelPixels(imageData, lut, auto, ink, width, height) {
  const d = imageData.data;
  const lo = auto ? auto.lo : 0;
  const stretch = auto ? 255 / Math.max(1, auto.hi - auto.lo) : 1;
  const gR = auto ? auto.gainR : 1;
  const gG = auto ? auto.gainG : 1;
  const gB = auto ? auto.gainB : 1;
  const bands = 7; // ink bands across the luminance range
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let r = d[i];
      let g = d[i + 1];
      let b = d[i + 2];

      // Stage 1: auto grade (stretch + white balance).
      r = Math.min(255, Math.max(0, (r - lo) * stretch * gR));
      g = Math.min(255, Math.max(0, (g - lo) * stretch * gG));
      b = Math.min(255, Math.max(0, (b - lo) * stretch * gB));

      // Luminance and a saturation-boosted copy of the corrected photo.
      const lum = (r * 299 + g * 587 + b * 114) / 1000;
      const grey = lum;
      const sat = 1.22;
      r = grey + (r - grey) * sat;
      g = grey + (g - grey) * sat;
      b = grey + (b - grey) * sat;

      // Stage 2+3: poster ink. The banded luminance picks the mapped colour;
      // the unbanded photo shows through in proportion to (1 - ink).
      const t = lum / 255;
      const banded = Math.round(t * (bands - 1)) / (bands - 1);
      const soft = t + (banded - t) * Math.min(1, ink * 1.35);
      const li = Math.max(0, Math.min(255, Math.round(soft * 255))) * 3;
      const mr = lut[li];
      const mg = lut[li + 1];
      const mb = lut[li + 2];
      const mapMix = 0.34 + ink * 0.58;
      r = r * (1 - mapMix) + mr * mapMix;
      g = g * (1 - mapMix) + mg * mapMix;
      b = b * (1 - mapMix) + mb * mapMix;

      // Vignette: a gentle darkening toward the panel's corners.
      const dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / maxDist;
      const vig = 1 - 0.16 * dist * dist;
      d[i] = Math.min(255, Math.max(0, r * vig));
      d[i + 1] = Math.min(255, Math.max(0, g * vig));
      d[i + 2] = Math.min(255, Math.max(0, b * vig));
    }
  }
  return imageData;
}

// halftoneDots draws the poster's dot screen over a finished panel: dots of
// dark ink whose radius grows as the panel underneath darkens, sampled on a
// regular grid. Drawn as vector dots (not per-pixel) so exports stay crisp.
export function halftoneDots(ctx, x, y, w, h, sourceCanvas, strength) {
  if (strength <= 0.01) return;
  const step = Math.max(7, Math.round(w / 110));
  const probe = halftoneDots._probe ?? (halftoneDots._probe = document.createElement('canvas'));
  const scale = 160 / w;
  probe.width = Math.max(2, Math.round(w * scale));
  probe.height = Math.max(2, Math.round(h * scale));
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  pctx.drawImage(sourceCanvas, 0, 0, probe.width, probe.height);
  const data = pctx.getImageData(0, 0, probe.width, probe.height).data;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = 'rgba(16, 4, 28, 0.55)';
  for (let gy = step / 2; gy < h; gy += step) {
    for (let gx = step / 2; gx < w; gx += step) {
      const px = Math.min(probe.width - 1, Math.round(gx * scale));
      const py = Math.min(probe.height - 1, Math.round(gy * scale));
      const i = (py * probe.width + px) * 4;
      const lum = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 255000;
      const dark = Math.max(0, 0.52 - lum) / 0.52;
      if (dark <= 0.04) continue;
      const radius = (step / 2) * Math.min(1, dark * 1.15) * strength;
      if (radius < 0.4) continue;
      ctx.beginPath();
      ctx.arc(x + gx, y + gy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// filmGrain dusts a finished cover with seeded noise at low alpha.
export function filmGrain(ctx, w, h, seed, amount) {
  const rand = mulberry32(seed);
  const gw = Math.ceil(w / 2);
  const gh = Math.ceil(h / 2);
  const layer = filmGrain._layer ?? (filmGrain._layer = document.createElement('canvas'));
  layer.width = gw;
  layer.height = gh;
  const lctx = layer.getContext('2d');
  const img = lctx.createImageData(gw, gh);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 118 + Math.floor(rand() * 120);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = Math.round(amount * 255);
  }
  lctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(layer, 0, 0, w, h);
  ctx.restore();
}
