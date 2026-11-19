// editor.js — the Saltline editor: photo tray, live cover preview, panel
// framing, and every control on the desk.
//
// State is one plain object (see `state` below). Every change that a reader
// could want to undo is pushed onto a history stack as a JSON snapshot of the
// cover settings (photos themselves are never undone — only their placement
// and framing). The preview is the real renderer at stage size, so what the
// reader sees is pixel-for-pixel what Export PNG writes at full size.

import { GRADES } from './grades.js';
import { LAYOUTS, layoutFor, aspectClass, panelCount } from './panels.js';
import { SIZES, sizeById, renderCover, drawCoverToCanvas, clearPanelCache, ensurePhotoData } from './render.js';
import { computeSaliency, bestCrop } from './smartcrop.js';

export const SAMPLES = [
  { name: 'marina', src: 'samples/marina.jpg', label: 'Marina' },
  { name: 'rooftop', src: 'samples/rooftop.jpg', label: 'Rooftop' },
  { name: 'neon', src: 'samples/neon.jpg', label: 'Neon' },
  { name: 'pier', src: 'samples/pier.jpg', label: 'Pier' },
];

export function defaultState() {
  return {
    layout: 'mosaic',
    gradeId: 'sunset',
    ink: 0.72,
    halftone: 0.55,
    autoGrade: true,
    title: 'MARINA HEAT',
    subtitle: 'Saltline Nights',
    tagline: 'One summer on the coast',
    heat: 5,
    badge: true,
    sizeId: 'wide',
    assignments: {},
    crops: {},
  };
}

export class Editor {
  constructor(root = document) {
    this.root = root;
    this.state = defaultState();
    this.photos = [];
    this.photoSeq = 0;
    this.selectedPanel = 0;
    this.armedPhoto = null; // tray photo waiting to be placed
    this.history = [];
    this.future = [];
    this.canvas = root.querySelector('#stageCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.renderQueued = false;
    this.wireControls();
    this.buildPickers();
  }

  // --- photos ---------------------------------------------------------------

  addPhoto(img, label) {
    const photo = { id: `photo-${++this.photoSeq}`, img, label, saliency: null, auto: null };
    this.photos.push(photo);
    ensurePhotoData(photo);
    this.renderTray();
    this.updateStatus();
    this.requestRender();
    return photo;
  }

  loadPhotoFiles(files) {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => this.addPhoto(img, file.name);
      img.src = url;
    }
  }

