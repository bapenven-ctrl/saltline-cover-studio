// editor.js — The Saltline editor: state, photo intake, and UI wiring.
//
// The state is a plain object the renderer consumes. Every user gesture
// funnels through commit(), which snapshots the previous state for
// undo/redo and repaints. Photos carry an id, a display name and the
// callout they wear by default ("THE DRIVER" and friends); a panel may
// override its callout text, and the editor's label field edits the
// selected panel's override.

import { LAYOUTS, PANEL_COUNTS } from './panels.js';
import { GRADES, analysePhoto, pickAutoGrade } from './grades.js';
import { EXPORT_SIZES, renderCover, sizeById } from './render.js';

export const SAMPLE_PHOTOS = [
  { id: 'driver', name: 'Driver', src: 'samples/driver.jpg', callout: 'THE DRIVER' },
  { id: 'redhead', name: 'Redhead', src: 'samples/redhead.jpg', callout: 'THE FIXER' },
  { id: 'rider', name: 'Rider', src: 'samples/rider.jpg', callout: 'THE RIDER' },
  { id: 'marina', name: 'Marina', src: 'samples/marina.jpg', callout: 'THE INSIDER' },
  { id: 'pier', name: 'Pier', src: 'samples/pier.jpg', callout: 'THE CAPTAIN' },
  { id: 'rooftop', name: 'Rooftop', src: 'samples/rooftop.jpg', callout: 'THE BOSS' },
  { id: 'neon', name: 'Neon', src: 'samples/neon.jpg', callout: 'THE COURIERS' },
  { id: 'motel', name: 'Motel', src: 'samples/motel.jpg', callout: 'THE HIDEOUT' },
];

// Which sample sits in which panel for each poster layout, by sample id.
// Panel order follows panels.js: keyart [hero, lt, lb, rt, rb],
// poster [tl, tr, hero, bl, br], ensemble row-major.
export const ASSIGNMENTS = {
  keyart: ['driver', 'marina', 'rider', 'redhead', 'pier'],
  poster: ['redhead', 'rooftop', 'driver', 'rider', 'motel'],
  ensemble: ['driver', 'pier', 'redhead', 'rider', 'marina', 'neon'],
};

export function createState() {
  return {
    layout: 'keyart',
    grade: 'key-art',
    caption: 'NEON SHORES',
    subtitle: 'Saltline City',
    furniture: true,
    callouts: true,
    size: '1920x1080',
    photos: [],
    panels: [],
    selectedPanel: 0,
    selectedPhoto: 0,
  };
}

function freshPanel(photoIndex) {
  return { photoIndex, zoom: 1, ox: 0, oy: 0, smart: true, label: null, dy: 0 };
}

export function ensurePanels(state) {
  const n = PANEL_COUNTS[state.layout] || 3;
  const preset = ASSIGNMENTS[state.layout];
  while (state.panels.length < n) {
    const i = state.panels.length;
    let photoIndex = state.photos.length ? i % state.photos.length : 0;
    if (preset && state.photos.length) {
      const idx = state.photos.findIndex((p) => p.id === preset[i]);
      if (idx >= 0) photoIndex = idx;
    }
    state.panels.push(freshPanel(photoIndex));
  }
  state.panels.length = n;
  if (state.selectedPanel >= n) state.selectedPanel = 0;
}

// applyAssignment(state) — force the layout's showcase assignment (shots
// and Auto Cover use it so the composition is the designed one).
export function applyAssignment(state) {
  ensurePanels(state);
  const preset = ASSIGNMENTS[state.layout];
  if (!preset) return;
  state.panels.forEach((panel, i) => {
    const idx = state.photos.findIndex((p) => p.id === preset[i]);
    if (idx >= 0) { panel.photoIndex = idx; panel.smart = true; panel.zoom = 1; panel.ox = 0; panel.oy = 0; }
  });
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
      state.photos.push({ img, id: sample.id, name: sample.name, callout: sample.callout });
    } catch { /* a sample that fails to load simply never appears */ }
  }
  ensurePanels(state);
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

