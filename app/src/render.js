// render.js — Draws a finished Saltline cover onto a canvas.
// Pipeline per panel: crop the assigned photo (smart or manual), paint it to
// a small offscreen canvas, apply the grade, then stamp it into the panel
// rectangle with its frame and its character callout chip. Over the panels
// goes the poster furniture: a masthead band with stars and a pull-quote, a
// chrome title block with script subtitle and tagline ribbon, and a credits
// strip with barcode and seal. On the poster and ensemble layouts the title
// block sits in its own painted sunset bed below the panels, never over
// them. A vignette and fine grain finish the sheet.

import { getPanelRects, furnitureZones, POSTER_LAYOUTS } from './panels.js';
import { lutForGrade, applyLUTToImageData, posterizeBlend, hardPosterize, resolveGradeId } from './grades.js';
import { sourceRectForPanel } from './smartcrop.js';

export const EXPORT_SIZES = [
  { id: '1080x1080', label: 'Square 1080 x 1080', w: 1080, h: 1080 },
  { id: '1080x1350', label: 'Portrait 1080 x 1350', w: 1080, h: 1350 },
  { id: '1920x1080', label: 'Wide 1920 x 1080', w: 1920, h: 1080 },
  { id: '1080x1920', label: 'Story 1080 x 1920', w: 1080, h: 1920 },
];

export function sizeById(id) {
  return EXPORT_SIZES.find((s) => s.id === id) || EXPORT_SIZES[2];
}

// Default character callouts, by sample photo key.
export const PHOTO_LABELS = {
  driver: 'THE DRIVER',
  pier: 'THE CAPTAIN',
  redhead: 'THE FIXER',
  rider: 'THE RIDER',
  marina: 'THE INSIDER',
  rooftop: 'THE BOSS',
  neon: 'THE COURIERS',
  motel: 'THE HIDEOUT',
};

export function defaultLabelFor(photo) {
  if (!photo) return '';
  return PHOTO_LABELS[photo.key] || (photo.name ? photo.name.toUpperCase() : '');
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
  applyLUTToImageData(data, lut, options.gradeId === 'key-art' ? 0.78 : 0.8);
  if (options.gradeId === 'key-art') {
    // The Key Art finish: gentle many-band posterize over the graded photo.
    data = posterizeBlend(data, 18, 0.45, 1.12);
  } else if (options.posterInk) {
    data = hardPosterize(data, 7, 1.22);
  }
  octx.putImageData(data, 0, 0);
  if (options.halftone) paintHalftone(octx, pw, ph);

  ctx.save();
  ctx.translate(panelRect.x + panelRect.w / 2, panelRect.y + panelRect.h / 2);
  ctx.rotate(panelRect.rot || 0);
  ctx.drawImage(off, -panelRect.w / 2, -panelRect.h / 2, panelRect.w, panelRect.h);
  if (options.thinFrame) {
    const lw = Math.max(2, Math.round(Math.min(options.W, options.H) * 0.0032));
    ctx.strokeStyle = 'rgba(255, 246, 230, 0.92)';
    ctx.lineWidth = lw;
    ctx.strokeRect(-panelRect.w / 2 + lw / 2, -panelRect.h / 2 + lw / 2, panelRect.w - lw, panelRect.h - lw);
  } else {
    const border = Math.max(3, Math.round(Math.min(panelRect.w, panelRect.h) * 0.016));
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = border;
    ctx.strokeRect(-panelRect.w / 2 + border / 2, -panelRect.h / 2 + border / 2, panelRect.w - border, panelRect.h - border);
  }
  ctx.restore();
}

