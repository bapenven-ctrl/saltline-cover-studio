// panels.js — Multi-panel layouts in the GTA poster style.
// Each layout returns panel rectangles (in canvas pixels) for a given canvas
// size. Panels carry a small rotation so the collage feels hand-assembled,
// while the renderer still clips photos cleanly inside each rectangle.

export const LAYOUTS = [
  { id: 'hero-left', label: 'Hero Left' },
  { id: 'hero-right', label: 'Hero Right' },
  { id: 'triptych', label: 'Triptych' },
  { id: 'quad', label: 'Quad 2x2' },
  { id: 'cover-grid', label: 'Cover Grid' },
  { id: 'duet', label: 'Duet + Title' },
  { id: 'full-bleed', label: 'Full Bleed' },
];

function rect(x, y, w, h, rot = 0) {
  return { x, y, w, h, rot };
}

// getPanelRects(layoutId, width, height) -> [{x, y, w, h, rot}, ...]
export function getPanelRects(layoutId, width, height) {
  const W = width, H = height;
  const m = Math.round(Math.min(W, H) * 0.035); // outer margin
  const g = Math.round(Math.min(W, H) * 0.018); // gutter
  const iw = W - m * 2, ih = H - m * 2;
  switch (layoutId) {
    case 'hero-right': {
      const side = Math.round(iw * 0.34);
      const main = iw - side - g;
      const half = Math.round((ih - g) / 2);
      return [
        rect(m + side + g, m, main, ih, 0),
        rect(m, m, side, half, -0.006),
        rect(m, m + half + g, side, ih - half - g, 0.006),
      ];
    }
    case 'triptych': {
      const cw = Math.round((iw - g * 2) / 3);
      return [0, 1, 2].map((i) =>
        rect(m + i * (cw + g), m + (i === 1 ? g : 0), cw, ih - (i === 1 ? g : 0), i === 1 ? 0 : (i === 0 ? -0.005 : 0.005)));
    }
    case 'quad': {
      const cw = Math.round((iw - g) / 2), ch = Math.round((ih - g) / 2);
      return [
        rect(m, m, cw, ch, -0.004), rect(m + cw + g, m, iw - cw - g, ch, 0.004),
        rect(m, m + ch + g, cw, ih - ch - g, 0.004), rect(m + cw + g, m + ch + g, iw - cw - g, ih - ch - g, -0.004),
      ];
    }
    case 'cover-grid': {
      const cols = 3, rows = 2;
      const cw = Math.round((iw - g * (cols - 1)) / cols);
      const ch = Math.round((ih - g * (rows - 1)) / rows);
      const out = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        out.push(rect(m + c * (cw + g), m + r * (ch + g), cw, ch, (c + r) % 2 ? 0.003 : -0.003));
      }
      return out;
    }
    case 'duet': {
      const band = Math.round(ih * 0.22);
      const body = ih - band - g;
      const cw = Math.round((iw - g) / 2);
      return [
        rect(m, m, cw, body, -0.005),
        rect(m + cw + g, m, iw - cw - g, body, 0.005),
        rect(m, m + body + g, iw, band, 0),
      ];
    }
    case 'full-bleed': {
      const stripH = Math.round(ih * 0.24);
      const sw = Math.round((iw - g * 2) / 3);
      const out = [rect(0, 0, W, H, 0)];
      for (let i = 0; i < 3; i++) {
        out.push(rect(m + i * (sw + g), H - m - stripH, sw, stripH, i === 1 ? 0 : (i === 0 ? -0.008 : 0.008)));
      }
      return out;
    }
    case 'hero-left':
    default: {
      const main = Math.round(iw * 0.62);
      const side = iw - main - g;
      const half = Math.round((ih - g) / 2);
      return [
        rect(m, m, main, ih, 0),
        rect(m + main + g, m, side, half, 0.006),
        rect(m + main + g, m + half + g, side, ih - half - g, -0.006),
      ];
    }
  }
}

export function layoutById(id) {
  return LAYOUTS.find((l) => l.id === id) || LAYOUTS[0];
}
