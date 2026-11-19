// Saltline Cover Studio — the program that hands the entry in.
//
// The app itself is the static site under app/ (open app/index.html in a
// desktop browser; it works fully offline). This program copies app/ and
// screenshots/ into the output directory and writes dossier.json there with
// the kit's vendored buildDossier, byte for byte as the grader rebuilds it.
//
// Run it the way the grader does, with the output directory standing in:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoDir, 'app'), join(outputDir, 'app'), { recursive: true });

const shotsDir = join(repoDir, 'screenshots');
if (existsSync(shotsDir)) {
  mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
}

// The caps below are the scorer's own (reference/gate.json): the text cap
// shapes the dossier's bytes; the rest make this program refuse an entry the
// scorer would refuse anyway — too many screenshots or one too heavy, an
// app/ tree over its file or byte budget, or an over-long path under app/.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
