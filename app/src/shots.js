// shots.js — Deterministic scenes for the entry's screenshots.
//
// ?shot=cover paints one finished cover full-frame at an export size;
// ?shot=editor opens the real editor with the default composition.
// Either way the scene waits for the sample photos and both display
// fonts before painting, and raises window.__shotReady only after the
// painted frame, so a headless capture is stable. URL parameters:
// size, layout, grade, caption, subtitle.

import { createState, ensurePanels, initEditor, loadSamplePhotos } from './editor.js';
import { renderCover, sizeById } from './render.js';

async function fontsReady() {
  if (!document.fonts || !document.fonts.ready) return;
  try {
    await Promise.all([
      document.fonts.load('400 40px Anton'),
      document.fonts.load('400 40px Pacifico'),
      document.fonts.ready,
    ]);
  } catch { /* system fonts still paint a cover */ }
}

function applyParams(state, params) {
  if (params.get('layout')) state.layout = params.get('layout');
  if (params.get('grade')) state.grade = params.get('grade');
  if (params.get('caption')) state.caption = params.get('caption');
  if (params.get('subtitle')) state.subtitle = params.get('subtitle');
  ensurePanels(state);
  // Poster framing fix: in the portrait poster the smart crop seats
  // the Fixer's chin right on her panel's bottom edge. Slide that one
  // panel's crop window a little further down the photo so her whole
  // face, chin included, sits inside the frame with a margin. Scoped
  // to the poster scene; every other layout keeps the default crop.
  if (state.layout === 'poster') {
    const fixer = state.panels.find((p) => p.photoId === 'redhead');
    if (fixer) fixer.dy = 0.07;
  }
}

function signalReady() {
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
}

export async function runShotScene(params, els) {
  const state = createState();
  await loadSamplePhotos(state);
  applyParams(state, params);
  await fontsReady();

  if (params.get('shot') === 'cover') {
    document.body.classList.add('shot-cover');
    const size = sizeById(params.get('size') || '1920x1080');
    els.canvas.width = size.w;
    els.canvas.height = size.h;
    renderCover(els.canvas, state);
  } else {
    // The editor, exactly as a visitor gets it: wide Key Art sheet on
    // the stage, first panel selected, controls at their defaults.
    els.canvas.width = 1920;
    els.canvas.height = 1080;
    initEditor(state, els, { shot: true });
  }
  signalReady();
  return state;
}
