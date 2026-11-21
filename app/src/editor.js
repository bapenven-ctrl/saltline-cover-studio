// editor.js — The Saltline editor: state, photo intake and every
// control in the sidebar.
//
// State is one plain object. Panels are rebuilt from the layout's
// defaults whenever the arrangement changes; each panel remembers its
// photo, its callout label, whether the smart crop drives it, and a
// manual zoom/offset on top of the crop. Undo/redo snapshot the whole
// state as JSON, which keeps the history logic boring and reliable.

import { LAYOUTS, layoutZones } from './panels.js';
import { GRADES, pickAutoGrade } from './grades.js';
import { renderCover, sizeById } from './render.js';

export const SAMPLES = [
  { id: 'driver', name: 'Driver', file: 'samples/driver.jpg' },
  { id: 'redhead', name: 'Redhead', file: 'samples/redhead.jpg' },
  { id: 'rider', name: 'Rider', file: 'samples/rider.jpg' },
  { id: 'marina', name: 'Marina', file: 'samples/marina.jpg' },
  { id: 'pier', name: 'Pier', file: 'samples/pier.jpg' },
  { id: 'rooftop', name: 'Rooftop', file: 'samples/rooftop.jpg' },
  { id: 'neon', name: 'Neon', file: 'samples/neon.jpg' },
  { id: 'motel', name: 'Motel', file: 'samples/motel.jpg' },
];

// The cast list: each bundled photo's callout label on the poster.
export const DEFAULT_LABELS = {
  driver: 'THE DRIVER',
  pier: 'THE CAPTAIN',
  redhead: 'THE FIXER',
  rider: 'THE RIDER',
  marina: 'THE INSIDER',
  rooftop: 'THE BOSS',
  neon: 'THE COURIERS',
  motel: 'THE HIDEOUT',
};

export function createState() {
  return {
    layout: 'keyart',
    grade: 'key-art',
    resolvedGrade: 'key-art',
    caption: 'NEON SHORES',
    subtitle: 'Saltline City',
    furniture: true,
    callouts: true,
    photos: [],
    panels: [],
    selected: 0,
    _builtFor: null,
  };
}

export function ensurePanels(state, force = false) {
  if (!force && state._builtFor === state.layout && state.panels.length) return;
  const zones = layoutZones(state.layout, 1000, 1000, true);
  state.panels = zones.panels.map((p) => ({
    photoId: p.photo,
    label: DEFAULT_LABELS[p.photo] || '',
    smart: true,
    zoom: 1,
    dx: 0,
    dy: 0,
  }));
  state._builtFor = state.layout;
  if (state.selected >= state.panels.length) state.selected = 0;
}

export async function loadSamplePhotos(state) {
  const loaded = await Promise.all(SAMPLES.map(async (s) => {
    const img = new Image();
    img.src = s.file;
    await img.decode();
    return { id: s.id, name: s.name, img };
  }));
  state.photos = loaded.concat(state.photos.filter((p) => p.custom));
  return state.photos;
}

function fillSelect(select, items, value) {
  if (!select) return;
  select.innerHTML = '';
  for (const item of items) {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.label;
    select.appendChild(opt);
  }
  select.value = value;
}

