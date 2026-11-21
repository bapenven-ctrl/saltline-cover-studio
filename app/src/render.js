// render.js — Paints a finished Saltline cover onto a canvas.
//
// Order of work: photos are cropped and graded panel by panel, a vignette
// and a breath of grain settle over the collage, then the poster furniture
// is printed on top — masthead with its five-star press quote, a Saltline
// pill bug, slanted cast callouts, the chrome title block, and the credits
// strip with its barcode and seal. Every random-looking element (grain,
// barcode bars) comes from a fixed seed, so a cover renders identically
// every time it is drawn.

import { computeGeometry } from './panels.js';
import { gradeById, applyGradeToImageData, resolveGradeId } from './grades.js';
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

const NAVY = '#0d0928';
const GOLD = '#e3a93d';
const CREAM = '#f6ead0';

// mulberry-style seeded generator: tiny, stable, good enough for grain.
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setSpacing(ctx, px) {
  try { ctx.letterSpacing = `${px}px`; } catch { /* engines without it keep default tracking */ }
}

// fitFontSize — shrink from startSize until the (spaced) text fits maxWidth.
function fitFontSize(ctx, text, family, startSize, maxWidth, spacingRatio = 0) {
  let size = startSize;
  const set = () => { ctx.font = `400 ${size}px ${family}`; setSpacing(ctx, size * spacingRatio); };
  set();
  while (ctx.measureText(text).width > maxWidth && size > 10) { size -= 2; set(); }
  return size;
}

function star(ctx, cx, cy, r, color) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const ang = -Math.PI / 2 + i * Math.PI / 5;
    const px = cx + Math.cos(ang) * rad, py = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- panels

function paintPanel(ctx, image, rect, panelState, grade) {
  const pw = Math.max(2, Math.round(rect.w));
  const ph = Math.max(2, Math.round(rect.h));
  const off = document.createElement('canvas');
  off.width = pw; off.height = ph;
  const octx = off.getContext('2d', { willReadFrequently: true });
  if (image) {
    const src = sourceRectForPanel(image, rect, panelState);
    octx.drawImage(image, src.sx, src.sy, src.sw, src.sh, 0, 0, pw, ph);
  } else {
    const grad = octx.createLinearGradient(0, 0, pw, ph);
    grad.addColorStop(0, '#3a2358'); grad.addColorStop(1, '#130a26');
    octx.fillStyle = grad; octx.fillRect(0, 0, pw, ph);
  }
  const data = octx.getImageData(0, 0, pw, ph);
  applyGradeToImageData(data, grade);
  octx.putImageData(data, 0, 0);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = Math.max(6, Math.min(pw, ph) * 0.04);
  ctx.shadowOffsetY = Math.max(2, Math.min(pw, ph) * 0.012);
  ctx.drawImage(off, rect.x, rect.y, pw, ph);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  const lw = Math.max(2, Math.min(5, Math.min(pw, ph) * 0.009));
  ctx.strokeStyle = 'rgba(255,241,214,0.92)';
  ctx.lineWidth = lw;
  ctx.strokeRect(rect.x + lw / 2, rect.y + lw / 2, pw - lw, ph - lw);
  ctx.restore();
}

function paintVignetteAndGrain(ctx, W, H) {
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(7,3,16,0.4)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  const rand = seededRandom(20261121);
  const dots = Math.round((W * H) / 11000);
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  for (let i = 0; i < dots; i++) ctx.fillRect(rand() * W, rand() * H, 1.3, 1.3);
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let i = 0; i < dots; i++) ctx.fillRect(rand() * W, rand() * H, 1.3, 1.3);
}

// -------------------------------------------------------------- masthead

