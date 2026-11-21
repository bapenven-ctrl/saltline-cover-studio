// main.js — Entry point for Saltline Cover Studio.
//
// With no query string this boots the editor: the eight bundled sample
// photos are already composed into the Key Art cover, ready to rearrange.
// With ?shot= it paints one deterministic screenshot scene instead.
// Everything runs locally from the files under app/ — no network calls.

import { createState, ensurePanels, initEditor, loadSamplePhotos, applyAssignment } from './editor.js';
import { renderCover, sizeById } from './render.js';
import { runShotScene } from './shots.js';

const els = {
  canvas: document.getElementById('cover'),
  canvasWrap: document.getElementById('canvas-wrap'),
  layout: document.getElementById('layout'),
  grade: document.getElementById('grade'),
  caption: document.getElementById('caption'),
  subtitle: document.getElementById('subtitle'),
  furniture: document.getElementById('furniture'),
  callouts: document.getElementById('callouts'),
  zoom: document.getElementById('zoom'),
  smartCrop: document.getElementById('smart-crop'),
  panelLabel: document.getElementById('panel-label'),
  calloutLabel: document.getElementById('callout-label'),
  photoStrip: document.getElementById('photo-strip'),
  fileInput: document.getElementById('photo-file'),
  undoBtn: document.getElementById('undo'),
  redoBtn: document.getElementById('redo'),
  autoBtn: document.getElementById('auto-cover'),
  exportBtns: [...document.querySelectorAll('.export-btn')],
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
  applyAssignment(state);
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch { /* system fonts still render */ }
  }
  initEditor(state, els);
  renderCover(els.canvas, state);
}

boot();
