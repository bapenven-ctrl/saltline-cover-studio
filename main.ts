// Saltline Cover Studio — entry program for the make.fun bounty
// gta6-cover-art-01 (Node 22, standard library only).
//
// The product is the app/ folder beside this file: a static web app a
// desktop browser runs fully offline. It composes movie-poster-style
// multi-panel covers from the visitor's own photos — ten layouts, seven
// gradient-map colour grades plus an Auto grade, saliency smart crop that
// keeps faces whole, and a full poster furniture system (press masthead,
// cast callouts, chrome title, credits strip) — and exports finished
// covers as PNGs at square, portrait, wide and story sizes.
//
// This program performs the hand-in: it copies app/ and screenshots/ into
// the output directory and writes dossier.json there with the vendored
// make.fun library. To try the app locally instead, run `node serve.ts`
// and open http://localhost:8080. Outside the grader's container,
// MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The caps below mirror the scorer's own gate: at most four screenshots of
// at most 256 KiB each, at most 993 files and 48 MiB under app/, and no
// app/ path longer than 1000 bytes; the dossier's text budget is 160 KiB.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);
