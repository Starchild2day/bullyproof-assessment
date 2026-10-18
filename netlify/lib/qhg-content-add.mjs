// Decrypts the guides added after the first 25 (Guide 26 onward), English and Spanish, built by
// tools/qhg/build_add.py. The key (QHG_CONTENT_KEY_ADD) lives in Netlify's environment settings.
// If the key is missing, the first 25 keep working and the new guides simply don't appear.
import { createDecipheriv } from "node:crypto";
import { BLOB } from "./qhg-content-add.enc.mjs";

let cache = null;
export function contentAdd() {
  if (cache) return cache;
  try {
    const key = Buffer.from(Netlify.env.get("QHG_CONTENT_KEY_ADD") || "", "hex");
    if (key.length !== 32) throw new Error("QHG_CONTENT_KEY_ADD is missing");
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(BLOB.iv, "base64"));
    d.setAuthTag(Buffer.from(BLOB.tag, "base64"));
    cache = JSON.parse(Buffer.concat([d.update(Buffer.from(BLOB.data, "base64")), d.final()]).toString("utf8"));
  } catch (e) {
    console.log("added guides unavailable:", e.message);
    return { en: { PAGES: {}, TEASERS: {} }, es: { PAGES: {}, TEASERS: {} } };
  }
  return cache;
}

// One library: the first 25 plus the added guides.
// Wording repairs (exact replacements per guide) and the "don't wait" safety line at the end of every
// Quick Help travel inside the encrypted bundle, so they cost nothing if the key is missing.
const DW_CSS = '<style>.dont-wait{margin:18px 0 4px;padding:12px 14px;border-left:4px solid #c0392b;background:#fdf1ef;border-radius:8px}</style>';

export function repaired(page, slug, add) {
  if (typeof page !== "string") return page;
  let out = page;
  for (const [a, b, c] of (add.PATCHES || {})[slug] || []) {
    if (a === "@@CUT") {
      // remove everything from marker b up to (not including) marker c
      const i = out.indexOf(b), j = i > -1 ? out.indexOf(c, i) : -1;
      if (j > -1) out = out.slice(0, i) + out.slice(j);
      else console.log("guide cut not applied:", slug);
      continue;
    }
    if (out.includes(a)) out = out.split(a).join(b);
    else console.log("guide repair not applied:", slug, a.slice(0, 60));
  }
  if (add.DONT_WAIT && !out.includes('class="dont-wait"')) {
    const q = out.indexOf('<section class="quick"');
    const end = q > -1 ? out.indexOf("</section>", q) : -1;
    if (end > -1) {
      out = out.slice(0, end) + add.DONT_WAIT + out.slice(end);
      out = out.replace("</head>", DW_CSS + "</head>");
    }
  }
  return out;
}

export function merged(base, lang) {
  const add = contentAdd()[lang] || { PAGES: {}, TEASERS: {} };
  const all = { ...base.PAGES, ...add.PAGES };
  const PAGES = {};
  for (const [slug, page] of Object.entries(all)) PAGES[slug] = repaired(page, slug, add);
  return { ...base, PAGES, TEASERS: { ...base.TEASERS, ...add.TEASERS } };
}
