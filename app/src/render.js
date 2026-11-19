// render.js — draws a finished cover from the editor's state.
//
// A cover is drawn panel by panel: each panel's photo is cropped (the smart
// crop from smartcrop.js, adjusted by the reader's drag and zoom), run
// through the grade pipeline (grades.js) at the panel's own pixel size, given
// its halftone screen, and framed in black. The title block is then lettered
// over its cell, band or scrim: a sunset-gradient display face for the title,
// a neon script for the subtitle, a letter-spaced tagline strip, the heat
// stars and the starburst badge. Film grain seals the whole cover.
//
// Processed panels are cached, so dragging one panel or editing the caption
// never re-grades the others.

import { buildLut, gradeById, analyzeAutoGrade, gradePanelPixels, halftoneDots, filmGrain } from './grades.js';
import { computeSaliency, bestCrop } from './smartcrop.js';
import { layoutFor, aspectClass } from './panels.js';

export const SIZES = [
  { id: 'square', label: '1080 × 1080', note: 'square', w: 1080, h: 1080 },
  { id: 'portrait', label: '1080 × 1350', note: 'portrait', w: 1080, h: 1350 },
  { id: 'wide', label: '1920 × 1080', note: 'wide', w: 1920, h: 1080 },
  { id: 'story', label: '1080 × 1920', note: 'story', w: 1080, h: 1920 },
];

export function sizeById(id) {
  return SIZES.find((s) => s.id === id) ?? SIZES[0];
}

const TITLE_FONT = '"Saltline Display", "Arial Narrow", sans-serif';
const SCRIPT_FONT = '"Saltline Script", "Comic Sans MS", cursive';

// ensurePhotoData lazily attaches a photo's saliency map and its measured
// auto-grade correction; both are computed once, at thumbnail size.
export function ensurePhotoData(photo) {
  if (!photo.saliency) photo.saliency = computeSaliency(photo.img);
  if (!photo.auto) {
    const thumb = document.createElement('canvas');
    const tw = 256;
    const th = Math.max(8, Math.round((tw * photo.img.naturalHeight) / photo.img.naturalWidth));
    thumb.width = tw;
    thumb.height = th;
    const tctx = thumb.getContext('2d', { willReadFrequently: true });
    tctx.drawImage(photo.img, 0, 0, tw, th);
    photo.auto = analyzeAutoGrade(tctx.getImageData(0, 0, tw, th));
    photo.thumb = thumb;
  }
  return photo;
}

// cropForPanel resolves a panel's source crop: the smart crop for the panel's
// aspect, narrowed by the reader's zoom and shifted by their drag (dx, dy are
// fractions of the crop window). The window is always clamped inside the
// photo, so a panel can never show empty space.
export function cropForPanel(photo, aspect, crop) {
  ensurePhotoData(photo);
  const base = bestCrop(photo.img, photo.saliency, aspect);
  const zoom = crop?.zoom ?? 1;
  const sw = base.sw / zoom;
  const sh = base.sh / zoom;
  const freeX = base.sw - sw;
  const freeY = base.sh - sh;
  let sx = base.sx + freeX / 2 + (crop?.dx ?? 0) * base.sw;
  let sy = base.sy + freeY / 2 + (crop?.dy ?? 0) * base.sh;
  sx = Math.min(photo.img.naturalWidth - sw, Math.max(0, sx));
  sy = Math.min(photo.img.naturalHeight - sh, Math.max(0, sy));
  return { sx, sy, sw, sh };
}

const panelCache = new Map();

export function clearPanelCache() {
  panelCache.clear();
}

