// smartcrop.js — Saliency smart crop.
//
// A panel wants the interesting part of its photo, and on a poster the
// interesting part is almost always a face. This module scores a small
// copy of the photo for visual saliency — local contrast and edges,
// saturated colour, a bonus for skin-like tones, and a mild pull toward
// the middle — then searches for the crop window of the panel's aspect
// ratio with the highest total score. Two guards keep the result
// poster-safe: the window may not zoom past a minimum size (no
// postage-stamp crops), and it must contain the single highest-scoring
// point with a margin, so a face that dominates the saliency map is
// never sliced in half by the frame.

const GRID = 96; // saliency grid resolution on the long side

// Build the saliency grid + integral image for a photo (an object with
// an `img`). Cached on the photo object itself.
export function saliencyFor(photo) {
  if (photo._saliency) return photo._saliency;
  const img = photo.img;
  const scale = GRID / Math.max(img.naturalWidth, img.naturalHeight);
  const gw = Math.max(8, Math.round(img.naturalWidth * scale));
  const gh = Math.max(8, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = gw;
  canvas.height = gh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, gw, gh);
  const px = ctx.getImageData(0, 0, gw, gh).data;

  const luma = new Float32Array(gw * gh);
  for (let i = 0; i < gw * gh; i++) {
    luma[i] = 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];
  }

  const score = new Float32Array(gw * gh);
  const skin = new Float32Array(gw * gh);
  let peak = 0;
  let peakX = gw >> 1;
  let peakY = gh >> 1;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      const r = px[i * 4];
      const g = px[i * 4 + 1];
      const b = px[i * 4 + 2];
      // Local contrast: how much this cell stands out from its neighbours.
      const self = luma[i];
      let diff = 0;
      if (x > 0) diff += Math.abs(self - luma[i - 1]);
      if (x < gw - 1) diff += Math.abs(self - luma[i + 1]);
      if (y > 0) diff += Math.abs(self - luma[i - gw]);
      if (y < gh - 1) diff += Math.abs(self - luma[i + gw]);
      let s = diff * 0.9;
      // Saturated colour draws the eye.
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      s += mx === 0 ? 0 : ((mx - mn) / mx) * 60;
      // Skin-like tones get a strong bonus: posters are about people.
      if (r > 90 && r > g && g > b && r - b > 25 && r - g < 90) { s += 70; skin[i] = 1; }
      // Mild centre prior so empty skies at the edges lose ties.
      const dx = (x / gw - 0.5) * 2;
      const dy = (y / gh - 0.5) * 2;
      s += (1 - Math.min(1, dx * dx + dy * dy)) * 12;
      score[i] = s;
      if (s > peak) { peak = s; peakX = x; peakY = y; }
    }
  }

  // The subject point: the heart of the largest skin-toned blob (a
  // face), found by blurring the skin map and taking its maximum.
  // Sparkly water and neon can out-score a face cell by cell, but they
  // never form a skin blob — so when a blob exists it, not the raw
  // saliency peak, is what the crop must protect and compose around.
  let subjectX = peakX;
  let subjectY = peakY;
  {
    const radius = Math.max(3, Math.round(gw / 14));
    const blurred = new Float32Array(gw * gh);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        let sum = 0;
        let count = 0;
        for (let yy = Math.max(0, y - radius); yy <= Math.min(gh - 1, y + radius); yy++) {
          for (let xx = Math.max(0, x - radius); xx <= Math.min(gw - 1, x + radius); xx++) {
            sum += skin[yy * gw + xx];
            count++;
          }
        }
        blurred[y * gw + x] = sum / count;
      }
    }
    let bestSkin = 0;
    for (let i = 0; i < gw * gh; i++) {
      if (blurred[i] > bestSkin) { bestSkin = blurred[i]; subjectX = i % gw; subjectY = Math.floor(i / gw); }
    }
    if (bestSkin < 0.16) { subjectX = peakX; subjectY = peakY; }
  }

  // Integral image for O(1) window sums.
  const integral = new Float64Array((gw + 1) * (gh + 1));
  for (let y = 0; y < gh; y++) {
    let rowSum = 0;
    for (let x = 0; x < gw; x++) {
      rowSum += score[y * gw + x];
      integral[(y + 1) * (gw + 1) + x + 1] = integral[y * (gw + 1) + x + 1] + rowSum;
    }
  }

  const result = { gw, gh, integral, peakX, peakY, subjectX, subjectY };
  photo._saliency = result;
  return result;
}

function windowSum(sal, x, y, w, h) {
  const { gw, integral } = sal;
  const stride = gw + 1;
  const x2 = Math.min(sal.gw, x + w);
  const y2 = Math.min(sal.gh, y + h);
  const x1 = Math.max(0, x);
  const y1 = Math.max(0, y);
  return integral[y2 * stride + x2] - integral[y1 * stride + x2]
    - integral[y2 * stride + x1] + integral[y1 * stride + x1];
}