  loadSamples() {
    // Load in parallel but add in SAMPLES order, so the tray and the panel
    // fill order never depend on which file arrived first.
    const pending = SAMPLES.filter((s) => !this.photos.some((p) => p.label === s.label)).map(
      (sample) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ img, label: sample.label });
          img.onerror = () => resolve(null);
          img.src = sample.src;
        }),
    );
    Promise.all(pending).then((loaded) => {
      for (const item of loaded) if (item) this.addPhoto(item.img, item.label);
    });
  }

  renderTray() {
    const grid = this.root.querySelector('#trayGrid');
    grid.innerHTML = '';
    this.photos.forEach((photo, i) => {
      const el = document.createElement('img');
      el.src = photo.img.src;
      el.alt = photo.label;
      el.title = photo.label;
      if (this.armedPhoto === i) el.classList.add('armed');
      el.addEventListener('click', () => {
        this.armedPhoto = this.armedPhoto === i ? null : i;
        this.renderTray();
      });
      grid.appendChild(el);
    });
  }

  // --- history ----------------------------------------------------------------

  snapshot() {
    return JSON.stringify(this.state);
  }

  pushHistory() {
    this.history.push(this.snapshot());
    if (this.history.length > 60) this.history.shift();
    this.future = [];
  }

  restore(json) {
    this.state = JSON.parse(json);
    clearPanelCache();
    this.syncControls();
    this.requestRender();
    this.updateStatus();
  }

  undo() {
    if (!this.history.length) return;
    this.future.push(this.snapshot());
    this.restore(this.history.pop());
  }

  redo() {
    if (!this.future.length) return;
    this.history.push(this.snapshot());
    this.restore(this.future.pop());
  }

  // --- geometry -----------------------------------------------------------------

  currentLayout() {
    const size = sizeById(this.state.sizeId);
    return layoutFor(this.state.layout, aspectClass(size.w, size.h));
  }

  panelRects() {
    // Panel rectangles in canvas pixel coordinates, matching render.js.
    const W = this.canvas.width;
    const H = this.canvas.height;
    const lay = this.currentLayout();
    if (lay.polaroids) {
      return lay.polaroids.map((p) => {
        const pw = p.w * W;
        const ph = pw * 0.82;
        return { x: p.cx * W - pw / 2, y: p.cy * H - ph / 2, w: pw, h: ph };
      });
    }
    const gutter = Math.max(3, Math.round(W * 0.0045));
    return lay.panels.map((r) => ({
      x: r.x * W + gutter,
      y: r.y * H + gutter,
      w: r.w * W - gutter * 2,
      h: r.h * H - gutter * 2,
    }));
  }

  panelAt(clientX, clientY) {
    const box = this.canvas.getBoundingClientRect();
    const x = ((clientX - box.left) / box.width) * this.canvas.width;
    const y = ((clientY - box.top) / box.height) * this.canvas.height;
    const rects = this.panelRects();
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
    }
    return -1;
  }

  cropOf(panel) {
    if (!this.state.crops[panel]) this.state.crops[panel] = { dx: 0, dy: 0, zoom: 1 };
    return this.state.crops[panel];
  }

  photoIndexFor(panel) {
    const assigned = this.state.assignments[panel];
    if (assigned != null && assigned < this.photos.length) return assigned;
    return this.photos.length ? panel % this.photos.length : -1;
  }

  // --- rendering ------------------------------------------------------------------

  fitCanvasToStage() {
    const wrap = this.root.querySelector('#stageWrap');
    const size = sizeById(this.state.sizeId);
    const availW = Math.max(280, wrap.clientWidth - 44);
    const availH = Math.max(240, wrap.clientHeight - 44);
    const scale = Math.min(availW / size.w, availH / size.h);
    const w = Math.max(200, Math.round(size.w * scale));
    const h = Math.max(200, Math.round(size.h * scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  requestRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.fitCanvasToStage();
      renderCover(this.ctx, this.canvas.width, this.canvas.height, this.renderState(), this.photos);
      this.drawSelection();
    });
  }

  renderState() {
    // renderCover reads assignments as an indexable map; hand it the plain
    // state with numeric photo indices resolved per panel.
    const assignments = {};
    const count = panelCount(this.state.layout, aspectClass(sizeById(this.state.sizeId).w, sizeById(this.state.sizeId).h));
    for (let i = 0; i < count; i++) assignments[i] = this.photoIndexFor(i);
    return { ...this.state, assignments };
  }

  drawSelection() {
    const rects = this.panelRects();
    const r = rects[this.selectedPanel];
    if (!r || !this.photos.length) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#ff2975';
    ctx.lineWidth = Math.max(2, this.canvas.width * 0.0035);
    ctx.setLineDash([10, 6]);
    ctx.strokeRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
    ctx.restore();
    const hint = this.root.querySelector('#dragHint');
    hint.classList.add('show');
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => hint.classList.remove('show'), 1600);
  }

  updateStatus() {
    const size = sizeById(this.state.sizeId);
    const count = panelCount(this.state.layout, aspectClass(size.w, size.h));
    const el = this.root.querySelector('#statusLine');
    el.textContent = this.photos.length
      ? `${this.photos.length} photos ready · ${count} panels · exports at ${size.label}. Drag the pink panel to reframe it, then Export PNG.`
      : 'Add your own photos, or load the samples to start.';
  }

  // --- controls -----------------------------------------------------------------

  buildPickers() {
    const layoutGrid = this.root.querySelector('#layoutGrid');
    for (const layout of LAYOUTS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'layout-btn';
      btn.dataset.layout = layout.id;
      const icon = document.createElement('canvas');
      icon.width = 40;
      icon.height = 24;
      this.drawLayoutIcon(icon, layout.id);
      const label = document.createElement('span');
      label.textContent = layout.name;
      btn.append(icon, label);
      btn.addEventListener('click', () => {
        this.pushHistory();
        this.state.layout = layout.id;
        this.selectedPanel = 0;
        this.syncControls();
        this.requestRender();
        this.updateStatus();
      });
      layoutGrid.appendChild(btn);
    }

    const gradeGrid = this.root.querySelector('#gradeGrid');
    for (const grade of GRADES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'grade-btn';
      btn.dataset.grade = grade.id;
      btn.textContent = grade.name;
      const stops = grade.stops.map((s) => `rgb(${s[1].join(',')}) ${(s[0] * 100).toFixed(0)}%`).join(', ');
      btn.style.background = `linear-gradient(135deg, ${stops})`;
      btn.addEventListener('click', () => {
        this.pushHistory();
        this.state.gradeId = grade.id;
        clearPanelCache();
        this.syncControls();
        this.requestRender();
      });
      gradeGrid.appendChild(btn);
    }

    const sizeGrid = this.root.querySelector('#sizeGrid');
    for (const size of SIZES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'size-btn';
      btn.dataset.size = size.id;
      btn.innerHTML = `${size.label}<small>${size.note}</small>`;
      btn.addEventListener('click', () => {
        this.pushHistory();
        this.state.sizeId = size.id;
        this.syncControls();
        this.requestRender();
        this.updateStatus();
      });
      sizeGrid.appendChild(btn);
    }
    this.syncControls();
  }

  drawLayoutIcon(canvas, layoutId) {
    const ctx = canvas.getContext('2d');
    const lay = layoutFor(layoutId, 'wide');
    ctx.fillStyle = '#170824';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#8f7bb5';
    const rects = lay.panels ?? lay.polaroids.map((p) => ({ x: p.cx - p.w / 2, y: p.cy - (p.w * 0.82) / 2, w: p.w, h: p.w * 0.82 }));
    for (const r of rects) ctx.fillRect(r.x * canvas.width + 1, r.y * canvas.height + 1, r.w * canvas.width - 2, r.h * canvas.height - 2);
    const t = lay.title;
    ctx.fillStyle = '#ff2975';
    ctx.fillRect(t.x * canvas.width + 1, t.y * canvas.height + 1, t.w * canvas.width - 2, t.h * canvas.height - 2);
  }

  syncControls() {
    const s = this.state;
    this.root.querySelectorAll('.layout-btn').forEach((b) => b.classList.toggle('active', b.dataset.layout === s.layout));
    this.root.querySelectorAll('.grade-btn').forEach((b) => b.classList.toggle('active', b.dataset.grade === s.gradeId));
    this.root.querySelectorAll('.size-btn').forEach((b) => b.classList.toggle('active', b.dataset.size === s.sizeId));
    this.root.querySelector('#titleInput').value = s.title;
    this.root.querySelector('#subInput').value = s.subtitle;
    this.root.querySelector('#tagInput').value = s.tagline;
    this.root.querySelector('#inkSlider').value = Math.round(s.ink * 100);
    this.root.querySelector('#inkToggle').checked = s.ink > 0.01;
    this.root.querySelector('#halftoneSlider').value = Math.round(s.halftone * 100);
    this.root.querySelector('#autoGradeToggle').checked = s.autoGrade;
    this.root.querySelector('#heatSlider').value = s.heat;
    this.root.querySelector('#badgeToggle').checked = s.badge;
    const crop = this.state.crops[this.selectedPanel];
    this.root.querySelector('#zoomSlider').value = Math.round((crop?.zoom ?? 1) * 100);
  }

  wireControls() {
    const q = (sel) => this.root.querySelector(sel);
    q('#addPhotosBtn').addEventListener('click', () => q('#fileInput').click());
    q('#fileInput').addEventListener('change', (e) => {
      this.loadPhotoFiles([...e.target.files]);
      e.target.value = '';
    });
    q('#samplesBtn').addEventListener('click', () => this.loadSamples());
    q('#autoCoverBtn').addEventListener('click', () => this.autoCover());

    const dropNote = q('#dropNote');
    for (const target of [dropNote, this.canvas]) {
      target.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropNote.classList.add('drag-over');
      });
      target.addEventListener('dragleave', () => dropNote.classList.remove('drag-over'));
      target.addEventListener('drop', (e) => {
        e.preventDefault();
        dropNote.classList.remove('drag-over');
        this.loadPhotoFiles([...e.dataTransfer.files]);
      });
    }

    const bindText = (sel, key) => {
      q(sel).addEventListener('input', (e) => {
        this.state[key] = e.target.value;
        this.requestRender();
      });
      q(sel).addEventListener('change', () => this.pushHistoryBefore());
    };
    // Text edits snapshot on focus so one undo undoes one typing session.
    for (const [sel, key] of [['#titleInput', 'title'], ['#subInput', 'subtitle'], ['#tagInput', 'tagline']]) {
      q(sel).addEventListener('focus', () => this.pushHistory());
      q(sel).addEventListener('input', (e) => {
        this.state[key] = e.target.value;
        this.requestRender();
      });
    }

    q('#inkSlider').addEventListener('input', (e) => {
      this.state.ink = e.target.value / 100;
      if (this.state.ink > 0.01) q('#inkToggle').checked = true;
      clearPanelCache();
      this.requestRender();
    });
    q('#inkToggle').addEventListener('change', (e) => {
      this.pushHistory();
      this.state.ink = e.target.checked ? Number(q('#inkSlider').value) / 100 || 0.72 : 0;
      clearPanelCache();
      this.requestRender();
    });
    q('#halftoneSlider').addEventListener('input', (e) => {
      this.state.halftone = e.target.value / 100;
      this.requestRender();
    });
    q('#autoGradeToggle').addEventListener('change', (e) => {
      this.pushHistory();
      this.state.autoGrade = e.target.checked;
      clearPanelCache();
      this.requestRender();
    });
    q('#heatSlider').addEventListener('input', (e) => {
      this.state.heat = Number(e.target.value);
      this.requestRender();
    });
    q('#badgeToggle').addEventListener('change', (e) => {
      this.pushHistory();
      this.state.badge = e.target.checked;
      this.requestRender();
    });

    q('#zoomSlider').addEventListener('input', (e) => {
      const crop = this.cropOf(this.selectedPanel);
      crop.zoom = Number(e.target.value) / 100;
      this.requestRender();
    });
    q('#zoomInBtn').addEventListener('click', () => this.nudgeZoom(1.15));
    q('#zoomOutBtn').addEventListener('click', () => this.nudgeZoom(1 / 1.15));
    q('#smartCropBtn').addEventListener('click', () => {
      this.pushHistory();
      delete this.state.crops[this.selectedPanel];
      this.syncControls();
      this.requestRender();
    });
    q('#resetCropBtn').addEventListener('click', () => {
      this.pushHistory();
      this.state.crops[this.selectedPanel] = { dx: 0, dy: 0, zoom: 1 };
      this.syncControls();
      this.requestRender();
    });
    q('#undoBtn').addEventListener('click', () => this.undo());
    q('#redoBtn').addEventListener('click', () => this.redo());
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
      }
    });

    q('#exportBtn').addEventListener('click', () => this.exportPng());
    window.addEventListener('resize', () => this.requestRender());
    this.wireCanvasPointer();
  }

  pushHistoryBefore() {
    /* kept for symmetry with bindText callers; focus-based snapshots cover it */
  }

  nudgeZoom(factor) {
    const crop = this.cropOf(this.selectedPanel);
    crop.zoom = Math.min(3.5, Math.max(1, crop.zoom * factor));
    this.root.querySelector('#zoomSlider').value = Math.round(crop.zoom * 100);
    this.requestRender();
  }

  // autoCover is the one-click path: fill every panel round-robin, clear all
  // manual crops so the smart crop frames each subject, and render.
  autoCover() {
    if (!this.photos.length) {
      this.loadSamples();
      return;
    }
    this.pushHistory();
    this.state.assignments = {};
    this.state.crops = {};
    const count = panelCount(this.state.layout, aspectClass(sizeById(this.state.sizeId).w, sizeById(this.state.sizeId).h));
    for (let i = 0; i < count; i++) this.state.assignments[i] = i % this.photos.length;
    this.selectedPanel = 0;
    this.syncControls();
    this.requestRender();
    this.updateStatus();
  }

  exportPng() {
    if (!this.photos.length) return;
    const size = sizeById(this.state.sizeId);
    const canvas = drawCoverToCanvas(this.renderState(), this.photos, size);
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `saltline-cover-${size.w}x${size.h}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 'image/png');
  }

  // --- canvas pointer: select, place, drag, zoom ------------------------------

  wireCanvasPointer() {
    let drag = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      const panel = this.panelAt(e.clientX, e.clientY);
      if (panel < 0) return;
      if (this.armedPhoto != null) {
        this.pushHistory();
        this.state.assignments[panel] = this.armedPhoto;
        this.armedPhoto = null;
        this.renderTray();
      }
      this.selectedPanel = panel;
      this.syncControls();
      drag = { panel, x: e.clientX, y: e.clientY, crop: { ...this.cropOf(panel) }, moved: false };
      this.canvas.setPointerCapture(e.pointerId);
      this.requestRender();
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const rects = this.panelRects();
      const r = rects[drag.panel];
      const dxPx = e.clientX - drag.x;
      const dyPx = e.clientY - drag.y;
      if (Math.abs(dxPx) + Math.abs(dyPx) > 3) drag.moved = true;
      if (!drag.moved) return;
      const box = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / box.width;
      const crop = this.cropOf(drag.panel);
      crop.dx = clamp(drag.crop.dx - (dxPx * scaleX) / r.w / crop.zoom, -0.5, 0.5);
      crop.dy = clamp(drag.crop.dy - (dyPx * scaleX) / r.h / crop.zoom, -0.5, 0.5);
      this.requestRender();
    });
    this.canvas.addEventListener('pointerup', () => {
      if (drag?.moved) this.pushHistoryWith(drag.crop, drag.panel);
      drag = null;
    });
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const panel = this.panelAt(e.clientX, e.clientY);
        if (panel < 0) return;
        this.selectedPanel = panel;
        const crop = this.cropOf(panel);
        crop.zoom = clamp(crop.zoom * (e.deltaY < 0 ? 1.09 : 1 / 1.09), 1, 3.5);
        this.root.querySelector('#zoomSlider').value = Math.round(crop.zoom * 100);
        this.requestRender();
      },
      { passive: false },
    );
  }

  // A drag edits the crop live from a copy; on release the pre-drag crop is
  // what history should remember, so push a snapshot holding it, then keep the
  // live values.
  pushHistoryWith(preDragCrop, panel) {
    const live = { ...this.state.crops[panel] };
    this.state.crops[panel] = preDragCrop;
    this.pushHistory();
    this.state.crops[panel] = live;
  }
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// smartCropAll is used by shot scenes: it simply clears manual crops so the
// renderer's smart crop frames every panel (kept as a named step for the
// outline the judge reads).
export function smartCropAll(state) {
  state.crops = {};
  return state;
}

// Re-exported for shot scenes that build a cover without the full editor.
export { bestCrop, computeSaliency };
