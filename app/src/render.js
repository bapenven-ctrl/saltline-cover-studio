// render.js — Paints a finished Saltline cover onto a canvas.
//
// The paint order is the poster's own logic: background, photo panels
// with their frames, then the furniture — masthead, cast callouts, the
// chrome title block, and the credits strip. Two title geometries
// exist. In the print layouts (Poster, Ensemble) the title lives in a
// bed of its own below the panels. In the wide and classic layouts it
// overlaps the bottom centre of the panel area, and any callout chip
// that would slide under the tagline ribbon is lifted clear of it, so
// no face and no label is ever covered by the lettering.

import { layoutZones } from './panels.js';
import { gradedCopy } from './grades.js';
import { panelSourceRect } from './smartcrop.js';

export const EXPORT_SIZES = [
  { id: '1080x1080', label: 'Square — 1080 × 1080', w: 1080, h: 1080 },
  { id: '1080x1350', label: 'Portrait — 1080 × 1350', w: 1080, h: 1350 },
  { id: '1920x1080', label: 'Wide — 1920 × 1080', w: 1920, h: 1080 },
  { id: '1080x1920', label: 'Story — 1080 × 1920', w: 1080, h: 1920 },
];

export function sizeById(id) {
  return EXPORT_SIZES.find((s) => s.id === id) || EXPORT_SIZES[2];
}

const INK = '#150a2e';
const GOLD = '#d9a441';
const CREAM = '#ffe9c4';

function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function star(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function spacing(ctx, px) {
  try { ctx.letterSpacing = `${px}px`; } catch { /* older engines ignore it */ }
}

function noSpacing(ctx) {
  try { ctx.letterSpacing = '0px'; } catch { /* ignore */ }
}

// Shrink a font size until the text fits maxWidth. Returns the size.
function fitSize(ctx, text, family, weight, startSize, maxWidth) {
  let size = startSize;
  while (size > 8) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size *= 0.94;
  }
  return size;
}

// ---- Title block geometry -------------------------------------------
// Computed once per render so callout chips can steer clear of the
// tagline ribbon in the overlap layouts.
function titleMetrics(W, H, zones, state) {
  const probe = document.createElement('canvas').getContext('2d');
  const m = { mode: zones.bed ? 'bed' : 'overlap' };
  if (m.mode === 'bed') {
    const bed = zones.bed;
    m.titleSize = fitSize(probe, state.caption, 'Anton', 400, bed.h * 0.5, W * 0.93);
    m.titleBaseline = bed.y + bed.h * 0.52;
    m.subtitleSize = bed.h * 0.155;
    m.subtitleBaseline = bed.y + bed.h * 0.72;
    m.ribbonH = bed.h * 0.145;
    m.ribbonY = bed.y + bed.h * 0.8;
  } else {
    const credTop = zones.credits ? zones.credits.y : H;
    m.titleSize = fitSize(probe, state.caption, 'Anton', 400, H * 0.215, W * 0.7);
    m.titleBaseline = H * 0.7;
    m.subtitleSize = H * 0.05;
    m.subtitleBaseline = m.titleBaseline + m.titleSize * 0.47;
    m.ribbonH = H * 0.043;
    m.ribbonY = m.subtitleBaseline + H * 0.008;
    if (m.ribbonY + m.ribbonH > credTop - H * 0.006) {
      // Very short canvases: pull the whole stack up rather than
      // letting the ribbon fall into the credits strip.
      const shift = m.ribbonY + m.ribbonH - (credTop - H * 0.006);
      m.titleBaseline -= shift;
      m.subtitleBaseline -= shift;
      m.ribbonY -= shift;
    }
  }
  probe.font = `400 ${m.ribbonH * 0.48}px Anton`;
  spacing(probe, m.ribbonH * 0.48 * 0.3);
  const tagW = probe.measureText('THE CITY PAYS IN SUNSETS').width;
  noSpacing(probe);
  m.ribbonW = Math.min(W * 0.62, tagW + m.ribbonH * 1.6);
  m.ribbonX = (W - m.ribbonW) / 2;
  return m;
}

// ---- Furniture pieces ------------------------------------------------

