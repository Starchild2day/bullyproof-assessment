// TEMPORARY (Oct 2026): lets Claude read the English guide pages to translate them into Spanish.
// Locked by QHG_EXPORT_TOKEN (a long random value in Netlify's settings). Writes the page text to the
// site's private function logs and returns nothing. Removed as soon as the translation is done.
import type { Config, Context } from "@netlify/functions";
import { content } from "../lib/qhg-content.mjs";

export default async (req: Request, context: Context) => {
  const want = Netlify.env.get("QHG_EXPORT_TOKEN") || "";
  if (want.length < 32) return new Response("Not set", { status: 418 });
  if (context.params.token !== want) return new Response("Not found", { status: 403 });
  const slug = String(context.params.slug || "");
  const { PAGES } = content();
  const page = (PAGES as Record<string, string>)[slug];
  if (!page) return new Response("none", { status: 410 });
  const m = page.match(/<article class="guide">([\s\S]*?)<\/article>/);
  const body = (m ? m[1] : page).replace(/\n{2,}/g, "\n");
  const size = 1500, n = Math.ceil(body.length / size);
  for (let i = 0; i < n; i++) console.log(`XP|${slug}|${String(i + 1).padStart(3, "0")}/${n}|` + body.slice(i * size, (i + 1) * size));
  return new Response("logged " + n, { status: 200, headers: { "cache-control": "no-store" } });
};

export const config: Config = { path: "/guides/api/x-export/:token/:slug" };
