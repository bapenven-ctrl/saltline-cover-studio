// panels.js — Cover layouts and their geometry.
//
// A layout divides the canvas into zones: a masthead band at the top and
// a credits strip at the bottom (the poster's furniture), a grid of
// photo panels, and — for the two print formats, Poster and Ensemble —
// a dedicated title bed below the panels, so the big chrome lettering
// sits in its own designed space and never covers a face. The wide Key
// Art layout is the exception: there the title overlaps the bottom
// centre of the panel area, poster-style, the way the approved sheet
// has it.
//
// Every rectangle is computed from the canvas size, so one layout works
// at preview size and at every export size. Each panel carries the id
// of the sample photo it starts with; the editor can reassign freely.

export const LAYOUTS = [
  { id: 'keyart', label: 'Key Art (wide)' },
  { id: 'poster', label: 'Poster (portrait)' },
  { id: 'ensemble', label: 'Ensemble (square)' },
  { id: 'hero-left', label: 'Hero Left' },
  { id: 'hero-right', label: 'Hero Right' },
  { id: 'triptych', label: 'Triptych' },
  { id: 'quad', label: 'Quad' },
  { id: 'cover-grid', label: 'Cover Grid' },
  { id: 'duet', label: 'Duet' },
  { id: 'full-bleed', label: 'Full Bleed' },
];

const BAND = {
  masthead: 0.088, // fraction of height, wide/classic layouts
  credits: 0.06,
  posterMasthead: 0.07,
  posterBed: 0.32,
  ensembleMasthead: 0.08,
  ensembleBed: 0.26,
  printCredits: 0.04,
};

function frame(W, H) {
  return { margin: W * 0.024, gutter: W * 0.009, vGutter: H * 0.009 };
}

function panel(x, y, w, h, role, photo) {
  return { x, y, w, h, role, photo };
}

// The wide key art: hero in the middle, two stacked panels each side.
function keyartPanels(W, H, top, bottom, fr) {
  const areaH = bottom - top;
  const contentW = W - fr.margin * 2;
  const heroW = contentW * 0.415;
  const sideW = (contentW - heroW - fr.gutter * 2) / 2;
  const sideH = (areaH - fr.vGutter) / 2;
  const heroX = fr.margin + sideW + fr.gutter;
  const rightX = heroX + heroW + fr.gutter;
  return [
    panel(heroX, top, heroW, areaH, 'hero', 'driver'),
    panel(fr.margin, top, sideW, sideH, 'side', 'marina'),
    panel(fr.margin, top + sideH + fr.vGutter, sideW, sideH, 'side', 'rider'),
    panel(rightX, top, sideW, sideH, 'side', 'redhead'),
    panel(rightX, top + sideH + fr.vGutter, sideW, sideH, 'side', 'pier'),
  ];
}

// The portrait poster: two over hero over two, title bed underneath.
function posterPanels(W, H, top, bottom, fr) {
  const zoneH = bottom - top;
  const contentW = W - fr.margin * 2;
  const avail = zoneH - fr.vGutter * 2;
  const topH = avail * 0.27;
  const heroH = avail * 0.43;
  const botH = avail * 0.30;
  const halfW = (contentW - fr.gutter) / 2;
  const heroY = top + topH + fr.vGutter;
  const botY = heroY + heroH + fr.vGutter;
  return [
    panel(fr.margin, heroY, contentW, heroH, 'hero', 'driver'),
    panel(fr.margin, top, halfW, topH, 'side', 'redhead'),
    panel(fr.margin + halfW + fr.gutter, top, halfW, topH, 'side', 'rooftop'),
    panel(fr.margin, botY, halfW, botH, 'side', 'rider'),
    panel(fr.margin + halfW + fr.gutter, botY, halfW, botH, 'side', 'motel'),
  ];
}

// The square ensemble: a clean 3x2 grid, title bed underneath.
function ensemblePanels(W, H, top, bottom, fr) {
  const zoneH = bottom - top;
  const contentW = W - fr.margin * 2;
  const cellW = (contentW - fr.gutter * 2) / 3;
  const cellH = (zoneH - fr.vGutter) / 2;
  const photos = ['driver', 'pier', 'redhead', 'rider', 'marina', 'neon'];
  const out = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      out.push(panel(
        fr.margin + col * (cellW + fr.gutter),
        top + row * (cellH + fr.vGutter),
        cellW, cellH, 'grid', photos[row * 3 + col],
      ));
    }
  }
  return out;
}

