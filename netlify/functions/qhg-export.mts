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
  // One log line per request: the whole page, or one numbered piece of it (?part=N, size ?size=).
  const u = new URL(req.url);
  const size = Number(u.searchParams.get("size") || 1000000), part = Number(u.searchParams.get("part") || 1);
  const n = Math.ceil(body.length / size);
  console.log(`XP|${slug}|${part}/${n}|` + body.slice((part - 1) * size, part * size));
  return new Response("logged " + n, { status: 200, headers: { "cache-control": "no-store" } });
};

export const config: Config = { path: "/guides/api/x-export/:token/:slug" };
