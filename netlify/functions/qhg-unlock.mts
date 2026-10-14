// After Stripe checkout, the buyer lands here with ?session_id=...
// We confirm with Stripe that the session is actually paid, then give this browser access
// and send the buyer to a page with their private library link.
import type { Config, Context } from "@netlify/functions";
import { store, newToken, grantCookies, html } from "../lib/qhg-access.mjs";

const page = (title: string, msg: string) =>
  html(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/guides/assets/library.css">
<main class="wrap"><div class="panel"><h1>${title}</h1><p>${msg}</p><p><a href="/guides/">Back to the guides</a></p></div></main>`, 400);

export default async (req: Request, context: Context) => {
  // The library remembers the reader's language (qhg_lang), so Spanish readers come back to Spanish pages.
  const lang = context.cookies.get("qhg_lang") === "es" ? "es" : "en";
  const id = new URL(req.url).searchParams.get("session_id") || "";
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) {
    return page("We couldn't find that purchase", "This link is missing its purchase details. If you just paid, please use the link from your checkout confirmation, or email mark@bullyproof.guide and we'll send your guides right away.");
  }
  const key = Netlify.env.get("STRIPE_SECRET_KEY");
  if (!key) return page("Almost there", "Payments are still being connected. Please email mark@bullyproof.guide and we'll send your guides right away.");

  const r = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(id), {
    headers: { Authorization: "Bearer " + key },
  });
  if (!r.ok) return page("We couldn't confirm that purchase", "Stripe didn't recognize this purchase. If you were charged, email mark@bullyproof.guide and we'll fix it the same day.");
  const s = await r.json();
  const paid = s.status === "complete" && (s.payment_status === "paid" || s.payment_status === "no_payment_required");
  if (!paid) return page("Your payment hasn't finished yet", "Stripe shows this checkout as not paid yet. If you completed payment, wait a minute and refresh this page.");

  const email = String(s.customer_details?.email || s.customer_email || "").toLowerCase();
  const db = store();
  let token = (await db.get("session/" + id)) as string | null;
  if (!token) {
    token = newToken();
    const rec = { email, session: id, created: new Date().toISOString(), amount: s.amount_total, mode: id.startsWith("cs_live") ? "live" : "test" };
    await db.setJSON("token/" + token, rec);
    await db.set("session/" + id, token);
    if (email) await db.set("email/" + email, token);

    // Optional: tell SwipeOne about the purchase (stops sales emails, sends the access link).
    const hook = Netlify.env.get("SWIPEONE_PURCHASE_WEBHOOK");
    if (hook && email) {
      const link = new URL("/guides/access/" + token, req.url).toString();
      context.waitUntil(fetch(hook, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, tags: ["qhg-purchased"], access_link: link, language: lang }) }).catch(() => {}));
    }
  }
  grantCookies(context, token);
  const welcome = lang === "es" ? "/guides/es/welcome/?k=" : "/guides/welcome/?k=";
  return new Response(null, { status: 302, headers: { Location: welcome + token, "cache-control": "no-store" } });
};

export const config: Config = { path: "/guides/unlock" };
