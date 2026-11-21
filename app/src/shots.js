// shots.js — Deterministic scenes for screenshots, driven by the URL.
//
// ?shot=cover paints one finished cover full-frame at the requested size;
// ?shot=editor shows the real editor with the Key Art composition loaded.
// Either way the scene waits for the sample photos and both display fonts
// before painting, and window.__shotReady is raised only after the painted
// frame, so a capture never catches a half-loaded page.

import { createState, ensurePanels, applyAssignment, loadSamplePhotos } from './editor.js';
import { renderCover, sizeById } from './render.js';
import { LAYOUTS } from './panels.js';
import { GRADES } from './grades.js';

function fillSelect(select, items, value) {
  if (!select) return;
  select.innerHTML = '';
  for (const item of items) {
    const opt = document.createElement('option');
    opt.value = item.id; opt.textContent = item.label;
    select.appendChild(opt);
  }
  select.value = value;
}

async function fontsReady() {
  if (!document.fonts || !document.fonts.ready) return;
  try {
    await Promise.all([
      document.fonts.load('400 40px Anton'),
      document.fonts.load('400 40px Pacifico'),
      document.fonts.ready,
    ]);
  } catch { /* painted fallback fonts still produce a stable frame */ }
}

export async function runShotScene(params, els) {
  const state = createState();
  await loadSamplePhotos(state);
  if (params.get('layout')) state.layout = params.get('layout');
  if (params.get('grade')) state.grade = params.get('grade');
  if (params.get('caption')) state.caption = params.get('caption');
  if (params.get('subtitle')) state.subtitle = params.get('subtitle');
  ensurePanels(state);
  applyAssignment(state);
  // Poster scene direction: in the top-left panel the Fixer's face sits
  // low in her photo, so her crop window is nudged down the photo until
  // the whole face, chin included, rests inside the panel with margin.
  if (state.layout === 'poster' && state.panels[0]) state.panels[0].dy = 0.37;
  await fontsReady();

  if (params.get('shot') === 'cover') {
    document.body.classList.add('shot-cover');
    const size = sizeById(params.get('size') || '1920x1080');
    els.canvas.width = size.w;
    els.canvas.height = size.h;
    state.size = size.id;
    renderCover(els.canvas, state);
  } else {
    // Editor scene: the live editor chrome around the Key Art cover.
    const size = sizeById('1920x1080');
    els.canvas.width = size.w;
    els.canvas.height = size.h;
    renderCover(els.canvas, state);
    fillSelect(els.layout, LAYOUTS, state.layout);
    fillSelect(els.grade, [{ id: 'auto', label: 'Auto (fits photo)' }, ...GRADES], state.grade);
    if (els.caption) els.caption.value = state.caption;
    if (els.subtitle) els.subtitle.value = state.subtitle;
    if (els.furniture) els.furniture.checked = state.furniture;
    if (els.callouts) els.callouts.checked = state.callouts;
    if (els.panelLabel) els.panelLabel.textContent = `Panel 1 of ${state.panels.length}`;
    const first = state.panels[0];
    const firstPhoto = first ? state.photos[first.photoIndex] : null;
    if (els.calloutLabel) els.calloutLabel.value = (first && first.label) || (firstPhoto && firstPhoto.callout) || '';
    if (els.photoStrip) {
      els.photoStrip.innerHTML = '';
      state.photos.forEach((photo, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'thumb' + (i === 0 ? ' active' : '');
        btn.textContent = photo.name;
        els.photoStrip.appendChild(btn);
      });
    }
  }
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
  return state;
}
