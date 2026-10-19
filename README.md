# Golden Pro — Female Training Camp

Static site inspired by the scroll/fade layout of idoportal.com.

- Edit text in `src/partials/*.html` and `src/pages/*.html`.
- **Camp dates, contact details and the Google Form link** live in `src/data/site.json` — edit that file (even on github.com) and the site redeploys.
- Build locally: `node build.js` → `dist/`.
- Re-process photos (sepia tone, crops, logo cut-out): `python tools/process_images.py` (needs Pillow). Originals are in `assets/raw/`.

## Connecting the Google Form
1. Create the form with the same questions as `src/pages/apply.html`.
2. Put its share link in `apply.googleFormUrl`.
3. For in-page submission, set `apply.googleFormAction` to `https://docs.google.com/forms/d/e/<FORM_ID>/formResponse` and fill each `entries` value with the matching `entry.123456` id (from "Get pre-filled link").
