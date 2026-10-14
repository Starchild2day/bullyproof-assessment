# The Bullyproof Quick Help Guides — build tools

Builds the searchable guide library served at `/guides/`.

- `build.py` turns the guide source files (kept privately in Marketing Secrets, never in this repo)
  into the public library pages in `/guides/` and the **encrypted** paid pages in
  `netlify/lib/qhg-content.enc.mjs`.
- Paid pages are decrypted at runtime with `QHG_CONTENT_KEY` (Netlify environment setting).
- Buyers get access after Stripe confirms payment (`/guides/unlock`, needs `STRIPE_SECRET_KEY`).
- `PREVIEW_KEY` lets the owner open every guide at `/guides/access/<PREVIEW_KEY>`.
- Guide 20 (crisis) is a free static page and never behind the paywall.

## Guides added after the first 25 (Guide 26 onward)

- `build_add.py` adds new guides (English and Spanish) without rebuilding the first 25. Their pages are
  encrypted into `netlify/lib/qhg-content-add.enc.mjs` with `QHG_CONTENT_KEY_ADD` (Netlify setting), and
  `qhg-content.mjs` / `qhg-content-es.mjs` merge them in, so buyers see one library.
- It also adds the guides to both search indexes and to the "Find your situation" lists on both home pages.
  Sources (`guide-26.md` … and `es/guide-26.md` …) stay private, outside the repo.
- If `build.py` or `build_es.py` is ever run again, run `build_add.py` afterwards so 26–28 stay listed.
