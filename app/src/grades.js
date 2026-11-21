// grades.js — Colour grades for Saltline Cover Studio.
//
// Every grade is a small recipe: a set of colour stops that become a
// 256-entry gradient-map lookup table, plus a handful of per-pixel
// adjustments (saturation, contrast, an optional gentle posterize blend,
// fine grain and a soft vignette). Grading a photo means: build the LUT
// once, then walk the pixels of a working copy once. The walk is kept
// deliberately simple so a full cover re-grades in well under a second.
//
// "Key Art" is the house grade and the default everywhere: a warm sunset
// map laid over the photograph at a little over half strength, an
// 18-band posterize blended in at 45% so skin stays smooth, a whisper of
// grain and a vignette that barely darkens the corners.

export const GRADES = [
  { id: 'key-art', label: 'Key Art' },
  { id: 'vice-sunset', label: 'Vice Sunset' },
  { id: 'neon-nights', label: 'Neon Nights' },
  { id: 'golden-hour', label: 'Golden Hour' },
  { id: 'teal-heat', label: 'Teal Heat' },
  { id: 'magenta-dusk', label: 'Magenta Dusk' },
  { id: 'mono-ink', label: 'Mono Ink' },
];

// stops: [position 0..1, r, g, b]. mapMix: how much of the gradient map
// replaces the photograph (the rest is the photo's own colour, pushed by
// saturation/contrast). posterize: {bands, mix} or null. grain: 0..12
// additive noise amplitude. vignette: 0..0.5 corner darkening.
const RECIPES = {
  'key-art': {
    stops: [
      [0.0, 36, 18, 66], [0.35, 148, 44, 86], [0.62, 233, 97, 52],
      [0.85, 250, 178, 84], [1.0, 255, 228, 172],
    ],
    mapMix: 0.55, saturation: 1.07, contrast: 1.05,
    posterize: { bands: 18, mix: 0.45 }, grain: 5, vignette: 0.22,
  },
  'vice-sunset': {
    stops: [
      [0.0, 26, 8, 48], [0.4, 150, 30, 90], [0.7, 255, 110, 60],
      [1.0, 255, 210, 130],
    ],
    mapMix: 0.8, saturation: 1.15, contrast: 1.06,
    posterize: null, grain: 5, vignette: 0.26,
  },
  'neon-nights': {
    stops: [
      [0.0, 6, 20, 38], [0.35, 10, 90, 110], [0.65, 200, 40, 120],
      [1.0, 240, 240, 255],
    ],
    mapMix: 0.72, saturation: 1.25, contrast: 1.08,
    posterize: null, grain: 6, vignette: 0.3,
  },
  'golden-hour': {
    stops: [
      [0.0, 40, 24, 10], [0.5, 190, 120, 50], [1.0, 255, 235, 190],
    ],
    mapMix: 0.5, saturation: 1.05, contrast: 1.02,
    posterize: null, grain: 4, vignette: 0.2,
  },
  'teal-heat': {
    stops: [
      [0.0, 6, 44, 52], [0.45, 24, 120, 124], [0.75, 240, 140, 70],
      [1.0, 255, 220, 170],
    ],
    mapMix: 0.65, saturation: 1.12, contrast: 1.05,
    posterize: null, grain: 5, vignette: 0.24,
  },
  'magenta-dusk': {
    stops: [
      [0.0, 24, 6, 44], [0.5, 140, 40, 110], [1.0, 255, 190, 220],
    ],
    mapMix: 0.65, saturation: 1.1, contrast: 1.04,
    posterize: null, grain: 5, vignette: 0.24,
  },
  'mono-ink': {
    stops: [
      [0.0, 12, 10, 18], [0.5, 128, 124, 132], [1.0, 246, 244, 240],
    ],
    mapMix: 1.0, saturation: 0.0, contrast: 1.2,
    posterize: { bands: 5, mix: 1.0 }, grain: 8, vignette: 0.28,
  },
};

function recipeFor(gradeId) {
  return RECIPES[gradeId] || RECIPES['key-art'];
}

// Build the 256x3 gradient-map LUT for a recipe by walking its stops
// with a smoothstep blend between neighbours.
function buildLUT(recipe) {
  const lut = new Uint8Array(256 * 3);
  const stops = recipe.stops;
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) { a = stops[s]; b = stops[s + 1]; break; }
    }
    const span = (b[0] - a[0]) || 1;
    let f = (t - a[0]) / span;
    f = f * f * (3 - 2 * f);
    lut[i * 3] = a[1] + (b[1] - a[1]) * f;
    lut[i * 3 + 1] = a[2] + (b[2] - a[2]) * f;
    lut[i * 3 + 2] = a[3] + (b[3] - a[3]) * f;
  }
  return lut;
}

