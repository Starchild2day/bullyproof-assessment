// "I bought the guides but lost my link." Looks up the purchase by email.
// The link is only ever sent to the buyer's own inbox (through SwipeOne) — never shown here,
// so typing someone else's email can't unlock the guides.
import type { Config, Context } from "@netlify/functions";
import { store } from "../lib/qhg-access.mjs";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let email = "", lang = "en";
  try { const b = await req.json(); email = String(b.email || "").trim().toLowerCase(); lang = b.lang === "es" ? "es" : "en"; } catch {}
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ ok: false, reason: "email" }, { status: 400 });

  const token = (await store().get("email/" + email)) as string | null;
  const hook = Netlify.env.get("SWIPEONE_PURCHASE_WEBHOOK");
  if (token && hook) {
    const link = new URL("/guides/access/" + token, req.url).toString();
    await fetch(hook, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, tags: ["qhg-resend-link"], access_link: link, language: lang }) }).catch(() => {});
  }
  // Same answer either way, so this can't be used to check who bought.
  return Response.json({ ok: true, emailing: !!hook });
};

export const config: Config = { path: "/guides/api/restore", method: "POST" };
