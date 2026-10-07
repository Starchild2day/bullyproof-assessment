// Netlify function — saves a "Reserve my copy" Playbook reservation (replaces Formspree).
//
// Saves the reservation to Netlify Blobs (store "reservations") and tells SwipeOne (bullyproof.support
// workspace) with the tag "playbook-reserved", so the reservation list lives there too. Only our own site
// may call it; honeypot + simple rate limit.
"use strict";

const { saveRecord, deliverOrQueue } = require("../lib/records.js");
let CONFIG = {};
let makePlanBundle = null;
try { makePlanBundle = require("../lib/plan-bundle.js"); CONFIG = makePlanBundle("https://bullyproof.guide").CONFIG || {}; } catch (e) { /* defaults below */ }
const ENGLISH_CONSENT = "Yes, please send me the invitation to try the Bullyproof Parent Playbook, plus occasional updates. I can unsubscribe any time.";
// Store the exact wording the parent saw (English or Spanish), so the consent record is accurate.
function consentWording(lang) {
  if (lang !== "es" || !makePlanBundle) return ENGLISH_CONSENT;
  try { const b = makePlanBundle("https://bullyproof.guide"); b.setLang("es"); return b.PLAYBOOK_INVITE_LABEL(); } catch (e) { return ENGLISH_CONSENT; }
}

const DEFAULT_ORIGINS = ["https://assessment.bullyproof.guide", "https://shimmering-pegasus-4a4a21.netlify.app"];
const hits = new Map();
const respond = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) });

function allowedOrigins() {
  const set = new Set(DEFAULT_ORIGINS);
  [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL].forEach((u) => u && set.add(u.replace(/\/$/, "")));
  (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean).forEach((o) => set.add(o));
  return set;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return respond(405, { error: "Method not allowed." });
  const headers = {};
  Object.entries(event.headers || {}).forEach(([k, v]) => { headers[k.toLowerCase()] = v; });
  let origin = (headers.origin || "").replace(/\/$/, "");
  if (!origin && headers.referer) { try { origin = new URL(headers.referer).origin; } catch (e) { /* ignore */ } }
  if (!origin || !allowedOrigins().has(origin)) return respond(403, { error: "Not allowed." });
  if ((event.body || "").length > 2000) return respond(413, { error: "Request too large." });

  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch (e) { return respond(400, { error: "Invalid request." }); }
  if (typeof payload.website === "string" && payload.website.trim() !== "") return respond(200, { success: true });

  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  if (!email || email.length > 254 || /[\s,;<>"]/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return respond(400, { error: "Please check the email address." });
  if (payload.consent !== true) return respond(400, { error: "Please tick the box to reserve your copy." });

  const ip = headers["x-nf-client-connection-ip"] || (headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (recent.length >= 5) return respond(429, { error: "Too many requests. Please try again in a few minutes." });
  recent.push(now); hits.set(ip, recent);

  const lang = payload.lang === "es" ? "es" : "en";
  const createdAt = new Date().toISOString();
  const saved = await saveRecord(event, "reservations", {
    createdAt,
    email,
    consent: consentWording(lang),
    lang,
    source: "Playbook reserve page"
  });
  const told = await deliverOrQueue(event, {
    event: "playbook_reserved",
    email,
    tags: ["playbook-reserved"],
    tags_text: "playbook-reserved",
    language: lang,
    playbook_interest: "yes",
    source: "Playbook reserve page",
    submitted_at: createdAt
  }, 2, { kind: "reservation" });
  return (saved || told !== "failed") ? respond(200, { success: true }) : respond(503, { error: "We couldn't save that just now." });
};

exports.__test = { hits };