function paintMasthead(ctx, zone, W) {
  const { y, h } = zone;
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, '#1d0f3d');
  grad.addColorStop(1, '#120826');
  ctx.fillStyle = grad;
  ctx.fillRect(0, y, W, h);
  // Five gold stars.
  const r = h * 0.3;
  let sx = W * 0.026 + r;
  ctx.fillStyle = '#f5b921';
  for (let i = 0; i < 5; i++) {
    star(ctx, sx, y + h * 0.47, r);
    ctx.fill();
    sx += r * 2.45;
  }
  // The pull-quote and its attribution.
  const quoteSize = h * 0.4;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = CREAM;
  const qSize = fitSize(ctx, 'THE HOTTEST SUMMER ON RECORD', 'Anton', 400, quoteSize, W * 0.44);
  spacing(ctx, qSize * 0.06);
  ctx.font = `400 ${qSize}px Anton`;
  ctx.fillText('THE HOTTEST SUMMER ON RECORD', sx + W * 0.012, y + h * 0.47);
  const attrSize = h * 0.185;
  ctx.font = `400 ${attrSize}px Anton`;
  spacing(ctx, attrSize * 0.34);
  ctx.fillStyle = '#d9b26a';
  ctx.fillText('THE SALTLINE GAZETTE', sx + W * 0.012, y + h * 0.76);
  noSpacing(ctx);
  // VOL. 1 chip on the right.
  const chipH = h * 0.52;
  const chipSize = h * 0.3;
  ctx.font = `400 ${chipSize}px Anton`;
  spacing(ctx, chipSize * 0.08);
  const chipW = ctx.measureText('VOL. 1').width + chipSize * 1.1;
  const chipX = W - W * 0.024 - chipW;
  const chipY = y + (h - chipH) / 2;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = Math.max(1.5, h * 0.022);
  rr(ctx, chipX, chipY, chipW, chipH, chipH * 0.28);
  ctx.stroke();
  ctx.fillStyle = CREAM;
  ctx.textAlign = 'center';
  ctx.fillText('VOL. 1', chipX + chipW / 2, chipY + chipH * 0.68);
  ctx.textAlign = 'left';
  noSpacing(ctx);
  // Gold rule under the band.
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, y + h - Math.max(2, h * 0.035), W, Math.max(2, h * 0.035));
}

