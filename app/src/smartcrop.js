// smartcrop.js — Where each panel looks inside its photo.
//
// The smart pass shrinks the photo to a small grid and scores every cell
// three ways: edge strength (detail worth keeping), local contrast, and a
// skin-tone vote. Skin cells are flood-filled into blobs; the largest blob
// is treated as the subject — usually a face with its neck and shoulders.
// The crop window is then placed so the subject survives whole:
//
//   * if the window can contain the subject box, it must — with margin;
//   * the subject rests at roughly 42 percent of the window height, the
//     classic poster composition, when that costs little saliency;
//   * otherwise the window centres on the saliency-weighted centroid.
//
// Manual mode is plain cover-crop math: the largest window of the panel's
// aspect, tightened by the zoom factor and shifted by the drag offsets.
// Everything is a pure function of the photo, so renders are repeatable.

const GRID = 40;

function isSkin(r, g, b) {
  return r > 92 && g > 40 && b > 18 && r > g && g > b && r - b > 20 && r - g < 90;
}

// analyseImage(image) -> { saliency, skin, subject }
// subject: { cx, cy, box: {x0,y0,x1,y1} | null } in normalised 0..1 space.
export function analyseImage(image) {
  const cols = GRID, rows = GRID;
  const c = document.createElement('canvas');
  c.width = cols; c.height = rows;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, cols, rows);
  const d = ctx.getImageData(0, 0, cols, rows).data;
  const grey = new Float32Array(cols * rows);
  const skin = new Uint8Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    grey[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    skin[i] = isSkin(r, g, b) ? 1 : 0;
  }
  const saliency = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const gx = Math.abs(grey[i] - grey[y * cols + Math.min(cols - 1, x + 1)]);
      const gy = Math.abs(grey[i] - grey[Math.min(rows - 1, y + 1) * cols + x]);
      const cx = 1 - Math.abs(x - (cols - 1) / 2) / cols;
      const cy = 1 - Math.abs(y - (rows - 1) / 2) / rows;
      saliency[i] = gx + gy + skin[i] * 26 + (cx + cy) * 2.5;
    }
  }
  return { cols, rows, saliency, subject: largestSkinBlob(skin, cols, rows) };
}

