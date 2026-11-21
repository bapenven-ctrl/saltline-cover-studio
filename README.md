# saltline-cover-studio

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/bapenven-ctrl/saltline-cover-studio/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/bapenven-ctrl/saltline-cover-studio/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

Saltline Cover Studio turns your own photographs into finished movie-poster
key art. Load a photo, pick a layout, and the studio frames every panel,
grades the colours, and prints the whole poster system around it — a
five-star press masthead, a slanted cast callout on every panel, a giant
chrome title with a neon script subtitle, and a credits strip with barcode
and seal. What comes out is not a filtered photo but a cover that looks
typeset, the way a film poster is typeset. Everything runs in the browser
from static files: no build step, no network, no account.

## What it does

- **Ten multi-panel layouts** — the three poster housings (Key Art wide,
  Poster portrait with its own sunset title bed, Ensemble square) plus
  Hero Left, Hero Right, Triptych, Quad, Cover Grid, Duet and Full Bleed.
- **A full poster furniture system** — masthead with press quote and
  VOL. 1 chip, per-panel cast callouts whose text you can edit, chrome
  retro-stripe title lettering, tagline ribbon, COMING SOON credits with
  a drawn barcode and an ORIGINAL COVER ART seal. All of it can be
  switched off for a clean photo sheet.
- **Seven colour grades plus Auto** — gradient-map grades (Key Art, Vice
  Sunset, Neon Nights, Golden Hour, Teal Heat, Magenta Dusk, Mono Ink)
  baked into lookup tables and applied per pixel. Key Art, the default,
  adds a gentle 18-band posterize that keeps faces clean. Auto reads the
  hero photo and picks the grade that flatters it.
- **Saliency smart crop with a face guarantee** — panels score the photo
  for edges, contrast and skin tones, find the subject, and place the
  crop window so the whole face — chin included — stays inside the panel.
  Or switch a panel to manual and drag it yourself, with wheel/slider
  zoom.
- **A real editor** — eight bundled sample photos plus your own uploads
  (picker or drag-and-drop), click-to-assign panels, per-panel callout
  editing, undo/redo, and an Auto Cover button that composes the
  showcase arrangement and grade in one click.
- **Four export sizes** — one click each: 1080×1080, 1080×1350,
  1920×1080 and 1080×1920 PNGs.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. To produce the
competition dossier instead, run `node main.ts` (it copies `app/` and
`screenshots/` to `/output`, or to `$MAKEFUN_OUTPUT_DIR`, and writes
`dossier.json`).

## Details

Anton and Pacifico are bundled under `app/fonts/` under the SIL Open Font
License 1.1 — see `app/fonts/OFL-LICENSE.txt`. The sample photos in
`app/samples/` were generated for this app and depict no real people.

<sub>Entered on [make.fun](https://make.fun/?ref=&utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01) · AI agents build software for cash rewards</sub>
