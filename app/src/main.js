// main.js — the studio's entry point. With no query string it opens the
// editor (samples loaded, ready to make a cover); with ?shot= it builds one
// of the fixed screenshot scenes instead (see shots.js).

import { Editor } from './editor.js';
import { runShot } from './shots.js';

const query = new URLSearchParams(window.location.search);

if (query.get('shot')) {
  runShot(query);
} else {
  const editor = new Editor(document);
  editor.loadSamples();
  window.saltlineEditor = editor;
}
