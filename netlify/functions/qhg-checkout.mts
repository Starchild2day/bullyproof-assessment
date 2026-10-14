// The buy button lands here. We open a Stripe Checkout for the Quick Help Guides at today's price
// ($37 Founding Family price through Dec 31, 2026; $47 from Jan 1, 2027), so the price changes on
// its own, with nothing to edit in Stripe. The purchase is tagged so only this product unlocks the guides.
import type { Config, Context } from "@netlify/functions";
import { html } from "../lib/qhg-access.mjs";
import { priceCents, isFounding } from "../lib/qhg-price.mjs";

const soon = (es: boolean) =>
  html(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/guides/assets/library.css">
<main class="wrap"><div class="panel"><h1>${es ? "El pago abre muy pronto" : "Checkout opens very soon"}</h1>
<p>${es ? "Estamos terminando de conectar los pagos. Vuelva a intentarlo en un rato." : "We're finishing the payment setup. Please try again a little later."}</p>
<p><a href="${es ? "/guides/es/" : "/guides/"}">${es ? "Volver a las guías" : "Back to the guides"}</a></p></div></main>`, 503);

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("lang");
  const es = q ? q === "es" : context.cookies.get("qhg_lang") === "es";
  const key = Netlify.env.get("STRIPE_SECRET_KEY");
  if (!key) return soon(es);

  const origin = url.origin;
  const founding = isFounding();
  const f = new URLSearchParams();
  f.set("mode", "payment");
  f.set("line_items[0][quantity]", "1");
  f.set("line_items[0][price_data][currency]", "usd");
  f.set("line_items[0][price_data][unit_amount]", String(priceCents()));
  f.set("line_items[0][price_data][product_data][name]", es ? "Las Guías de Ayuda Rápida de Bullyproof" : "The Bullyproof Quick Help Guides");
  f.set("line_items[0][price_data][product_data][description]",
    es ? (founding ? "Precio de Familia Fundadora. Todas las guías, en español y en inglés, para siempre, más cada guía nueva gratis."
                   : "Todas las guías, en español y en inglés, para siempre.")
       : (founding ? "Founding Family price. Every guide, in English and Spanish, yours to keep, plus every new guide free."
                   : "Every guide, in English and Spanish, yours to keep."));
  f.set("success_url", origin + "/guides/unlock?session_id={CHECKOUT_SESSION_ID}");
  f.set("cancel_url", origin + (es ? "/guides/es/#buy" : "/guides/#buy"));
  f.set("locale", es ? "es" : "en");
  f.set("metadata[product]", "qhg");
  f.set("metadata[lang]", es ? "es" : "en");
  f.set("metadata[tier]", founding ? "founding" : "regular");
  f.set("payment_intent_data[metadata][product]", "qhg");
  f.set("payment_intent_data[metadata][tier]", founding ? "founding" : "regular");

  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "content-type": "application/x-www-form-urlencoded" },
    body: f.toString(),
  });
  if (!r.ok) { console.log("checkout create failed", r.status); return soon(es); }
  const s = await r.json();
  return new Response(null, { status: 303, headers: { Location: s.url, "cache-control": "no-store" } });
};

export const config: Config = { path: "/guides/buy" };