// Slanted character callout chip at a panel's bottom-left corner. When
// maxBottom is given, the chip rides up so its bottom edge stays above it.
function paintCallout(ctx, panelRect, label, H, maxBottom = null) {
  const text = (label || '').trim().toUpperCase();
  if (!text) return;
  const inset = Math.max(6, Math.round(Math.min(panelRect.w, panelRect.h) * 0.045));
  const ch = Math.max(17, Math.round(Math.min(panelRect.h * 0.115, H * 0.05)));
  let size = Math.round(ch * 0.56);
  ctx.save();
  ctx.font = `400 ${size}px Anton, sans-serif`;
  try { ctx.letterSpacing = `${Math.max(1, Math.round(size * 0.06))}px`; } catch { /* default spacing */ }
  const tickW = Math.round(ch * 0.16);
  const padX = Math.round(ch * 0.34);
  let textW = ctx.measureText(text).width;
  const maxW = panelRect.w - inset * 2;
  while (textW + tickW + padX * 2 > maxW && size > 9) {
    size -= 1;
    ctx.font = `400 ${size}px Anton, sans-serif`;
    textW = ctx.measureText(text).width;
  }
  const cw = Math.round(textW + tickW + padX * 2);
  const x = panelRect.x + inset;
  let y = panelRect.y + panelRect.h - inset - ch;
  if (maxBottom != null && y + ch > maxBottom) y = maxBottom - ch;
  const slant = Math.round(ch * 0.36);
  ctx.beginPath();
  ctx.moveTo(x, y + ch);
  ctx.lineTo(x + slant, y);
  ctx.lineTo(x + cw + slant, y);
  ctx.lineTo(x + cw, y + ch);
  ctx.closePath();
  ctx.fillStyle = 'rgba(10, 5, 20, 0.88)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 201, 77, 0.55)';
  ctx.lineWidth = Math.max(1, Math.round(ch * 0.045));
  ctx.stroke();
  ctx.fillStyle = '#ffc94d';
  ctx.fillRect(x + padX * 0.55, y + ch * 0.22, tickW, ch * 0.56);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX * 0.55 + tickW + padX * 0.6, y + ch / 2 + size * 0.05);
  try { ctx.letterSpacing = '0px'; } catch { /* nothing to reset */ }
  ctx.restore();
}

function paintStar(ctx, cx, cy, r, color) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function paintMasthead(ctx, W, H, mastH, margin) {
  const grad = ctx.createLinearGradient(0, 0, 0, mastH);
  grad.addColorStop(0, '#1a0c30');
  grad.addColorStop(1, '#0d0618');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, mastH);
  ctx.fillStyle = '#ffc94d';
  ctx.fillRect(0, mastH - Math.max(2, Math.round(mastH * 0.035)), W, Math.max(2, Math.round(mastH * 0.035)));

  const cy = mastH / 2;
  const starR = mastH * 0.2;
  let x = margin + starR;
  for (let i = 0; i < 5; i++) {
    paintStar(ctx, x, cy, starR, '#ffc94d');
    x += starR * 2 + starR * 0.55;
  }
  const textX = x + mastH * 0.12;

  // VOL. 1 chip on the right.
  const chipH = Math.round(mastH * 0.54);
  const chipSize = Math.round(mastH * 0.27);
  ctx.font = `400 ${chipSize}px Anton, sans-serif`;
  const chipW = Math.round(ctx.measureText('VOL. 1').width + chipH * 0.9);
  const chipX = W - margin - chipW;
  const chipY = Math.round((mastH - chipH) / 2);
  ctx.strokeStyle = '#ffc94d';
  ctx.lineWidth = Math.max(1.5, mastH * 0.022);
  ctx.beginPath(); ctx.roundRect(chipX, chipY, chipW, chipH, chipH * 0.22); ctx.stroke();
  ctx.fillStyle = '#ffd98a';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('VOL. 1', chipX + chipW / 2, chipY + chipH / 2 + 1);

  // Pull-quote, two lines: the quote, then its attribution.
  let qSize = Math.round(mastH * 0.315);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const quote = 'THE HOTTEST SUMMER ON RECORD';
  ctx.font = `400 ${qSize}px Anton, sans-serif`;
  try { ctx.letterSpacing = `${Math.round(qSize * 0.13)}px`; } catch { /* default spacing */ }
  const maxQW = chipX - textX - mastH * 0.25;
  while (ctx.measureText(quote).width > maxQW && qSize > 10) {
    qSize -= 2;
    ctx.font = `400 ${qSize}px Anton, sans-serif`;
  }
  ctx.fillStyle = '#f7ead0';
  ctx.fillText(quote, textX, mastH * 0.47);
  const aSize = Math.round(mastH * 0.145);
  ctx.font = `400 ${aSize}px Anton, sans-serif`;
  try { ctx.letterSpacing = `${Math.round(aSize * 0.3)}px`; } catch { /* default spacing */ }
  ctx.fillStyle = '#c9a86a';
  ctx.fillText('THE SALTLINE GAZETTE', textX, mastH * 0.8);
  try { ctx.letterSpacing = '0px'; } catch { /* nothing to reset */ }
}

