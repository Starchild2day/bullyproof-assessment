// Tests for lead saving, reservations, the hourly retry and the admin download — no real services touched.
// Run:  node scripts/build-plan-bundle.js && node scripts/test-leads.js
const path = require("path");
const ORIGIN = "https://assessment.bullyproof.guide";
const HOOK = "https://integrations-api.swipeone.com/webhooks/apps/generic-webhooks/TESTHOOK";
process.env.SWIPEONE_WEBHOOK_URL = HOOK;
process.env.ADMIN_KEY = "a-very-long-test-admin-key-123";
delete process.env.TURNSTILE_SECRET_KEY;

// Fake Netlify Blobs: in-memory stores.
const stores = {};
const fakeBlobs = {
  connectLambda() {},
  getStore(name) {
    const m = stores[name] || (stores[name] = new Map());
    return {
      async setJSON(k, v) { m.set(k, JSON.parse(JSON.stringify(v))); },
      async set(k, v) { m.set(k, v); },
      async get(k) { return m.has(k) ? m.get(k) : null; },
      async list() { return { blobs: [...m.keys()].map((key) => ({ key })) }; },
      async delete(k) { m.delete(k); }
    };
  }
};
require.cache[require.resolve("@netlify/blobs", { paths: [path.join(__dirname, "../netlify/lib")] })] = { exports: fakeBlobs, loaded: true };

let sent = [], hookStatus = 200;
global.fetch = async (url, opts) => {
  if (String(url) === HOOK) {
    if (hookStatus < 400) sent.push(JSON.parse(opts.body));
    return { ok: hookStatus < 400, status: hookStatus };
  }
  throw new Error("unexpected fetch " + url);
};
console.error = () => {};

const sendPlan = require("../netlify/functions/send-plan.js");
const reserve = require("../netlify/functions/reserve.js");
const admin = require("../netlify/functions/leads-admin.js");
const track = require("../netlify/functions/track.js");
const records = require("../netlify/lib/records.js");
const QUESTIONS = require("../netlify/lib/plan-bundle.js")(ORIGIN).QUESTIONS;
const opt = (id, f) => QUESTIONS.find((q) => q.id === id).options.find((o) => o.includes(f));
const calm = { q1: "8–10", q2: opt("q2", "treated badly"), q8: opt("q8", "told me clearly"), q12: "How can I help her?" };
const risky = { ...calm, q12: "Learn how to keep from killing someone" };

let ip = 0, pass = 0, fail = 0;
const ev = (body, fn = "plan", hdr = {}) => ({ httpMethod: "POST", headers: { origin: ORIGIN, "content-type": "application/json", "x-nf-client-connection-ip": `10.1.0.${++ip}`, ...hdr }, body: JSON.stringify(body) });
const check = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); };
const reset = () => { sent = []; hookStatus = 200; Object.keys(stores).forEach((k) => delete stores[k]); sendPlan.__test.hits.ip.clear(); sendPlan.__test.hits.recipient.clear(); reserve.__test.hits.clear(); };
const leads = () => [...(stores.leads || new Map()).values()];

