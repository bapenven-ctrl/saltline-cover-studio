// grades.js — Colour grades as gradient maps, plus the Key Art finish.
// Each grade is a set of gradient stops (shadow -> midtone -> highlight).
// buildLUT turns the stops into a 256-entry RGB lookup table which the
// renderer applies per pixel, so grading is fast and fully deterministic.
// "Key Art" is the house grade: a warm sunset gradient map followed by a
// gentle many-band posterize blended back over the graded photo, so skin
// stays smooth while skies and neon snap into flat poster colour.

export const GRADES = [
  { id: 'key-art', label: 'Key Art', stops: [[0, [22, 9, 38]], [0.38, [148, 42, 88]], [0.68, [255, 118, 62]], [1, [255, 233, 176]]] },
  { id: 'vice-sunset', label: 'Vice Sunset', stops: [[0, [26, 10, 48]], [0.45, [198, 62, 105]], [0.75, [255, 138, 76]], [1, [255, 226, 170]]] },
  { id: 'neon-nights', label: 'Neon Nights', stops: [[0, [6, 8, 32]], [0.4, [22, 90, 140]], [0.72, [190, 40, 160]], [1, [170, 245, 255]]] },
  { id: 'golden-hour', label: 'Golden Hour', stops: [[0, [34, 18, 8]], [0.45, [150, 84, 34]], [0.78, [244, 168, 74]], [1, [255, 240, 200]]] },
  { id: 'teal-heat', label: 'Teal Heat', stops: [[0, [4, 34, 38]], [0.45, [16, 120, 118]], [0.78, [240, 120, 60]], [1, [255, 236, 190]]] },
  { id: 'magenta-dusk', label: 'Magenta Dusk', stops: [[0, [30, 6, 36]], [0.45, [120, 30, 110]], [0.78, [232, 90, 140]], [1, [255, 214, 224]]] },
  { id: 'mono-ink', label: 'Mono Ink', stops: [[0, [8, 8, 10]], [0.5, [118, 118, 122]], [1, [246, 246, 248]]] },
];

export const DEFAULT_GRADE = 'key-art';

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

// buildLUT(grade) -> Uint8ClampedArray of 256 * 3 entries.
export function buildLUT(grade) {
  const lut = new Uint8ClampedArray(256 * 3);
  const stops = grade.stops;
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = stops[0], b = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) { a = stops[s]; b = stops[s + 1]; break; }
    }
    const span = (b[0] - a[0]) || 1;
    const f = Math.min(1, Math.max(0, (t - a[0]) / span));
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = lerp(a[1][c], b[1][c], f);
  }
  return lut;
}

const lutCache = new Map();
export function lutForGrade(gradeId) {
  if (!lutCache.has(gradeId)) {
    const grade = GRADES.find((g) => g.id === gradeId) || GRADES[0];
    lutCache.set(gradeId, buildLUT(grade));
  }
  return lutCache.get(gradeId);
}

// applyLUTToImageData(imageData, lut, strength) — maps luminance through the
// gradient map while keeping a share of the original colour.
export function applyLUTToImageData(imageData, lut, strength = 0.82) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const lum = Math.max(0, Math.min(255, Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)));
    const li = lum * 3;
    d[i] = Math.round(r * (1 - strength) + lut[li] * strength + (r - lum) * 0.35);
    d[i + 1] = Math.round(g * (1 - strength) + lut[li + 1] * strength + (g - lum) * 0.35);
    d[i + 2] = Math.round(b * (1 - strength) + lut[li + 2] * strength + (b - lum) * 0.35);
  }
  return imageData;
}

// posterizeBlend(imageData, levels, blend, saturationLift)
// Quantises each channel to `levels` bands, lifts saturation a touch, then
// mixes the result back over the input by `blend` (0..1). With many bands
// and a blend under a half, faces keep their modelling — no blotchy skin —
// while flat areas gain the printed-poster snap of key art.
export function posterizeBlend(imageData, levels = 18, blend = 0.45, saturationLift = 1.12) {
  const d = imageData.data;
  const step = 255 / (levels - 1);
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    const grey = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = grey + (r - grey) * saturationLift;
    g = grey + (g - grey) * saturationLift;
    b = grey + (b - grey) * saturationLift;
    const pr = Math.round(r / step) * step;
    const pg = Math.round(g / step) * step;
    const pb = Math.round(b / step) * step;
    d[i] = Math.round(d[i] * (1 - blend) + pr * blend);
    d[i + 1] = Math.round(d[i + 1] * (1 - blend) + pg * blend);
    d[i + 2] = Math.round(d[i + 2] * (1 - blend) + pb * blend);
  }
  return imageData;
}

// hardPosterize(imageData, levels, saturationLift) — the round-2 poster-ink
// treatment: a full-strength few-band quantise for the punchier grades.
export function hardPosterize(imageData, levels = 7, saturationLift = 1.22) {
  const d = imageData.data;
  const step = 255 / (levels - 1);
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    const grey = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = grey + (r - grey) * saturationLift;
    g = grey + (g - grey) * saturationLift;
    b = grey + (b - grey) * saturationLift;
    d[i] = Math.round(Math.round(r / step) * step);
    d[i + 1] = Math.round(Math.round(g / step) * step);
    d[i + 2] = Math.round(Math.round(b / step) * step);
  }
  return imageData;
}

// analysePhoto(image) -> { brightness, saturation, warmth, contrast }
// Samples the photo on a small offscreen canvas; no network, no storage.
export function analysePhoto(image) {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, 32, 32);
  const d = ctx.getImageData(0, 0, 32, 32).data;
  let br = 0, sat = 0, warm = 0, n = 0, min = 255, max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    br += (r + g + b) / 3; sat += mx === 0 ? 0 : (mx - mn) / mx; warm += r - b;
    min = Math.min(min, mx); max = Math.max(max, mx); n++;
  }
  return { brightness: br / n / 255, saturation: sat / n, warmth: (warm / n) / 255, contrast: (max - min) / 255 };
}

// pickAutoGrade(stats) -> grade id that best fits the photo analysis.
export function pickAutoGrade(stats) {
  if (stats.brightness < 0.32 && stats.saturation > 0.25) return 'neon-nights';
  if (stats.brightness < 0.3) return 'magenta-dusk';
  if (stats.warmth > 0.08 && stats.brightness > 0.45) return 'golden-hour';
  if (stats.warmth > 0.04) return 'key-art';
  if (stats.saturation < 0.16) return 'mono-ink';
  if (stats.brightness > 0.55) return 'teal-heat';
  return 'key-art';
}

// resolveGradeId(gradeId, image) — "auto" resolves against the hero photo.
export function resolveGradeId(gradeId, image) {
  if (gradeId !== 'auto') return gradeId;
  if (!image) return DEFAULT_GRADE;
  try { return pickAutoGrade(analysePhoto(image)); } catch { return DEFAULT_GRADE; }
}