function paintBarcode(ctx, x, y, w, h) {
  ctx.fillStyle = '#f6f1e6';
  ctx.fillRect(x, y, w, h);
  let seed = 987654321;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  ctx.fillStyle = '#14100c';
  let bx = x + w * 0.05;
  const barArea = w * 0.9;
  while (bx < x + barArea) {
    const bw = 1 + rand() * Math.max(1.6, w * 0.028);
    if (rand() > 0.34) ctx.fillRect(bx, y + h * 0.08, bw, h * 0.66);
    bx += bw + 1 + rand() * Math.max(1.4, w * 0.02);
  }
  ctx.font = `400 ${Math.max(6, Math.round(h * 0.2))}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#14100c';
  ctx.fillText('8 901234 567890', x + w / 2, y + h * 0.95);
}

function paintSeal(ctx, cx, cy, r) {
  ctx.beginPath();
  const points = 16;
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? r : r * 0.8;
    const a = (i * Math.PI) / points;
    const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const grad = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
  grad.addColorStop(0, '#ffe98a');
  grad.addColorStop(1, '#f5a623');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = '#8a5a10';
  ctx.lineWidth = Math.max(1, r * 0.045);
  ctx.stroke();
  ctx.fillStyle = '#2a1503';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const size = Math.max(6, Math.round(r * 0.27));
  ctx.font = `400 ${size}px Anton, sans-serif`;
  ctx.fillText('ORIGINAL', cx, cy - size * 0.58);
  ctx.fillText('COVER ART', cx, cy + size * 0.12);
  const size2 = Math.max(5, Math.round(r * 0.19));
  ctx.font = `400 ${size2}px Anton, sans-serif`;
  ctx.fillText('EST. 2026', cx, cy + size * 0.78);
}

function paintCredits(ctx, W, H, creditsH, margin) {
  const top = H - creditsH;
  const grad = ctx.createLinearGradient(0, top, 0, H);
  grad.addColorStop(0, '#0d0618');
  grad.addColorStop(1, '#170b2c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, top, W, creditsH);
  ctx.fillStyle = '#ffc94d';
  ctx.fillRect(0, top, W, Math.max(2, Math.round(creditsH * 0.04)));
  const cy = top + creditsH / 2;

  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const csSize = Math.round(creditsH * 0.32);
  ctx.font = `400 ${csSize}px Anton, sans-serif`;
  try { ctx.letterSpacing = `${Math.round(csSize * 0.22)}px`; } catch { /* default spacing */ }
  ctx.fillStyle = '#ffe9b0';
  ctx.fillText('COMING SOON', margin, cy + 1);
  const leftW = ctx.measureText('COMING SOON').width;
  try { ctx.letterSpacing = '0px'; } catch { /* nothing to reset */ }

  // Seal at the far right, barcode just left of it.
  const sealR = creditsH * 0.46;
  const sealX = W - margin - sealR;
  const barW = Math.round(creditsH * 1.45), barH = Math.round(creditsH * 0.72);
  const barX = Math.round(sealX - sealR - creditsH * 0.35 - barW);
  paintBarcode(ctx, barX, Math.round(cy - barH / 2), barW, barH);
  paintSeal(ctx, sealX, cy, sealR);

  // Centre billing block, two tiny caps lines.
  const centerX = Math.round((margin + leftW + barX) / 2);
  const lineSize = Math.max(7, Math.round(creditsH * 0.155));
  ctx.font = `400 ${lineSize}px Anton, sans-serif`;
  try { ctx.letterSpacing = `${Math.round(lineSize * 0.18)}px`; } catch { /* default spacing */ }
  ctx.fillStyle = '#cdbcf0';
  ctx.textAlign = 'center';
  ctx.fillText('A SALTLINE PICTURES PRODUCTION · STARRING YOU', centerX, cy - lineSize * 0.62);
  ctx.fillText('SHOT ON YOUR OWN CAMERA · GRADED BY HAND', centerX, cy + lineSize * 0.72);
  try { ctx.letterSpacing = '0px'; } catch { /* nothing to reset */ }
}

function fitFont(ctx, text, family, startSize, maxWidth, spacingRatio = 0) {
  let size = startSize;
  ctx.font = `400 ${size}px ${family}`;
  if (spacingRatio) { try { ctx.letterSpacing = `${Math.round(size * spacingRatio)}px`; } catch { /* default */ } }
  while (ctx.measureText(text).width > maxWidth && size > 12) {
    size -= 3;
    ctx.font = `400 ${size}px ${family}`;
    if (spacingRatio) { try { ctx.letterSpacing = `${Math.round(size * spacingRatio)}px`; } catch { /* default */ } }
  }
  return size;
}

// The title bed: a designed sunset field — deep purple melting into
// magenta, a soft sun disc glowing behind where the title will sit, and a
// gold rule along the top edge where the panel zone ends. Painted only for
// the layouts that reserve a bed (poster, ensemble).
function paintTitleBed(ctx, W, bedTop, creditsTop) {
  const bedH = creditsTop - bedTop;
  const grad = ctx.createLinearGradient(0, bedTop, 0, creditsTop);
  grad.addColorStop(0, '#2b0a4e');
  grad.addColorStop(0.55, '#5c0f6e');
  grad.addColorStop(1, '#93196d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, bedTop, W, bedH);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, bedTop, W, bedH); ctx.clip();
  const sunGrad = ctx.createLinearGradient(0, bedTop + bedH * 0.21, 0, bedTop + bedH * 0.95);
  sunGrad.addColorStop(0, 'rgba(255, 150, 61, 0.5)');
  sunGrad.addColorStop(1, 'rgba(255, 61, 138, 0.5)');
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(W / 2, bedTop + bedH * 0.58, bedH * 0.37, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#ffc94d';
  ctx.fillRect(0, bedTop, W, Math.max(2, Math.round(bedH * 0.008)));
}

// Chrome title block: title, script subtitle, tagline ribbon — stacked
// above the credits strip with every line fully inside the canvas. When
// bedTop is given (poster, ensemble), the whole stack is sized to the bed
// and the title shrinks until its cap top clears the bed's top edge, so
// no letter ever reaches the panels above.
function paintTitleBlock(ctx, W, H, state, creditsTop, bedTop = null) {
  const title = (state.caption || '').trim().toUpperCase();
  const sub = (state.subtitle || '').trim();
  const tagline = (state.tagline || '').trim().toUpperCase();
  const bedH = bedTop != null ? creditsTop - bedTop : 0;
  const marginBottom = bedTop != null ? Math.round(bedH * 0.05) : Math.round(H * 0.016);

  // Tagline ribbon at the bottom of the stack.
  const ribH = bedTop != null ? Math.round(bedH * 0.15) : Math.round(H * 0.047);
  const ribBottom = creditsTop - marginBottom;
  const ribTop = ribBottom - ribH;
  if (tagline) {
    const tSize = fitFont(ctx, tagline, 'Anton, sans-serif', Math.round(ribH * 0.5), W * 0.8, 0.16);
    ctx.font = `400 ${tSize}px Anton, sans-serif`;
    const tw = ctx.measureText(tagline).width + tSize * 0.16 * tagline.length;
    const ribW = Math.min(W * 0.92, Math.round(tw + ribH * 1.1));
    const ribX = Math.round((W - ribW) / 2);
    ctx.fillStyle = 'rgba(11, 5, 22, 0.92)';
    ctx.beginPath(); ctx.roundRect(ribX, ribTop, ribW, ribH, ribH * 0.18); ctx.fill();
    ctx.strokeStyle = '#ffc94d'; ctx.lineWidth = Math.max(1.5, ribH * 0.045); ctx.stroke();
    ctx.fillStyle = '#ffe9b0';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tagline, W / 2, ribTop + ribH / 2 + 1);
    try { ctx.letterSpacing = '0px'; } catch { /* nothing to reset */ }
  }

  // Script subtitle with a neon glow, just above the ribbon.
  let subBaseline = ribTop - (bedTop != null ? Math.round(bedH * 0.03) : Math.round(H * 0.012));
  if (sub) {
    const sSize = fitFont(ctx, sub, 'Pacifico, cursive', bedTop != null ? Math.round(bedH * 0.16) : Math.round(H * 0.05), W * 0.72);
    ctx.font = `400 ${sSize}px Pacifico, cursive`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = '#ff2d78';
    ctx.shadowBlur = sSize * 0.45;
    ctx.fillStyle = '#ff77ad';
    ctx.fillText(sub, W / 2, subBaseline);
    ctx.fillText(sub, W / 2, subBaseline);
    ctx.shadowBlur = sSize * 0.12;
    ctx.fillStyle = '#ffe3ef';
    ctx.fillText(sub, W / 2, subBaseline);
    ctx.shadowBlur = 0;
    subBaseline -= Math.round(sSize * 1.3);
  } else {
    subBaseline -= Math.round(H * 0.03);
  }

  // The title itself: chrome retro-stripe fill, dark outline, light keyline.
  if (title) {
    let tSize = fitFont(ctx, title, 'Anton, sans-serif', bedTop != null ? Math.round(bedH * 0.62) : Math.round(H * 0.2), W * 0.94, 0.02);
    if (bedTop != null) {
      // Shrink until the cap top, outline included, clears the bed's top.
      while (tSize > 30 && subBaseline - Math.round(tSize * 0.1) - tSize * 0.84 < bedTop + Math.round(bedH * 0.03)) {
        tSize -= 4;
      }
    }
    ctx.save();
    ctx.translate(Math.round(W / 2), 0);
    ctx.font = `400 ${tSize}px Anton, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const baseline = subBaseline - Math.round(tSize * 0.1);
    ctx.fillStyle = 'rgba(12, 4, 24, 0.55)';
    ctx.fillText(title, Math.round(tSize * 0.035), baseline + Math.round(tSize * 0.05));
    ctx.lineWidth = Math.max(4, tSize * 0.11);
    ctx.strokeStyle = '#170826';
    ctx.lineJoin = 'round';
    ctx.strokeText(title, 0, baseline);
    const grad = ctx.createLinearGradient(0, baseline - tSize * 0.78, 0, baseline + tSize * 0.22);
    grad.addColorStop(0, '#ffe98a');
    grad.addColorStop(0.36, '#ffb03a');
    grad.addColorStop(0.56, '#ff7a3d');
    grad.addColorStop(0.76, '#ff3d8a');
    grad.addColorStop(1, '#8a3dff');
    ctx.fillStyle = grad;
    ctx.fillText(title, 0, baseline);
    ctx.lineWidth = Math.max(1.5, tSize * 0.014);
    ctx.strokeStyle = 'rgba(255, 246, 214, 0.9)';
    ctx.strokeText(title, 0, baseline);
    try { ctx.letterSpacing = '0px'; } catch { /* nothing to reset */ }
    ctx.restore();
  }
}

