// Shared helpers for the Netlify functions: saving records to Netlify Blobs (Netlify's built-in storage)
// and sending email through Resend. Replaces Formspree entirely — no monthly submission ceiling.
"use strict";

let blobs = null;
try { blobs = require("@netlify/blobs"); } catch (err) { /* only missing in local tests */ }

// Open a named store. Returns null (and the caller carries on) if storage isn't available,
// so a storage hiccup can never stop a parent from getting their plan.
function openStore(event, name) {
  if (!blobs) return null;
  try {
    if (event && event.blobs) blobs.connectLambda(event);
    return blobs.getStore(name);
  } catch (err) {
    console.error(`Storage "${name}" is not available:`, err && err.message);
    return null;
  }
}

function newKey() {
  return `${new Date().toISOString()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function saveRecord(event, storeName, record) {
  const store = openStore(event, storeName);
  if (!store) return false;
  try { await store.setJSON(newKey(), record); return true; }
  catch (err) { console.error(`Could not save to "${storeName}":`, err && err.message); return false; }
}

const escapeHtml = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function fromAddress() {
  return process.env.FROM_EMAIL || "Bullyproof.Guide <onboarding@resend.dev>";
}

// Where alerts and new-reservation notices go: ALERT_EMAIL if set, otherwise the contact email.
function alertAddress(config) {
  return process.env.ALERT_EMAIL || (config && config.CONTACT_EMAIL) || "";
}

// Resend's "you've used today's (or this month's) allowance" answer. Those emails go to the outbox
// and are sent automatically later; anything else is a real failure.
function isQuotaError(status, body) {
  const name = String((body && (body.name || body.code)) || "").toLowerCase();
  const msg = String((body && body.message) || "").toLowerCase();
  return status === 429 && (name.includes("quota") || msg.includes("quota") || msg.includes("limit"));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Send one email through Resend. Returns { ok, quota } — quota=true means "over the plan's
// allowance right now", so the caller should queue it rather than give up.
async function sendEmailResult({ to, subject, html, replyTo, headers }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return { ok: false, quota: false };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromAddress(), to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}), ...(headers ? { headers } : {}) })
      });
      if (res.ok) return { ok: true, quota: false };
      let body = {}; try { body = await res.json(); } catch (e) { /* ignore */ }
      if (isQuotaError(res.status, body)) return { ok: false, quota: true };
      if (res.status === 429 && attempt === 0) { await sleep(1100); continue; }   // brief speed limit: try once more
      console.error("Resend rejected an email:", res.status, JSON.stringify(body));
      return { ok: false, quota: res.status === 429 };
    } catch (err) {
      console.error("Could not reach Resend:", err && err.message);
      return { ok: false, quota: false };
    }
  }
  return { ok: false, quota: true };
}

async function sendEmail(msg) { return (await sendEmailResult(msg)).ok; }

// ---- Outbox: emails held back by the daily limit, sent automatically by the scheduled send-queue job ----
// priority 0 = safety alert (always first), 1 = parent's plan, 2 = notices to Mark
async function queueEmail(event, msg, priority, meta = {}) {
  const store = openStore(event, "outbox");
  if (!store) return false;
  const key = `p${priority}/${new Date().toISOString()}_${Math.random().toString(36).slice(2, 8)}`;
  try { await store.setJSON(key, { createdAt: new Date().toISOString(), priority, msg, ...meta }); return true; }
  catch (err) { console.error("Could not queue an email:", err && err.message); return false; }
}

// Send or, if the limit is reached, queue. Returns "sent" | "queued" | "failed".
async function sendOrQueue(event, msg, priority, meta) {
  const r = await sendEmailResult(msg);
  if (r.ok) return "sent";
  if (r.quota && await queueEmail(event, msg, priority, meta)) return "queued";
  return "failed";
}

// Work through the outbox, most important and oldest first. Stops as soon as the limit is still in effect.
async function processOutbox(store, send = sendEmailResult, pauseMs = 600) {
  const { blobs } = await store.list();
  const keys = blobs.map((b) => b.key).sort();      // "p0/..." before "p1/...", and oldest first within each
  const result = { sent: 0, failed: 0, remaining: keys.length, stoppedForLimit: false };
  for (const key of keys) {
    const item = await store.get(key, { type: "json" });
    if (!item) { result.remaining--; continue; }
    const r = await send(item.msg);
    if (r.ok) { await store.delete(key); result.sent++; result.remaining--; }
    else if (r.quota) { result.stoppedForLimit = true; break; }
    else {
      const tries = (item.tries || 0) + 1;
      if (tries >= 5) { await store.delete(key); result.failed++; result.remaining--; console.error("Gave up on a queued email after 5 tries."); }
      else await store.setJSON(key, { ...item, tries });
    }
    if (pauseMs) await sleep(pauseMs);   // stay under Resend's per-second speed limit
  }
  return result;
}

module.exports = { openStore, saveRecord, sendEmail, sendEmailResult, sendOrQueue, queueEmail, processOutbox, isQuotaError, escapeHtml, alertAddress, fromAddress };