(async () => {
  let r;
  // 1. Calm plan: one webhook, lead saved with the guide and plan ID.
  reset(); r = await sendPlan.handler(ev({ to: "a@example.com", answers: calm, safetyFlags: [], consentGiven: true }));
  check("calm plan returns 200", r.statusCode === 200);
  check("calm plan: exactly one webhook (plan-standard)", sent.length === 1 && sent[0].email === "a@example.com" && sent[0].plan_type === "plan-standard");
  check("calm plan: lead saved with answers, summary, guide and plan ID", leads().length === 1 && leads()[0].answers.q1 === "8–10" && leads()[0].summary.includes("A:") && leads()[0].guide === "guide-03" && leads()[0].planId.length === 24);
  check("calm plan: lead marks delivered", leads()[0].emailDelivered === true && leads()[0].safetyFlags.length === 0);

  // 2. Flagged plan: ONE webhook tagged plan-safety (SwipeOne sends the parent's email AND Mark's alert).
  reset(); r = await sendPlan.handler(ev({ to: "b@example.com", answers: risky, safetyFlags: [], safetyAcknowledged: true }));
  check("flagged plan returns 200 with one plan-safety webhook", r.statusCode === 200 && sent.length === 1 && sent[0].plan_type === "plan-safety");
  check("flagged plan: lead saved with flags + acknowledged, no guide", leads().length === 1 && leads()[0].safetyFlags.length > 0 && leads()[0].safetyResourcesAcknowledged === true && leads()[0].guide === "");

  // 3. Honeypot / bad origin: nothing saved, nothing sent.
  reset(); await sendPlan.handler(ev({ to: "e@example.com", answers: calm, website: "spam.example" }));
  check("bot (honeypot) saves nothing and sends nothing", leads().length === 0 && sent.length === 0);
  reset(); r = await sendPlan.handler(ev({ to: "e@example.com", answers: calm }, "plan", { origin: "https://evil.example" }));
  check("other websites are blocked and save nothing", r.statusCode === 403 && leads().length === 0);

  // 4. Reservations: saved, and SwipeOne gets the playbook-reserved tag.
  reset(); r = await reserve.handler(ev({ email: "r@example.com", consent: true }));
  check("reservation returns 200", r.statusCode === 200);
  check("reservation saved", stores.reservations && [...stores.reservations.values()][0].email === "r@example.com");
  check("reservation sent to SwipeOne with the playbook-reserved tag", sent.length === 1 && sent[0].event === "playbook_reserved" && sent[0].tags[0] === "playbook-reserved");
  reset(); r = await reserve.handler(ev({ email: "r@example.com", consent: false }));
  check("reservation without the box ticked is refused", r.statusCode === 400 && !stores.reservations && sent.length === 0);
  reset(); r = await reserve.handler(ev({ email: "r@example.com", consent: true }, "r", { origin: "https://evil.example" }));
  check("reservation from another website is blocked", r.statusCode === 403);

  // 5. Admin download and delete (lead, plan page AND reservation).
  reset();
  await sendPlan.handler(ev({ to: "keep@example.com", answers: calm }));
  await sendPlan.handler(ev({ to: "gone@example.com", answers: risky }));
  await reserve.handler(ev({ email: "gone@example.com", consent: true }));
  r = await admin.handler({ queryStringParameters: {} });
  check("admin: no key is refused", r.statusCode === 403);
  r = await admin.handler({ queryStringParameters: { key: "wrong-key-wrong-key-wrong" } });
  check("admin: wrong key is refused", r.statusCode === 403);
  r = await admin.handler({ queryStringParameters: { key: process.env.ADMIN_KEY } });
  check("admin: leads download as a spreadsheet with both parents and their guides", r.statusCode === 200 && /text\/csv/.test(r.headers["Content-Type"]) && r.body.includes("keep@example.com") && r.body.includes("gone@example.com") && r.body.includes("guide-03"));
  r = await admin.handler({ queryStringParameters: { key: process.env.ADMIN_KEY, list: "reservations" } });
  check("admin: reservations download", r.body.includes("gone@example.com"));
  r = await admin.handler({ queryStringParameters: { key: process.env.ADMIN_KEY, delete: "GONE@example.com" } });
  check("admin: delete removes the lead, the plan page AND the reservation", r.body.startsWith("Deleted 3"));
  check("admin: other families untouched", leads().length === 1 && leads()[0].email === "keep@example.com" && stores.reservations.size === 0 && stores.plans.size === 1);

  // 6. Visit counts.
  reset(); track.__test.hits.clear();
  const tev = (body, hdr = {}) => ({ httpMethod: "POST", headers: { origin: ORIGIN, "content-type": "application/json", "x-nf-client-connection-ip": "10.9.9.9", ...hdr }, body: JSON.stringify(body) });
  r = await track.handler(tev({ e: "assessment_started" }));
  await track.handler(tev({ e: "assessment_started" }));
  await track.handler(tev({ e: "question_answered", d: "q3" }));
  check("counts: a step is recorded", r.statusCode === 204 && stores.counts && stores.counts.size === 3);
  check("counts: nothing personal is stored", [...stores.counts.keys()].every((k) => /^\d{4}-\d{2}-\d{2}\/[a-z_]+(:q\d+)?\/[a-z0-9]+$/.test(k)) && [...stores.counts.values()].every((v) => v === "1"));
  r = await track.handler(tev({ e: "hacked_event" }));
  check("counts: unknown steps are refused", r.statusCode === 400 && stores.counts.size === 3);
  r = await track.handler(tev({ e: "assessment_started" }, { origin: "https://evil.example" }));
  check("counts: other websites can't add counts", r.statusCode === 403 && stores.counts.size === 3);
  r = await track.handler(tev({ e: "question_answered", d: "<script>" }));
  check("counts: odd details are dropped, step still counted", r.statusCode === 204 && [...stores.counts.keys()].filter((k) => k.includes("question_answered/")).length === 1);
  r = await admin.handler({ queryStringParameters: { key: process.env.ADMIN_KEY, list: "counts" } });
  check("counts: daily totals download as a spreadsheet", r.statusCode === 200 && /assessment_started","2"/.test(r.body) && /question_answered:q3","1"/.test(r.body));

  // 7. SwipeOne unreachable -> outbox -> hourly retry, safety-flagged plans first.
  reset(); hookStatus = 503;
  r = await sendPlan.handler(ev({ to: "calm@example.com", answers: calm }));
  r = await sendPlan.handler(ev({ to: "busy@example.com", answers: risky, safetyAcknowledged: true }));
  check("SwipeOne down: parent is told it's on its way (202), not an error", r.statusCode === 202 && JSON.parse(r.body).queued === true);
  const ob = stores.outbox || new Map();
  check("SwipeOne down: both plans waiting, the safety one marked most urgent", ob.size === 2 && [...ob.keys()].some((k) => k.startsWith("p0/")) && [...ob.keys()].some((k) => k.startsWith("p1/")));
  check("SwipeOne down: leads still saved, marked queued", leads().length === 2 && leads().every((l) => l.emailDelivered === "queued"));
  r = await reserve.handler(ev({ email: "res@example.com", consent: true }));
  check("SwipeOne down: reservation still saved and queued", r.statusCode === 200 && stores.reservations.size === 1 && ob.size === 3);

  let res1 = await records.processOutbox(fakeBlobs.getStore("outbox"), records.sendWebhook, 0);
  check("hourly job while SwipeOne is still down: keeps everything", res1.sent === 0 && ob.size === 3 && sent.length === 0);
  hookStatus = 200;
  res1 = await records.processOutbox(fakeBlobs.getStore("outbox"), records.sendWebhook, 0);
  check("SwipeOne back: all 3 sent and the outbox is empty", res1.sent === 3 && ob.size === 0);
  check("safety-flagged plan goes first, then the calm plan, then the reservation", sent[0].plan_type === "plan-safety" && sent[1].email === "calm@example.com" && sent[2].event === "playbook_reserved");

  // A webhook SwipeOne keeps refusing is retried hourly for 3 days, then dropped so it can't block the line.
  reset();
  await records.queueWebhook({}, { email: "x@example.com", tags: ["plan-standard"] }, 1);
  const failing = async () => ({ ok: false });
  for (let i = 0; i < 71; i++) await records.processOutbox(fakeBlobs.getStore("outbox"), failing, 0);
  check("refused webhook still waiting after 71 hourly tries", stores.outbox.size === 1);
  await records.processOutbox(fakeBlobs.getStore("outbox"), failing, 0);
  check("refused webhook dropped after 3 days", stores.outbox.size === 0);
  // Old Resend emails left from before the switch are cleared, not sent anywhere.
  reset(); await fakeBlobs.getStore("outbox").setJSON("p1/old", { msg: { to: "old@example.com", subject: "s", html: "h" } });
  res1 = await records.processOutbox(fakeBlobs.getStore("outbox"), records.sendWebhook, 0);
  check("leftover Resend emails are cleared without sending", stores.outbox.size === 0 && sent.length === 0);

  // "Delete my data" also clears anything waiting in the outbox.
  reset(); hookStatus = 503;
  await sendPlan.handler(ev({ to: "wipe@example.com", answers: calm }));
  r = await admin.handler({ queryStringParameters: { key: process.env.ADMIN_KEY, delete: "wipe@example.com" } });
  check("delete my data also removes the plan page and the waiting webhook", r.body.startsWith("Deleted 3") && stores.outbox.size === 0 && stores.plans.size === 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
