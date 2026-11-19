// editor.js — Wiring for the Saltline editor UI.
// Owns the cover state, loads the bundled sample photos, handles photo intake
// (file picker and drag & drop), panel selection and dragging, and every
// control in the toolbar. Any change re-renders the live preview.

import { LAYOUTS } from './panels.js';
import { GRADES } from './grades.js';
import { EXPORT_SIZES, renderCover, sizeById } from './render.js';

export const SAMPLE_PHOTOS = [
  { name: 'Marina', src: 'samples/marina.jpg' },
  { name: 'Neon', src: 'samples/neon.jpg' },
  { name: 'Pier', src: 'samples/pier.jpg' },
  { name: 'Rooftop', src: 'samples/rooftop.jpg' },
];

export function createState() {
  return {
    layout: 'hero-left',
    grade: 'auto',
    caption: 'NEON SHORES',
    subtitle: 'Saltline City',
    posterInk: true,
    halftone: false,
    size: '1080x1350',
    photos: [],
    panels: [],
    selectedPanel: 0,
    selectedPhoto: 0,
  };
}

export function ensurePanels(state) {
  const counts = { 'hero-left': 3, 'hero-right': 3, triptych: 3, quad: 4, 'cover-grid': 6, duet: 3, 'full-bleed': 4 };
  const n = counts[state.layout] || 3;
  while (state.panels.length < n) {
    const i = state.panels.length;
    state.panels.push({ photoIndex: state.photos.length ? i % state.photos.length : 0, zoom: 1, ox: 0, oy: 0, smart: true });
  }
  state.panels.length = n;
  if (state.selectedPanel >= n) state.selectedPanel = 0;
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
      state.photos.push({ img, name: sample.name });
    } catch { /* a missing sample simply never becomes assignable */ }
  }
  ensurePanels(state);
}

function fillSelect(select, items, value) {
  select.innerHTML = '';
  for (const item of items) {
    const opt = document.createElement('option');
    opt.value = item.id; opt.textContent = item.label;
    select.appendChild(opt);
  }
  select.value = value;
}

export function initEditor(state, els, onChange) {
  const render = () => { ensurePanels(state); renderCover(els.canvas, state); if (onChange) onChange(state); };
  fillSelect(els.layout, LAYOUTS, state.layout);
  fillSelect(els.grade, [{ id: 'auto', label: 'Auto (fits photo)' }, ...GRADES], state.grade);
  fillSelect(els.size, EXPORT_SIZES, state.size);
  els.caption.value = state.caption;
  els.subtitle.value = state.subtitle;
  els.posterInk.checked = state.posterInk;
  els.halftone.checked = state.halftone;

  const refreshPhotoStrip = () => {
    els.photoStrip.innerHTML = '';
    state.photos.forEach((photo, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'thumb' + (i === state.selectedPhoto ? ' active' : '');
      btn.textContent = photo.name;
      btn.addEventListener('click', () => {
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
    }
  };

  els.layout.addEventListener('change', () => { state.layout = els.layout.value; state.selectedPanel = 0; ensurePanels(state); refreshPhotoStrip(); render(); });
  els.grade.addEventListener('change', () => { state.grade = els.grade.value; render(); });
  els.size.addEventListener('change', () => {
    state.size = els.size.value;
    const s = sizeById(state.size);
    els.canvas.width = s.w; els.canvas.height = s.h;
    render();
  });
  els.caption.addEventListener('input', () => { state.caption = els.caption.value; render(); });
  els.subtitle.addEventListener('input', () => { state.subtitle = els.subtitle.value; render(); });
  els.posterInk.addEventListener('change', () => { state.posterInk = els.posterInk.checked; render(); });
  els.halftone.addEventListener('change', () => { state.halftone = els.halftone.checked; render(); });
  els.zoom.addEventListener('input', () => {
    const panel = state.panels[state.selectedPanel];
    if (panel) { panel.zoom = Number(els.zoom.value); render(); }
  });
  els.smartCrop.addEventListener('change', () => {
    const panel = state.panels[state.selectedPanel];
    if (panel) { panel.smart = els.smartCrop.checked; render(); }
  });

  const addFiles = async (files) => {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const url = URL.createObjectURL(file);
      try {
        const img = await loadImageFromUrl(url);
        state.photos.push({ img, name: file.name.replace(/\.[^.]+$/, '').slice(0, 18) || 'Photo' });
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
    // Import lazily through a global rect cache set by the last render.
    const rects = els.canvas._panelRects || [];
    let hit = -1;
    rects.forEach((rc, i) => {
      const W = els.canvas.width, H = els.canvas.height;
      if (p.x * W >= rc.x && p.x * W <= rc.x + rc.w && p.y * H >= rc.y && p.y * H <= rc.y + rc.h) hit = i;
    });
    if (hit >= 0) {
      state.selectedPanel = hit;
      state.selectedPhoto = state.panels[hit].photoIndex;
      refreshPhotoStrip();
    }
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

  els.exportBtn.addEventListener('click', () => {
    const s = sizeById(state.size);
    const off = document.createElement('canvas');
    off.width = s.w; off.height = s.h;
    // Render at full export resolution on a scratch canvas.
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
    void off;
  });

  refreshPhotoStrip();
  return { render, refreshPhotoStrip };
}
