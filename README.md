# Golden Pro — Female Training Camp

Static site inspired by the scroll/fade layout of idoportal.com.

- Edit text in `src/partials/*.html` and `src/pages/*.html`.
- **Camp dates, contact details and the Google Form link** live in `src/data/site.json` — edit that file (even on github.com) and the site redeploys.
- Build locally: `node build.js` → `dist/`.
- **Photos** live in `src/photos/` (one folder per page, files named by spot). Swap a photo by replacing the file with another one of the same name; carousels (`.../carousel/`) take one slide per file, sorted by name. Read `src/photos/READ ME - which photo goes where.txt` first. `node build.js` checks the photos (missing/HEIC/duplicate/not 3:2) and writes their sizes and cache-busting `?v=` into the pages. On deploy, the GitHub Action shrinks the published copies (max 2400 px, no GPS/EXIF) with `tools/optimize_photos.py`; the originals are never changed.
- Logo files only: `python tools/process_images.py --logo assets/raw/logo.png` (needs Pillow). It no longer touches photos.

## Swapping the logo
1. Put the new logo at `assets/raw/logo.png` (a transparent PNG is best; a JPG on white also works). Optionally add `assets/raw/logo-light.png` for dark backgrounds; otherwise one is made by recolouring the dark wine wordmark to gold.
2. Run `python tools/process_images.py --logo assets/raw/logo.png`. This writes `logo.png`, `logo-light.png`, `emblem.png` (the diamond only, cut at the gap above the wordmark; use `--emblem-cut 0.62` if there is no gap), `favicon.png` and `favicon-32.png`.
3. If the pixel size changed, update the `width`/`height` on the logo/emblem `<img>` tags (`grep -rn 'logo\|emblem' src`), then `node build.js`.

## Connecting the Google Form
1. Create the form with the same questions as `src/pages/apply.html`.
2. Put its share link in `apply.googleFormUrl`.
3. For in-page submission, set `apply.googleFormAction` to `https://docs.google.com/forms/d/e/<FORM_ID>/formResponse` and fill each `entries` value with the matching `entry.123456` id (from "Get pre-filled link").
