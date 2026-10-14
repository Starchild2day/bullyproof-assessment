// TEMPORARY (Oct 2026): lets Claude read the English guide pages to translate them into Spanish.
// Locked by QHG_EXPORT_TOKEN (a long random value in Netlify's settings). Writes the page text to the
// site's private function logs and returns nothing. Removed as soon as the translation is done.
import type { Config } from "@netlify/functions";
import { content } from "../lib/qhg-content.mjs";

export default async (req: Request) => {
  const u = new URL(req.url);
  const want = Netlify.env.get("QHG_EXPORT_TOKEN") || "";
  if (want.length < 32 || u.searchParams.get("t") !== want) return new Response("Not found", { status: 404 });
  const slug = u.searchParams.get("slug") || "";
  const { PAGES } = content();
  const page = (PAGES as Record<string, string>)[slug];
  if (!page) return new Response("none", { status: 404 });
  const m = page.match(/<article class="guide">([\s\S]*?)<\/article>/);
  const body = (m ? m[1] : page).replace(/\n{2,}/g, "\n");
  const size = 1500, n = Math.ceil(body.length / size);
  for (let i = 0; i < n; i++) console.log(`XP|${slug}|${String(i + 1).padStart(3, "0")}/${n}|` + body.slice(i * size, (i + 1) * size));
  return new Response("logged " + n, { status: 200, headers: { "cache-control": "no-store" } });
};

export const config: Config = { path: "/guides/api/x-export" };