function paintPillBug(ctx, W, H, x, y) {
  ctx.save();
  const bh = Math.round(H * 0.04);
  ctx.font = `400 ${Math.round(bh * 0.52)}px Anton, sans-serif`;
  const bw = Math.round(ctx.measureText('SALTLINE').width + bh * 0.9);
  ctx.fillStyle = 'rgba(14,8,28,0.88)';
  ctx.beginPath(); ctx.roundRect(x, y, bw, bh, bh / 2); ctx.fill();
  ctx.strokeStyle = '#ffb03a'; ctx.lineWidth = Math.max(2, bh * 0.05); ctx.stroke();
  ctx.fillStyle = '#ffd98a';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('SALTLINE', x + bw / 2, y + bh / 2 + 1);
  ctx.restore();
}

function paintVignetteAndGrain(ctx, W, H) {
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.36, W / 2, H / 2, Math.max(W, H) * 0.78);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(8,4,18,0.38)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  // Deterministic grain: a fixed-seed pattern, identical on every render.
  let seed = 1234567;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  const dots = Math.round((W * H) / 9000);
  for (let i = 0; i < dots; i++) ctx.fillRect(rand() * W, rand() * H, 1.3, 1.3);
  ctx.fillStyle = 'rgba(0,0,0,0.055)';
  for (let i = 0; i < dots; i++) ctx.fillRect(rand() * W, rand() * H, 1.3, 1.3);
}

