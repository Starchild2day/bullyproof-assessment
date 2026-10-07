// Netlify function — Mark's private window into saved leads and reservations (Netlify Blobs).
//
// Requires the environment variable ADMIN_KEY (a long random password, set in Netlify). Treat it like a password.
//
//   Download all plan leads as a spreadsheet (CSV):
//     /.netlify/functions/leads-admin?key=ADMIN_KEY
//   Download Playbook reservations:
//     /.netlify/functions/leads-admin?key=ADMIN_KEY&list=reservations
//   Download daily visit counts (how many parents reached each step):
//     /.netlify/functions/leads-admin?key=ADMIN_KEY&list=counts
//   Delete everything saved for one email address, including their private plan page ("Delete my data"):
//     /.netlify/functions/leads-admin?key=ADMIN_KEY&delete=parent@example.com
"use strict";

const crypto = require("crypto");
const { openStore } = require("../lib/records.js");

const text = (statusCode, body, type = "text/plain; charset=utf-8", extra = {}) =>
  ({ statusCode, headers: { "Content-Type": type, "Cache-Control": "no-store", "X-Robots-Tag": "noindex", ...extra }, body });

function keyOk(given) {
  const real = process.env.ADMIN_KEY || "";
  if (real.length < 16 || typeof given !== "string") return false;
  const a = Buffer.from(given), b = Buffer.from(real);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const csvCell = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""').replace(/\r?\n/g, " / ")}"`;

async function allRecords(store) {
  const out = [];
  const { blobs } = await store.list();
  for (const { key } of blobs) {
    const rec = await store.get(key, { type: "json" });
    if (rec) out.push({ key, ...rec });
  }
  return out.sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
}

exports.handler = async function (event) {
  const q = event.queryStringParameters || {};
  if (!keyOk(q.key)) return text(403, "Not allowed.");

  // Delete everything for one email, across both lists.
  if (q.delete) {
    const target = String(q.delete).trim().toLowerCase();
    let removed = 0;
    for (const name of ["leads", "reservations", "plans"]) {
      const store = openStore(event, name);
      if (!store) continue;
      for (const rec of await allRecords(store)) {
        if (String(rec.email || "").toLowerCase() === target) { await store.delete(rec.key); removed++; }
      }
    }
    // Also drop anything for that address still waiting in the outbox.
    const outbox = openStore(event, "outbox");
    if (outbox) {
      for (const rec of await allRecords(outbox)) {
        const addr = (rec.payload && rec.payload.email) || (rec.msg && rec.msg.to) || "";
        if (String(addr).toLowerCase() === target) { await outbox.delete(rec.key); removed++; }
      }
    }
    return text(200, `Deleted ${removed} record(s) for ${target}.`);
  }

  // Daily visit counts (from the track function): one row per day per step.
  if (q.list === "counts") {
    const store = openStore(event, "counts");
    if (!store) return text(503, "Storage is not available.");
    const { blobs } = await store.list();
    const tally = new Map();
    for (const { key } of blobs) {
      const [day, step] = key.split("/");
      const k = `${day}|${step}`;
      tally.set(k, (tally.get(k) || 0) + 1);
    }
    const rows = [...tally.entries()].map(([k, n]) => { const [day, step] = k.split("|"); return [day, step, n]; })
      .sort((a, b) => b[0].localeCompare(a[0]) || a[1].localeCompare(b[1], undefined, { numeric: true }));
    const csv = ["date,step,count"].concat(rows.map((r) => r.map(csvCell).join(","))).join("\n");
    const stamp = new Date().toISOString().slice(0, 10);
    return text(200, csv, "text/csv; charset=utf-8", { "Content-Disposition": `attachment; filename="bullyproof-visit-counts-${stamp}.csv"` });
  }

  const name = q.list === "reservations" ? "reservations" : "leads";
  const store = openStore(event, name);
  if (!store) return text(503, "Storage is not available.");
  const rows = await allRecords(store);

  const cols = name === "reservations"
    ? ["createdAt", "email", "source"]
    : ["createdAt", "email", "safetyFlags", "safetyResourcesAcknowledged", "guide", "emailDelivered", "planId", "summary"];
  const lines = [cols.join(",")].concat(rows.map((r) => cols.map((c) => csvCell(Array.isArray(r[c]) ? r[c].join("; ") : r[c])).join(",")));
  const stamp = new Date().toISOString().slice(0, 10);
  return text(200, lines.join("\n"), "text/csv; charset=utf-8", { "Content-Disposition": `attachment; filename="bullyproof-${name}-${stamp}.csv"` });
};
