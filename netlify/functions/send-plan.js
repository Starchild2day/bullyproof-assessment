// Netlify serverless function — saves a parent's personalized action plan and hands it to SwipeOne,
// which emails the parent a private link to it.
//
// SECURITY MODEL (why it is built this way):
//  * The browser sends the parent's ANSWERS, never HTML. This function checks every answer against the
//    real question list, so nothing arbitrary can be stored or sent from our site.
//  * Requests must come from our own site (Origin check), pass a hidden honeypot field, and — once
//    TURNSTILE_SECRET_KEY is set in Netlify — a Cloudflare Turnstile bot check.
//  * Per-visitor and per-recipient rate limits (per running instance; see note below).
//  * No parent email addresses or answers are ever written to the logs.
//
// HOW A PLAN TRAVELS:
//  1. The plan (answers + language) is saved under a long random ID in Netlify Blobs (store "plans").
//     Its private page is  <our site>/plan/<ID>  — the same plan as the screen
//     and the PDF, rebuilt from the answers by the same code, with a "Download PDF" button.
//  2. SwipeOne (bullyproof.support workspace) gets a webhook with ONLY: email, tags, language and that
//     link. Its automations send "your plan is ready", the safety alert to Mark (plan-safety), and the
//     Quick Help Guides follow-ups (plan-standard + the matched guide-NN tag). Answers never leave our storage.
//  3. If SwipeOne can't be reached, the webhook waits in the outbox and is retried every hour.
//
// ENVIRONMENT VARIABLES (Netlify > Site configuration > Environment variables):
//   SWIPEONE_WEBHOOK_URL   required — SwipeOne > bullyproof.support workspace > incoming webhook
//   ALLOWED_ORIGINS        optional, comma-separated extra sites allowed to call this function
//   TURNSTILE_SECRET_KEY   optional; when set, every request must carry a valid Turnstile token
//   PUBLIC_SITE_URL        optional; the address used in plan links (default: the site the parent is on)
//
// NOTE on rate limits: they are kept in memory, so each warm function instance counts separately. That
// blocks casual abuse; for a hard limit also add a Netlify/Cloudflare rate-limiting rule on this path.
"use strict";

const crypto = require("crypto");
const { saveRecord, deliverOrQueue } = require("../lib/records.js");

let createPlanBuilder = null;
let bundleError = null;
try { createPlanBuilder = require("../lib/plan-bundle.js"); } catch (err) { bundleError = err; }

const DEFAULT_ORIGINS = ["https://assessment.bullyproof.guide", "https://shimmering-pegasus-4a4a21.netlify.app"];
const IP_LIMIT = { max: 5, windowMs: 15 * 60 * 1000 };
const RECIPIENT_LIMIT = { max: 3, windowMs: 24 * 60 * 60 * 1000 };
const hits = { ip: new Map(), recipient: new Map() };

function tooMany(map, key, cfg, now) {
  const recent = (map.get(key) || []).filter((t) => now - t < cfg.windowMs);
  if (recent.length >= cfg.max) { map.set(key, recent); return true; }
  recent.push(now); map.set(key, recent);
  if (map.size > 5000) for (const [k, v] of map) if (!v.some((t) => now - t < cfg.windowMs)) map.delete(k);
  return false;
}

const respond = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) });

function allowedOrigins() {
  const set = new Set(DEFAULT_ORIGINS);
  [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL].forEach((u) => u && set.add(u.replace(/\/$/, "")));
  (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean).forEach((o) => set.add(o));
  return set;
}

function requestOrigin(headers) {
  const origin = headers.origin;
  if (origin) return origin.replace(/\/$/, "");
  if (headers.referer) { try { return new URL(headers.referer).origin; } catch (e) { /* ignore */ } }
  return "";
}

// Keep only answers that match the real questions; anything else rejects the whole request.
function cleanAnswers(QUESTIONS, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out = {};
  for (const q of QUESTIONS) {
    const v = raw[q.id];
    if (v === undefined || v === null || v === "") continue;
    if (q.type === "text") {
      if (typeof v !== "string") return null;
      out[q.id] = v.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 2000);
      continue;
    }
    const allowed = new Set([...(q.options || []), ...(q.preventExtra || []), ...Object.values(q.preventReplace || {})]);
    if (q.type === "choice") {
      if (typeof v !== "string" || !allowed.has(v)) return null;
      out[q.id] = v;
    } else if (q.type === "multi") {
      if (!Array.isArray(v) || v.length > 20 || v.some((x) => typeof x !== "string" || !allowed.has(x))) return null;
      out[q.id] = [...new Set(v)];
    }
  }
  return out.q1 && out.q2 ? out : null;   // a plan needs at least the child's age and what brought them here
}