// renderCover(canvas, state)
// state: { layout, grade, caption, subtitle, tagline, posterInk, halftone,
//          furniture, callouts,
//          photos: [{img, key, name}],
//          panels: [{photoIndex, zoom, ox, oy, smart, label}] }
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
  const zones = furnitureZones(state.layout, W, H);
  const margin = Math.round(Math.min(W, H) * 0.03);
  const thinFrame = POSTER_LAYOUTS.includes(state.layout);
  const callouts = [];
  rects.forEach((panelRect, i) => {
    const ps = state.panels[i] || { photoIndex: i % Math.max(1, state.photos.length), zoom: 1, ox: 0, oy: 0, smart: true };
    const photo = state.photos[ps.photoIndex] || state.photos[0];
    paintPanel(ctx, photo ? photo.img : null, panelRect, ps, lut, { posterInk: state.posterInk, halftone: state.halftone, gradeId, thinFrame, W, H });
    if (state.callouts) callouts.push([panelRect, ps.label || defaultLabelFor(photo), i]);
  });

  const furniture = state.furniture !== false;
  const creditsTop = furniture && zones.creditsH > 0 ? H - zones.creditsH : H;
  // Layouts with a title bed (poster, ensemble) get the designed sunset bed
  // under their panels; the title stack lives entirely inside it.
  const bedTop = zones.titleBedH > 0 ? zones.bottom : null;
  if (bedTop != null) paintTitleBed(ctx, W, bedTop, creditsTop);
  paintVignetteAndGrain(ctx, W, H);

  if (bedTop == null) {
    // Soft shade behind the title block so type stays readable on busy photos.
    const shadeTop = creditsTop - Math.round(H * 0.42);
    const shade = ctx.createLinearGradient(0, shadeTop, 0, creditsTop);
    shade.addColorStop(0, 'rgba(10,5,22,0)');
    shade.addColorStop(1, 'rgba(10,5,22,0.5)');
    ctx.fillStyle = shade; ctx.fillRect(0, shadeTop, W, creditsTop - shadeTop);
  }

  paintTitleBlock(ctx, W, H, state, creditsTop, bedTop);
  if (furniture && zones.mastH > 0) paintMasthead(ctx, W, H, zones.mastH, margin);
  if (furniture && zones.creditsH > 0) paintCredits(ctx, W, H, zones.creditsH, margin);
  // The SALTLINE pill bug: top-left, just under the masthead when present.
  const pillY = furniture && zones.mastH > 0 ? zones.mastH + Math.round(H * 0.014) : Math.round(H * 0.026);
  paintPillBug(ctx, W, H, margin, pillY);
  // Callout chips paint last, like stickers over the finished poster, so a
  // chip at a panel's bottom corner stays readable where the title block
  // overlaps that corner. On the wide Key Art cover the hero chip rides up
  // a touch so the tagline ribbon never clips its bottom edge.
  const heroRibTop = state.layout === 'keyart' && (state.tagline || '').trim()
    ? creditsTop - Math.round(H * 0.016) - Math.round(H * 0.047)
    : null;
  for (const [panelRect, label, i] of callouts) {
    paintCallout(ctx, panelRect, label, H, heroRibTop != null && i === 0 ? heroRibTop - 6 : null);
  }
  return { gradeId, panelCount: rects.length };
}
