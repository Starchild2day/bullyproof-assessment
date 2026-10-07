// Shared helpers for the Netlify functions:
//  * saving records to Netlify Blobs (Netlify's built-in storage), and
//  * telling SwipeOne about a new plan or reservation through its incoming webhook.
//
// SwipeOne (the bullyproof.support workspace) sends ALL the emails: the "your plan is ready" email,
// the safety alert to Mark, and the Quick Help Guides follow-ups. Resend is no longer used.
//
// PRIVACY: the webhook carries only what SwipeOne needs to send the right emails — the email address,
// tags, language, and the private plan link. A parent's answers about their child are NEVER sent to
// SwipeOne; they stay in our own storage.
"use strict";

let blobs = null;
try { blobs = require("@netlify/blobs"); } catch (err) { console.error("@netlify/blobs is missing — is package.json in the repo?"); }

// Open a named store. Returns null (and the caller carries on) if storage isn't available.
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

async function saveRecord(event, storeName, record, key) {
  const store = openStore(event, storeName);
  if (!store) return false;
  try { await store.setJSON(key || newKey(), record); return true; }
  catch (err) { console.error(`Could not save to "${storeName}":`, err && err.message); return false; }
}

const escapeHtml = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Post one event to SwipeOne. Returns { ok }. Tries twice before giving up for now.
async function sendWebhook(payload) {
  const url = process.env.SWIPEONE_WEBHOOK_URL;
  if (!url) { console.error("SWIPEONE_WEBHOOK_URL is not set in this site's environment variables."); return { ok: false }; }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) return { ok: true };
      console.error("SwipeOne did not accept the webhook:", res.status);   // never log the payload (it has an email address)
    } catch (err) {
      console.error("Could not reach SwipeOne:", err && err.message);
    }
    if (attempt === 0) await sleep(1200);
  }
  return { ok: false };
}

// ---- Outbox: webhooks SwipeOne didn't accept yet, retried every hour by the scheduled send-queue job ----
// priority 0 = safety-flagged plan (always first), 1 = parent's plan, 2 = Playbook reservations
async function queueWebhook(event, payload, priority, meta = {}) {
  const store = openStore(event, "outbox");
  if (!store) return false;
  const key = `p${priority}/${new Date().toISOString()}_${Math.random().toString(36).slice(2, 8)}`;
  try { await store.setJSON(key, { createdAt: new Date().toISOString(), priority, payload, ...meta }); return true; }
  catch (err) { console.error("Could not queue a webhook:", err && err.message); return false; }
}

// Send now or, if SwipeOne can't be reached, queue it for the hourly retry. Returns "sent" | "queued" | "failed".
async function deliverOrQueue(event, payload, priority, meta, send = sendWebhook) {
  const r = await send(payload);
  if (r.ok) return "sent";
  if (await queueWebhook(event, payload, priority, meta)) return "queued";
  return "failed";
}

const MAX_TRIES = 72;   // hourly retries for three days, then give up (the lead itself is still saved)

// Work through the outbox, most important and oldest first.
async function processOutbox(store, send = sendWebhook, pauseMs = 300) {
  const { blobs: items } = await store.list();
  const keys = items.map((b) => b.key).sort();      // "p0/..." before "p1/...", and oldest first within each
  const result = { sent: 0, failed: 0, remaining: keys.length };
  for (const key of keys) {
    const item = await store.get(key, { type: "json" });
    if (!item) { result.remaining--; continue; }
    if (!item.payload) {   // an old Resend email from before the switch to SwipeOne — can't be sent any more
      await store.delete(key); result.failed++; result.remaining--; continue;
    }
    const r = await send(item.payload);
    if (r.ok) { await store.delete(key); result.sent++; result.remaining--; }
    else {
      const tries = (item.tries || 0) + 1;
      if (tries >= MAX_TRIES) { await store.delete(key); result.failed++; result.remaining--; console.error("Gave up on a queued webhook after 3 days."); }
      else await store.setJSON(key, { ...item, tries });
    }
    if (pauseMs) await sleep(pauseMs);
  }
  return result;
}

module.exports = { openStore, saveRecord, sendWebhook, queueWebhook, deliverOrQueue, processOutbox, escapeHtml };