function paintMasthead(ctx, W, mast) {
  const h = mast.h;
  ctx.save();
  // Five gold stars, left.
  const r = h * 0.29;
  const cy = h * 0.46;
  let sx = W * 0.032 + r;
  for (let i = 0; i < 5; i++) { star(ctx, sx, cy, r, '#f4b63f'); sx += r * 2.3; }
  const starsEnd = sx - r * 1.3;

  // VOL. 1 chip, right.
  const chipFont = h * 0.33;
  ctx.font = `400 ${chipFont}px Anton, sans-serif`;
  setSpacing(ctx, chipFont * 0.06);
  const chipW = ctx.measureText('VOL. 1').width + h * 0.42;
  const chipH = h * 0.54;
  const chipX = W - W * 0.024 - chipW;
  const chipY = cy - chipH / 2;
  ctx.beginPath(); ctx.roundRect(chipX, chipY, chipW, chipH, chipH * 0.28);
  ctx.strokeStyle = GOLD; ctx.lineWidth = Math.max(1.6, h * 0.022); ctx.stroke();
  ctx.fillStyle = CREAM;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('VOL. 1', chipX + chipW / 2, chipY + chipH / 2 + 1);

  // Press quote, centred in the space that remains — measured WITH its
  // letter-spacing, so it can never creep under the chip.
  const quote = 'THE HOTTEST SUMMER ON RECORD';
  const avail = chipX - W * 0.02 - starsEnd;
  const qSize = fitFontSize(ctx, quote, 'Anton, sans-serif', h * 0.56, avail, 0.045);
  ctx.font = `400 ${qSize}px Anton, sans-serif`;
  setSpacing(ctx, qSize * 0.045);
  const qW = ctx.measureText(quote).width;
  const qx = starsEnd + (avail - qW) / 2;
  ctx.fillStyle = CREAM;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(quote, qx, h * 0.60);

  // The paper's name, letterspaced gold, under the quote's left edge.
  const gSize = h * 0.175;
  ctx.font = `400 ${gSize}px Anton, sans-serif`;
  setSpacing(ctx, gSize * 0.5);
  ctx.fillStyle = GOLD;
  ctx.fillText('THE SALTLINE GAZETTE', qx + 2, h * 0.865);
  setSpacing(ctx, 0);

  // Gold rule closing the band.
  const rule = ctx.createLinearGradient(0, 0, W, 0);
  rule.addColorStop(0, 'rgba(227,169,61,0.25)');
  rule.addColorStop(0.5, 'rgba(227,169,61,0.95)');
  rule.addColorStop(1, 'rgba(227,169,61,0.25)');
  ctx.fillStyle = rule;
  ctx.fillRect(0, h - Math.max(2, H_PX(ctx) * 0.0022), W, Math.max(2, H_PX(ctx) * 0.0022));
  ctx.restore();
}

function H_PX(ctx) { return ctx.canvas.height; }

// ------------------------------------------------------------------ pill

function paintSaltlinePill(ctx, zone, H) {
  ctx.save();
  const size = Math.max(15, Math.min(30, zone.h * 0.032));
  ctx.font = `400 ${size}px Anton, sans-serif`;
  setSpacing(ctx, size * 0.08);
  const w = ctx.measureText('SALTLINE').width + size * 1.15;
  const h = size * 1.52;
  const x = zone.x + Math.round(zone.w * 0.008);
  const y = zone.y + Math.round(H * 0.01);
  ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2);
  ctx.fillStyle = 'rgba(12,7,26,0.88)'; ctx.fill();
  ctx.strokeStyle = GOLD; ctx.lineWidth = Math.max(1.5, size * 0.07); ctx.stroke();
  ctx.fillStyle = '#ffd98a';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('SALTLINE', x + w / 2, y + h / 2 + 1);
  setSpacing(ctx, 0);
  ctx.restore();
}

// --------------------------------------------------------------- callout

function calloutRect(rect, label, ctx) {
  const h = Math.max(19, Math.min(38, rect.h * 0.052));
  const size = h * 0.54;
  ctx.font = `400 ${size}px Anton, sans-serif`;
  setSpacing(ctx, size * 0.05);
  const w = ctx.measureText(label).width + h * 1.15;
  return {
    x: rect.x + rect.w * 0.032,
    y: rect.y + rect.h - h - rect.h * 0.032,
    w, h, size,
  };
}