// processedPanel returns a canvas of one panel's photo, cropped and graded at
// exactly pw × ph pixels. Results are cached on everything that shapes them.
function processedPanel(photo, pw, ph, state, crop) {
  const key = [
    photo.id,
    pw,
    ph,
    state.gradeId,
    Math.round(state.ink * 20),
    state.autoGrade ? 'auto' : 'raw',
    crop ? `${Math.round(crop.sx)},${Math.round(crop.sy)},${Math.round(crop.sw)}` : 'fit',
  ].join('|');
  const hit = panelCache.get(key);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, pw);
  canvas.height = Math.max(2, ph);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = photo.img;
  if (crop) {
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
  } else {
    // Plain cover-fit centre crop, used before saliency exists.
    const aspect = pw / ph;
    let sw = img.naturalWidth;
    let sh = sw / aspect;
    if (sh > img.naturalHeight) {
      sh = img.naturalHeight;
      sw = sh * aspect;
    }
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  }
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const lut = buildLut(gradeById(state.gradeId));
  gradePanelPixels(imageData, lut, state.autoGrade ? ensurePhotoData(photo).auto : null, state.ink, canvas.width, canvas.height);
  ctx.putImageData(imageData, 0, 0);
  panelCache.set(key, canvas);
  if (panelCache.size > 90) panelCache.delete(panelCache.keys().next().value);
  return canvas;
}

// --- lettering -------------------------------------------------------------

function fitFontSize(ctx, text, font, maxWidth, startSize, minSize) {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${size}px ${font}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  }
  return size;
}

// splitTitleLines breaks a title into the lines it will be drawn as at a
// given size: one line if it fits, otherwise two at the word nearest the
// middle (or the explicit lines a '\n' asks for, e.g. the duo rail).
function splitTitleLines(ctx, text, maxWidth, size) {
  const forced = text.split('\n').map((s) => s.trim()).filter(Boolean);
  if (forced.length > 1) return forced;
  const words = text.split(/\s+/).filter(Boolean);
  ctx.font = `${size}px ${TITLE_FONT}`;
  if (words.length <= 1 || ctx.measureText(text).width <= maxWidth) return [text];
  let bestSplit = 1;
  let bestWidth = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
    if (w < bestWidth) {
      bestWidth = w;
      bestSplit = i;
    }
  }
  return [words.slice(0, bestSplit).join(' '), words.slice(bestSplit).join(' ')];
}

// letterTitle draws the big display title: sunset-gradient fill, a heavy dark
// outline and a hard offset shadow, centred in (cx, y) within the given
// maximum width and height. The size is chosen so the broken lines fit both.
// Returns the drawn height.
function letterTitle(ctx, text, cx, y, maxWidth, startSize, maxHeight = Infinity, align = 'center') {
  let size = startSize;
  let lines = splitTitleLines(ctx, text, maxWidth, size);
  while (size > 18 && (lines.length * size * 0.94 > maxHeight || lines.some((l) => {
    ctx.font = `${size}px ${TITLE_FONT}`;
    return ctx.measureText(l).width > maxWidth;
  }))) {
    size -= 4;
    lines = splitTitleLines(ctx, text, maxWidth, size);
  }
  const lineHeight = size * 0.94;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  lines.forEach((line, i) => {
    const ly = y + size + i * lineHeight;
    const grad = ctx.createLinearGradient(0, ly - size, 0, ly + size * 0.18);
    grad.addColorStop(0, '#fff3b0');
    grad.addColorStop(0.34, '#ffd23f');
    grad.addColorStop(0.62, '#ff7b39');
    grad.addColorStop(1, '#ff2975');
    ctx.font = `${size}px ${TITLE_FONT}`;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#170824';
    ctx.lineWidth = size / 9;
    ctx.shadowColor = 'rgba(10, 2, 18, 0.6)';
    ctx.shadowOffsetX = size / 16;
    ctx.shadowOffsetY = size / 13;
    ctx.shadowBlur = 0;
    ctx.strokeText(line, cx, ly);
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = grad;
    ctx.fillText(line, cx, ly);
  });
  return lines.length * lineHeight;
}

