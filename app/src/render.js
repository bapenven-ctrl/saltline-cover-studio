// render.js — Draws a finished Saltline cover onto a canvas.
// Pipeline per panel: crop the assigned photo (smart or manual), paint it to
// a small offscreen canvas, apply the grade LUT, the poster-ink treatment and
// the optional halftone, then stamp it into the panel rectangle with its
// white border. A vignette and fine grain finish the sheet before lettering.

import { getPanelRects } from './panels.js';
import { lutForGrade, applyLUTToImageData, resolveGradeId } from './grades.js';
import { sourceRectForPanel } from './smartcrop.js';

export const EXPORT_SIZES = [
  { id: '1080x1080', label: 'Square 1080 x 1080', w: 1080, h: 1080 },
  { id: '1080x1350', label: 'Portrait 1080 x 1350', w: 1080, h: 1350 },
  { id: '1920x1080', label: 'Wide 1920 x 1080', w: 1920, h: 1080 },
  { id: '1080x1920', label: 'Story 1080 x 1920', w: 1080, h: 1920 },
];

export function sizeById(id) {
  return EXPORT_SIZES.find((s) => s.id === id) || EXPORT_SIZES[1];
}

function posterizeAndSaturate(imageData, levels, saturationLift) {
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

function paintHalftone(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const gap = Math.max(6, Math.round(w / 46));
  ctx.fillStyle = 'rgba(10, 6, 20, 0.5)';
  for (let y = gap / 2; y < h; y += gap) {
    for (let x = gap / 2; x < w; x += gap) {
      const i = (Math.floor(y) * w + Math.floor(x)) * 4;
      const lum = (d[i] + d[i + 1] + d[i + 2]) / 765;
      if (lum < 0.42) {
        const rad = (0.42 - lum) * gap * 0.62;
        ctx.beginPath(); ctx.arc(x, y, Math.max(0.6, rad), 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}

function paintPanel(ctx, image, panelRect, panelState, lut, options) {
  const pw = Math.max(2, Math.round(panelRect.w));
  const ph = Math.max(2, Math.round(panelRect.h));
  const off = document.createElement('canvas');
  off.width = pw; off.height = ph;
  const octx = off.getContext('2d', { willReadFrequently: true });
  if (image) {
    const src = sourceRectForPanel(image, panelRect, panelState);
    octx.drawImage(image, src.sx, src.sy, src.sw, src.sh, 0, 0, pw, ph);
  } else {
    const grad = octx.createLinearGradient(0, 0, pw, ph);
    grad.addColorStop(0, '#3a2358'); grad.addColorStop(1, '#120a24');
    octx.fillStyle = grad; octx.fillRect(0, 0, pw, ph);
  }
  let data = octx.getImageData(0, 0, pw, ph);
  applyLUTToImageData(data, lut, 0.8);
  if (options.posterInk) data = posterizeAndSaturate(data, 7, 1.22);
  octx.putImageData(data, 0, 0);
  if (options.halftone) paintHalftone(octx, pw, ph);

  ctx.save();
  ctx.translate(panelRect.x + panelRect.w / 2, panelRect.y + panelRect.h / 2);
  ctx.rotate(panelRect.rot || 0);
  ctx.drawImage(off, -panelRect.w / 2, -panelRect.h / 2, panelRect.w, panelRect.h);
  const border = Math.max(3, Math.round(Math.min(panelRect.w, panelRect.h) * 0.016));
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = border;
  ctx.strokeRect(-panelRect.w / 2 + border / 2, -panelRect.h / 2 + border / 2, panelRect.w - border, panelRect.h - border);
  ctx.restore();
}

function paintVignetteAndGrain(ctx, W, H) {
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.36, W / 2, H / 2, Math.max(W, H) * 0.78);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(8,4,18,0.42)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  // Deterministic grain: a fixed-seed pattern, identical on every render.
  let seed = 1234567;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  const dots = Math.round((W * H) / 9000);
  for (let i = 0; i < dots; i++) ctx.fillRect(rand() * W, rand() * H, 1.4, 1.4);
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  for (let i = 0; i < dots; i++) ctx.fillRect(rand() * W, rand() * H, 1.4, 1.4);
}

function fitFont(ctx, text, weight, family, startSize, maxWidth) {
  let size = startSize;
  ctx.font = `${weight} ${size}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && size > 14) {
    size -= 3;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

function paintLettering(ctx, W, H, caption, subtitle) {
  const title = (caption || '').trim().toUpperCase();
  const sub = (subtitle || '').trim();
  // Soft shade behind the lettering so type stays readable on busy photos.
  const shade = ctx.createLinearGradient(0, H * 0.62, 0, H);
  shade.addColorStop(0, 'rgba(10,5,22,0)');
  shade.addColorStop(1, 'rgba(10,5,22,0.55)');
  ctx.fillStyle = shade; ctx.fillRect(0, H * 0.62, W, H * 0.38);

  ctx.save();
  ctx.translate(W / 2, H * 0.9);
  ctx.rotate(-0.018);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if (title) {
    const size = fitFont(ctx, title, '400', 'Anton, sans-serif', H * 0.115, W * 0.9);
    const grad = ctx.createLinearGradient(0, -size, 0, size * 0.25);
    grad.addColorStop(0, '#ffe9a8');
    grad.addColorStop(0.55, '#ff9a3d');
    grad.addColorStop(1, '#ff3d7e');
    ctx.font = `400 ${size}px Anton, sans-serif`;
    // Poster lettering reads better with a touch of tracking and a hard
    // offset shadow under the outline, like ink stamped on the print.
    try { ctx.letterSpacing = `${Math.round(size * 0.035)}px`; } catch { /* older engines keep default spacing */ }
    ctx.lineWidth = Math.max(3, size * 0.09);
    ctx.strokeStyle = '#1c0b2e';
    ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(20,6,36,0.55)';
    ctx.fillText(title, size * 0.045, size * 0.07);
    ctx.strokeText(title, 0, 0);
    ctx.fillStyle = grad;
    ctx.fillText(title, 0, 0);
    try { ctx.letterSpacing = '0px'; } catch { /* nothing to reset */ }
  }
  if (sub) {
    const size = fitFont(ctx, sub, '400', 'Pacifico, cursive', H * 0.042, W * 0.7);
    ctx.font = `400 ${size}px Pacifico, cursive`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = size * 0.22;
    ctx.fillText(sub, 0, size * 1.35);
    ctx.shadowBlur = 0;
  }
  ctx.restore();

  // Saltline badge chip, top-left corner.
  ctx.save();
  const bh = Math.round(H * 0.045);
  ctx.font = `400 ${Math.round(bh * 0.52)}px Anton, sans-serif`;
  const bw = Math.round(ctx.measureText('SALTLINE').width + bh * 0.9);
  const bx = Math.round(W * 0.028), by = Math.round(H * 0.026);
  ctx.fillStyle = 'rgba(14,8,28,0.88)';
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, bh / 2); ctx.fill();
  ctx.strokeStyle = '#ffb03a'; ctx.lineWidth = Math.max(2, bh * 0.05); ctx.stroke();
  ctx.fillStyle = '#ffd98a';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('SALTLINE', bx + bw / 2, by + bh / 2 + 1);
  ctx.restore();
}

// renderCover(canvas, state)
// state: { layout, grade, caption, subtitle, posterInk, halftone,
//          photos: [{img}], panels: [{photoIndex, zoom, ox, oy, smart}] }
export function renderCover(canvas, state) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#160b2a';
  ctx.fillRect(0, 0, W, H);
  const hero = state.photos[state.panels[0]?.photoIndex || 0]?.img || state.photos[0]?.img || null;
  const gradeId = resolveGradeId(state.grade, hero);
  const lut = lutForGrade(gradeId);
  const rects = getPanelRects(state.layout, W, H);
  canvas._panelRects = rects;
  rects.forEach((panelRect, i) => {
    const ps = state.panels[i] || { photoIndex: i % Math.max(1, state.photos.length), zoom: 1, ox: 0, oy: 0, smart: true };
    const photo = state.photos[ps.photoIndex] || state.photos[0];
    paintPanel(ctx, photo ? photo.img : null, panelRect, ps, lut, state);
  });
  paintVignetteAndGrain(ctx, W, H);
  paintLettering(ctx, W, H, state.caption, state.subtitle);
  return { gradeId, panelCount: rects.length };
}
