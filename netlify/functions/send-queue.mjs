// Netlify SCHEDULED function — runs automatically every hour (included in Netlify's free plan).
//
// Sends any emails waiting in the outbox because Resend's daily/monthly allowance was used up:
// safety alerts first, then parents' plans, then notices to Mark — oldest first within each.
// If the allowance is still used up, it stops and simply tries again next hour. Nothing personal is logged.
import records from "../lib/records.js";

export default async () => {
  const store = records.openStore(null, "outbox");
  if (!store) return new Response("Storage not available", { status: 503 });
  const result = await records.processOutbox(store);
  if (result.sent || result.remaining || result.failed) {
    console.log(`Outbox: sent ${result.sent}, still waiting ${result.remaining}, gave up ${result.failed}${result.stoppedForLimit ? " (daily limit still in effect)" : ""}`);
  }
  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
};

export const config = { schedule: "@hourly" };