// letterSubtitle draws the neon script line, tilted, overlapping the title.
function letterSubtitle(ctx, text, cx, y, maxWidth, baseSize) {
  if (!text) return 0;
  const size = fitFontSize(ctx, text, SCRIPT_FONT, maxWidth, baseSize, 14);
  ctx.save();
  ctx.translate(cx, y);
  ctx.rotate(-0.045);
  ctx.font = `${size}px ${SCRIPT_FONT}`;
  ctx.textAlign = 'center';
  ctx.shadowColor = '#17e6cf';
  ctx.shadowBlur = size / 3.2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0b2b33';
  ctx.lineWidth = size / 10;
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 0, 0);
  ctx.restore();
  return size;
}

// letterTagline draws the letter-spaced small-caps strip.
function letterTagline(ctx, text, cx, y, maxWidth, size) {
  if (!text) return 0;
  const label = text.toUpperCase();
  ctx.font = `${size}px ${TITLE_FONT}`;
  let spacing = size * 0.32;
  try {
    ctx.letterSpacing = `${spacing}px`;
  } catch {
    spacing = 0;
  }
  const w = Math.min(maxWidth, ctx.measureText(label).width + size * 1.6);
  ctx.fillStyle = 'rgba(12, 3, 22, 0.88)';
  ctx.fillRect(cx - w / 2, y - size * 1.02, w, size * 1.5);
  ctx.fillStyle = '#ffd23f';
  ctx.textAlign = 'center';
  ctx.fillText(label, cx, y + size * 0.28);
  try {
    ctx.letterSpacing = '0px';
  } catch {
    /* older engines: nothing to reset */
  }
  return size * 1.5;
}

