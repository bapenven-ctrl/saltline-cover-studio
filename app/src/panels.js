// panels.js — the cover layouts of Saltline Cover Studio.
//
// A layout is a set of panel rectangles in cover-relative coordinates (0..1)
// plus a title block. Rectangles are drawn inset by the renderer's gutter, so
// the tables below can share edges freely. There are seven layouts:
//
//   mosaic  — the classic cover grid: a hero panel, a stack of details and a
//             title cell, eight photos around the lettering;
//   sleeve  — one big hero with a rail of three, the title banded over it;
//   story   — the lettering takes a band across the top, six panels below;
//   tilt    — loose snapshots scattered over a halftone field, title centred;
//   duo     — two tall portraits side by side with a title rail or band;
//   bleed   — a single photo edge to edge, lettering over a scrim;
//   strips  — five vertical reels across the top, title block beneath.
//
// Wide, square and portrait covers each get their own tables: a grid that
// sings at 16:9 crowds a portrait frame, so the portrait tables restack the
// same idea vertically. Story (9:16) covers reuse the portrait tables.

export const LAYOUTS = [
  { id: 'mosaic', name: 'Mosaic' },
  { id: 'sleeve', name: 'Sleeve' },
  { id: 'story', name: 'Story' },
  { id: 'tilt', name: 'Tilt' },
  { id: 'duo', name: 'Duo' },
  { id: 'strips', name: 'Strips' },
  { id: 'bleed', name: 'Bleed' },
];

export function aspectClass(w, h) {
  const ar = w / h;
  if (ar >= 1.45) return 'wide';
  if (ar >= 0.86) return 'square';
  return 'portrait';
}

const R = (x, y, w, h) => ({ x, y, w, h });
const T = (x, y, w, h, kind) => ({ x, y, w, h, kind });

const TABLES = {
  mosaic: {
    wide: {
      panels: [
        R(0, 0, 0.4, 0.63),
        R(0.41, 0, 0.185, 0.305),
        R(0.41, 0.325, 0.185, 0.305),
        R(0.605, 0, 0.395, 0.63),
        R(0, 0.645, 0.145, 0.355),
        R(0.155, 0.645, 0.145, 0.355),
        R(0.31, 0.645, 0.145, 0.355),
        R(0.465, 0.645, 0.13, 0.355),
      ],
      title: T(0.605, 0.645, 0.395, 0.355, 'cell'),
    },
    square: {
      panels: [
        R(0, 0, 1, 0.3),
        R(0, 0.31, 0.49, 0.225),
        R(0.51, 0.31, 0.49, 0.225),
        R(0, 0.545, 0.32, 0.225),
        R(0.34, 0.545, 0.32, 0.225),
        R(0.68, 0.545, 0.32, 0.225),
      ],
      title: T(0, 0.78, 1, 0.22, 'cell'),
    },
    portrait: {
      panels: [
        R(0, 0, 1, 0.335),
        R(0, 0.345, 0.49, 0.2),
        R(0.51, 0.345, 0.49, 0.2),
        R(0, 0.555, 0.32, 0.195),
        R(0.34, 0.555, 0.32, 0.195),
        R(0.68, 0.555, 0.32, 0.195),
      ],
      title: T(0, 0.76, 1, 0.24, 'cell'),
    },
  },

  sleeve: {
    wide: {
      panels: [R(0, 0, 0.52, 1), R(0.53, 0, 0.47, 0.325), R(0.53, 0.335, 0.47, 0.325), R(0.53, 0.67, 0.47, 0.33)],
      title: T(0, 0.76, 0.52, 0.24, 'scrim'),
    },
    square: {
      panels: [R(0, 0, 1, 0.46), R(0, 0.47, 0.49, 0.25), R(0.51, 0.47, 0.49, 0.25)],
      title: T(0, 0.73, 1, 0.27, 'cell'),
    },
    portrait: {
      panels: [R(0, 0, 1, 0.52), R(0, 0.53, 0.49, 0.23), R(0.51, 0.53, 0.49, 0.23)],
      title: T(0, 0.77, 1, 0.23, 'cell'),
    },
  },

  story: {
    wide: {
      panels: [
        R(0, 0.27, 0.327, 0.35),
        R(0.337, 0.27, 0.327, 0.35),
        R(0.673, 0.27, 0.327, 0.35),
        R(0, 0.635, 0.327, 0.365),
        R(0.337, 0.635, 0.327, 0.365),
        R(0.673, 0.635, 0.327, 0.365),
      ],
      title: T(0, 0, 1, 0.255, 'band'),
    },
    square: {
      panels: [
        R(0, 0.235, 0.327, 0.37),
        R(0.337, 0.235, 0.327, 0.37),
        R(0.673, 0.235, 0.327, 0.37),
        R(0, 0.62, 0.327, 0.38),
        R(0.337, 0.62, 0.327, 0.38),
        R(0.673, 0.62, 0.327, 0.38),
      ],
      title: T(0, 0, 1, 0.22, 'band'),
    },
    portrait: {
      panels: [
        R(0, 0.21, 0.49, 0.255),
        R(0.51, 0.21, 0.49, 0.255),
        R(0, 0.475, 0.49, 0.255),
        R(0.51, 0.475, 0.49, 0.255),
        R(0, 0.74, 0.49, 0.26),
        R(0.51, 0.74, 0.49, 0.26),
      ],
      title: T(0, 0, 1, 0.2, 'band'),
    },
  },

  duo: {
    wide: {
      panels: [R(0, 0, 0.335, 1), R(0.345, 0, 0.335, 1)],
      title: T(0.69, 0, 0.31, 1, 'rail'),
    },
    square: {
      panels: [R(0, 0, 0.49, 0.78), R(0.51, 0, 0.49, 0.78)],
      title: T(0, 0.79, 1, 0.21, 'cell'),
    },
    portrait: {
      panels: [R(0, 0, 0.49, 0.8), R(0.51, 0, 0.49, 0.8)],
      title: T(0, 0.81, 1, 0.19, 'cell'),
    },
  },

  strips: {
    wide: {
      panels: [0, 1, 2, 3, 4].map((i) => R(i * 0.202, 0, 0.192, 0.665)),
      title: T(0, 0.68, 1, 0.32, 'band'),
    },
    square: {
      panels: [0, 1, 2, 3].map((i) => R(i * 0.255, 0, 0.245, 0.63)),
      title: T(0, 0.645, 1, 0.355, 'band'),
    },
    portrait: {
      panels: [0, 1, 2, 3].map((i) => R(i * 0.255, 0, 0.245, 0.6)),
      title: T(0, 0.615, 1, 0.385, 'band'),
    },
  },

  bleed: {
    wide: { panels: [R(0, 0, 1, 1)], title: T(0, 0.7, 1, 0.3, 'scrim') },
    square: { panels: [R(0, 0, 1, 1)], title: T(0, 0.72, 1, 0.28, 'scrim') },
    portrait: { panels: [R(0, 0, 1, 1)], title: T(0, 0.74, 1, 0.26, 'scrim') },
  },
};

