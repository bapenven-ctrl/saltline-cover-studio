# Saltline Cover Studio

Saltline Cover Studio turns your own photos into GTA-poster-style cover art.
Pick a multi-panel layout, drop in photos, grade the colours, add a bold
title, and export a finished cover as a PNG. Everything runs locally in the
browser from static files — no build step, no network, no accounts.

## Features

- **7 multi-panel layouts** — Hero Left, Hero Right, Triptych, Quad 2x2,
  Cover Grid (6 panels), Duet + Title, and Full Bleed with an inset strip,
  all drawn as white-bordered panels with a slight hand-assembled tilt.
- **Colour grades as gradient maps** — Vice Sunset, Neon Nights, Golden
  Hour, Teal Heat, Magenta Dusk and Mono Ink, each built as a 256-entry RGB
  lookup table and applied per pixel. **Auto** analyses the hero photo's
  brightness, saturation and warmth and picks the grade that fits.
- **Saliency smart crop** — panels can find their own best crop window by
  scoring a downscaled copy of the photo for edges, contrast and faces, or
  you can switch a panel to manual mode and drag the photo with a zoom
  slider.
- **Poster treatments** — a toggleable poster-ink effect (posterized levels
  with a saturation lift), an optional halftone dot overlay in the shadows,
  plus a vignette and fine deterministic grain over the whole sheet.
- **Lettering** — the title is set in Anton with a sunset gradient fill,
  dark outline and slight tilt; the subtitle is set in Pacifico script; a
  small Saltline badge chip sits in the corner.
- **Photo intake** — four bundled sample photos are composed into a cover
  on load; add your own with the file picker (multiple) or by dragging
  files onto the preview, then click a panel and a photo to assign it.
- **Live preview** — every change re-renders immediately.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser.

## Export sizes

- Square — 1080 x 1080
- Portrait — 1080 x 1350
- Wide — 1920 x 1080
- Story — 1080 x 1920

The Export button downloads the cover as a PNG at the chosen size.

## Fonts

Anton and Pacifico are bundled under `app/fonts/` and licensed under the
SIL Open Font License 1.1 — see `app/fonts/OFL-LICENSE.txt`. The sample
photos in `app/samples/` were generated for this app and contain no real
people.

## Competition

Built for the make.fun bounty gta6-cover-art-01:
https://make.fun/c/gta6-cover-art-01
