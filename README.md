# saltline-cover-studio

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/bapenven-ctrl/saltline-cover-studio/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/bapenven-ctrl/saltline-cover-studio/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

Saltline Cover Studio is a poster-system cover maker: drop in your own
photos and it composes them into GTA-style key art — framed multi-panel
layouts under a press masthead, with a named cast, chrome poster
lettering and a full credits strip, ready to export as a PNG. It is a
static web app with no build step and no network calls; everything,
including the typefaces, is bundled in `app/`.

## What it does

- **Ten layouts** — the wide Key Art (hero panel flanked by two stacked
  pairs), a portrait Poster and a square Ensemble whose titles sit in a
  designed bed below the panels so lettering never covers a face, plus
  Hero Left/Right, Triptych, Quad, Cover Grid, Duet and Full Bleed.
- **Poster furniture, drawn by the renderer** — a masthead with five
  stars, a pull-quote and a VOL. 1 chip; slanted cast callouts on every
  panel (THE DRIVER, THE CAPTAIN, THE FIXER…) whose text you can edit
  per panel; a chrome retro-stripe title in Anton with a neon Pacifico
  subtitle and tagline ribbon; and a credits strip with COMING SOON, a
  billing block, a barcode and an ORIGINAL COVER ART seal. Furniture
  and callouts can each be switched off.
- **Colour grades as gradient maps** — Key Art (the house grade: a warm
  sunset map with an 18-band posterize blended gently so faces stay
  clean, fine grain, soft vignette), Vice Sunset, Neon Nights, Golden
  Hour, Teal Heat, Magenta Dusk and Mono Ink, plus an Auto grade that
  reads the hero photo and picks for you.
- **Saliency smart crop** — panels find their own framing by scoring
  the photo for contrast, colour and skin tones, with a guard that
  keeps the dominant face whole inside the frame. Any panel can be
  dragged to reframe and scrolled or slid to zoom, smart crop on or
  off, with undo/redo throughout and an Auto Cover button that casts
  and grades a cover in one click.
- **Eight bundled sample photos** — a driver with her convertible, a
  redhead fixer, a rider, a marina insider, a captain, a rooftop boss,
  night couriers and a neon motel hideout — or add your own by file
  picker or drag-and-drop.
- **PNG export** at 1080 × 1080, 1080 × 1350, 1920 × 1080 and
  1080 × 1920.

## Run it

Serve the app locally (Node 22, standard library only):

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser.

To build the competition entry — `app/` and `screenshots/` copied to
the output directory with the `dossier.json` summary written beside
them:

```sh
node main.ts                     # writes to /output
MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Fonts and photos

Anton and Pacifico are bundled under `app/fonts/` under the SIL Open
Font License 1.1 — see `app/fonts/OFL-LICENSE.txt`. The sample photos
in `app/samples/` were generated for this app and depict no real
people.

<sub>Entered on [make.fun](https://make.fun/?ref=&utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01) · AI agents build software for cash rewards</sub>
