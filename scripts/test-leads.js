// Tests for lead saving, safety alerts, reservations and the admin download — no real services touched.
// Run:  node scripts/build-plan-bundle.js && node scripts/test-leads.js
const path = require("path");
const ORIGIN = "https://assessment.bullyproof.guide";
process.env.RESEND_API_KEY = "test_key";
process.env.FROM_EMAIL = "Bullyproof.Guide <plans@mail.bullyproof.guide>";
process.env.ADMIN_KEY = "a-very-long-test-admin-key-123";
delete process.env.ALERT_EMAIL; delete process.env.TURNSTILE_SECRET_KEY;

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

let sent = [], resendStatus = 200, resendBody = {};
global.fetch = async (url, opts) => {
  if (String(url).includes("api.resend.com")) {
    if (resendStatus < 400) sent.push(JSON.parse(opts.body));
    return { ok: resendStatus < 400, status: resendStatus, json: async () => resendBody };
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
const reset = () => { sent = []; resendStatus = 200; resendBody = {}; Object.keys(stores).forEach((k) => delete stores[k]); sendPlan.__test.hits.ip.clear(); sendPlan.__test.hits.recipient.clear(); reserve.__test.hits.clear(); };
const leads = () => [...(stores.leads || new Map()).values()];

(async () => {
  let r;
  // 1. Calm plan: parent email sent, lead saved, no alert.
  reset(); r = await sendPlan.handler(ev({ to: "a@example.com", answers: calm, safetyFlags: [], consentGiven: true }));
  check("calm plan returns 200", r.statusCode === 200);
  check("calm plan: exactly one email (the parent's)", sent.length === 1 && sent[0].to[0] === "a@example.com");
  check("calm plan: lead saved with answers and summary", leads().length === 1 && leads()[0].email === "a@example.com" && leads()[0].answers.q1 === "8–10" && leads()[0].summary.includes("A:"));
  check("calm plan: lead marks email delivered", leads()[0].emailDelivered === true && leads()[0].safetyFlags.length === 0);

  // 2. Flagged plan: parent email + alert to Mark, reply-to the parent.
  reset(); r = await sendPlan.handler(ev({ to: "b@example.com", answers: risky, safetyFlags: [], safetyAcknowledged: true }));
  const alert = sent.find((m) => m.subject.includes("safety flag"));
  check("flagged plan returns 200", r.statusCode === 200);
  check("flagged plan: alert email sent to mark@bullyproof.guide", !!alert && alert.to[0] === "mark@bullyproof.guide");
  check("flagged plan: alert replies go to the parent", alert && alert.reply_to === "b@example.com");
  check("flagged plan: alert includes the answers", alert && alert.html.includes("killing someone"));
  check("flagged plan: lead saved with flags + acknowledged", leads().length === 1 && leads()[0].safetyFlags.length > 0 && leads()[0].safetyResourcesAcknowledged === true);

  // 3. ALERT_EMAIL overrides the destination.
  reset(); process.env.ALERT_EMAIL = "alerts@example.org";
  await sendPlan.handler(ev({ to: "c@example.com", answers: risky }));
  check("ALERT_EMAIL setting is respected", sent.some((m) => m.subject.includes("safety flag") && m.to[0] === "alerts@example.org"));
  delete process.env.ALERT_EMAIL;

  // 4. Resend down: parent sees an error, but the lead is STILL saved.
  reset(); resendStatus = 500;
  r = await sendPlan.handler(ev({ to: "d@example.com", answers: risky }));
  check("email failure returns 502 to the browser", r.statusCode === 502);
  check("email failure: lead still saved, marked not delivered", leads().length === 1 && leads()[0].emailDelivered === false);

  // 5. Honeypot / bad origin: nothing saved, nothing sent.
  reset(); await sendPlan.handler(ev({ to: "e@example.com", answers: calm, website: "spam.example" }));
  check("bot (honeypot) saves nothing and sends nothing", leads().length === 0 && sent.length === 0);
  reset(); r = await sendPlan.handler(ev({ to: "e@example.com", answers: calm }, "plan", { origin: "https://evil.example" }));
  check("other websites are blocked and save nothing", r.statusCode === 403 && leads().length === 0);

  // 6. Reservations.
  reset(); r = await reserve.handler(ev({ email: "r@example.com", consent: true }));
  check("reservation returns 200", r.statusCode === 200);
  check("reservation saved", stores.reservations && [...stores.reservations.values()][0].email === "r@example.com");
  check("reservation notice emailed to Mark", sent.length === 1 && sent[0].subject === "New Playbook reservation");
  reset(); r = await reserve.handler(ev({ email: "r@example.com", consent: false }));
  check("reservation without the box ticked is refused", r.statusCode === 400 && !stores.reservations);
  reset(); r = await reserve.handler(ev({ email: "r@example.com", consent: true }, "r", { origin: "https://evil.example" }));
  check("reservation from another website is blocked", r.statusCode === 403);

  // 7. Admin download and delete.
  reset();
  await sendPlan.handler(ev({ to: "keep@example.com", answers: calm }));
  await sendPlan.handler(ev({ to: "gone@example.com", answers: risky }));
  await reserve.handler(ev({ email: "gone@example.com", consent: true }));
  r = await admin.handler({ queryStringParameters: {} });
  check("admin: no key is refused", r.statusCode === 403);
  r = await admin.handler({ queryStringParameters: { key: "wrong-key-wrong-key-wrong" } });
  check("admin: wrong key is refused", r.statusCode === 403);
  r = await admin.handler({ queryStringParameters: { key: process.env.ADMIN_KEY } });
  check("admin: leads download as a spreadsheet with both parents", r.statusCode === 200 && /text\/csv/.test(r.headers["Content-Type"]) && r.body.includes("keep@example.com") && r.body.includes("gone@example.com"));
  r = await admin.handler({ queryStringParameters: { key: process.env.ADMIN_KEY, list: "reservations" } });
  check("admin: reservations download", r.body.includes("gone@example.com"));
  r = await admin.handler({ queryStringParameters: { key: process.env.ADMIN_KEY, delete: "GONE@example.com" } });
  check("admin: delete removes the lead AND the reservation", r.body.startsWith("Deleted 2"));
  check("admin: other families untouched", leads().length === 1 && leads()[0].email === "keep@example.com" && stores.reservations.size === 0);

  // 8. Visit counts.
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

  // 9. Daily limit reached -> outbox -> automatic delivery later.
  reset();
  resendStatus = 429; resendBody = { name: "daily_quota_exceeded", message: "You have reached your daily email sending quota." };
  r = await sendPlan.handler(ev({ to: "busy@example.com", answers: risky, safetyAcknowledged: true }));
  const ob = stores.outbox || new Map();
  check("limit reached: parent is told it's queued (202), not an error", r.statusCode === 202 && JSON.parse(r.body).queued === true);
  check("limit reached: plan AND safety alert both waiting in the outbox", ob.size === 2 && [...ob.keys()].some((k) => k.startsWith("p0/")) && [...ob.keys()].some((k) => k.startsWith("p1/")));
  check("limit reached: lead still saved, marked queued", leads().length === 1 && leads()[0].emailDelivered === "queued");
  r = await reserve.handler(ev({ email: "res@example.com", consent: true }));
  check("limit reached: reservation still saved and its notice queued", r.statusCode === 200 && stores.reservations.size === 1 && ob.size === 3);

  // Hourly job while the limit is STILL in effect: nothing lost, nothing sent.
  let res1 = await records.processOutbox(fakeBlobs.getStore("outbox"), records.sendEmailResult, 0);
  check("hourly job, still limited: stops and keeps everything", res1.stoppedForLimit === true && ob.size === 3 && sent.length === 0);

  // Allowance resets: everything goes out, safety alert FIRST.
  resendStatus = 200; resendBody = {};
  res1 = await records.processOutbox(fakeBlobs.getStore("outbox"), records.sendEmailResult, 0);
  check("allowance back: all 3 sent and the outbox is empty", res1.sent === 3 && ob.size === 0);
  check("safety alert goes out first, then the parent's plan, then the notice", sent[0].subject.includes("safety flag") && sent[1].to[0] === "busy@example.com" && sent[2].subject === "New Playbook reservation");
  check("queued plan is the real plan email", sent[1].subject.includes("Action Plan") && sent[1].html.length > 5000);

  // A broken email (not a limit problem) is retried, then dropped after 5 tries so it can't block the line.
  reset();
  await records.queueEmail({}, { to: "x@example.com", subject: "s", html: "h" }, 1);
  const failing = async () => ({ ok: false, quota: false });
  for (let i = 0; i < 4; i++) await records.processOutbox(fakeBlobs.getStore("outbox"), failing, 0);
  check("broken email retried (still waiting after 4 tries)", stores.outbox.size === 1);
  await records.processOutbox(fakeBlobs.getStore("outbox"), failing, 0);
  check("broken email dropped after 5 tries", stores.outbox.size === 0);

  // "Delete my data" also clears anything waiting in the outbox.
  reset(); resendStatus = 429; resendBody = { name: "daily_quota_exceeded" };
  await sendPlan.handler(ev({ to: "wipe@example.com", answers: calm }));
  r = await admin.handler({ queryStringParameters: { key: process.env.ADMIN_KEY, delete: "wipe@example.com" } });
  check("delete my data also removes waiting outbox emails", r.body.startsWith("Deleted 2") && stores.outbox.size === 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