function heroSidePanels(W, H, top, bottom, fr, heroOnLeft) {
  const areaH = bottom - top;
  const contentW = W - fr.margin * 2;
  const heroW = contentW * 0.56;
  const sideW = contentW - heroW - fr.gutter;
  const sideH = (areaH - fr.vGutter) / 2;
  const heroX = heroOnLeft ? fr.margin : fr.margin + sideW + fr.gutter;
  const sideX = heroOnLeft ? fr.margin + heroW + fr.gutter : fr.margin;
  return [
    panel(heroX, top, heroW, areaH, 'hero', 'driver'),
    panel(sideX, top, sideW, sideH, 'side', heroOnLeft ? 'marina' : 'redhead'),
    panel(sideX, top + sideH + fr.vGutter, sideW, sideH, 'side', heroOnLeft ? 'pier' : 'rooftop'),
  ];
}

function columns(W, H, top, bottom, fr, photos) {
  const areaH = bottom - top;
  const contentW = W - fr.margin * 2;
  const cellW = (contentW - fr.gutter * (photos.length - 1)) / photos.length;
  return photos.map((photo, i) => panel(
    fr.margin + i * (cellW + fr.gutter), top, cellW, areaH, 'column', photo,
  ));
}

function grid(W, H, top, bottom, fr, cols, photos) {
  const areaH = bottom - top;
  const contentW = W - fr.margin * 2;
  const rows = Math.ceil(photos.length / cols);
  const cellW = (contentW - fr.gutter * (cols - 1)) / cols;
  const cellH = (areaH - fr.vGutter * (rows - 1)) / rows;
  return photos.map((photo, i) => panel(
    fr.margin + (i % cols) * (cellW + fr.gutter),
    top + Math.floor(i / cols) * (cellH + fr.vGutter),
    cellW, cellH, 'grid', photo,
  ));
}

// Full zone geometry for a layout at a canvas size. `furniture` reserves
// the masthead/credits/bed zones; without it the panels take the whole
// canvas and the renderer draws no poster furniture at all.
export function layoutZones(layoutId, W, H, furniture = true) {
  const fr = frame(W, H);
  const zones = { masthead: null, credits: null, bed: null, panels: [] };
  if (!furniture) {
    const top = fr.margin;
    const bottom = H - fr.margin;
    zones.panels = panelsFor(layoutId, W, H, top, bottom, fr);
    return zones;
  }
  if (layoutId === 'poster' || layoutId === 'ensemble') {
    const isPoster = layoutId === 'poster';
    const mastH = H * (isPoster ? BAND.posterMasthead : BAND.ensembleMasthead);
    const credH = H * BAND.printCredits;
    const bedH = H * (isPoster ? BAND.posterBed : BAND.ensembleBed);
    zones.masthead = { x: 0, y: 0, w: W, h: mastH };
    zones.credits = { x: 0, y: H - credH, w: W, h: credH };
    zones.bed = { x: 0, y: H - credH - bedH, w: W, h: bedH };
    const top = mastH + H * 0.008;
    const bottom = zones.bed.y - H * 0.008;
    zones.panels = isPoster
      ? posterPanels(W, H, top, bottom, fr)
      : ensemblePanels(W, H, top, bottom, fr);
    return zones;
  }
  const mastH = H * BAND.masthead;
  const credH = H * BAND.credits;
  zones.masthead = { x: 0, y: 0, w: W, h: mastH };
  zones.credits = { x: 0, y: H - credH, w: W, h: credH };
  const top = mastH + H * 0.014;
  const bottom = H - credH - H * 0.012;
  zones.panels = panelsFor(layoutId, W, H, top, bottom, fr);
  return zones;
}

function panelsFor(layoutId, W, H, top, bottom, fr) {
  switch (layoutId) {
    case 'keyart': return keyartPanels(W, H, top, bottom, fr);
    case 'poster': return posterPanels(W, H, top, bottom, fr);
    case 'ensemble': return ensemblePanels(W, H, top, bottom, fr);
    case 'hero-left': return heroSidePanels(W, H, top, bottom, fr, true);
    case 'hero-right': return heroSidePanels(W, H, top, bottom, fr, false);
    case 'triptych': return columns(W, H, top, bottom, fr, ['marina', 'driver', 'pier']);
    case 'duet': return columns(W, H, top, bottom, fr, ['driver', 'marina']);
    case 'quad': return grid(W, H, top, bottom, fr, 2, ['driver', 'pier', 'marina', 'neon']);
    case 'cover-grid': return grid(W, H, top, bottom, fr, 3, ['driver', 'pier', 'redhead', 'rider', 'marina', 'neon']);
    case 'full-bleed': return [panel(fr.margin, top, W - fr.margin * 2, bottom - top, 'hero', 'driver')];
    default: return keyartPanels(W, H, top, bottom, fr);
  }
}

// Just the panel rectangles (used for editor hit-testing).
export function getPanelRects(layoutId, W, H, furniture = true) {
  return layoutZones(layoutId, W, H, furniture).panels;
}

export function panelCount(layoutId) {
  return getPanelRects(layoutId, 1000, 1000, true).length;
}