function paintCallout(ctx, rect, label, avoid) {
  const box = calloutRect(rect, label, ctx);
  if (avoid) {
    const pad = 8;
    const hits = box.x < avoid.x + avoid.w + pad && box.x + box.w > avoid.x - pad &&
      box.y < avoid.y + avoid.h + pad && box.y + box.h > avoid.y - pad;
    if (hits) box.y = avoid.y - box.h - pad;
  }
  const slant = box.h * 0.26;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(box.x, box.y);
  ctx.lineTo(box.x + box.w, box.y);
  ctx.lineTo(box.x + box.w - slant, box.y + box.h);
  ctx.lineTo(box.x, box.y + box.h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(11,6,24,0.9)';
  ctx.fill();
  ctx.fillStyle = GOLD;
  ctx.fillRect(box.x + box.h * 0.22, box.y + box.h * 0.26, box.h * 0.13, box.h * 0.48);
  ctx.font = `400 ${box.size}px Anton, sans-serif`;
  setSpacing(ctx, box.size * 0.05);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, box.x + box.h * 0.52, box.y + box.h / 2 + 1);
  setSpacing(ctx, 0);
  ctx.restore();
}

// ----------------------------------------------------------------- title

function drawChromeTitle(ctx, text, cx, baseline, size) {
  ctx.save();
  ctx.font = `400 ${size}px Anton, sans-serif`;
  setSpacing(ctx, size * 0.015);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const grad = ctx.createLinearGradient(0, baseline - size * 0.8, 0, baseline + size * 0.1);
  grad.addColorStop(0, '#fff6bd');
  grad.addColorStop(0.3, '#ffd23e');
  grad.addColorStop(0.52, '#ff9435');
  grad.addColorStop(0.74, '#ff3d8a');
  grad.addColorStop(1, '#7a2bd0');
  ctx.fillStyle = 'rgba(10,4,20,0.5)';
  ctx.fillText(text, cx + size * 0.032, baseline + size * 0.05);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#150826';
  ctx.lineWidth = size * 0.17;
  ctx.strokeText(text, cx, baseline);
  ctx.fillStyle = grad;
  ctx.fillText(text, cx, baseline);
  ctx.strokeStyle = 'rgba(255,233,168,0.8)';
  ctx.lineWidth = size * 0.02;
  ctx.strokeText(text, cx, baseline);
  setSpacing(ctx, 0);
  ctx.restore();
}

function drawSubtitle(ctx, text, cx, baseline, size) {
  ctx.save();
  ctx.font = `400 ${size}px Pacifico, cursive`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(255,45,150,0.85)';
  ctx.shadowBlur = size * 0.32;
  ctx.fillStyle = '#ff8ac2';
  ctx.fillText(text, cx, baseline);
  ctx.fillText(text, cx, baseline);
  ctx.restore();
}

function drawRibbon(ctx, text, cx, cy, h) {
  ctx.save();
  const size = h * 0.42;
  ctx.font = `400 ${size}px Anton, sans-serif`;
  setSpacing(ctx, size * 0.3);
  const w = ctx.measureText(text).width + h * 1.1;
  ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h * 0.24);
  ctx.fillStyle = 'rgba(13,8,28,0.94)'; ctx.fill();
  ctx.strokeStyle = GOLD; ctx.lineWidth = Math.max(1.6, h * 0.055); ctx.stroke();
  ctx.fillStyle = CREAM;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 1);
  setSpacing(ctx, 0);
  ctx.restore();
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

