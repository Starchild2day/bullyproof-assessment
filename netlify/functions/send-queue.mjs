// Netlify SCHEDULED function — runs automatically every hour (included in Netlify's free plan).
//
// Re-sends any webhooks SwipeOne couldn't accept the first time: safety-flagged plans first, then
// parents' plans, then Playbook reservations — oldest first within each. Nothing personal is logged.
import { getStore } from "@netlify/blobs";
import records from "../lib/records.js";

// Storage is opened here directly (a scheduled function is a modern ES module, where the shared
// helper's older way of loading the storage package doesn't work).
export default async () => {
  let store = null;
  try { store = getStore("outbox"); } catch (err) { console.error("Outbox storage not available:", err && err.message); }
  if (!store) return new Response("Storage not available", { status: 503 });
  const result = await records.processOutbox(store);
  if (result.sent || result.remaining || result.failed) {
    console.log(`Outbox: sent ${result.sent}, still waiting ${result.remaining}, gave up ${result.failed}`);
  }
  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
};

export const config = { schedule: "@hourly" };