// Small deterministic PRNG so grain is identical on every render of the
// same photo at the same size (screenshots must not shimmer between runs).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Apply a grade to a canvas in place.
export function paintGrade(canvas, gradeId) {
  const recipe = recipeFor(gradeId);
  const lut = buildLUT(recipe);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  const { mapMix, saturation, contrast, posterize, grain, vignette } = recipe;
  const keep = 1 - mapMix;
  const rand = mulberry32(0x5A17 + w * 131 + h * 17);
  const bands = posterize ? posterize.bands : 0;
  const bandMix = posterize ? posterize.mix : 0;
  const cx = w / 2;
  const cy = h / 2;
  const maxR2 = cx * cx + cy * cy;

  for (let y = 0; y < h; y++) {
    const dy = y - cy;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      // Luminance drives the gradient map.
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) | 0;
      const li = lum * 3;
      let nr = r * keep + lut[li] * mapMix;
      let ng = g * keep + lut[li + 1] * mapMix;
      let nb = b * keep + lut[li + 2] * mapMix;
      // Contrast around mid-grey, then saturation around the new luma.
      nr = (nr - 128) * contrast + 128;
      ng = (ng - 128) * contrast + 128;
      nb = (nb - 128) * contrast + 128;
      const grey = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
      nr = grey + (nr - grey) * saturation;
      ng = grey + (ng - grey) * saturation;
      nb = grey + (nb - grey) * saturation;
      // Gentle posterize: quantize, then blend back so faces stay clean.
      if (bands) {
        const step = 255 / (bands - 1);
        nr += (Math.round(nr / step) * step - nr) * bandMix;
        ng += (Math.round(ng / step) * step - ng) * bandMix;
        nb += (Math.round(nb / step) * step - nb) * bandMix;
      }
      // Grain and vignette.
      if (grain) {
        const n = (rand() - 0.5) * 2 * grain;
        nr += n; ng += n; nb += n;
      }
      if (vignette) {
        const dx = x - cx;
        const r2 = (dx * dx + dy * dy) / maxR2;
        const f = 1 - vignette * Math.pow(Math.max(0, r2 - 0.3) / 0.7, 1.4);
        nr *= f; ng *= f; nb *= f;
      }
      px[i] = nr < 0 ? 0 : nr > 255 ? 255 : nr;
      px[i + 1] = ng < 0 ? 0 : ng > 255 ? 255 : ng;
      px[i + 2] = nb < 0 ? 0 : nb > 255 ? 255 : nb;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Graded working copies, cached per photo object + grade. A photo is
// drawn once at a capped working size (longest side 1400px) and graded;
// panels then sample from the copy, so dragging and re-rendering the
// editor never re-walks full-resolution pixels.
const gradedCache = new WeakMap();

export function gradedCopy(photo, gradeId) {
  let byGrade = gradedCache.get(photo);
  if (!byGrade) { byGrade = new Map(); gradedCache.set(photo, byGrade); }
  if (byGrade.has(gradeId)) return byGrade.get(gradeId);
  const img = photo.img;
  const scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  paintGrade(canvas, gradeId);
  byGrade.set(gradeId, canvas);
  return canvas;
}

// Quick look at a photo for the Auto grade: average brightness,
// saturation and warmth from a thumbnail.
export function analysePhoto(photo) {
  const img = photo.img;
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, 32, 32);
  const px = ctx.getImageData(0, 0, 32, 32).data;
  let bright = 0;
  let sat = 0;
  let warm = 0;
  const n = 32 * 32;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255;
    const g = px[i + 1] / 255;
    const b = px[i + 2] / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    bright += (r * 0.2126 + g * 0.7152 + b * 0.0722);
    sat += mx === 0 ? 0 : (mx - mn) / mx;
    warm += r - b;
  }
  return { brightness: bright / n, saturation: sat / n, warmth: warm / n };
}

// The Auto grade's pick, from a hero photo's statistics.
export function pickAutoGrade(photo) {
  const s = analysePhoto(photo);
  if (s.saturation < 0.12) return 'mono-ink';
  if (s.brightness < 0.3) return 'neon-nights';
  if (s.warmth > 0.16 && s.brightness > 0.55) return 'golden-hour';
  if (s.warmth < -0.05) return 'teal-heat';
  if (s.saturation > 0.42) return 'vice-sunset';
  return 'key-art';
}
