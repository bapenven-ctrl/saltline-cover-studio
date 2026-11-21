// panels.js — Multi-panel layouts in the GTA poster style.
// The three poster layouts (keyart, poster, ensemble) reserve a masthead
// band at the top and a credits strip at the bottom — the poster furniture
// zones — and lay their panels out straight, with thin frames and dark
// gutters, in the space between. Poster and ensemble additionally reserve
// a title bed above the credits strip, so their panel zones end clear of
// the title block. The classic layouts keep the looser hand-assembled
// collage geometry from earlier rounds.

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

export const POSTER_LAYOUTS = ['keyart', 'poster', 'ensemble'];

// Default photo assignment per layout, by sample photo key. The hero slot
// always takes the driver; supporting slots follow the cast list.
export const LAYOUT_CAST = {
  keyart: ['driver', 'marina', 'rider', 'redhead', 'pier'],
  poster: ['redhead', 'rooftop', 'driver', 'rider', 'motel'],
  ensemble: ['driver', 'pier', 'redhead', 'rider', 'marina', 'neon'],
  'hero-left': ['driver', 'marina', 'pier'],
  'hero-right': ['marina', 'driver', 'pier'],
  triptych: ['driver', 'redhead', 'rider'],
  quad: ['driver', 'pier', 'redhead', 'motel'],
  'cover-grid': ['driver', 'pier', 'redhead', 'rider', 'marina', 'neon'],
  duet: ['driver', 'redhead', 'motel'],
  'full-bleed': ['driver', 'marina', 'rider', 'pier'],
};

function rect(x, y, w, h, rot = 0) {
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), rot };
}

// furnitureZones(layoutId, W, H) -> { mastH, creditsH, top, bottom, titleBedH }
// top/bottom bound the panel area. Poster and ensemble also reserve a
// title bed (titleBedH) between the panel area and the credits strip: the
// title block lives entirely inside that bed and never overlaps a panel.
// Classic layouts reserve nothing.
export function furnitureZones(layoutId, W, H) {
  switch (layoutId) {
    case 'keyart': {
      const mastH = Math.round(H * 0.09), creditsH = Math.round(H * 0.062);
      return { mastH, creditsH, top: mastH, bottom: H - creditsH, titleBedH: 0 };
    }
    case 'poster': {
      // Masthead ~7%, panel zone ~57%, title bed ~32%, credits ~4%.
      const mastH = Math.round(H * 0.07), creditsH = Math.round(H * 0.04);
      const bedH = Math.round(H * 0.32);
      return { mastH, creditsH, top: mastH, bottom: H - creditsH - bedH, titleBedH: bedH };
    }
    case 'ensemble': {
      // Masthead ~8%, panel grid in the top ~62%, title bed ~26%, credits ~4%.
      const mastH = Math.round(H * 0.08), creditsH = Math.round(H * 0.04);
      const bedH = Math.round(H * 0.26);
      return { mastH, creditsH, top: mastH, bottom: H - creditsH - bedH, titleBedH: bedH };
    }
    default:
      return { mastH: 0, creditsH: 0, top: 0, bottom: H, titleBedH: 0 };
  }
}

