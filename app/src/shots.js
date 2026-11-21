// shots.js — Deterministic screenshot scenes driven by URL parameters.
// ?shot=cover paints only the cover, full-frame, at the &size= export size.
// ?shot=editor shows the editor with the wide Key Art cover loaded.
// Sample photos are fully awaited and fonts are ready before painting, and
// window.__shotReady is set only after the painted frame, so captures are
// stable. Supported params: size, layout, grade, caption, subtitle, tagline.

import { createState, ensurePanels, assignCast, loadSamplePhotos } from './editor.js';
import { renderCover, sizeById, EXPORT_SIZES, defaultLabelFor } from './render.js';
import { getPanelRects, LAYOUTS } from './panels.js';
import { GRADES } from './grades.js';

function applyParams(state, params) {
  if (params.get('layout')) state.layout = params.get('layout');
  if (params.get('grade')) state.grade = params.get('grade');
  if (params.get('caption')) state.caption = params.get('caption');
  if (params.get('subtitle')) state.subtitle = params.get('subtitle');
  if (params.get('tagline')) state.tagline = params.get('tagline');
  // Sample loading assigned the default layout's cast; re-cast for the
  // layout this scene actually uses.
  assignCast(state);
  ensurePanels(state);
  // Screenshot framing uses the saliency smart crop, which is deterministic:
  // the same photo and panel aspect always produce the same crop.
  state.panels.forEach((panel) => { panel.smart = true; });
}

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

export async function runShotScene(params, els) {
  const shot = params.get('shot');
  const state = createState();
  await loadSamplePhotos(state);
  applyParams(state, params);
  if (document.fonts && document.fonts.ready) {
    try {
      await Promise.all([
        document.fonts.load('400 32px Anton'),
        document.fonts.load('400 32px Pacifico'),
        document.fonts.ready,
      ]);
    } catch { /* fall back to painted fonts */ }
  }
  if (shot === 'cover') {
    document.body.classList.add('shot-cover');
    const size = sizeById(params.get('size') || '1920x1080');
    els.canvas.width = size.w;
    els.canvas.height = size.h;
    state.size = size.id;
    renderCover(els.canvas, state);
    els.canvas._panelRects = getPanelRects(state.layout, size.w, size.h);
  } else {
    // Editor scene: the wide Key Art cover in the live editor.
    const size = sizeById('1920x1080');
    els.canvas.width = size.w;
    els.canvas.height = size.h;
    state.size = size.id;
    renderCover(els.canvas, state);
    els.canvas._panelRects = getPanelRects(state.layout, size.w, size.h);
    fillSelect(els.layout, LAYOUTS, state.layout);
    fillSelect(els.grade, [{ id: 'auto', label: 'Auto (fits photo)' }, ...GRADES], state.grade);
    fillSelect(els.size, EXPORT_SIZES, state.size);
    if (els.caption) els.caption.value = state.caption;
    if (els.subtitle) els.subtitle.value = state.subtitle;
    if (els.tagline) els.tagline.value = state.tagline;
    if (els.posterInk) els.posterInk.checked = state.posterInk;
    if (els.halftone) els.halftone.checked = state.halftone;
    if (els.furniture) els.furniture.checked = state.furniture;
    if (els.callouts) els.callouts.checked = state.callouts;
    if (els.smartCrop) els.smartCrop.checked = true;
    if (els.panelLabel) els.panelLabel.textContent = `Panel 1 of ${state.panels.length}`;
    if (els.panelText) {
      els.panelText.value = '';
      els.panelText.placeholder = defaultLabelFor(state.photos[state.panels[0]?.photoIndex || 0]) || 'Callout label';
    }
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
