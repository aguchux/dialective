# Dialect Library Discourse theme

Makes `community.dialectlibrary.com` (self-hosted Discourse, see
`k8s/overlays/prod/README.md`'s "Community (Discourse)" section) match the
main app's look: Inter font, the same purple accent (`#6a18a8` light /
`#a866e0` dark) and neutral palette as `frontend/app/globals.css`, plus
rounded-lg cards/buttons and a flat hairline-bordered header instead of
Discourse's stock shadowed look.

## Install (one-time, per Discourse instance)

Discourse pulls themes straight from a git repo/subdirectory instead of a
manual paste-into-admin-panel step, so this stays versioned and
reproducible:

1. Push this repo (already the case — nothing extra to do).
2. In Discourse: **Admin → Customize → Themes → Install → From a git
   repository**.
   - Repository URL: this repo's URL (e.g.
     `https://github.com/<org>/dialective.git`)
   - Subfolder: `discourse-theme`
3. After install, open the theme and set it as the **default theme** (or a
   selectable one, if you want it opt-in) so anonymous/logged-out visitors
   get it too.
4. Under **Admin → Customize → Colors**, the two color schemes this theme
   ships — "Dialect Library Light" / "Dialect Library Dark" — become
   selectable; set Light as the site default and Dark as the
   `dark_scheme` (Admin → Settings → search "dark scheme") so Discourse's
   own light/dark toggle follows the same palette the main app uses.

## Update

Edit files here, commit, push to `main`, then in Discourse: **Admin →
Customize → Themes → (this theme) → Update from remote**. There is no
build step and no k8s redeploy — Discourse pulls and compiles the SCSS
itself.

## Why colors live in `about.json`, not `common.scss`

Discourse's own CSS already references `--primary`/`--secondary`/
`--tertiary`/etc. everywhere (buttons, links, badges, category colors) —
defining the palette once as a **color scheme** in `about.json` reskins
all of that automatically. `common.scss` only adds structural changes
(font, border-radius, header treatment) on top; it deliberately avoids
hardcoding hex values so the two color schemes (light/dark) stay the only
source of truth for color, mirroring how `frontend/app/globals.css`
drives color entirely through CSS custom properties rather than literals
scattered through component files.
