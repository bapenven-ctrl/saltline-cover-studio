// grades.js — Colour grades for Saltline covers.
//
// Every grade is a small set of gradient stops (shadow, midtone, highlight).
// A stop list is baked into a 256-entry RGB lookup table once, then applied
// per pixel: the pixel's luminance picks the mapped colour and the result is
// blended back with the original so photographs keep their local colour
// relationships while taking on the grade's mood.
//
// "Key Art" is the house grade: a warm sunset map, a gentle 18-band
// posterize blended at 45 percent, and a small saturation lift. The
// posterize is deliberately soft — faces must stay clean, never muddy.

export const GRADES = [
  {
    id: 'key-art', label: 'Key Art',
    stops: [[0, [30, 13, 34]], [0.38, [128, 44, 62]], [0.68, [238, 116, 64]], [1, [255, 230, 178]]],
    strength: 0.58, posterizeBands: 18, posterizeBlend: 0.45, saturation: 1.07,
  },
  {
    id: 'vice-sunset', label: 'Vice Sunset',
    stops: [[0, [24, 9, 46]], [0.45, [196, 60, 104]], [0.75, [255, 136, 74]], [1, [255, 224, 168]]],
    strength: 0.8, posterizeBands: 0, posterizeBlend: 0, saturation: 1.04,
  },
  {
    id: 'neon-nights', label: 'Neon Nights',
    stops: [[0, [5, 7, 30]], [0.4, [20, 88, 138]], [0.72, [188, 38, 158]], [1, [168, 244, 255]]],
    strength: 0.8, posterizeBands: 0, posterizeBlend: 0, saturation: 1.05,
  },
  {
    id: 'golden-hour', label: 'Golden Hour',
    stops: [[0, [32, 17, 8]], [0.45, [148, 82, 33]], [0.78, [243, 167, 73]], [1, [255, 239, 199]]],
    strength: 0.78, posterizeBands: 0, posterizeBlend: 0, saturation: 1.03,
  },
  {
    id: 'teal-heat', label: 'Teal Heat',
    stops: [[0, [4, 33, 37]], [0.45, [15, 118, 116]], [0.78, [239, 119, 59]], [1, [255, 235, 189]]],
    strength: 0.8, posterizeBands: 0, posterizeBlend: 0, saturation: 1.04,
  },
  {
    id: 'magenta-dusk', label: 'Magenta Dusk',
    stops: [[0, [29, 6, 35]], [0.45, [118, 29, 108]], [0.78, [231, 89, 139]], [1, [255, 213, 223]]],
    strength: 0.8, posterizeBands: 0, posterizeBlend: 0, saturation: 1.04,
  },
  {
    id: 'mono-ink', label: 'Mono Ink',
    stops: [[0, [9, 9, 11]], [0.5, [116, 116, 120]], [1, [245, 245, 247]]],
    strength: 0.92, posterizeBands: 9, posterizeBlend: 0.5, saturation: 1,
  },
];

export function gradeById(id) {
  return GRADES.find((g) => g.id === id) || GRADES[0];
}

function mix(a, b, t) { return Math.round(a + (b - a) * t); }

// buildLUT(grade) -> Uint8ClampedArray with 256 * 3 entries.
export function buildLUT(grade) {
  const lut = new Uint8ClampedArray(256 * 3);
  const stops = grade.stops;
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let lo = stops[0];
    let hi = stops[stops.length - 1];
    for (let s = 0; s + 1 < stops.length; s++) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) { lo = stops[s]; hi = stops[s + 1]; break; }
    }
    const f = Math.min(1, Math.max(0, (t - lo[0]) / ((hi[0] - lo[0]) || 1)));
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = mix(lo[1][c], hi[1][c], f);
  }
  return lut;
}

const lutCache = new Map();
export function lutForGrade(gradeId) {
  if (!lutCache.has(gradeId)) lutCache.set(gradeId, buildLUT(gradeById(gradeId)));
  return lutCache.get(gradeId);
}

// applyGradeToImageData(imageData, grade)
// Runs the full grade pipeline in place: gradient map, optional gentle
// posterize, saturation trim. Deterministic — same input, same output.
export function applyGradeToImageData(imageData, grade) {
  const lut = lutForGrade(grade.id);
  const d = imageData.data;
  const keep = 1 - grade.strength;
  const bands = grade.posterizeBands || 0;
  const bandStep = bands > 1 ? 255 / (bands - 1) : 0;
  const pb = grade.posterizeBlend || 0;
  const sat = grade.saturation || 1;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const lum = Math.max(0, Math.min(255, Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)));
    const li = lum * 3;
    // Gradient-mapped colour, re-tinted with a share of the pixel's own
    // chroma so skin and sky do not flatten into a single hue.
    let nr = lut[li] * grade.strength + r * keep + (r - lum) * 0.32;
    let ng = lut[li + 1] * grade.strength + g * keep + (g - lum) * 0.32;
    let nb = lut[li + 2] * grade.strength + b * keep + (b - lum) * 0.32;
    if (sat !== 1) {
      const grey = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
      nr = grey + (nr - grey) * sat;
      ng = grey + (ng - grey) * sat;
      nb = grey + (nb - grey) * sat;
    }
    if (bands > 1 && pb > 0) {
      nr = nr * (1 - pb) + Math.round(nr / bandStep) * bandStep * pb;
      ng = ng * (1 - pb) + Math.round(ng / bandStep) * bandStep * pb;
      nb = nb * (1 - pb) + Math.round(nb / bandStep) * bandStep * pb;
    }
    d[i] = nr; d[i + 1] = ng; d[i + 2] = nb;
  }
  return imageData;
}

// analysePhoto(image) -> { brightness, saturation, warmth }
// A 24x24 sample is plenty to characterise a photo for the Auto grade.
export function analysePhoto(image) {
  const side = 24;
  const c = document.createElement('canvas');
  c.width = side; c.height = side;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, side, side);
  const d = ctx.getImageData(0, 0, side, side).data;
  let bright = 0, sat = 0, warm = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    bright += (r + g + b) / 3;
    sat += mx === 0 ? 0 : (mx - mn) / mx;
    warm += r - b;
    n++;
  }
  return { brightness: bright / n / 255, saturation: sat / n, warmth: warm / n / 255 };
}

// pickAutoGrade(stats) -> the grade id that flatters this photo most.
export function pickAutoGrade(stats) {
  if (stats.brightness < 0.3 && stats.saturation > 0.24) return 'neon-nights';
  if (stats.brightness < 0.28) return 'magenta-dusk';
  if (stats.warmth > 0.09 && stats.brightness > 0.42) return 'golden-hour';
  if (stats.warmth > 0.03) return 'key-art';
  if (stats.saturation < 0.14) return 'mono-ink';
  if (stats.brightness > 0.58) return 'teal-heat';
  return 'key-art';
}

// resolveGradeId(gradeId, heroImage) — "auto" is resolved against the hero.
export function resolveGradeId(gradeId, heroImage) {
  if (gradeId !== 'auto') return gradeId;
  if (!heroImage) return 'key-art';
  try { return pickAutoGrade(analysePhoto(heroImage)); } catch { return 'key-art'; }
}
