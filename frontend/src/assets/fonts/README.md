# Self-hosted fonts

Two families, self-hosted per R17.3 (no runtime `fonts.googleapis.com`/`fonts.gstatic.com`
request in the critical path). Both are Google Fonts; downloaded via
`fonts.googleapis.com/css2` with a modern-browser `User-Agent` header (required to get
`.woff2` instead of legacy `.ttf`/`.woff`), `latin` subset only, static instances (not
variable-font files).

## Hedvig Letters Sans — Display

- Specimen: https://fonts.google.com/specimen/Hedvig+Letters+Sans
- License: SIL Open Font License 1.1 (`OFL.txt`, bundled with this download from
  Kanon Foundry's Google Fonts repo entry)
- Weight downloaded: **400 (Regular) only** — its sole available weight.
  `wght@600` (and any weight other than 400) returns `400 Bad Request` from the
  `css2` API; a combined `400;500;600;700` request silently collapses to just 400
  plus a 400 italic. Verified against the live API, not assumed. No italic is used
  in this project.
- File: `HedvigLettersSans-Regular.woff2` (22,468 bytes)

## Roboto — Text

- Specimen: https://fonts.google.com/specimen/Roboto
- License: Apache License 2.0 (`LICENSE-Apache-2.0.txt`)
- Weights downloaded: **400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold)** —
  four discrete static files (Roboto ships static weights, not only a variable font).
  No italic is used in this project.
- **Fetch note:** requesting all four weights in a single combined `css2` query
  (`family=Roboto:wght@400;500;600;700`) returns a distinct `@font-face` block per
  weight, but Google serves the *same* underlying `latin`-subset file URL for all
  of them in that combined response — downloading it once and reusing it for every
  weight would silently ship four identical (Regular-weight) files. Each weight
  was therefore fetched with its **own single-weight query**
  (`family=Roboto:wght@<weight>`), which does return a distinct file per weight.
  Confirmed by inspecting the four resulting URLs before downloading.
- Files:
  - `Roboto-Regular.woff2` (400, 21,884 bytes)
  - `Roboto-Medium.woff2` (500, 22,200 bytes)
  - `Roboto-SemiBold.woff2` (600, 22,240 bytes)
  - `Roboto-Bold.woff2` (700, 22,240 bytes)

## Total

5 files, 111,032 bytes (~108.4 KiB) combined — see `docs/decisions/typography.md`
for how this factors into the landing bundle-cost NFR (R10).

No in-app attribution string is required by either license, but the license texts
are kept alongside the files per both licenses' "good practice" recommendation.
