// shots.js — fixed scenes for the entry's screenshots.
//
// The screenshots are the app's own drawings, produced by the app itself:
//   ?shot=cover   renders one exported cover full-window (the cover PNG's own
//                 drawing at screenshot size), e.g.
//                 ?shot=cover&layout=mosaic&grade=sunset&title=MARINA%20HEAT
//   ?shot=editor  opens the editor with the samples loaded, panels filled and
//                 one panel selected, e.g.
//                 ?shot=editor&layout=tilt&grade=neon&size=portrait&select=0
// Every scene sets window.__shotReady once the cover is painted, after the
// fonts and photos have loaded, so the screenshot waits for the real render.

import { Editor, SAMPLES, defaultState } from './editor.js';
import { renderCover, sizeById } from './render.js';
import { aspectClass, panelCount } from './panels.js';

function loadSampleImages() {
  return Promise.all(
    SAMPLES.map(
      (sample) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ id: `sample-${sample.name}`, img, label: sample.label, saliency: null, auto: null });
          img.src = sample.src;
        }),
    ),
  );
}

function applyParams(state, query) {
  if (query.get('layout')) state.layout = query.get('layout');
  if (query.get('grade')) state.gradeId = query.get('grade');
  if (query.get('size')) state.sizeId = query.get('size');
  if (query.get('title')) state.title = query.get('title');
  if (query.get('sub')) state.subtitle = query.get('sub');
  if (query.get('tag')) state.tagline = query.get('tag');
  if (query.get('ink')) state.ink = Number(query.get('ink')) / 100;
  if (query.get('halftone')) state.halftone = Number(query.get('halftone')) / 100;
  if (query.get('heat')) state.heat = Number(query.get('heat'));
  if (query.get('badge')) state.badge = query.get('badge') !== '0';
  return state;
}

function fillAssignments(state, photoCount) {
  const size = sizeById(state.sizeId);
  const count = panelCount(state.layout, aspectClass(size.w, size.h));
  state.assignments = {};
  for (let i = 0; i < count; i++) state.assignments[i] = i % photoCount;
  state.crops = {};
  return state;
}

async function runCoverShot(query) {
  document.body.classList.add('shot-cover');
  const state = fillAssignments(applyParams(defaultState(), query), SAMPLES.length);
  const photos = await loadSampleImages();
  await document.fonts.ready;
  const canvas = document.querySelector('#shotCanvas');
  canvas.hidden = false;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  renderCover(canvas.getContext('2d'), canvas.width, canvas.height, state, photos);
  markReady();
}

async function runEditorShot(query) {
  const editor = new Editor(document);
  editor.loadSamples();
  const deadline = Date.now() + 20000;
  while (editor.photos.length < SAMPLES.length && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 90));
  }
  applyParams(editor.state, query);
  fillAssignments(editor.state, editor.photos.length);
  editor.selectedPanel = Number(query.get('select') ?? 1);
  editor.syncControls();
  await document.fonts.ready;
  editor.requestRender();
  // Keep the framing hint visible for the shot: it is part of the editor.
  const hint = document.querySelector('#dragHint');
  const keepHint = setInterval(() => hint.classList.add('show'), 120);
  setTimeout(() => {
    clearInterval(keepHint);
    hint.classList.add('show');
    markReady();
  }, 450);
}

function markReady() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__shotReady = true;
  }));
}

export function runShot(query) {
  const shot = query.get('shot');
  if (shot === 'cover') return runCoverShot(query);
  if (shot === 'editor') return runEditorShot(query);
  return Promise.resolve();
}
