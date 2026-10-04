// Netlify serverless function — emails a parent their personalized action plan.
//
// SECURITY MODEL (why it is built this way):
//  * The browser sends the parent's ANSWERS, never HTML. This function checks every answer against the
//    real question list and builds the email itself from our approved template. So the endpoint cannot be
//    used to send arbitrary content from our domain.
//  * Requests must come from our own site (Origin check), pass a hidden honeypot field, and — once
//    TURNSTILE_SECRET_KEY is set in Netlify — a Cloudflare Turnstile bot check.
//  * Per-visitor and per-recipient rate limits (per running instance; see note below).
//  * No parent email addresses or answers are ever written to the logs.
//
// ENVIRONMENT VARIABLES (Netlify > Site configuration > Environment variables):
//   RESEND_API_KEY         required
//   FROM_EMAIL             required for real parents, e.g.  Bullyproof.Guide <plans@bullyproof.guide>
//                          (bullyproof.guide must be VERIFIED in Resend first — Resend's shared test sender
//                          can only deliver to the Resend account owner's own address)
//   REPLY_TO               optional; defaults to CONTACT_EMAIL from config.js
//   ALLOWED_ORIGINS        optional, comma-separated extra sites allowed to call this function
//   TURNSTILE_SECRET_KEY   optional; when set, every request must carry a valid Turnstile token
//   ALERT_EMAIL            optional; where "⚠️ safety flag" alerts go (defaults to CONTACT_EMAIL in config.js)
//
// LEADS: every plan request is saved to Netlify Blobs (store "leads") — this replaced Formspree, so there
// is no monthly submission limit. When answers raise a safety flag, an alert email goes straight to
// ALERT_EMAIL through Resend. Download or delete records with the leads-admin function.
//
// NOTE on rate limits: they are kept in memory, so each warm function instance counts separately. That
// blocks casual abuse; for a hard limit also add a Netlify/Cloudflare rate-limiting rule on this path.
"use strict";

const { saveRecord, sendOrQueue, escapeHtml, alertAddress } = require("../lib/records.js");

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
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.error("RESEND_API_KEY is not set in this site's environment variables."); return respond(503, { error: "Email is not available right now." }); }
  if (!createPlanBuilder) { console.error("plan-bundle.js could not be loaded — did the build command run?", bundleError && bundleError.message); return respond(503, { error: "Email is not available right now." }); }
  let fromAddress = process.env.FROM_EMAIL;
  if (!fromAddress) {
    console.error("FROM_EMAIL is not set. Falling back to Resend's TEST sender, which can only deliver to the Resend account owner. Verify bullyproof.guide in Resend, then set FROM_EMAIL.");
    fromAddress = "Bullyproof.Guide <onboarding@resend.dev>";
  }

  // 8. Validate the answers, then build the email ourselves from the approved template.
  let builder;
  try { builder = createPlanBuilder(origin); } catch (err) { console.error("Could not start the plan builder:", err && err.message); return respond(500, { error: "Email is not available right now." }); }
  const answers = cleanAnswers(builder.QUESTIONS, payload.answers);
  if (!answers) return respond(400, { error: "We couldn't read those answers." });

  // The plan is built in the language the parent was using ("es" = Spanish); anything else is English.
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
  builder.state.marketingConsent = payload.marketingConsent === true;

  let html;
  try { html = builder.buildEmailHtml(); } catch (err) { console.error("Could not build the plan email:", err && err.message); return respond(500, { error: "Email is not available right now." }); }
  const flagged = builder.state.safetyFlags.length > 0;
  const subject = lang === "es"
    ? (flagged ? "Su Plan de Acción de Bullyproof.Guide (por favor, léalo)" : "Su Plan de Acción de Bullyproof.Guide")
    : (flagged ? "Your Bullyproof.Guide Action Plan (please read)" : "Your Bullyproof.Guide Action Plan");
  const replyTo = process.env.REPLY_TO || builder.CONFIG.CONTACT_EMAIL || undefined;

  // 9. Send the parent's plan. If today's email allowance is used up, it goes to the outbox and the
  //    scheduled send-queue job delivers it automatically as soon as the allowance resets.
  const delivery = await sendOrQueue(event, {
    to, subject, html,
    ...(replyTo ? { replyTo, headers: { "List-Unsubscribe": `<mailto:${replyTo}?subject=unsubscribe>` } } : {})
  }, 1, { kind: "plan" });
  const emailSent = delivery === "sent";

  // 10. Save the lead (always — even if the email failed, so no family is ever lost).
  const flags = builder.state.safetyFlags.slice();
  let summary = "";
  builder.setLang("en");   // the summary is for our own team, so it is always written in English
  try { summary = builder.buildReadableSummary(); } catch (e) { /* summary is optional */ }
  await saveRecord(event, "leads", {
    createdAt: new Date().toISOString(),
    email: to,
    lang,
    safetyFlags: flags,
    safetyResourcesAcknowledged: flags.length ? payload.safetyAcknowledged === true : null,
    consentGiven: payload.consentGiven === true,
    emailDelivered: delivery === "sent" ? true : (delivery === "queued" ? "queued" : false),
    answers,
    summary
  });

  // 11. Safety alert straight to Mark's inbox (does not depend on any form service).
  if (flags.length) {
    const alertTo = alertAddress(builder.CONFIG);
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;">
        <h2 style="color:#B23A48;margin:0 0 10px;">⚠️ Safety flag on a Parent Clarity Check</h2>
        <p><strong>Flags:</strong> ${escapeHtml(flags.join(", "))}<br>
        <strong>Parent saw and acknowledged the safety resources:</strong> ${payload.safetyAcknowledged === true ? "yes" : "no"}<br>
        <strong>Parent's plan email delivered:</strong> ${emailSent ? "yes" : (delivery === "queued" ? "queued — the daily email limit was reached, so it will go out automatically when it resets (the parent has their PDF)" : "NO — the parent may not have received their plan")}<br>
        <strong>Language of the plan:</strong> ${lang === "es" ? "Spanish (Español)" : "English"}<br>
        <strong>Parent's email:</strong> ${escapeHtml(to)} (reply to this message to write to them)</p>
        <pre style="white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;background:#F5F6F8;border-radius:8px;padding:14px;font-size:14px;line-height:1.5;">${escapeHtml(summary)}</pre>
      </div>`;
    await sendOrQueue(event, { to: alertTo, subject: "⚠️ Bullyproof Assessment — safety flag triggered", html, replyTo: to }, 0, { kind: "safety-alert" });
  }

  if (delivery === "sent") return respond(200, { success: true });
  if (delivery === "queued") return respond(202, { success: true, queued: true });
  return respond(502, { error: "We couldn't send the email." });
};

exports.__test = { hits };   // lets the test script reset the rate-limit counters
