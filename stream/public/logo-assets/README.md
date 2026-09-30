# Stream logo assets

Every file here is generated from `stream/public/logo-mark-512.png` — the
shipped mark, resampled and composited, never redrawn or reshaped.
`mark-512.png` is pixel-identical to that source.

**Brand blue is `#334dcc`**, sampled from the mark itself. It is *not* the
site's `--accent` (`#6a18a8` purple) — that is the UI accent for buttons and
links. Recolouring the mark to the UI accent produces a logo the brand does
not use. Keep the two separate.

## Icons — the mark on transparency

`mark-16` `mark-32` `mark-48` `mark-64` `mark-96` `mark-128` `mark-180`
`mark-192` `mark-256` `mark-384` `mark-512` `mark-1024` (`.png`)

Drop-in for favicons, app icons, and anywhere the mark sits on a background
you control.

| File | Use |
| --- | --- |
| `favicon-16/32/48.png`, `favicon.ico` | Browser tabs. The `.ico` bundles all three sizes. |
| `apple-touch-icon-180.png` | iOS home screen. White mark on brand blue, 14% padding — iOS adds its own corner radius, so the tile must be square and fully bled. |
| `mark-maskable-512.png` | Android / PWA `purpose: "maskable"`. 20% padding keeps the glyph inside the safe zone when the launcher crops it to a circle or squircle. |

**A note on small sizes:** the mark has 13 separate elements. Below ~32px the
bars and the gaps between them fall under one pixel and it resolves as a
coloured smudge rather than a waveform. That is inherent to the artwork, not
to the resampling. If a crisper favicon matters, it needs a simplified
glyph — a design decision, not a render setting.

## Social and promotional

| File | Size | Where |
| --- | --- | --- |
| `og-image-1200x630.png` | 1200×630 | Open Graph default — Facebook, Slack, iMessage, WhatsApp, LinkedIn fallback |
| `og-image-light-1200x630.png` | 1200×630 | Same, on the light background |
| `twitter-card-1200x600.png` | 1200×600 | X/Twitter `summary_large_image` |
| `linkedin-1200x627.png` | 1200×627 | LinkedIn share |
| `github-social-1280x640.png` | 1280×640 | GitHub repo social preview |
| `email-header-1200x300.png` | 1200×300 | Email banner — no subtitle, so it holds up at letterbox heights |
| `avatar-400.png` / `avatar-800.png` | square | Profile pictures. White mark on brand blue, 18% padding so it survives a circular crop |

## One-colour variants

| File | Use |
| --- | --- |
| `mark-white-512.png` | Knockout for dark backgrounds, video, merch |
| `mark-ink-512.png` | Single-colour print, faxable documents |
| `mark-on-white-512.png` | The mark on a white tile, for surfaces that can't carry transparency |

## Regenerating

The generator is not committed — these are build outputs, and the inputs
(the master PNG plus the brand colours in `stream/app/globals.css`) are.
To rebuild, resample `logo-mark-512.png` with LANCZOS; for the flat-colour
variants use the source's own alpha channel as a stencil so the silhouette
stays faithful rather than re-tracing it.

## Wiring these up

`stream/app/layout.tsx` currently points at the older `/favicon-*.png` and
`/logo-mark-192.png` at the public root. These files do not replace those —
nothing here is referenced by the app yet. Switching `metadata.icons` and
adding `openGraph.images` to this directory is a deliberate change, not
implied by the assets existing.

Also worth knowing: `viewport.themeColor` in that file is `#f7f9fc`, a
blue-grey that matches neither the page background (`--bg`, `#f7f5fa`) nor
the brand blue. Probably wants correcting whenever the icons are.
