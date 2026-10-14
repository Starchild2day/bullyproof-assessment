// A buyer's private link: /access/<token>. Opening it on any device gives that device access.
import type { Config, Context } from "@netlify/functions";
import { isValid, grantCookies, html } from "../lib/qhg-access.mjs";

export default async (req: Request, context: Context) => {
  const token = String(context.params.token || "");
  if (!(await isValid(token))) {
    return html(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/guides/assets/library.css">
<main class="wrap"><div class="panel"><h1>That link didn't work</h1><p>It may have been copied only partly. Try opening it again from where you saved it, or <a href="/guides/restore/">get your guides again here</a>.</p></div></main>`, 404);
  }
  grantCookies(context, token);
  // ?lang=es (or the reader's saved language) opens the Spanish library
  const q = new URL(req.url).searchParams.get("lang");
  if (q === "es" || q === "en") context.cookies.set({ name: "qhg_lang", value: q, path: "/guides", maxAge: 34560000, sameSite: "Lax", secure: true });
  const es = q ? q === "es" : context.cookies.get("qhg_lang") === "es";
  const home = es ? "/guides/es/" : "/guides/";
  return new Response(null, { status: 302, headers: { Location: home, "cache-control": "no-store" } });
};

export const config: Config = { path: "/guides/access/:token" };
