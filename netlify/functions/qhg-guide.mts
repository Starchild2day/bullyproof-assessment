// Serves a paid guide to buyers. Everyone else sees the guide's title and one-line
// question, plus the way to get the library. The free crisis guide is a static page,
// so preferStatic lets it bypass this function entirely.
import type { Config, Context } from "@netlify/functions";
import { content } from "../lib/qhg-content.mjs";
import { isValid, html } from "../lib/qhg-access.mjs";

const esc = (s: string) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as any)[c]);

export default async (req: Request, context: Context) => {
  const slug = String(context.params.slug || "").replace(/\/$/, "");
  const { PAGES, TEASERS, SHELL } = content();
  const page = (PAGES as Record<string, string>)[slug];
  const t = (TEASERS as Record<string, any>)[slug];
  if (!page || !t) {
    return Response.redirect(new URL("/guides/", req.url).toString(), 302);
  }
  if (await isValid(context.cookies.get("qhg_access"))) return html(page);

  const body = `<main class="wrap page"><nav class="crumb"><a href="/guides/">All guides</a><span>›</span><span>${esc(t.section)}</span></nav>
<article class="guide"><header class="g-head"><p class="kicker">${esc(t.section)}</p><h1>${esc(t.title)}</h1>
${t.line ? `<p class="g-q">“${esc(t.line)}”</p>` : ""}</header>
<div class="locked"><div class="lk">
<h2>This guide is part of The Bullyproof Quick Help Guides</h2>
<p>All 25 guides come together in one library: the exact words to say for each situation, what not to say, and what to do tonight and this week. Instant access on this phone or computer. No account, no app, no password.</p>
<p><a class="btn gold" href="/guides/#buy">See what's inside · $37</a></p>
<p class="small">Already bought the guides? <a href="/guides/restore/">Open them again here</a>.</p>
</div>
<p class="small" style="margin-top:18px">If you're worried your child may not want to be here anymore, the guide for that is free for every parent: <a href="/guides/my-child-doesnt-want-to-be-here-anymore/">My Child Doesn't Want to Be Here Anymore</a>.</p>
</div></article></main>`;
  return html(
    SHELL.replace("__TITLE__", esc(t.title) + " · The Bullyproof Quick Help Guides")
      .replace("__DESC__", esc(t.line || ""))
      .replace("__BODY__", body)
  );
};

export const config: Config = {
  path: ["/guides/:slug", "/guides/:slug/"],
  excludedPath: ["/guides/unlock", "/guides/unlock/", "/guides/assets/*"],
  preferStatic: true,
};
