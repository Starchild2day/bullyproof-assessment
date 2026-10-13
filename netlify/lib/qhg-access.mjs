// Shared access helpers for the Quick Help Guides.
import { getStore } from "@netlify/blobs";

export const store = () => getStore({ name: "qhg-access", consistency: "strong" });
const YEAR = 60 * 60 * 24 * 400;

export function newToken() {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

// A token is valid if it's the owner preview key, or a stored buyer token.
export async function isValid(token) {
  if (!token || !/^[a-f0-9]{24,64}$/.test(token)) return false;
  const preview = Netlify.env.get("PREVIEW_KEY");
  if (preview && token === preview) return true;
  const rec = await store().get("token/" + token, { type: "json" });
  return !!(rec && !rec.revoked);
}

export function grantCookies(context, token) {
  const base = { path: "/guides", secure: true, sameSite: "Lax", maxAge: YEAR };
  context.cookies.set({ ...base, name: "qhg_access", value: token, httpOnly: true });
  context.cookies.set({ ...base, name: "qhg_has", value: "1", httpOnly: false });
}

export function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" },
  });
}
