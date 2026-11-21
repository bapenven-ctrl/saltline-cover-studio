// panels.js — Cover geometry: where the masthead, panels, title and
// credits live on the sheet for each layout.
//
// A cover is built from horizontal bands. Every layout reserves a masthead
// band at the top and a credits strip at the bottom. Between them sits the
// panel zone. The three poster layouts differ in how the title is housed:
//   keyart   — the title overlaps the foot of the panel zone, poster-style;
//   poster   — the title gets its own sunset bed below the panels;
//   ensemble — same bed idea, shallower, under a 3x2 grid.
// The seven classic layouts share the keyart housing with their own panel
// arrangements. All numbers are fractions of the canvas, so any export
// size keeps the same composition.

export const LAYOUTS = [
  { id: 'keyart', label: 'Key Art (wide)' },
  { id: 'poster', label: 'Poster (portrait)' },
  { id: 'ensemble', label: 'Ensemble (square)' },
  { id: 'hero-left', label: 'Hero Left' },
  { id: 'hero-right', label: 'Hero Right' },
  { id: 'triptych', label: 'Triptych' },
  { id: 'quad', label: 'Quad 2x2' },
  { id: 'cover-grid', label: 'Cover Grid' },
  { id: 'duet', label: 'Duet + Title' },
  { id: 'full-bleed', label: 'Full Bleed' },
];

export const PANEL_COUNTS = {
  keyart: 5, poster: 5, ensemble: 6,
  'hero-left': 3, 'hero-right': 3, triptych: 3, quad: 4,
  'cover-grid': 6, duet: 3, 'full-bleed': 4,
};

export function layoutById(id) {
  return LAYOUTS.find((l) => l.id === id) || LAYOUTS[0];
}

function band(frac) { return frac; }

// computeGeometry(layoutId, W, H)
// -> { masthead: {y,h}, zone: {x,y,w,h}, bed: {x,y,w,h}|null,
//      credits: {y,h}, titleMode: 'overlap'|'bed', panels: [{x,y,w,h}] }
export function computeGeometry(layoutId, W, H) {
  const plans = {
    keyart: { mast: 0.115, cred: 0.072, bed: 0, mode: 'overlap' },
    poster: { mast: 0.085, cred: 0.04, bed: 0.26, mode: 'bed' },
    ensemble: { mast: 0.095, cred: 0.04, bed: 0.265, mode: 'bed' },
    classic: { mast: 0.078, cred: 0.05, bed: 0, mode: 'overlap' },
  };
  const plan = plans[layoutId] || plans.classic;
  const masthead = { y: 0, h: Math.round(H * plan.mast) };
  const credits = { y: Math.round(H * (1 - plan.cred)), h: Math.round(H * plan.cred) };
  const bed = plan.bed > 0
    ? { x: 0, y: Math.round(credits.y - H * plan.bed), w: W, h: Math.round(H * plan.bed) }
    : null;
  const zoneTop = masthead.h + Math.round(H * 0.012);
  const zoneBottom = (bed ? bed.y : credits.y) - Math.round(H * 0.01);
  const zone = { x: Math.round(W * 0.02), y: zoneTop, w: Math.round(W * 0.96), h: zoneBottom - zoneTop };
  return {
    masthead, credits, bed, zone,
    titleMode: plan.mode,
    panels: panelRects(layoutId, zone, W, H),
  };
}

function panelRects(layoutId, zone, W, H) {
  const gx = Math.round(W * 0.009);
  const gy = Math.round(H * 0.011);
  const { x, y, w, h } = zone;
  const R = (px, py, pw, ph) => ({ x: Math.round(px), y: Math.round(py), w: Math.round(pw), h: Math.round(ph) });
  switch (layoutId) {
    case 'keyart': {
      const heroW = w * 0.415;
      const sideW = (w - heroW - gx * 2) / 2;
      const halfH = (h - gy) / 2;
      return [
        R(x + sideW + gx, y, heroW, h),                    // hero
        R(x, y, sideW, halfH),                             // left top
        R(x, y + halfH + gy, sideW, h - halfH - gy),       // left bottom
        R(x + sideW + gx + heroW + gx, y, sideW, halfH),   // right top
        R(x + sideW + gx + heroW + gx, y + halfH + gy, sideW, h - halfH - gy), // right bottom
      ];
    }
    case 'poster': {
      const rowsH = h - gy * 2;
      const topH = rowsH * 0.26, heroH = rowsH * 0.46, botH = rowsH - topH - heroH;
      const halfW = (w - gx) / 2;
      const y1 = y + topH + gy, y2 = y1 + heroH + gy;
      return [
        R(x, y, halfW, topH),
        R(x + halfW + gx, y, w - halfW - gx, topH),
        R(x, y1, w, heroH),
        R(x, y2, halfW, botH),
        R(x + halfW + gx, y2, w - halfW - gx, botH),
      ];
    }
    case 'ensemble': {
      const cw = (w - gx * 2) / 3, ch = (h - gy) / 2;
      const out = [];
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) out.push(R(x + c * (cw + gx), y + r * (ch + gy), cw, ch));
      return out;
    }
    case 'hero-right': {
      const sideW = w * 0.335, mainW = w - sideW - gx, halfH = (h - gy) / 2;
      return [
        R(x + sideW + gx, y, mainW, h),
        R(x, y, sideW, halfH),
        R(x, y + halfH + gy, sideW, h - halfH - gy),
      ];
    }
    case 'triptych': {
      const cw = (w - gx * 2) / 3;
      return [0, 1, 2].map((i) => R(x + i * (cw + gx), y, cw, h));
    }
    case 'quad': {
      const cw = (w - gx) / 2, ch = (h - gy) / 2;
      return [R(x, y, cw, ch), R(x + cw + gx, y, cw, ch), R(x, y + ch + gy, cw, ch), R(x + cw + gx, y + ch + gy, cw, ch)];
    }
    case 'cover-grid': {
      const cw = (w - gx * 2) / 3, ch = (h - gy) / 2;
      const out = [];
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) out.push(R(x + c * (cw + gx), y + r * (ch + gy), cw, ch));
      return out;
    }
    case 'duet': {
      const bandH = h * 0.24, bodyH = h - bandH - gy, cw = (w - gx) / 2;
      return [R(x, y, cw, bodyH), R(x + cw + gx, y, cw, bodyH), R(x, y + bodyH + gy, w, bandH)];
    }
    case 'full-bleed': {
      const stripH = h * 0.26, sw = (w - gx * 2) / 3;
      const out = [R(x, y, w, h)];
      for (let i = 0; i < 3; i++) out.push(R(x + i * (sw + gx), y + h - stripH, sw, stripH));
      return out;
    }
    case 'hero-left':
    default: {
      const mainW = w * 0.615, sideW = w - mainW - gx, halfH = (h - gy) / 2;
      return [
        R(x, y, mainW, h),
        R(x + mainW + gx, y, sideW, halfH),
        R(x + mainW + gx, y + halfH + gy, sideW, h - halfH - gy),
      ];
    }
  }
}

// getPanelRects(layoutId, W, H) — convenience for hit-testing in the editor.
export function getPanelRects(layoutId, W, H) {
  return computeGeometry(layoutId, W, H).panels;
}