function paintBed(ctx, bed) {
  const grad = ctx.createLinearGradient(0, bed.y, 0, bed.y + bed.h);
  grad.addColorStop(0, '#2a0a4a');
  grad.addColorStop(0.55, '#6d1668');
  grad.addColorStop(1, '#b81f6d');
  ctx.fillStyle = grad;
  ctx.fillRect(bed.x, bed.y, bed.w, bed.h);
  // A soft sun disc glowing behind the lettering.
  const sun = ctx.createRadialGradient(
    bed.w * 0.34, bed.y + bed.h * 0.42, 0,
    bed.w * 0.34, bed.y + bed.h * 0.42, bed.h * 0.66,
  );
  sun.addColorStop(0, 'rgba(255,170,90,0.55)');
  sun.addColorStop(1, 'rgba(255,170,90,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(bed.x, bed.y, bed.w, bed.h);
  // Gold rule along the top of the bed.
  ctx.fillStyle = GOLD;
  ctx.fillRect(bed.x, bed.y, bed.w, Math.max(2, bed.h * 0.008));
}

function paintTitleBlock(ctx, state, m, W) {
  // Chrome-stripe title.
  const titleTop = m.titleBaseline - m.titleSize * 0.74;
  const grad = ctx.createLinearGradient(0, titleTop, 0, m.titleBaseline + m.titleSize * 0.08);
  grad.addColorStop(0, '#fff3b0');
  grad.addColorStop(0.27, '#ffd23e');
  grad.addColorStop(0.44, '#ff9a2e');
  grad.addColorStop(0.57, '#ff5e62');
  grad.addColorStop(0.71, '#ff2e88');
  grad.addColorStop(0.87, '#a83df0');
  grad.addColorStop(1, '#6a3df0');
  ctx.font = `400 ${m.titleSize}px Anton`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#160a28';
  ctx.lineWidth = m.titleSize * 0.17;
  ctx.strokeText(state.caption, W / 2, m.titleBaseline);
  ctx.fillStyle = grad;
  ctx.fillText(state.caption, W / 2, m.titleBaseline);
  ctx.strokeStyle = 'rgba(255,246,214,0.9)';
  ctx.lineWidth = Math.max(1.2, m.titleSize * 0.016);
  ctx.strokeText(state.caption, W / 2, m.titleBaseline);
  // Neon script subtitle.
  ctx.font = `400 ${m.subtitleSize}px Pacifico`;
  ctx.shadowColor = '#ff4d9d';
  ctx.shadowBlur = m.subtitleSize * 0.5;
  ctx.fillStyle = '#ff77b7';
  ctx.fillText(state.subtitle, W / 2, m.subtitleBaseline);
  ctx.fillText(state.subtitle, W / 2, m.subtitleBaseline);
  ctx.shadowBlur = 0;
  // Tagline ribbon.
  ctx.fillStyle = 'rgba(14,6,28,0.94)';
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = Math.max(1.5, m.ribbonH * 0.05);
  rr(ctx, m.ribbonX, m.ribbonY, m.ribbonW, m.ribbonH, m.ribbonH * 0.3);
  ctx.fill();
  ctx.stroke();
  const tagSize = m.ribbonH * 0.48;
  ctx.font = `400 ${tagSize}px Anton`;
  spacing(ctx, tagSize * 0.3);
  ctx.fillStyle = CREAM;
  ctx.fillText('THE CITY PAYS IN SUNSETS', W / 2, m.ribbonY + m.ribbonH * 0.68);
  noSpacing(ctx);
  ctx.textAlign = 'left';
}

function paintCredits(ctx, zone, W) {
  const { y, h } = zone;
  ctx.fillStyle = INK;
  ctx.fillRect(0, y, W, h);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, y, W, Math.max(2, h * 0.045));
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  // Coming soon, left.
  const soonSize = h * 0.34;
  ctx.font = `400 ${soonSize}px Anton`;
  spacing(ctx, soonSize * 0.22);
  ctx.fillStyle = '#f3d9a0';
  ctx.fillText('COMING SOON', W * 0.024, y + h * 0.66);
  noSpacing(ctx);
  // Billing block, centre, two small lines.
  const lineSize = h * 0.2;
  ctx.font = `700 ${lineSize}px 'Arial Narrow', Arial, sans-serif`;
  spacing(ctx, lineSize * 0.16);
  ctx.fillStyle = 'rgba(240,230,210,0.82)';
  ctx.textAlign = 'center';
  ctx.fillText('A SALTLINE PICTURES PRODUCTION · STARRING YOU', W / 2, y + h * 0.4);
  ctx.fillText('SHOT ON YOUR OWN CAMERA · GRADED BY HAND', W / 2, y + h * 0.72);
  noSpacing(ctx);
  ctx.textAlign = 'left';
  // Seal: a gold starburst at the far right.
  const sealR = h * 0.42;
  const sealCx = W - W * 0.02 - sealR;
  const sealCy = y + h * 0.54;
  ctx.beginPath();
  const spikes = 20;
  for (let i = 0; i < spikes * 2; i++) {
    const rad = i % 2 === 0 ? sealR : sealR * 0.8;
    const a = (i * Math.PI) / spikes - Math.PI / 2;
    const px = sealCx + Math.cos(a) * rad;
    const py = sealCy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#f5b921';
  ctx.fill();
  ctx.strokeStyle = '#7a5200';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#4a2c00';
  ctx.textAlign = 'center';
  const sealText = Math.max(4, sealR * 0.3);
  ctx.font = `700 ${sealText}px Arial, sans-serif`;
  ctx.fillText('ORIGINAL', sealCx, sealCy - sealText * 0.12);
  ctx.fillText('COVER ART', sealCx, sealCy + sealText * 0.95);
  // Barcode to the seal's left: white block, seeded bars, tiny digits.
  const bw = W * 0.052;
  const bh = h * 0.56;
  const bx = sealCx - sealR - W * 0.012 - bw;
  const by = y + h * 0.24;
  ctx.fillStyle = '#f4f1e8';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#14100c';
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let bxPos = bx + bw * 0.06;
  while (bxPos < bx + bw * 0.9) {
    const barW = (0.4 + rnd() * 1.6) * (bw / 42);
    if (rnd() > 0.42) ctx.fillRect(bxPos, by + bh * 0.06, barW, bh * 0.76);
    bxPos += barW + bw / 42;
  }
  if (h > 40) {
    ctx.font = `${Math.max(5, h * 0.13)}px Arial, sans-serif`;
    ctx.fillStyle = 'rgba(240,230,210,0.75)';
    ctx.fillText('8 991234 567890', bx + bw / 2, y + h * 0.95);
  }
  ctx.textAlign = 'left';
}

function paintCallout(ctx, rect, label, W, H, ribbon) {
  if (!label) return;
  const chipH = Math.max(15, Math.min(rect.h * 0.1, H * 0.036));
  const fontSize = chipH * 0.52;
  ctx.font = `400 ${fontSize}px Anton`;
  spacing(ctx, fontSize * 0.05);
  const textW = ctx.measureText(label).width;
  noSpacing(ctx);
  const chipW = textW + fontSize * 1.7;
  const slant = chipH * 0.3;
  const x = rect.x + W * 0.006;
  let y = rect.y + rect.h - chipH - rect.h * 0.04;
  // In the overlap layouts, a chip that would slide under the tagline
  // ribbon is lifted clear of it instead.
  if (ribbon && x < ribbon.x + ribbon.w && x + chipW > ribbon.x && y + chipH > ribbon.y) {
    y = Math.min(y, ribbon.y - chipH - H * 0.006);
  }
  ctx.beginPath();
  ctx.moveTo(x + slant, y);
  ctx.lineTo(x + chipW, y);
  ctx.lineTo(x + chipW - slant, y + chipH);
  ctx.lineTo(x, y + chipH);
  ctx.closePath();
  ctx.fillStyle = 'rgba(15,7,30,0.9)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(217,164,65,0.65)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#f5b921';
  ctx.fillRect(x + slant * 0.55, y + chipH * 0.2, Math.max(3, chipH * 0.1), chipH * 0.6);
  ctx.font = `400 ${fontSize}px Anton`;
  spacing(ctx, fontSize * 0.05);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + slant * 0.55 + chipH * 0.32, y + chipH * 0.7);
  noSpacing(ctx);
}

