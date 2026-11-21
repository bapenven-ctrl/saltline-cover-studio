// main.js — Entry point for Saltline Cover Studio.
// Boots the editor with the eight bundled sample photos already composed
// into a Key Art cover, or, when the URL carries ?shot=, paints one
// deterministic scene for screenshots instead. Everything runs locally
// from files under app/.

import { createState, ensurePanels, initEditor, loadSamplePhotos } from './editor.js';
import { renderCover, sizeById } from './render.js';
import { getPanelRects } from './panels.js';
import { runShotScene } from './shots.js';

const els = {
  canvas: document.getElementById('cover'),
  canvasWrap: document.getElementById('canvas-wrap'),
  layout: document.getElementById('layout'),
  grade: document.getElementById('grade'),
  size: document.getElementById('size'),
  caption: document.getElementById('caption'),
  subtitle: document.getElementById('subtitle'),
  tagline: document.getElementById('tagline'),
  posterInk: document.getElementById('poster-ink'),
  halftone: document.getElementById('halftone'),
  furniture: document.getElementById('furniture'),
  callouts: document.getElementById('callouts'),
  zoom: document.getElementById('zoom'),
  smartCrop: document.getElementById('smart-crop'),
  panelLabel: document.getElementById('panel-label'),
  panelText: document.getElementById('panel-text'),
  photoStrip: document.getElementById('photo-strip'),
  fileInput: document.getElementById('photo-file'),
  exportBtn: document.getElementById('export'),
  undoBtn: document.getElementById('undo'),
  redoBtn: document.getElementById('redo'),
  autoBtn: document.getElementById('auto-cover'),
  status: document.getElementById('status'),
};

const params = new URLSearchParams(location.search);

async function boot() {
  if (params.get('shot')) {
    await runShotScene(params, els);
    return;
  }
  const state = createState();
  const size = sizeById(state.size);
  els.canvas.width = size.w;
  els.canvas.height = size.h;
  await loadSamplePhotos(state);
  ensurePanels(state);
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch { /* system fonts still render */ }
  }
  const editor = initEditor(state, els, (s) => {
    els.canvas._panelRects = getPanelRects(s.layout, els.canvas.width, els.canvas.height);
  });
  renderCover(els.canvas, state);
  els.canvas._panelRects = getPanelRects(state.layout, els.canvas.width, els.canvas.height);
  editor.refreshPhotoStrip();
}

boot();