export function initEditor(state, els) {
  const history = [];
  const future = [];
  const snapshot = () => JSON.stringify({
    layout: state.layout, grade: state.grade, caption: state.caption,
    subtitle: state.subtitle, furniture: state.furniture, callouts: state.callouts,
    panels: state.panels, selectedPanel: state.selectedPanel,
  });
  const restore = (json) => {
    const s = JSON.parse(json);
    Object.assign(state, s);
    syncControls();
    render();
  };
  const commit = () => { history.push(snapshot()); if (history.length > 60) history.shift(); future.length = 0; };
  const render = () => { ensurePanels(state); renderCover(els.canvas, state); };

  fillSelect(els.layout, LAYOUTS, state.layout);
  fillSelect(els.grade, [{ id: 'auto', label: 'Auto (fits photo)' }, ...GRADES], state.grade);

  function syncControls() {
    els.layout.value = state.layout;
    els.grade.value = state.grade;
    els.caption.value = state.caption;
    els.subtitle.value = state.subtitle;
    els.furniture.checked = state.furniture;
    els.callouts.checked = state.callouts;
    refreshPhotoStrip();
  }

  function refreshPhotoStrip() {
    els.photoStrip.innerHTML = '';
    state.photos.forEach((photo, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'thumb' + (i === state.selectedPhoto ? ' active' : '');
      btn.textContent = photo.name;
      btn.addEventListener('click', () => {
        commit();
        state.selectedPhoto = i;
        const panel = state.panels[state.selectedPanel];
        if (panel) { panel.photoIndex = i; panel.label = null; }
        refreshPhotoStrip(); render();
      });
      els.photoStrip.appendChild(btn);
    });
    const panel = state.panels[state.selectedPanel];
    if (panel) {
      els.panelLabel.textContent = `Panel ${state.selectedPanel + 1} of ${state.panels.length}`;
      els.zoom.value = String(panel.zoom);
      els.smartCrop.checked = !!panel.smart;
      const photo = state.photos[panel.photoIndex];
      els.calloutLabel.value = panel.label || (photo && photo.callout) || '';
    }
  }

  els.layout.addEventListener('change', () => { commit(); state.layout = els.layout.value; state.selectedPanel = 0; ensurePanels(state); refreshPhotoStrip(); render(); });
  els.grade.addEventListener('change', () => { commit(); state.grade = els.grade.value; render(); });
  els.caption.addEventListener('focus', () => commit());
  els.caption.addEventListener('input', () => { state.caption = els.caption.value; render(); });
  els.subtitle.addEventListener('focus', () => commit());
  els.subtitle.addEventListener('input', () => { state.subtitle = els.subtitle.value; render(); });
  els.furniture.addEventListener('change', () => { commit(); state.furniture = els.furniture.checked; render(); });
  els.callouts.addEventListener('change', () => { commit(); state.callouts = els.callouts.checked; render(); });
  els.calloutLabel.addEventListener('focus', () => commit());
  els.calloutLabel.addEventListener('input', () => {
    const panel = state.panels[state.selectedPanel];
    if (panel) { panel.label = els.calloutLabel.value.toUpperCase() || null; render(); }
  });
  els.zoom.addEventListener('pointerdown', () => commit());
  els.zoom.addEventListener('input', () => {
    const panel = state.panels[state.selectedPanel];
    if (panel) { panel.zoom = Number(els.zoom.value); render(); }
  });
  els.smartCrop.addEventListener('change', () => {
    commit();
    const panel = state.panels[state.selectedPanel];
    if (panel) { panel.smart = els.smartCrop.checked; render(); }
  });

  els.undoBtn.addEventListener('click', () => {
    if (!history.length) return;
    future.push(snapshot());
    restore(history.pop());
  });
  els.redoBtn.addEventListener('click', () => {
    if (!future.length) return;
    history.push(snapshot());
    restore(future.pop());
  });
  els.autoBtn.addEventListener('click', () => {
    commit();
    applyAssignment(state);
    const hero = state.photos[state.panels[0] ? state.panels[0].photoIndex : 0];
    if (hero) {
      try { state.grade = pickAutoGrade(analysePhoto(hero.img)); } catch { /* keep current grade */ }
      els.grade.value = state.grade;
    }
    refreshPhotoStrip(); render();
  });

  const addFiles = async (files) => {
    let added = false;
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const img = await loadImageFromUrl(URL.createObjectURL(file));
        const name = file.name.replace(/\.[^.]+$/, '').slice(0, 18) || 'Photo';
        state.photos.push({ img, id: null, name, callout: name.toUpperCase() });
        added = true;
      } catch { /* unreadable files are skipped */ }
    }
    if (added) { commit(); refreshPhotoStrip(); render(); }
  };
  els.fileInput.addEventListener('change', () => { addFiles([...els.fileInput.files]); els.fileInput.value = ''; });
  els.canvasWrap.addEventListener('dragover', (e) => { e.preventDefault(); els.canvasWrap.classList.add('dragging'); });
  els.canvasWrap.addEventListener('dragleave', () => els.canvasWrap.classList.remove('dragging'));
  els.canvasWrap.addEventListener('drop', (e) => {
    e.preventDefault(); els.canvasWrap.classList.remove('dragging');
    if (e.dataTransfer) addFiles([...e.dataTransfer.files]);
  });

  // Panel picking, drag-to-reframe, wheel-to-zoom on the preview.
  let drag = null;
  const canvasPoint = (e) => {
    const r = els.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  els.canvas.addEventListener('pointerdown', (e) => {
    const p = canvasPoint(e);
    const rects = els.canvas._panelRects || [];
    const W = els.canvas.width, H = els.canvas.height;
    let hit = -1;
    rects.forEach((rc, i) => {
      if (p.x * W >= rc.x && p.x * W <= rc.x + rc.w && p.y * H >= rc.y && p.y * H <= rc.y + rc.h) hit = i;
    });
    if (hit >= 0 && hit !== state.selectedPanel) {
      state.selectedPanel = hit;
      state.selectedPhoto = state.panels[hit].photoIndex;
      refreshPhotoStrip();
    }
    drag = { x: p.x, y: p.y, moved: false };
    els.canvas.setPointerCapture(e.pointerId);
  });
  els.canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = canvasPoint(e);
    const panel = state.panels[state.selectedPanel];
    if (panel && !panel.smart && (Math.abs(p.x - drag.x) > 0.002 || Math.abs(p.y - drag.y) > 0.002)) {
      if (!drag.moved) { commit(); drag.moved = true; }
      panel.ox = Math.min(1, Math.max(-1, panel.ox - (p.x - drag.x) * 2));
      panel.oy = Math.min(1, Math.max(-1, panel.oy - (p.y - drag.y) * 2));
      render();
    }
    drag.x = p.x; drag.y = p.y;
  });
  els.canvas.addEventListener('pointerup', () => { drag = null; });
  let lastWheelCommit = 0;
  els.canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const panel = state.panels[state.selectedPanel];
    if (!panel) return;
    const now = performance.now();
    if (now - lastWheelCommit > 450) { commit(); lastWheelCommit = now; }
    panel.zoom = Math.min(3, Math.max(1, panel.zoom * (e.deltaY < 0 ? 1.08 : 0.93)));
    els.zoom.value = String(panel.zoom);
    render();
  }, { passive: false });

  // Export: one button per size, each renders fresh at that exact size.
  els.exportBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = sizeById(btn.dataset.size);
      const off = document.createElement('canvas');
      off.width = s.w; off.height = s.h;
      renderCover(off, state);
      off.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `saltline-cover-${s.id}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        els.status.textContent = `Saved saltline-cover-${s.id}.png`;
      }, 'image/png');
    });
  });

  syncControls();
  render();
  return { render, refreshPhotoStrip };
}
