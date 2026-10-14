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
export function merged(base, lang) {
  const add = contentAdd()[lang] || { PAGES: {}, TEASERS: {} };
  return { ...base, PAGES: { ...base.PAGES, ...add.PAGES }, TEASERS: { ...base.TEASERS, ...add.TEASERS } };
}
