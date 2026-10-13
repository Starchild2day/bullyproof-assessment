# The Bullyproof Quick Help Guides — build tools

Builds the searchable guide library served at `/guides/`.

- `build.py` turns the guide source files (kept privately in Marketing Secrets, never in this repo)
  into the public library pages in `/guides/` and the **encrypted** paid pages in
  `netlify/lib/qhg-content.enc.mjs`.
- Paid pages are decrypted at runtime with `QHG_CONTENT_KEY` (Netlify environment setting).
- Buyers get access after Stripe confirms payment (`/guides/unlock`, needs `STRIPE_SECRET_KEY`).
- `PREVIEW_KEY` lets the owner open every guide at `/guides/access/<PREVIEW_KEY>`.
- Guide 20 (crisis) is a free static page and never behind the paywall.