export function initEditor(state, els, opts = {}) {
  const canvas = els.canvas;
  let zones = null;
  const undoStack = [];
  const redoStack = [];
  let userCount = 0;

  const photoById = (id) => state.photos.find((p) => p.id === id);
  const heroPhoto = () => {
    const first = state.panels[0];
    return first ? photoById(first.photoId) : state.photos[0];
  };

  function resolveAuto() {
    if (state.grade !== 'auto') return;
    const hero = heroPhoto();
    if (hero) state.resolvedGrade = pickAutoGrade(hero);
  }

  function snapshot() {
    return JSON.stringify({
      layout: state.layout, grade: state.grade, resolvedGrade: state.resolvedGrade,
      caption: state.caption, subtitle: state.subtitle,
      furniture: state.furniture, callouts: state.callouts,
      panels: state.panels, selected: state.selected,
    });
  }

  function restore(json) {
    const s = JSON.parse(json);
    Object.assign(state, s);
    state._builtFor = state.layout;
    syncControls();
    update();
  }

  function pushHistory() {
    undoStack.push(snapshot());
    if (undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
  }

  function update() {
    resolveAuto();
    zones = renderCover(canvas, state, opts.shot ? {} : { selected: state.selected });
    syncSelectionControls();
    refreshStrip();
  }

  function syncSelectionControls() {
    const panel = state.panels[state.selected];
    if (!panel) return;
    if (els.panelLabel) els.panelLabel.textContent = `Panel ${state.selected + 1} of ${state.panels.length}`;
    if (els.calloutLabel && document.activeElement !== els.calloutLabel) els.calloutLabel.value = panel.label || '';
    if (els.zoom) els.zoom.value = panel.zoom;
    if (els.smartCrop) els.smartCrop.checked = panel.smart;
  }

  function syncControls() {
    if (els.layout) els.layout.value = state.layout;
    if (els.grade) els.grade.value = state.grade;
    if (els.caption) els.caption.value = state.caption;
    if (els.subtitle) els.subtitle.value = state.subtitle;
    if (els.furniture) els.furniture.checked = state.furniture;
    if (els.callouts) els.callouts.checked = state.callouts;
    syncSelectionControls();
  }

  function refreshStrip() {
    if (!els.photoStrip) return;
    const panel = state.panels[state.selected];
    els.photoStrip.innerHTML = '';
    for (const photo of state.photos) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip' + (panel && panel.photoId === photo.id ? ' active' : '');
      btn.textContent = photo.name;
      btn.addEventListener('click', () => assignPhoto(photo));
      els.photoStrip.appendChild(btn);
    }
  }

  function assignPhoto(photo) {
    const panel = state.panels[state.selected];
    if (!panel) return;
    panel.photoId = photo.id;
    panel.label = DEFAULT_LABELS[photo.id] || (photo.custom ? photo.name.toUpperCase() : panel.label);
    pushHistory();
    update();
  }

  function addPhotoFiles(files) {
    for (const file of files) {
      if (!file.type || !file.type.startsWith('image/')) continue;
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        userCount += 1;
        const photo = {
          id: `user-${userCount}`,
          name: file.name.replace(/\.[^.]+$/, '') || `Photo ${userCount}`,
          img,
          custom: true,
        };
        state.photos.push(photo);
        assignPhoto(photo);
      };
      img.src = url;
    }
  }

  // ---- Controls ------------------------------------------------------
  fillSelect(els.layout, LAYOUTS, state.layout);
  fillSelect(els.grade, [{ id: 'auto', label: 'Auto (fits photo)' }, ...GRADES], state.grade);

  els.layout?.addEventListener('change', () => {
    state.layout = els.layout.value;
    ensurePanels(state);
    state.selected = 0;
    pushHistory();
    update();
  });
  els.grade?.addEventListener('change', () => {
    state.grade = els.grade.value;
    resolveAuto();
    pushHistory();
    update();
  });
  els.caption?.addEventListener('input', () => { state.caption = els.caption.value; update(); });
  els.caption?.addEventListener('change', pushHistory);
  els.subtitle?.addEventListener('input', () => { state.subtitle = els.subtitle.value; update(); });
  els.subtitle?.addEventListener('change', pushHistory);
  els.calloutLabel?.addEventListener('input', () => {
    const panel = state.panels[state.selected];
    if (panel) { panel.label = els.calloutLabel.value; update(); }
  });
  els.calloutLabel?.addEventListener('change', pushHistory);
  els.furniture?.addEventListener('change', () => { state.furniture = els.furniture.checked; pushHistory(); update(); });
  els.callouts?.addEventListener('change', () => { state.callouts = els.callouts.checked; pushHistory(); update(); });
  els.smartCrop?.addEventListener('change', () => {
    const panel = state.panels[state.selected];
    if (panel) { panel.smart = els.smartCrop.checked; pushHistory(); update(); }
  });
  els.zoom?.addEventListener('input', () => {
    const panel = state.panels[state.selected];
    if (panel) { panel.zoom = Number(els.zoom.value); update(); }
  });
  els.zoom?.addEventListener('change', pushHistory);
  els.undoBtn?.addEventListener('click', () => {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    restore(undoStack.pop());
  });
  els.redoBtn?.addEventListener('click', () => {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    restore(redoStack.pop());
  });
  els.autoBtn?.addEventListener('click', () => {
    ensurePanels(state, true);
    state.selected = 0;
    const hero = heroPhoto();
    if (hero) state.grade = pickAutoGrade(hero);
    if (els.grade) els.grade.value = state.grade;
    pushHistory();
    update();
  });
  els.fileInput?.addEventListener('change', () => {
    addPhotoFiles([...els.fileInput.files]);
    els.fileInput.value = '';
  });
  if (els.exportBtns) {
    for (const btn of els.exportBtns) {
      btn.addEventListener('click', () => exportPng(btn.dataset.size));
    }
  }

  function exportPng(sizeId) {
    const size = sizeById(sizeId);
    const out = document.createElement('canvas');
    out.width = size.w;
    out.height = size.h;
    renderCover(out, state);
    out.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `saltline-cover-${size.id}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      if (els.status) els.status.textContent = `Saved PNG ${size.w} × ${size.h}`;
    }, 'image/png');
  }

  // ---- Canvas interaction ---------------------------------------------
  function canvasPoint(evt) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (evt.clientX - rect.left) * (canvas.width / rect.width),
      y: (evt.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  let drag = null;
  canvas.addEventListener('pointerdown', (evt) => {
    if (!zones) return;
    const pt = canvasPoint(evt);
    const idx = zones.panels.findIndex((r) => pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h);
    if (idx === -1) return;
    state.selected = idx;
    const panel = state.panels[idx];
    drag = {
      idx, startX: evt.clientX, startY: evt.clientY,
      dx: panel.dx, dy: panel.dy, rect: zones.panels[idx], moved: false,
    };
    canvas.setPointerCapture(evt.pointerId);
    update();
  });
  canvas.addEventListener('pointermove', (evt) => {
    if (!drag) return;
    const panel = state.panels[drag.idx];
    const zoom = Math.max(1, panel.zoom || 1);
    const dxPx = evt.clientX - drag.startX;
    const dyPx = evt.clientY - drag.startY;
    if (Math.abs(dxPx) + Math.abs(dyPx) > 2) drag.moved = true;
    const scaleX = canvas.width / canvas.getBoundingClientRect().width;
    panel.dx = drag.dx - (dxPx * scaleX) / (zoom * drag.rect.w);
    panel.dy = drag.dy - (dyPx * scaleX) / (zoom * drag.rect.h);
    update();
  });
  canvas.addEventListener('pointerup', () => {
    if (drag && drag.moved) pushHistory();
    drag = null;
  });
  let wheelTimer = null;
  canvas.addEventListener('wheel', (evt) => {
    evt.preventDefault();
    const panel = state.panels[state.selected];
    if (!panel) return;
    panel.zoom = Math.max(1, Math.min(3, (panel.zoom || 1) * (evt.deltaY < 0 ? 1.08 : 0.93)));
    update();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(pushHistory, 450);
  }, { passive: false });

  // Drag-and-drop photo intake on the stage.
  const wrap = els.canvasWrap;
  if (wrap) {
    wrap.addEventListener('dragover', (evt) => evt.preventDefault());
    wrap.addEventListener('drop', (evt) => {
      evt.preventDefault();
      addPhotoFiles([...evt.dataTransfer.files]);
    });
  }

  syncControls();
  update();
  return { update, refreshStrip, assignPhoto };
}
