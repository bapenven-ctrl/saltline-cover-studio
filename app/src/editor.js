// editor.js — Wiring for the Saltline editor UI.
// Owns the cover state, loads the bundled sample photos, handles photo
// intake (file picker and drag & drop), panel selection and dragging,
// per-panel character labels, undo/redo, the one-click Auto Cover, and
// every control in the toolbar. Any change re-renders the live preview.

import { LAYOUTS, LAYOUT_CAST, panelCount } from './panels.js';
import { GRADES } from './grades.js';
import { EXPORT_SIZES, renderCover, sizeById, defaultLabelFor } from './render.js';

export const SAMPLE_PHOTOS = [
  { key: 'driver', name: 'Driver', src: 'samples/driver.jpg' },
  { key: 'redhead', name: 'Redhead', src: 'samples/redhead.jpg' },
  { key: 'rider', name: 'Rider', src: 'samples/rider.jpg' },
  { key: 'marina', name: 'Marina', src: 'samples/marina.jpg' },
  { key: 'pier', name: 'Pier', src: 'samples/pier.jpg' },
  { key: 'rooftop', name: 'Rooftop', src: 'samples/rooftop.jpg' },
  { key: 'neon', name: 'Neon', src: 'samples/neon.jpg' },
  { key: 'motel', name: 'Motel', src: 'samples/motel.jpg' },
];

export function createState() {
  return {
    layout: 'keyart',
    grade: 'key-art',
    caption: 'NEON SHORES',
    subtitle: 'Saltline City',
    tagline: 'THE CITY PAYS IN SUNSETS',
    posterInk: true,
    halftone: false,
    furniture: true,
    callouts: true,
    size: '1920x1080',
    photos: [],
    panels: [],
    selectedPanel: 0,
    selectedPhoto: 0,
  };
}

function photoIndexByKey(state, key) {
  const i = state.photos.findIndex((p) => p.key === key);
  return i >= 0 ? i : 0;
}

// assignCast(state) — reset every panel to the layout's default cast,
// smart crop on, framing centred, labels back to the cast defaults.
export function assignCast(state) {
  const cast = LAYOUT_CAST[state.layout] || [];
  state.panels = cast.map((key) => ({
    photoIndex: state.photos.length ? photoIndexByKey(state, key) : 0,
    zoom: 1, ox: 0, oy: 0, smart: true, label: '',
  }));
  if (!state.panels.length) {
    state.panels = [{ photoIndex: 0, zoom: 1, ox: 0, oy: 0, smart: true, label: '' }];
  }
  if (state.selectedPanel >= state.panels.length) state.selectedPanel = 0;
}

export function ensurePanels(state) {
  const n = panelCount(state.layout);
  if (state.panels.length !== n) assignCast(state);
  if (state.selectedPanel >= state.panels.length) state.selectedPanel = 0;
}