// planTitle — measure the title block before painting so callouts can be
// kept clear of the ribbon in overlap mode.
function planTitle(ctx, geom, W, H, state) {
  const title = (state.caption || '').trim().toUpperCase();
  const sub = (state.subtitle || '').trim();
  if (geom.titleMode === 'bed') {
    const bed = geom.bed;
    const size = fitFontSize(ctx, title, 'Anton, sans-serif', bed.h * 0.6, W * 0.94, 0.015);
    return {
      mode: 'bed', title, sub, size,
      titleBaseline: bed.y + bed.h * 0.52,
      subBaseline: bed.y + bed.h * 0.73,
      ribbonCy: bed.y + bed.h * 0.885,
      ribbonH: bed.h * 0.115,
      ribbonRect: null,
    };
  }
  const start = state.layout === 'keyart' ? H * 0.225 : H * 0.185;
  const size = fitFontSize(ctx, title, 'Anton, sans-serif', start, W * 0.82, 0.015);
  const titleBaseline = geom.zone.y + geom.zone.h * 0.735;
  const subBaseline = titleBaseline + size * 0.36;
  const ribbonH = H * 0.046;
  const ribbonCy = subBaseline + H * 0.05;
  // Ribbon width, for the callout collision test.
  const rSize = ribbonH * 0.42;
  ctx.font = `400 ${rSize}px Anton, sans-serif`;
  setSpacing(ctx, rSize * 0.3);
  const rw = ctx.measureText('THE CITY PAYS IN SUNSETS').width + ribbonH * 1.1;
  setSpacing(ctx, 0);
  return {
    mode: 'overlap', title, sub, size, titleBaseline, subBaseline, ribbonCy, ribbonH,
    ribbonRect: { x: W / 2 - rw / 2, y: ribbonCy - ribbonH / 2, w: rw, h: ribbonH },
  };
}