// getPanelRects(layoutId, width, height) -> [{x, y, w, h, rot}, ...]
export function getPanelRects(layoutId, width, height) {
  const W = width, H = height;
  const m = Math.round(Math.min(W, H) * 0.03); // outer margin
  const g = Math.round(Math.min(W, H) * 0.016); // gutter
  const zones = furnitureZones(layoutId, W, H);
  const areaY = zones.top + g;
  const areaH = zones.bottom - g - areaY;
  const iw = W - m * 2;

  switch (layoutId) {
    case 'keyart': {
      // Hero centre ~44% wide, two stacked panels on each side.
      const heroW = Math.round(iw * 0.44);
      const sideW = Math.round((iw - heroW - g * 2) / 2);
      const half = Math.round((areaH - g) / 2);
      const heroX = m + sideW + g;
      const rightX = heroX + heroW + g;
      const rightW = W - m - rightX;
      return [
        rect(heroX, areaY, heroW, areaH),
        rect(m, areaY, sideW, half),
        rect(m, areaY + half + g, sideW, areaH - half - g),
        rect(rightX, areaY, rightW, half),
        rect(rightX, areaY + half + g, rightW, areaH - half - g),
      ];
    }
    case 'poster': {
      // Row of two, hero, row of two. The bottom row is the tallest band:
      // its wide panels need the height to keep a close-up face whole.
      const topH = Math.round(areaH * 0.21);
      const botH = Math.round(areaH * 0.3);
      const heroH = areaH - topH - botH - g * 2;
      const cw = Math.round((iw - g) / 2);
      const y2 = areaY + topH + g, y3 = y2 + heroH + g;
      return [
        rect(m, areaY, cw, topH), rect(m + cw + g, areaY, iw - cw - g, topH),
        rect(m, y2, iw, heroH),
        rect(m, y3, cw, botH), rect(m + cw + g, y3, iw - cw - g, botH),
      ];
    }
    case 'ensemble': {
      const cols = 3, rows = 2;
      const cw = Math.round((iw - g * (cols - 1)) / cols);
      const ch = Math.round((areaH - g * (rows - 1)) / rows);
      const out = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        out.push(rect(m + c * (cw + g), areaY + r * (ch + g), c === cols - 1 ? W - m - (m + c * (cw + g)) : cw, r === rows - 1 ? zones.bottom - g - (areaY + r * (ch + g)) : ch));
      }
      return out;
    }
    case 'hero-right': {
      const mm = Math.round(Math.min(W, H) * 0.035);
      const gg = Math.round(Math.min(W, H) * 0.018);
      const iiw = W - mm * 2, iih = H - mm * 2;
      const side = Math.round(iiw * 0.34);
      const main = iiw - side - gg;
      const half = Math.round((iih - gg) / 2);
      return [
        rect(mm + side + gg, mm, main, iih, 0),
        rect(mm, mm, side, half, -0.006),
        rect(mm, mm + half + gg, side, iih - half - gg, 0.006),
      ];
    }
    case 'triptych': {
      const mm = Math.round(Math.min(W, H) * 0.035);
      const gg = Math.round(Math.min(W, H) * 0.018);
      const iiw = W - mm * 2, iih = H - mm * 2;
      const cw = Math.round((iiw - gg * 2) / 3);
      return [0, 1, 2].map((i) =>
        rect(mm + i * (cw + gg), mm + (i === 1 ? gg : 0), cw, iih - (i === 1 ? gg : 0), i === 1 ? 0 : (i === 0 ? -0.005 : 0.005)));
    }
    case 'quad': {
      const mm = Math.round(Math.min(W, H) * 0.035);
      const gg = Math.round(Math.min(W, H) * 0.018);
      const iiw = W - mm * 2, iih = H - mm * 2;
      const cw = Math.round((iiw - gg) / 2), ch = Math.round((iih - gg) / 2);
      return [
        rect(mm, mm, cw, ch, -0.004), rect(mm + cw + gg, mm, iiw - cw - gg, ch, 0.004),
        rect(mm, mm + ch + gg, cw, iih - ch - gg, 0.004), rect(mm + cw + gg, mm + ch + gg, iiw - cw - gg, iih - ch - gg, -0.004),
      ];
    }
    case 'cover-grid': {
      const mm = Math.round(Math.min(W, H) * 0.035);
      const gg = Math.round(Math.min(W, H) * 0.018);
      const iiw = W - mm * 2, iih = H - mm * 2;
      const cols = 3, rows = 2;
      const cw = Math.round((iiw - gg * (cols - 1)) / cols);
      const ch = Math.round((iih - gg * (rows - 1)) / rows);
      const out = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        out.push(rect(mm + c * (cw + gg), mm + r * (ch + gg), cw, ch, (c + r) % 2 ? 0.003 : -0.003));
      }
      return out;
    }
    case 'duet': {
      const mm = Math.round(Math.min(W, H) * 0.035);
      const gg = Math.round(Math.min(W, H) * 0.018);
      const iiw = W - mm * 2, iih = H - mm * 2;
      const band = Math.round(iih * 0.22);
      const body = iih - band - gg;
      const cw = Math.round((iiw - gg) / 2);
      return [
        rect(mm, mm, cw, body, -0.005),
        rect(mm + cw + gg, mm, iiw - cw - gg, body, 0.005),
        rect(mm, mm + body + gg, iiw, band, 0),
      ];
    }
    case 'full-bleed': {
      const mm = Math.round(Math.min(W, H) * 0.035);
      const gg = Math.round(Math.min(W, H) * 0.018);
      const iiw = W - mm * 2, iih = H - mm * 2;
      const stripH = Math.round(iih * 0.24);
      const sw = Math.round((iiw - gg * 2) / 3);
      const out = [rect(0, 0, W, H, 0)];
      for (let i = 0; i < 3; i++) {
        out.push(rect(mm + i * (sw + gg), H - mm - stripH, sw, stripH, i === 1 ? 0 : (i === 0 ? -0.008 : 0.008)));
      }
      return out;
    }
    case 'hero-left':
    default: {
      const mm = Math.round(Math.min(W, H) * 0.035);
      const gg = Math.round(Math.min(W, H) * 0.018);
      const iiw = W - mm * 2, iih = H - mm * 2;
      const main = Math.round(iiw * 0.62);
      const side = iiw - main - gg;
      const half = Math.round((iih - gg) / 2);
      return [
        rect(mm, mm, main, iih, 0),
        rect(mm + main + gg, mm, side, half, 0.006),
        rect(mm + main + gg, mm + half + gg, side, iih - half - gg, -0.006),
      ];
    }
  }
}

export function panelCount(layoutId) {
  return (LAYOUT_CAST[layoutId] || []).length || 3;
}

export function layoutById(id) {
  return LAYOUTS.find((l) => l.id === id) || LAYOUTS[0];
}
