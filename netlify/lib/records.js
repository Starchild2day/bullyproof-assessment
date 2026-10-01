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

async function sendEmail({ to, subject, html, replyTo, headers }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromAddress(), to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}), ...(headers ? { headers } : {}) })
    });
    if (!res.ok) {
      let detail = ""; try { detail = JSON.stringify(await res.json()); } catch (e) { /* ignore */ }
      console.error("Resend rejected an email:", res.status, detail);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Could not reach Resend:", err && err.message);
    return false;
  }
}

module.exports = { openStore, saveRecord, sendEmail, escapeHtml, alertAddress, fromAddress };