function paintTitleBed(ctx, geom, W) {
  const bed = geom.bed;
  ctx.save();
  const grad = ctx.createLinearGradient(0, bed.y, 0, bed.y + bed.h);
  grad.addColorStop(0, '#26084a');
  grad.addColorStop(0.55, '#6d1560');
  grad.addColorStop(1, '#bc2070');
  ctx.fillStyle = grad;
  ctx.fillRect(bed.x, bed.y, bed.w, bed.h);
  const glow = ctx.createRadialGradient(W / 2, bed.y + bed.h * 0.4, 10, W / 2, bed.y + bed.h * 0.4, bed.h * 0.95);
  glow.addColorStop(0, 'rgba(255,130,80,0.22)');
  glow.addColorStop(1, 'rgba(255,130,80,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(bed.x, bed.y, bed.w, bed.h);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, bed.y, W, Math.max(2, bed.h * 0.012));
  ctx.restore();
}

function paintTitle(ctx, plan, W) {
  if (plan.title) drawChromeTitle(ctx, plan.title, W / 2, plan.titleBaseline, plan.size);
  if (plan.sub) drawSubtitle(ctx, plan.sub, W / 2, plan.subBaseline, plan.size * 0.30);
  drawRibbon(ctx, 'THE CITY PAYS IN SUNSETS', W / 2, plan.ribbonCy, plan.ribbonH);
}

// --------------------------------------------------------------- credits

function paintCredits(ctx, W, credits) {
  const { y, h } = credits;
  ctx.save();
  ctx.fillStyle = 'rgba(227,169,61,0.45)';
  ctx.fillRect(0, y, W, 1);
  const cy = y + h / 2;
  ctx.textBaseline = 'middle';

  const soonSize = h * 0.32;
  ctx.font = `400 ${soonSize}px Anton, sans-serif`;
  setSpacing(ctx, soonSize * 0.16);
  ctx.fillStyle = GOLD;
  ctx.textAlign = 'left';
  ctx.fillText('COMING SOON', W * 0.022, cy + 1);

  const lineSize = h * 0.205;
  ctx.font = `400 ${lineSize}px Anton, sans-serif`;
  setSpacing(ctx, lineSize * 0.2);
  ctx.fillStyle = '#cfc4e8';
  ctx.textAlign = 'center';
  ctx.fillText('A SALTLINE PICTURES PRODUCTION · STARRING YOU', W / 2, y + h * 0.32);
  ctx.fillText('SHOT ON YOUR OWN CAMERA · GRADED BY HAND', W / 2, y + h * 0.68);
  setSpacing(ctx, 0);

  // Seal: a gold starburst at the far right.
  const sealR = h * 0.4;
  const sealX = W - W * 0.02 - sealR;
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const rad = i % 2 === 0 ? sealR : sealR * 0.8;
    const ang = (i / 24) * Math.PI * 2;
    const px = sealX + Math.cos(ang) * rad, py = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#f2b63c';
  ctx.fill();
  ctx.fillStyle = '#160a2c';
  ctx.textAlign = 'center';
  const micro = sealR * 0.34;
  ctx.font = `400 ${micro}px Anton, sans-serif`;
  ctx.fillText('ORIGINAL', sealX, cy - micro * 0.55);
  ctx.fillText('COVER ART', sealX, cy + micro * 0.75);
  ctx.restore();

  // Barcode: white card, seeded bars, number underneath.
  const bw = W * 0.05, bh = h * 0.5;
  const bx = sealX - sealR - W * 0.012 - bw;
  const by = cy - bh / 2 - h * 0.07;
  ctx.fillStyle = '#f4f1e8';
  ctx.fillRect(bx, by, bw, bh);
  const rand = seededRandom(987654);
  ctx.fillStyle = '#14100c';
  let px = bx + bw * 0.08;
  while (px < bx + bw * 0.9) {
    const barW = 1 + rand() * bw * 0.045;
    if (rand() > 0.32) ctx.fillRect(px, by + bh * 0.1, barW, bh * 0.8);
    px += barW + 1 + rand() * bw * 0.03;
  }
  const numSize = h * 0.15;
  ctx.font = `400 ${numSize}px Anton, sans-serif`;
  setSpacing(ctx, numSize * 0.1);
  ctx.fillStyle = '#cfc4e8';
  ctx.textAlign = 'center';
  ctx.fillText('9 882134 567890', bx + bw / 2, by + bh + h * 0.14);
  setSpacing(ctx, 0);
  ctx.restore();
}

// ------------------------------------------------------------ plain mode

function paintPlainLettering(ctx, W, H, state) {
  const shade = ctx.createLinearGradient(0, H * 0.6, 0, H);
  shade.addColorStop(0, 'rgba(10,5,22,0)');
  shade.addColorStop(1, 'rgba(10,5,22,0.6)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, H * 0.6, W, H * 0.4);
  const title = (state.caption || '').trim().toUpperCase();
  if (title) {
    const size = fitFontSize(ctx, title, 'Anton, sans-serif', H * 0.11, W * 0.9, 0.02);
    drawChromeTitle(ctx, title, W / 2, H * 0.9, size);
  }
  const sub = (state.subtitle || '').trim();
  if (sub) drawSubtitle(ctx, sub, W / 2, H * 0.955, H * 0.034);
}

// ----------------------------------------------------------------- cover

// renderCover(canvas, state)
// state: { layout, grade, caption, subtitle, furniture, callouts,
//          photos: [{img, id}], panels: [{photoIndex, zoom, ox, oy, smart, label}] }
export function renderCover(canvas, state) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, W, H);
  const geom = computeGeometry(state.layout, W, H);
  canvas._panelRects = geom.panels;

  const heroPanel = state.panels[0];
  const heroPhoto = heroPanel ? state.photos[heroPanel.photoIndex] : state.photos[0];
  const gradeId = resolveGradeId(state.grade, heroPhoto ? heroPhoto.img : null);
  const grade = gradeById(gradeId);

  geom.panels.forEach((rect, i) => {
    const ps = state.panels[i] || { photoIndex: 0, zoom: 1, ox: 0, oy: 0, smart: true };
    const photo = state.photos[ps.photoIndex] || state.photos[0];
    paintPanel(ctx, photo ? photo.img : null, rect, ps, grade);
  });
  paintVignetteAndGrain(ctx, W, H);

  if (!state.furniture) {
    paintPlainLettering(ctx, W, H, state);
    return { gradeId, panelCount: geom.panels.length };
  }

  if (geom.bed) paintTitleBed(ctx, geom, W);
  paintMasthead(ctx, W, geom.masthead);
  paintSaltlinePill(ctx, geom.zone, H);
  const plan = planTitle(ctx, geom, W, H, state);
  if (state.callouts) {
    geom.panels.forEach((rect, i) => {
      const ps = state.panels[i];
      if (!ps) return;
      const photo = state.photos[ps.photoIndex];
      const label = ps.label || (photo && photo.callout) || '';
      if (label) paintCallout(ctx, rect, label, i === 0 ? plan.ribbonRect : null);
    });
  }
  paintTitle(ctx, plan, W);
  paintCredits(ctx, W, geom.credits);
  return { gradeId, panelCount: geom.panels.length };
}
