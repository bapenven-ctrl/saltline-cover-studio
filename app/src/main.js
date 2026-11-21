// main.js — Entry point for Saltline Cover Studio.
//
// With no query string this boots the editor: the eight bundled sample
// photos composed into the default Key Art cover, every control live.
// With ?shot= it hands over to the deterministic screenshot scenes in
// shots.js instead. Everything runs locally from the files in app/ —
// no build step, no network, no libraries.

import { createState, ensurePanels, initEditor, loadSamplePhotos } from './editor.js';
import { runShotScene } from './shots.js';

const els = {
  canvas: document.getElementById('cover'),
  canvasWrap: document.getElementById('canvas-wrap'),
  photoStrip: document.getElementById('photo-strip'),
  fileInput: document.getElementById('photo-file'),
  layout: document.getElementById('layout'),
  grade: document.getElementById('grade'),
  caption: document.getElementById('caption'),
  subtitle: document.getElementById('subtitle'),
  calloutLabel: document.getElementById('callout-label'),
  panelLabel: document.getElementById('panel-label'),
  zoom: document.getElementById('zoom'),
  smartCrop: document.getElementById('smart-crop'),
  furniture: document.getElementById('furniture'),
  callouts: document.getElementById('callouts'),
  undoBtn: document.getElementById('undo'),
  redoBtn: document.getElementById('redo'),
  autoBtn: document.getElementById('auto-cover'),
  exportBtns: document.querySelectorAll('.export-size'),
  status: document.getElementById('status'),
};

async function boot() {
  const params = new URLSearchParams(location.search);
  if (params.get('shot')) {
    await runShotScene(params, els);
    return;
  }
  const state = createState();
  await loadSamplePhotos(state);
  ensurePanels(state);
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch { /* fall back to system fonts */ }
  }
  initEditor(state, els);
}

boot();