export function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export async function loadSamplePhotos(state) {
  for (const sample of SAMPLE_PHOTOS) {
    try {
      const img = await loadImageFromUrl(sample.src);
      state.photos.push({ img, name: sample.name, key: sample.key });
    } catch { /* a missing sample simply never becomes assignable */ }
  }
  assignCast(state);
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

export function initEditor(state, els, onChange) {
  // --- Undo / redo -------------------------------------------------------
  const undoStack = [];
  const redoStack = [];
  const snapshot = () => JSON.stringify({
    layout: state.layout, grade: state.grade, caption: state.caption,
    subtitle: state.subtitle, tagline: state.tagline, posterInk: state.posterInk,
    halftone: state.halftone, furniture: state.furniture, callouts: state.callouts,
    size: state.size, panels: state.panels, selectedPanel: state.selectedPanel,
    selectedPhoto: state.selectedPhoto,
  });
  const restore = (snap) => {
    const s = JSON.parse(snap);
    Object.assign(state, s);
    syncControls();
    render();
  };
  const beginChange = () => {
    undoStack.push(snapshot());
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
  };
  if (els.undoBtn) els.undoBtn.addEventListener('click', () => {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    restore(undoStack.pop());
  });
  if (els.redoBtn) els.redoBtn.addEventListener('click', () => {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    restore(redoStack.pop());
  });

  const render = () => { ensurePanels(state); renderCover(els.canvas, state); if (onChange) onChange(state); };

  const refreshPhotoStrip = () => {
    els.photoStrip.innerHTML = '';
    state.photos.forEach((photo, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'thumb' + (i === state.selectedPhoto ? ' active' : '');
      btn.textContent = photo.name;
      btn.addEventListener('click', () => {
        beginChange();
        state.selectedPhoto = i;
        const panel = state.panels[state.selectedPanel];
        if (panel) panel.photoIndex = i;
        refreshPhotoStrip(); render();
      });
      els.photoStrip.appendChild(btn);
    });
    const panel = state.panels[state.selectedPanel];
    if (panel) {
      els.zoom.value = String(panel.zoom);
      els.smartCrop.checked = !!panel.smart;
      els.panelLabel.textContent = `Panel ${state.selectedPanel + 1} of ${state.panels.length}`;
      if (els.panelText) {
        const photo = state.photos[panel.photoIndex];
        els.panelText.value = panel.label || '';
        els.panelText.placeholder = defaultLabelFor(photo) || 'Callout label';
      }
    }
  };

  const syncControls = () => {
    fillSelect(els.layout, LAYOUTS, state.layout);
    fillSelect(els.grade, [{ id: 'auto', label: 'Auto (fits photo)' }, ...GRADES], state.grade);
    fillSelect(els.size, EXPORT_SIZES, state.size);
    els.caption.value = state.caption;
    els.subtitle.value = state.subtitle;
    if (els.tagline) els.tagline.value = state.tagline;
    els.posterInk.checked = state.posterInk;
    els.halftone.checked = state.halftone;
    if (els.furniture) els.furniture.checked = state.furniture;
    if (els.callouts) els.callouts.checked = state.callouts;
    const s = sizeById(state.size);
    if (els.canvas.width !== s.w || els.canvas.height !== s.h) { els.canvas.width = s.w; els.canvas.height = s.h; }
    refreshPhotoStrip();
  };

  syncControls();

  els.layout.addEventListener('change', () => {
    beginChange();
    state.layout = els.layout.value;
    state.selectedPanel = 0;
    assignCast(state);
    refreshPhotoStrip(); render();
  });
  els.grade.addEventListener('change', () => { beginChange(); state.grade = els.grade.value; render(); });
  els.size.addEventListener('change', () => {
    beginChange();
    state.size = els.size.value;
    const s = sizeById(state.size);
    els.canvas.width = s.w; els.canvas.height = s.h;
    render();
  });
  els.caption.addEventListener('input', () => { state.caption = els.caption.value; render(); });
  els.subtitle.addEventListener('input', () => { state.subtitle = els.subtitle.value; render(); });
  if (els.tagline) els.tagline.addEventListener('input', () => { state.tagline = els.tagline.value; render(); });
  els.posterInk.addEventListener('change', () => { beginChange(); state.posterInk = els.posterInk.checked; render(); });
  els.halftone.addEventListener('change', () => { beginChange(); state.halftone = els.halftone.checked; render(); });
  if (els.furniture) els.furniture.addEventListener('change', () => { beginChange(); state.furniture = els.furniture.checked; render(); });
  if (els.callouts) els.callouts.addEventListener('change', () => { beginChange(); state.callouts = els.callouts.checked; render(); });
  if (els.panelText) els.panelText.addEventListener('input', () => {
    const panel = state.panels[state.selectedPanel];
    if (panel) { panel.label = els.panelText.value; render(); }
  });
  els.zoom.addEventListener('input', () => {
    const panel = state.panels[state.selectedPanel];
    if (panel) { panel.zoom = Number(els.zoom.value); render(); }
  });
  els.smartCrop.addEventListener('change', () => {
    beginChange();
    const panel = state.panels[state.selectedPanel];
    if (panel) { panel.smart = els.smartCrop.checked; render(); }
  });
  if (els.autoBtn) els.autoBtn.addEventListener('click', () => {
    beginChange();
    assignCast(state);
    state.grade = 'auto';
    fillSelect(els.grade, [{ id: 'auto', label: 'Auto (fits photo)' }, ...GRADES], state.grade);
    state.furniture = true;
    state.callouts = true;
    if (els.furniture) els.furniture.checked = true;
    if (els.callouts) els.callouts.checked = true;
    refreshPhotoStrip(); render();
    els.status.textContent = 'Auto Cover: cast assigned, smart crop on, grade fitted to the hero photo.';
  });

  const addFiles = async (files) => {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const url = URL.createObjectURL(file);
      try {
        const img = await loadImageFromUrl(url);
        const base = file.name.replace(/\.[^.]+$/, '').slice(0, 18) || 'Photo';
        state.photos.push({ img, name: base, key: base.toLowerCase().replace(/[^a-z0-9]+/g, '-') });
      } catch { /* unreadable files are skipped */ }
    }
    refreshPhotoStrip(); render();
  };
  els.fileInput.addEventListener('change', () => { addFiles([...els.fileInput.files]); els.fileInput.value = ''; });
  els.canvasWrap.addEventListener('dragover', (e) => { e.preventDefault(); els.canvasWrap.classList.add('dragging'); });
  els.canvasWrap.addEventListener('dragleave', () => els.canvasWrap.classList.remove('dragging'));
  els.canvasWrap.addEventListener('drop', (e) => {
    e.preventDefault(); els.canvasWrap.classList.remove('dragging');
    if (e.dataTransfer) addFiles([...e.dataTransfer.files]);
  });

  // Panel picking + drag-to-reposition on the preview canvas.
  let drag = null;
  const canvasPoint = (e) => {
    const r = els.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  els.canvas.addEventListener('pointerdown', (e) => {
    const p = canvasPoint(e);
    const rects = els.canvas._panelRects || [];
    let hit = -1;
    rects.forEach((rc, i) => {
      const W = els.canvas.width, H = els.canvas.height;
      if (p.x * W >= rc.x && p.x * W <= rc.x + rc.w && p.y * H >= rc.y && p.y * H <= rc.y + rc.h) hit = i;
    });
    if (hit >= 0 && hit !== state.selectedPanel) {
      state.selectedPanel = hit;
      state.selectedPhoto = state.panels[hit].photoIndex;
      refreshPhotoStrip();
    }
    if (hit >= 0) beginChange();
    drag = { x: p.x, y: p.y };
    els.canvas.setPointerCapture(e.pointerId);
  });
  els.canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = canvasPoint(e);
    const panel = state.panels[state.selectedPanel];
    if (panel && !panel.smart) {
      panel.ox = Math.min(1, Math.max(-1, panel.ox - (p.x - drag.x) * 2));
      panel.oy = Math.min(1, Math.max(-1, panel.oy - (p.y - drag.y) * 2));
      render();
    }
    drag = p;
  });
  els.canvas.addEventListener('pointerup', () => { drag = null; });
  els.canvas.addEventListener('wheel', (e) => {
    const panel = state.panels[state.selectedPanel];
    if (!panel) return;
    e.preventDefault();
    panel.zoom = Math.min(3, Math.max(1, panel.zoom * (e.deltaY < 0 ? 1.06 : 0.94)));
    els.zoom.value = String(panel.zoom);
    render();
  }, { passive: false });

  els.exportBtn.addEventListener('click', () => {
    const s = sizeById(state.size);
    const savedW = els.canvas.width, savedH = els.canvas.height;
    els.canvas.width = s.w; els.canvas.height = s.h;
    renderCover(els.canvas, state);
    els.canvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `saltline-cover-${state.size}.png`;
      a.click();
      els.canvas.width = savedW; els.canvas.height = savedH;
      render();
      els.status.textContent = `Saved saltline-cover-${state.size}.png`;
    }, 'image/png');
  });

  refreshPhotoStrip();
  return { render, refreshPhotoStrip };
}
