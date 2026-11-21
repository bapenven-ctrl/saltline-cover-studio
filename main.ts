// Saltline Cover Studio — entry program for the make.fun bounty
// gta6-cover-art-01 (Node 22, standard library only).
//
// The product is the static web app in app/: a poster-system cover
// studio that turns a visitor's own photos into GTA-style key art —
// ten multi-panel layouts, seven gradient-map colour grades plus an
// Auto grade, saliency smart crop, and a full set of poster furniture
// (masthead, cast callouts, chrome title lettering, credits strip)
// drawn by the renderer, with PNG export at square, portrait, wide and
// story sizes. It runs entirely from local files: no build step, no
// network, no libraries.
//
// This program hands the entry in. It copies app/ and screenshots/
// into the output directory and writes dossier.json there with the
// vendored make.fun library — the summary the judge reads.
//
//   node main.ts                     (writes to /output)
//   MAKEFUN_OUTPUT_DIR=out node main.ts
//   node serve.ts                    (try the app on localhost:8080)

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

// The caps are the scorer's own (see the kit's gate): the text cap
// shapes the dossier bytes; the rest simply refuse anything the scorer
// would refuse — too many or too-large screenshots, an oversized app/.
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