// The best source rectangle (in photo pixels) for a panel of the given
// aspect ratio (width / height).
export function bestCrop(photo, aspect) {
  const img = photo.img;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const sal = saliencyFor(photo);

  // Window size in photo pixels: as large as the panel's aspect allows,
  // but never smaller than 55% of the photo on its short side.
  let pw = iw;
  let ph = pw / aspect;
  if (ph > ih) { ph = ih; pw = ph * aspect; }
  const minSide = Math.min(iw, ih) * 0.55;
  if (Math.min(pw, ph) < minSide) {
    const k = minSide / Math.min(pw, ph);
    pw = Math.min(iw, pw * k);
    ph = Math.min(ih, ph * k);
    // Re-fit to the aspect after clamping.
    if (pw / ph > aspect) pw = ph * aspect; else ph = pw / aspect;
  }

  // Convert the window to grid cells for the search.
  const winW = Math.max(4, Math.round((pw / iw) * sal.gw));
  const winH = Math.max(4, Math.round((ph / ih) * sal.gh));
  const maxX = sal.gw - winW;
  const maxY = sal.gh - winH;

  // The window must contain the subject point with a margin of 10% of
  // the window on each side where the photo allows it.
  const mx = winW * 0.1;
  const my = winH * 0.1;
  const loX = Math.max(0, Math.ceil(sal.subjectX - winW + mx));
  const hiX = Math.min(maxX, Math.floor(sal.subjectX - mx));
  const loY = Math.max(0, Math.ceil(sal.subjectY - winH + my));
  const hiY = Math.min(maxY, Math.floor(sal.subjectY - my));

  let best = -Infinity;
  let bestX = Math.max(0, Math.min(maxX, sal.subjectX - (winW >> 1)));
  let bestY = Math.max(0, Math.min(maxY, sal.subjectY - (winH >> 1)));
  const stepX = Math.max(1, Math.floor(winW / 14));
  const stepY = Math.max(1, Math.floor(winH / 14));
  const xFrom = loX <= hiX ? loX : 0;
  const xTo = loX <= hiX ? hiX : maxX;
  const yFrom = loY <= hiY ? loY : 0;
  const yTo = loY <= hiY ? hiY : maxY;
  for (let y = yFrom; y <= yTo; y += stepY) {
    for (let x = xFrom; x <= xTo; x += stepX) {
      const s = windowSum(sal, x, y, winW, winH);
      if (s > best) { best = s; bestX = x; bestY = y; }
    }
  }
  // Always score the exact far corner too (the step may skip it).
  const corner = windowSum(sal, xTo, yTo, winW, winH);
  if (corner > best) { bestX = xTo; bestY = yTo; }

  // Compose the shot: a window centred on the dominant subject — the
  // peak resting a little above the middle, as posters frame faces —
  // wins over the raw richest window unless it gives up real content.
  const placedX = Math.max(0, Math.min(maxX, Math.round(sal.subjectX - winW * 0.5)));
  const placedY = Math.max(0, Math.min(maxY, Math.round(sal.subjectY - winH * 0.42)));
  if (windowSum(sal, placedX, placedY, winW, winH) >= best * 0.85) {
    bestX = placedX;
    bestY = placedY;
  }

  return {
    sx: (bestX / sal.gw) * iw,
    sy: (bestY / sal.gh) * ih,
    sw: (winW / sal.gw) * iw,
    sh: (winH / sal.gh) * ih,
  };
}

// A plain centred cover-fit rectangle (the non-smart fallback).
export function coverCrop(photo, aspect) {
  const iw = photo.img.naturalWidth;
  const ih = photo.img.naturalHeight;
  let sw = iw;
  let sh = sw / aspect;
  if (sh > ih) { sh = ih; sw = sh * aspect; }
  return { sx: (iw - sw) / 2, sy: (ih - sh) / 2, sw, sh };
}

// Resolve a panel's source rectangle: smart crop or cover-fit first,
// then the panel's own zoom (window shrinks around its centre) and drag
// offsets (fractions of the window) applied, clamped inside the photo.
export function panelSourceRect(photo, panel, aspect) {
  const base = panel.smart ? bestCrop(photo, aspect) : coverCrop(photo, aspect);
  const iw = photo.img.naturalWidth;
  const ih = photo.img.naturalHeight;
  const zoom = Math.max(1, panel.zoom || 1);
  let sw = base.sw / zoom;
  let sh = base.sh / zoom;
  let sx = base.sx + (base.sw - sw) / 2 + (panel.dx || 0) * base.sw;
  let sy = base.sy + (base.sh - sh) / 2 + (panel.dy || 0) * base.sh;
  sx = Math.max(0, Math.min(iw - sw, sx));
  sy = Math.max(0, Math.min(ih - sh, sy));
  return { sx, sy, sw, sh };
}