// drawStars draws the heat meter: filled gold stars up to `heat`, hollow
// after, in a row ending at (rightX, cy).
function drawStars(ctx, heat, rightX, cy, radius) {
  ctx.save();
  for (let i = 0; i < 5; i++) {
    const cx = rightX - (4 - i) * radius * 2.25 - radius;
    ctx.beginPath();
    for (let p = 0; p < 10; p++) {
      const r = p % 2 === 0 ? radius : radius * 0.45;
      const a = -Math.PI / 2 + (p * Math.PI) / 5;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (p === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    if (i < heat) {
      ctx.fillStyle = '#ffd23f';
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255, 210, 63, 0.9)';
    ctx.lineWidth = radius / 6;
    ctx.stroke();
  }
  ctx.restore();
}

// drawBadge stamps the starburst release badge in the cover's top-left.
function drawBadge(ctx, W, H, textTop, textBottom) {
  const radius = Math.min(W, H) * 0.085;
  const cx = radius * 1.12;
  const cy = radius * 1.12;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.16);
  ctx.beginPath();
  const points = 18;
  for (let p = 0; p < points * 2; p++) {
    const r = p % 2 === 0 ? radius : radius * 0.82;
    const a = (p * Math.PI) / points;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (p === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffd23f';
  ctx.fill();
  ctx.strokeStyle = '#170824';
  ctx.lineWidth = radius / 11;
  ctx.stroke();
  ctx.fillStyle = '#170824';
  ctx.textAlign = 'center';
  ctx.font = `${radius * 0.52}px ${TITLE_FONT}`;
  ctx.fillText(textTop, 0, radius * 0.1);
  ctx.font = `${radius * 0.21}px ${TITLE_FONT}`;
  ctx.fillText(textBottom, 0, radius * 0.42);
  ctx.restore();
}

// halftoneField dusts a rectangle with the gold dot screen used behind
// centred lettering.
function halftoneField(ctx, x, y, w, h) {
  const step = Math.max(10, w / 42);
  ctx.save();
  ctx.fillStyle = 'rgba(255, 178, 62, 0.5)';
  for (let gy = y + step / 2, row = 0; gy < y + h; gy += step, row++) {
    for (let gx = x + step / 2 + (row % 2 ? step / 2 : 0); gx < x + w; gx += step) {
      const fade = 1 - Math.abs(gy - (y + h / 2)) / (h / 2);
      ctx.beginPath();
      ctx.arc(gx, gy, (step / 2) * 0.62 * Math.max(0.15, fade), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// drawTitleBlock letters the caption into its block. `rect` is in pixels.
function drawTitleBlock(ctx, rect, state, W, H) {
  const { x, y, w, h, kind } = rect;
  if (kind === 'cell' || kind === 'band' || kind === 'rail') {
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#2b0a4e');
    grad.addColorStop(0.55, '#6d1460');
    grad.addColorStop(1, '#a11c68');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    halftoneField(ctx, x, y + h * 0.08, w, h * 0.4);
  } else if (kind === 'scrim') {
    const grad = ctx.createLinearGradient(0, y - h * 0.35, 0, y + h);
    grad.addColorStop(0, 'rgba(14, 2, 24, 0)');
    grad.addColorStop(0.45, 'rgba(14, 2, 24, 0.72)');
    grad.addColorStop(1, 'rgba(14, 2, 24, 0.94)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y - h * 0.35, w, h * 1.35);
  } else if (kind === 'center') {
    halftoneField(ctx, x - w * 0.06, y - h * 0.1, w * 1.12, h * 1.2);
  }

  const title = (state.title || 'UNTITLED').toUpperCase();
  const rail = kind === 'rail';
  // The badge owns the cover's top-left corner, so a title band shifts its
  // lettering right to keep the badge off the first letter.
  const badgeShift = kind === 'band' && state.badge ? w * 0.045 : 0;
  const cx = x + w / 2 + badgeShift;
  const titleMaxW = kind === 'band' && state.badge ? w * 0.83 : w * 0.92;
  // Budget the block before lettering: the heat stars own a strip at the top
  // of a cell or band, the tagline strip owns the bottom, the subtitle a band
  // under the title, and the title gets what is left — so a two-line title in
  // a short cell shrinks instead of spilling or running under the stars.
  const starZone = state.heat > 0 && (kind === 'cell' || kind === 'band') ? h * 0.13 : 0;
  const tagZone = state.tagline ? h * 0.17 : h * 0.05;
  const subZone = state.subtitle ? h * 0.2 : 0;
  const titleZone = h - starZone - tagZone - subZone - h * 0.12;
  const startSize = rail ? h * 0.16 : Math.min(h * 0.52, w * 0.26);
  const titleTop = y + starZone + h * 0.05;
  const titleHeight = letterTitle(ctx, rail ? title.split(/\s+/).join('\n') : title, cx, titleTop, titleMaxW, startSize, titleZone);
  if (state.subtitle) {
    letterSubtitle(ctx, state.subtitle, cx + w * 0.08, titleTop + titleHeight + subZone * 0.78, w * 0.86, h * 0.21);
  }
  if (state.tagline) {
    letterTagline(ctx, state.tagline, cx, y + h - h * 0.055, w * 0.9, Math.max(13, h * 0.062));
  }
  if (state.heat > 0) {
    if (kind === 'cell' || kind === 'band') {
      drawStars(ctx, state.heat, x + w - w * 0.04, y + starZone * 0.55, Math.max(7, Math.min(w, h) * 0.03));
    } else if (kind === 'scrim') {
      drawStars(ctx, state.heat, W - W * 0.02, H * 0.042, Math.max(8, Math.min(W, H) * 0.02));
    } else if (kind === 'center') {
      const r = Math.max(8, Math.min(w, h) * 0.05);
      drawStars(ctx, state.heat, cx + r * 5.6, y + h + r * 1.5, r);
    } else if (rail) {
      const r = Math.max(7, Math.min(w, h) * 0.045);
      drawStars(ctx, state.heat, cx + r * 5.6, y + h - r * 1.6, r);
    }
  }
}

// --- the cover -------------------------------------------------------------

// renderCover draws the whole cover into ctx at W × H pixels.
// state: { layout, gradeId, ink, autoGrade, halftone, title, subtitle,
//          tagline, heat, badge, assignments: [photoIndex per panel],
//          crops: { [panelIndex]: { dx, dy, zoom } } }
// photos: [{ id, img, saliency, auto }]
export function renderCover(ctx, W, H, state, photos) {
  const cls = aspectClass(W, H);
  const lay = layoutFor(state.layout, cls);
  ctx.fillStyle = '#12041f';
  ctx.fillRect(0, 0, W, H);
  if (!photos.length) return;

  const gutter = Math.max(3, Math.round(W * 0.0045));
  const frame = Math.max(3, Math.round(W * 0.004));

  const photoFor = (panelIndex) => {
    const assigned = state.assignments?.[panelIndex];
    const idx = assigned ?? panelIndex % photos.length;
    return photos[Math.min(idx, photos.length - 1)];
  };

  if (lay.polaroids) {
    // Snapshot Tilt: a purple field, a gold halftone band, tilted polaroids.
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#1d0533');
    grad.addColorStop(0.55, '#571060');
    grad.addColorStop(1, '#93195f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    halftoneField(ctx, 0, H * 0.3, W, H * 0.4);
    lay.polaroids.forEach((p, i) => {
      const photo = photoFor(i);
      const pw = p.w * W;
      const ph = pw * 0.82;
      const crop = cropForPanel(photo, pw / (ph * 0.86), state.crops?.[i]);
      const panel = processedPanel(photo, Math.round(pw), Math.round(ph * 0.86), state, crop);
      ctx.save();
      ctx.translate(p.cx * W, p.cy * H);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.shadowColor = 'rgba(5, 0, 12, 0.55)';
      ctx.shadowBlur = W * 0.02;
      ctx.shadowOffsetY = W * 0.008;
      ctx.fillStyle = '#f7f2e7';
      ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
      ctx.shadowColor = 'transparent';
      ctx.drawImage(panel, -pw / 2 + pw * 0.045, -ph / 2 + ph * 0.045, pw * 0.91, ph * 0.78);
      ctx.restore();
      if (state.halftone > 0.01) {
        ctx.save();
        ctx.translate(p.cx * W, p.cy * H);
        ctx.rotate((p.rot * Math.PI) / 180);
        halftoneDots(ctx, -pw / 2 + pw * 0.045, -ph / 2 + ph * 0.045, pw * 0.91, ph * 0.78, panel, state.halftone * 0.8);
        ctx.restore();
      }
    });
  } else {
    lay.panels.forEach((rect, i) => {
      const px = rect.x * W + gutter;
      const py = rect.y * H + gutter;
      const pw = rect.w * W - gutter * 2;
      const ph = rect.h * H - gutter * 2;
      const photo = photoFor(i);
      const crop = cropForPanel(photo, pw / ph, state.crops?.[i]);
      const panel = processedPanel(photo, Math.round(pw), Math.round(ph), state, crop);
      ctx.drawImage(panel, px, py);
      if (state.halftone > 0.01) halftoneDots(ctx, px, py, pw, ph, panel, state.halftone);
      ctx.strokeStyle = '#0a0214';
      ctx.lineWidth = frame;
      ctx.strokeRect(px, py, pw, ph);
    });
  }

  const t = lay.title;
  drawTitleBlock(ctx, { x: t.x * W, y: t.y * H, w: t.w * W, h: t.h * H, kind: t.kind }, state, W, H);
  if (state.badge) drawBadge(ctx, W, H, 'NEW', 'SUMMER 2026');
  filmGrain(ctx, W, H, 20261119, 0.05);
}

// drawCoverToCanvas renders a cover onto a fresh canvas at an export size.
export function drawCoverToCanvas(state, photos, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  renderCover(canvas.getContext('2d'), size.w, size.h, state, photos);
  return canvas;
}
