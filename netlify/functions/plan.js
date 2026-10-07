// Netlify function — returns one saved plan for its private page (/plan/<ID>).
//
// The ID is 24 random characters (144 bits), so plans can't be guessed or listed. It returns only what
// the page needs to rebuild the plan (answers, safety flags, language, Playbook interest) — never the
// parent's email address. Plans stay available for 12 months, and "Delete my data" removes them.
"use strict";

const { openStore } = require("../lib/records.js");

const KEEP_DAYS = 365;
const ID_PATTERN = /^[A-Za-z0-9_-]{24}$/;
const hits = new Map();

const respond = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" },
  body: JSON.stringify(body)
});

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return respond(405, { error: "Method not allowed." });
  const id = String((event.queryStringParameters || {}).id || "");
  if (!ID_PATTERN.test(id)) return respond(404, { error: "not-found" });

  // Gentle per-visitor limit, so nobody can hammer the endpoint hunting for IDs.
  const headers = {};
  Object.entries(event.headers || {}).forEach(([k, v]) => { headers[k.toLowerCase()] = v; });
  const ip = headers["x-nf-client-connection-ip"] || (headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (recent.length >= 60) return respond(429, { error: "too-many" });
  recent.push(now); hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < 15 * 60 * 1000)) hits.delete(k);

  const store = openStore(event, "plans");
  if (!store) return respond(503, { error: "unavailable" });
  let plan = null;
  try { plan = await store.get(id, { type: "json" }); } catch (err) { console.error("Could not read a plan:", err && err.message); return respond(503, { error: "unavailable" }); }
  if (!plan) return respond(404, { error: "not-found" });
  if (now - Date.parse(plan.createdAt) > KEEP_DAYS * 24 * 60 * 60 * 1000) return respond(410, { error: "expired" });

  return respond(200, {
    answers: plan.answers || {},
    safetyFlags: Array.isArray(plan.safetyFlags) ? plan.safetyFlags : [],
    lang: plan.lang === "es" ? "es" : "en",
    marketingConsent: plan.marketingConsent === true,
    createdAt: plan.createdAt
  });
};

exports.__test = { hits };