function paintPill(ctx, panelRect, W, H) {
  const size = H * 0.02;
  ctx.font = `400 ${size}px Anton`;
  spacing(ctx, size * 0.14);
  const tw = ctx.measureText('SALTLINE').width;
  noSpacing(ctx);
  const pw = tw + size * 1.5;
  const ph = size * 1.6;
  const x = panelRect.x + W * 0.008;
  const y = panelRect.y + H * 0.01;
  ctx.fillStyle = 'rgba(13,6,28,0.85)';
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.5;
  rr(ctx, x, y, pw, ph, ph / 2);
  ctx.fill();
  ctx.stroke();
  ctx.font = `400 ${size}px Anton`;
  spacing(ctx, size * 0.14);
  ctx.fillStyle = '#ffd98a';
  ctx.textAlign = 'center';
  ctx.fillText('SALTLINE', x + pw / 2, y + ph * 0.7);
  noSpacing(ctx);
  ctx.textAlign = 'left';
}

// ---- The cover itself -------------------------------------------------

export function renderCover(canvas, state, opts = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const gradeId = state.grade === 'auto' ? (state.resolvedGrade || 'key-art') : state.grade;
  const zones = layoutZones(state.layout, W, H, state.furniture);
  const photosById = new Map(state.photos.map((p) => [p.id, p]));

  ctx.fillStyle = '#14092b';
  ctx.fillRect(0, 0, W, H);

  // Photo panels.
  zones.panels.forEach((rect, i) => {
    const panelState = state.panels[i];
    const photo = panelState ? photosById.get(panelState.photoId) : null;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    if (photo && photo.img) {
      const src = gradedCopy(photo, gradeId);
      const r = panelSourceRect(photo, panelState, rect.w / rect.h);
      const k = src.width / photo.img.naturalWidth;
      ctx.drawImage(src, r.sx * k, r.sy * k, r.sw * k, r.sh * k, rect.x, rect.y, rect.w, rect.h);
    } else {
      const g = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
      g.addColorStop(0, '#2a1650');
      g.addColorStop(1, '#180b33');
      ctx.fillStyle = g;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.fillStyle = 'rgba(255,233,196,0.5)';
      ctx.font = `400 ${Math.max(11, H * 0.016)}px Anton`;
      ctx.textAlign = 'center';
      ctx.fillText('ADD A PHOTO', rect.x + rect.w / 2, rect.y + rect.h / 2);
      ctx.textAlign = 'left';
    }
    ctx.restore();
    // Frame: a fine cream keyline inside a dark edge.
    ctx.strokeStyle = 'rgba(8,3,20,0.9)';
    ctx.lineWidth = Math.max(2, W * 0.0022);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = 'rgba(255,238,205,0.85)';
    ctx.lineWidth = Math.max(1.2, W * 0.0012);
    ctx.strokeRect(rect.x + ctx.lineWidth, rect.y + ctx.lineWidth, rect.w - ctx.lineWidth * 2, rect.h - ctx.lineWidth * 2);
  });

  if (state.furniture) {
    const m = titleMetrics(W, H, zones, state);
    if (zones.bed) paintBed(ctx, zones.bed);
    if (zones.masthead) paintMasthead(ctx, zones.masthead, W);
    // The SALTLINE pill sits on the top-left panel.
    if (zones.panels.length) {
      const tl = zones.panels.reduce((a, b) => (b.x < a.x || (b.x === a.x && b.y < a.y) ? b : a), zones.panels[0]);
      paintPill(ctx, tl, W, H);
    }
    if (state.callouts) {
      const ribbon = m.mode === 'overlap'
        ? { x: m.ribbonX, y: m.ribbonY, w: m.ribbonW, h: m.ribbonH }
        : null;
      zones.panels.forEach((rect, i) => {
        const panelState = state.panels[i];
        if (panelState) paintCallout(ctx, rect, panelState.label, W, H, ribbon);
      });
    }
    paintTitleBlock(ctx, state, m, W);
    if (zones.credits) paintCredits(ctx, zones.credits, W);
  }

  // Editor selection outline.
  if (opts.selected != null && zones.panels[opts.selected]) {
    const r = zones.panels[opts.selected];
    ctx.strokeStyle = '#ff8a3d';
    ctx.lineWidth = Math.max(2.5, W * 0.0026);
    ctx.strokeRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
  }
  canvas._zones = zones;
  return zones;
}
