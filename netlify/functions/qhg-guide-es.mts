// Serves a Spanish paid guide to buyers (one purchase opens both languages). Everyone else sees the
// guide's title and one-line question, plus the way to get the library. The free crisis guide and the
// library home are static pages, so preferStatic lets them bypass this function.
import type { Config, Context } from "@netlify/functions";
import { contentEs } from "../lib/qhg-content-es.mjs";
import { isValid, html } from "../lib/qhg-access.mjs";
import { priceLabel } from "../lib/qhg-price.mjs";

const esc = (s: string) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as any)[c]);

export default async (req: Request, context: Context) => {
  const slug = String(context.params.slug || "").replace(/\/$/, "");
  const { PAGES, TEASERS, SHELL } = contentEs();
  const page = (PAGES as Record<string, string>)[slug];
  const t = (TEASERS as Record<string, any>)[slug];
  if (!page || !t) return Response.redirect(new URL("/guides/es/", req.url).toString(), 302);
  if (await isValid(context.cookies.get("qhg_access"))) return html(page);

  const body = `<main class="wrap page"><nav class="crumb"><a href="/guides/es/">Todas las guías</a><span>›</span><span>${esc(t.section)}</span></nav>
<article class="guide"><header class="g-head"><p class="kicker">${esc(t.section)}</p><h1>${esc(t.title)}</h1>
${t.line ? `<p class="g-q">“${esc(t.line)}”</p>` : ""}</header>
<div class="locked"><div class="lk">
<h2>Esta guía es parte de Las Guías de Ayuda Rápida de Bullyproof</h2>
<p>Las 28 guías vienen juntas en una sola biblioteca: las palabras exactas para cada situación, lo que no conviene decir, y qué hacer esta noche y esta semana. En español y en inglés. Acceso inmediato en este teléfono o computadora. Sin cuenta, sin aplicación, sin contraseña.</p>
<p><a class="btn gold" href="/guides/es/#buy">Vea lo que incluye · ${priceLabel()}</a></p>
<p class="small">¿Ya compró las guías? <a href="/guides/es/restore/">Ábralas de nuevo aquí</a>.</p>
</div>
<p class="small" style="margin-top:18px">Si le preocupa que su hijo ya no quiera estar aquí, la guía para eso es gratis para todos los padres: <a href="/guides/es/my-child-doesnt-want-to-be-here-anymore/">Mi hijo o hija ya no quiere estar aquí</a>.</p>
</div></article></main>`;
  return html(
    SHELL.replace("__TITLE__", esc(t.title) + " · Las Guías de Ayuda Rápida de Bullyproof")
      .replace("__DESC__", esc(t.line || ""))
      .replace("__BODY__", body)
  );
};

export const config: Config = {
  path: ["/guides/es/:slug", "/guides/es/:slug/"],
  excludedPath: ["/guides/es/welcome", "/guides/es/welcome/", "/guides/es/restore", "/guides/es/restore/"],
  preferStatic: true,
};
