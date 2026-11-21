// smartcrop.js — Saliency smart crop plus manual cover-crop math.
// The saliency pass downscales the photo to a small grid and scores each
// cell by saturation, local contrast and edge strength, with a skin-tone
// bonus and a mild centre bias — faces and neon signs win over empty sky.
// It then slides a window of the target aspect over an integral image of
// the scores and returns the highest-scoring crop. Manual mode uses plain
// cover-crop math driven by the editor's drag offset and zoom slider.

// computeSaliencyMap(image) -> { cols, rows, scores: Float32Array }
export function computeSaliencyMap(image) {
  const cols = 28, rows = 28;
  const c = document.createElement('canvas');
  c.width = cols; c.height = rows;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, cols, rows);
  const d = ctx.getImageData(0, 0, cols, rows).data;
  const grey = new Float32Array(cols * rows);
  const scores = new Float32Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) {
    grey[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const saturation = mx === 0 ? 0 : (mx - mn) / mx;
      const gx = Math.abs(grey[i] - grey[y * cols + Math.min(cols - 1, x + 1)]);
      const gy = Math.abs(grey[i] - grey[Math.min(rows - 1, y + 1) * cols + x]);
      const contrast = Math.abs(grey[i] - 128) / 128;
      const skinTone = (r > 90 && r > g && g > b && r - b > 18) ? 0.8 : 0;
      const cx = 1 - Math.abs(x - cols / 2) / cols;
      const cy = 1 - Math.abs(y - rows / 2) / rows;
      scores[i] = saturation * 42 + (gx + gy) * 0.33 + contrast * 9 + skinTone * 26 + (cx + cy) * 2.2;
    }
  }
  return { cols, rows, scores };
}

// findSmartCrop(image, targetAspect) -> { sx, sy, sw, sh } in source pixels.
export function findSmartCrop(image, targetAspect) {
  const iw = image.naturalWidth, ih = image.naturalHeight;
  let sw, sh;
  if (iw / ih > targetAspect) { sh = ih; sw = Math.round(ih * targetAspect); }
  else { sw = iw; sh = Math.round(iw / targetAspect); }
  try {
    const { cols, rows, scores } = computeSaliencyMap(image);
    // Integral image so each candidate window sums in O(1).
    const integral = new Float64Array((cols + 1) * (rows + 1));
    for (let y = 0; y < rows; y++) {
      let rowSum = 0;
      for (let x = 0; x < cols; x++) {
        rowSum += scores[y * cols + x];
        integral[(y + 1) * (cols + 1) + x + 1] = integral[y * (cols + 1) + x + 1] + rowSum;
      }
    }
    const winW = Math.max(2, Math.round(cols * (sw / iw)));
    const winH = Math.max(2, Math.round(rows * (sh / ih)));
    const windowSum = (x, y) =>
      integral[(y + winH) * (cols + 1) + x + winW] - integral[y * (cols + 1) + x + winW]
      - integral[(y + winH) * (cols + 1) + x] + integral[y * (cols + 1) + x];
    // Anchor bonus: windows whose centre sits near the saliency centroid
    // keep the subject framed instead of hugging a bright corner.
    let total = 0, cxSum = 0, cySum = 0;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const s = scores[y * cols + x];
      total += s; cxSum += s * (x + 0.5) / cols; cySum += s * (y + 0.5) / rows;
    }
    const cenX = total > 0 ? cxSum / total : 0.5;
    const cenY = total > 0 ? cySum / total : 0.5;
    let best = -Infinity, bx = 0, by = 0;
    for (let y = 0; y + winH <= rows; y++) {
      for (let x = 0; x + winW <= cols; x++) {
        const wx = (x + winW / 2) / cols, wy = (y + winH / 2) / rows;
        const dist2 = (wx - cenX) * (wx - cenX) + (wy - cenY) * (wy - cenY);
        const score = (windowSum(x, y) / (winW * winH)) * Math.exp(-dist2 / 0.09);
        if (score > best) { best = score; bx = x; by = y; }
      }
    }
    return { sx: Math.round((bx / cols) * iw), sy: Math.round((by / rows) * ih), sw, sh };
  } catch {
    return { sx: Math.round((iw - sw) / 2), sy: Math.round((ih - sh) / 2), sw, sh };
  }
}

// coverSourceRect(image, targetAspect, zoom, offsetX, offsetY)
// Manual cover-crop: the largest window of targetAspect that fits the photo,
// scaled by zoom (1 = full cover, >1 = tighter), then shifted by offsets in
// the range -1..1 and clamped so the window never leaves the photo.
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
    sx: Math.round(Math.min(iw - sw, Math.max(0, cx - sw / 2))),
    sy: Math.round(Math.min(ih - sh, Math.max(0, cy - sh / 2))),
    sw: Math.round(sw), sh: Math.round(sh),
  };
}

// sourceRectForPanel(image, panelRect, panelState)
// Chooses the smart or manual source rectangle for one panel.
export function sourceRectForPanel(image, panelRect, panelState) {
  const aspect = panelRect.w / panelRect.h;
  if (panelState && panelState.smart) {
    const base = findSmartCrop(image, aspect);
    if (panelState.zoom && panelState.zoom > 1) {
      const cx = base.sx + base.sw / 2, cy = base.sy + base.sh / 2;
      base.sw = Math.round(base.sw / panelState.zoom);
      base.sh = Math.round(base.sh / panelState.zoom);
      base.sx = Math.round(Math.min(image.naturalWidth - base.sw, Math.max(0, cx - base.sw / 2)));
      base.sy = Math.round(Math.min(image.naturalHeight - base.sh, Math.max(0, cy - base.sh / 2)));
    }
    return base;
  }
  const s = panelState || {};
  return coverSourceRect(image, aspect, s.zoom || 1, s.ox || 0, s.oy || 0);
}