async function verifyTurnstile(token, ip) {
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip || "" }).toString()
    });
    const json = await res.json();
    return !!json.success;
  } catch (err) { return false; }
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return respond(405, { error: "Method not allowed." });
  const headers = {};
  Object.entries(event.headers || {}).forEach(([k, v]) => { headers[k.toLowerCase()] = v; });

  // 1. Only our own site may call this.
  const origin = requestOrigin(headers);
  if (!origin || !allowedOrigins().has(origin)) return respond(403, { error: "Not allowed." });

  // 2. Shape and size of the request.
  if (!/application\/json/i.test(headers["content-type"] || "")) return respond(415, { error: "Unsupported request." });
  if ((event.body || "").length > 30000) return respond(413, { error: "Request too large." });
  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch (err) { return respond(400, { error: "Invalid request." }); }

  // 3. Hidden honeypot: real people never fill it. Pretend success so bots learn nothing.
  if (typeof payload.website === "string" && payload.website.trim() !== "") return respond(200, { success: true });

  // 4. Recipient: exactly one plain address.
  const to = typeof payload.to === "string" ? payload.to.trim() : "";
  if (!to || to.length > 254 || /[\s,;<>"]/.test(to) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return respond(400, { error: "Please check the email address." });

  // 5. Bot check (only once TURNSTILE_SECRET_KEY is configured).
  const ip = headers["x-nf-client-connection-ip"] || (headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (process.env.TURNSTILE_SECRET_KEY) {
    if (typeof payload.turnstileToken !== "string" || !payload.turnstileToken || !(await verifyTurnstile(payload.turnstileToken, ip))) {
      return respond(400, { error: "Please complete the quick check and try again." });
    }
  }

  // 6. Rate limits.
  const now = Date.now();
  if (tooMany(hits.ip, ip, IP_LIMIT, now) || tooMany(hits.recipient, to.toLowerCase(), RECIPIENT_LIMIT, now)) {
    return respond(429, { error: "Too many requests. Please wait a few minutes and try again." });
  }

  // 7. Service configuration.
  if (!createPlanBuilder) { console.error("plan-bundle.js could not be loaded — did the build command run?", bundleError && bundleError.message); return respond(503, { error: "Email is not available right now." }); }

  // 8. Validate the answers and work out the safety flags with the same code the browser uses.
  let builder;
  try { builder = createPlanBuilder(origin); } catch (err) { console.error("Could not start the plan builder:", err && err.message); return respond(500, { error: "Email is not available right now." }); }
  const answers = cleanAnswers(builder.QUESTIONS, payload.answers);
  if (!answers) return respond(400, { error: "We couldn't read those answers." });

  // The plan is shown in the language the parent was using ("es" = Spanish); anything else is English.
  const lang = payload.lang === "es" ? "es" : "en";
  builder.setLang(lang);
  builder.state.answers = answers;
  builder.state.safetyFlags = [];
  for (const q of builder.QUESTIONS) {
    const v = answers[q.id];
    if (v === undefined) continue;
    if (q.type === "text") builder.checkTextSafety(v); else builder.checkSafety(q, v);
  }
  // Keep flags the browser already raised (e.g. a box that was ticked and later unticked), known keys only.
  (Array.isArray(payload.safetyFlags) ? payload.safetyFlags : []).forEach((k) => {
    if (typeof k === "string" && builder.SAFETY_VARIANTS[k] && !builder.state.safetyFlags.includes(k)) builder.state.safetyFlags.push(k);
  });
  const marketingConsent = payload.marketingConsent === true;
  builder.state.marketingConsent = marketingConsent;
  const flags = builder.state.safetyFlags.slice();
  const flagged = flags.length > 0;
  const guide = flagged ? "" : builder.quickHelpGuide();   // safety-flagged parents never get the sales follow-ups

  // 9. Save the plan under a long random ID (144 bits — can't be guessed). This IS the parent's plan page.
  const planId = crypto.randomBytes(18).toString("base64url");
  const createdAt = new Date().toISOString();
  const planSaved = await saveRecord(event, "plans", { createdAt, email: to, lang, answers, safetyFlags: flags, marketingConsent }, planId);
  // The link uses the address the parent is on (already checked against our own sites above), so it always
  // works — even before assessment.bullyproof.guide points at Netlify. PUBLIC_SITE_URL overrides it.
  const site = (process.env.PUBLIC_SITE_URL || origin).replace(/\/$/, "");
  const planUrl = `${site}/plan/${planId}`;

  // 10. Hand it to SwipeOne (or queue it for the hourly retry). No answers — only what the emails need.
  let delivery = "failed";
  if (planSaved) {
    const planType = flagged ? "plan-safety" : "plan-standard";
    const tags = [planType].concat(guide ? [guide] : []).concat(marketingConsent ? ["playbook-interest"] : []);
    delivery = await deliverOrQueue(event, {
      event: "plan_created",
      email: to,
      plan_type: planType,
      guide,
      tags,
      tags_text: tags.join(", "),
      plan_link: planUrl,
      language: lang,
      playbook_interest: marketingConsent ? "yes" : "no",
      source: "Parent Clarity Check",
      submitted_at: createdAt
    }, flagged ? 0 : 1, { kind: flagged ? "plan-safety" : "plan" });
  }

  // 11. Save the lead for Mark's records (always — even if something failed, so no family is ever lost).
  let summary = "";
  builder.setLang("en");   // the summary is for our own team, so it is always written in English
  try { summary = builder.buildReadableSummary(); } catch (e) { /* summary is optional */ }
  await saveRecord(event, "leads", {
    createdAt,
    email: to,
    lang,
    planId: planSaved ? planId : "",
    guide,
    safetyFlags: flags,
    safetyResourcesAcknowledged: flagged ? payload.safetyAcknowledged === true : null,
    consentGiven: payload.consentGiven === true,
    marketingConsent,
    emailDelivered: delivery === "sent" ? true : (delivery === "queued" ? "queued" : false),
    answers,
    summary
  });

  if (delivery === "sent") return respond(200, { success: true, planUrl });
  if (delivery === "queued") return respond(202, { success: true, queued: true, planUrl });
  return respond(502, { error: "We couldn't send the email." });
};

exports.__test = { hits };   // lets the test script reset the rate-limit counters