// largestSkinBlob — flood fill over the skin mask; returns the biggest
// blob's centroid and bounding box, or null when no blob is convincing.
function largestSkinBlob(skin, cols, rows) {
  const seen = new Uint8Array(cols * rows);
  let best = null;
  for (let start = 0; start < cols * rows; start++) {
    if (!skin[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    let count = 0, sx = 0, sy = 0, x0 = cols, y0 = rows, x1 = 0, y1 = 0;
    while (stack.length) {
      const i = stack.pop();
      const x = i % cols, y = (i / cols) | 0;
      count++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      const nb = [i - 1, i + 1, i - cols, i + cols];
      for (const j of nb) {
        if (j < 0 || j >= cols * rows || seen[j] || !skin[j]) continue;
        if (Math.abs((j % cols) - x) > 1) continue;
        seen[j] = 1; stack.push(j);
      }
    }
    if (!best || count > best.count) best = { count, sx, sy, x0, y0, x1, y1 };
  }
  if (!best || best.count < 6) return null;
  return {
    cx: (best.sx / best.count + 0.5) / cols,
    cy: (best.sy / best.count + 0.5) / rows,
    box: {
      x0: best.x0 / cols, y0: best.y0 / rows,
      x1: (best.x1 + 1) / cols, y1: (best.y1 + 1) / rows,
    },
  };
}

const analysisCache = new WeakMap();
function analysisFor(image) {
  if (!analysisCache.has(image)) {
    try { analysisCache.set(image, analyseImage(image)); }
    catch { analysisCache.set(image, null); }
  }
  return analysisCache.get(image);
}

function clampWindow(v, size, limit) {
  return Math.min(Math.max(v, 0), Math.max(0, limit - size));
}

// findSmartCrop(image, targetAspect, nudgeY)
// nudgeY (in window heights, + moves the window down the photo) lets a
// scene director fine-tune one panel without touching the general rule.
export function findSmartCrop(image, targetAspect, nudgeY = 0) {
  const iw = image.naturalWidth, ih = image.naturalHeight;
  let sw, sh;
  if (iw / ih > targetAspect) { sh = ih; sw = ih * targetAspect; }
  else { sw = iw; sh = iw / targetAspect; }
  const info = analysisFor(image);
  if (!info) return { sx: Math.round((iw - sw) / 2), sy: Math.round((ih - sh) / 2), sw: Math.round(sw), sh: Math.round(sh) };

  const { cols, rows, saliency, subject } = info;
  // Saliency centroid of the whole frame — the fallback subject.
  let wx = 0, wy = 0, wsum = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const s = saliency[y * cols + x];
      wx += (x + 0.5) * s; wy += (y + 0.5) * s; wsum += s;
    }
  }
  let focusX = wsum ? wx / wsum / cols : 0.5;
  let focusY = wsum ? wy / wsum / rows : 0.42;
  if (subject) { focusX = subject.cx; focusY = subject.cy; }

  // Start from the composition point: subject at 42% of window height.
  let sx = focusX * iw - sw / 2;
  let sy = focusY * ih - sh * 0.42;

  // Hard rule: when the window can hold the whole subject box (with a
  // small margin), it does — a chin or forehead never leaves the panel.
  if (subject && subject.box) {
    const m = 0.035;
    const bx0 = (subject.box.x0 - m) * iw, bx1 = (subject.box.x1 + m) * iw;
    const by0 = (subject.box.y0 - m) * ih, by1 = (subject.box.y1 + m) * ih;
    if (bx1 - bx0 <= sw) {
      if (sx > bx0) sx = bx0;
      if (sx + sw < bx1) sx = bx1 - sw;
    }
    if (by1 - by0 <= sh) {
      if (sy > by0) sy = by0;
      if (sy + sh < by1) sy = by1 - sh;
    } else {
      // The subject is taller than the window: favour the top of the
      // subject — forehead and eyes matter more than the neck below.
      sy = Math.min(sy, by0 - sh * 0.05);
    }
  }
  sy += nudgeY * sh;
  return {
    sx: Math.round(clampWindow(sx, sw, iw)),
    sy: Math.round(clampWindow(sy, sh, ih)),
    sw: Math.round(sw), sh: Math.round(sh),
  };
}

// coverSourceRect(image, targetAspect, zoom, offsetX, offsetY)
// Manual framing: cover window, zoomed around its centre, dragged by
// offsets in -1..1, always clamped inside the photo.
export function coverSourceRect(image, targetAspect, zoom = 1, offsetX = 0, offsetY = 0) {
  const iw = image.naturalWidth, ih = image.naturalHeight;
  let sw, sh;
  if (iw / ih > targetAspect) { sh = ih; sw = ih * targetAspect; }
  else { sw = iw; sh = iw / targetAspect; }
  const z = Math.min(3, Math.max(1, zoom));
  sw /= z; sh /= z;
  const cx = iw / 2 + offsetX * (iw - sw) / 2;
  const cy = ih / 2 + offsetY * (ih - sh) / 2;
  return {
    sx: Math.round(clampWindow(cx - sw / 2, sw, iw)),
    sy: Math.round(clampWindow(cy - sh / 2, sh, ih)),
    sw: Math.round(sw), sh: Math.round(sh),
  };
}

// sourceRectForPanel(image, panelRect, panelState)
// panelState: { smart, zoom, ox, oy, dy } — dy is a scene-level nudge in
// window heights applied after the smart placement.
export function sourceRectForPanel(image, panelRect, panelState) {
  const aspect = panelRect.w / panelRect.h;
  const st = panelState || {};
  if (st.smart) {
    const base = findSmartCrop(image, aspect, st.dy || 0);
    if (st.zoom && st.zoom > 1) {
      const cx = base.sx + base.sw / 2, cy = base.sy + base.sh / 2;
      base.sw = Math.round(base.sw / st.zoom);
      base.sh = Math.round(base.sh / st.zoom);
      base.sx = Math.round(clampWindow(cx - base.sw / 2, base.sw, image.naturalWidth));
      base.sy = Math.round(clampWindow(cy - base.sh / 2, base.sh, image.naturalHeight));
    }
    return base;
  }
  return coverSourceRect(image, aspect, st.zoom || 1, st.ox || 0, st.oy || 0);
}
