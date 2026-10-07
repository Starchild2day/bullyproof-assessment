// Netlify function — private visit counting (replaces Plausible; no extra service, no cookies).
//
// Each step a parent reaches (started, each question, completed, plan sent...) is saved as one tiny,
// anonymous record in Netlify Blobs store "counts": no email, no answers, no IP address.
// Download daily totals with leads-admin (?key=ADMIN_KEY&list=counts).
"use strict";

const { openStore } = require("../lib/records.js");

const EVENTS = new Set(["assessment_started", "question_answered_view", "question_answered", "safety_escalation_triggered",
  "assessment_completed", "plan_email_sent", "pdf_downloaded", "playbook_invite_optin"]);
const DEFAULT_ORIGINS = ["https://assessment.bullyproof.guide", "https://bullyproof-support-clarity-check.netlify.app", "https://shimmering-pegasus-4a4a21.netlify.app"];
const hits = new Map();
const ok = { statusCode: 204, headers: { "Cache-Control": "no-store" }, body: "" };

function allowed(origin) {
  const set = new Set(DEFAULT_ORIGINS);
  [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL].forEach((u) => u && set.add(u.replace(/\/$/, "")));
  (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean).forEach((o) => set.add(o));
  return set.has(origin);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "" };
  const h = {}; Object.entries(event.headers || {}).forEach(([k, v]) => { h[k.toLowerCase()] = v; });
  const origin = (h.origin || "").replace(/\/$/, "");
  if (!allowed(origin) || (event.body || "").length > 300) return { statusCode: 403, body: "" };

  let p; try { p = JSON.parse(event.body || "{}"); } catch (e) { return { statusCode: 400, body: "" }; }
  if (!EVENTS.has(p.e)) return { statusCode: 400, body: "" };
  const detail = typeof p.d === "string" && /^[a-zA-Z0-9_]{1,30}$/.test(p.d) ? p.d : "";

  // Light flood protection so counts can't be inflated (kept in memory, per running instance).
  const ip = h["x-nf-client-connection-ip"] || (h["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
  if (recent.length >= 300) return ok;
  recent.push(now); hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();

  const store = openStore(event, "counts");
  if (store) {
    const day = new Date().toISOString().slice(0, 10);
    try { await store.set(`${day}/${p.e}${detail ? ":" + detail : ""}/${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`, "1"); }
    catch (e) { console.error("Could not save a count:", e && e.message); }
  }
  return ok;
};

exports.__test = { hits };
