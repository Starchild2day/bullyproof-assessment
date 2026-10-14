// Decrypts the paid guide pages at runtime. The repo only ever holds the encrypted copy;
// the key (QHG_CONTENT_KEY) lives in Netlify's environment settings, never in the code.
import { createDecipheriv } from "node:crypto";
import { merged } from "./qhg-content-add.mjs";
import { BLOB } from "./qhg-content.enc.mjs";

let cache = null;
export function content() {
  if (cache) return cache;
  const key = Buffer.from(Netlify.env.get("QHG_CONTENT_KEY") || "", "hex");
  if (key.length !== 32) throw new Error("QHG_CONTENT_KEY is missing");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(BLOB.iv, "base64"));
  d.setAuthTag(Buffer.from(BLOB.tag, "base64"));
  const plain = Buffer.concat([d.update(Buffer.from(BLOB.data, "base64")), d.final()]).toString("utf8");
  cache = merged(JSON.parse(plain), "en");
  return cache;
}