// The tilt layout is drawn by its own path in the renderer: polaroid frames
// at these centres (cover-relative), sizes and rotations.
const TILTS = {
  wide: {
    polaroids: [
      { cx: 0.185, cy: 0.27, w: 0.315, rot: -5 },
      { cx: 0.815, cy: 0.26, w: 0.315, rot: 4 },
      { cx: 0.16, cy: 0.76, w: 0.27, rot: 3 },
      { cx: 0.5, cy: 0.8, w: 0.27, rot: -2 },
      { cx: 0.84, cy: 0.76, w: 0.27, rot: 5 },
    ],
    title: T(0.14, 0.36, 0.72, 0.28, 'center'),
  },
  square: {
    polaroids: [
      { cx: 0.26, cy: 0.2, w: 0.44, rot: -5 },
      { cx: 0.74, cy: 0.19, w: 0.44, rot: 4 },
      { cx: 0.2, cy: 0.79, w: 0.38, rot: 4 },
      { cx: 0.55, cy: 0.82, w: 0.38, rot: -3 },
      { cx: 0.86, cy: 0.78, w: 0.36, rot: 5 },
    ],
    title: T(0.08, 0.38, 0.84, 0.24, 'center'),
  },
  portrait: {
    polaroids: [
      { cx: 0.3, cy: 0.16, w: 0.52, rot: -5 },
      { cx: 0.72, cy: 0.15, w: 0.52, rot: 4 },
      { cx: 0.24, cy: 0.83, w: 0.44, rot: 4 },
      { cx: 0.6, cy: 0.85, w: 0.44, rot: -3 },
      { cx: 0.88, cy: 0.82, w: 0.4, rot: 5 },
    ],
    title: T(0.06, 0.4, 0.88, 0.2, 'center'),
  },
};

// layoutFor returns the panel table for a layout at an aspect class. Tilt
// returns { polaroids, title } instead of { panels, title }.
export function layoutFor(layoutId, cls) {
  if (layoutId === 'tilt') return TILTS[cls] ?? TILTS.wide;
  const table = TABLES[layoutId] ?? TABLES.mosaic;
  return table[cls] ?? table.wide;
}

export function panelCount(layoutId, cls) {
  const lay = layoutFor(layoutId, cls);
  return (lay.panels ?? lay.polaroids).length;
}
