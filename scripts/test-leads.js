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
      async get(k) { return m.has(k) ? m.get(k) : null; },
      async list() { return { blobs: [...m.keys()].map((key) => ({ key })) }; },
      async delete(k) { m.delete(k); }
    };
  }
};
require.cache[require.resolve("@netlify/blobs", { paths: [path.join(__dirname, "../netlify/lib")] })] = { exports: fakeBlobs, loaded: true };

let sent = [], resendStatus = 200;
global.fetch = async (url, opts) => {
  if (String(url).includes("api.resend.com")) { sent.push(JSON.parse(opts.body)); return { ok: resendStatus < 400, status: resendStatus, json: async () => ({}) }; }
  throw new Error("unexpected fetch " + url);
};
console.error = () => {};

const sendPlan = require("../netlify/functions/send-plan.js");
const reserve = require("../netlify/functions/reserve.js");
const admin = require("../netlify/functions/leads-admin.js");
const QUESTIONS = require("../netlify/lib/plan-bundle.js")(ORIGIN).QUESTIONS;
const opt = (id, f) => QUESTIONS.find((q) => q.id === id).options.find((o) => o.includes(f));
const calm = { q1: "8–10", q2: opt("q2", "treated badly"), q8: opt("q8", "told me clearly"), q12: "How can I help her?" };
const risky = { ...calm, q12: "Learn how to keep from killing someone" };

let ip = 0, pass = 0, fail = 0;
const ev = (body, fn = "plan", hdr = {}) => ({ httpMethod: "POST", headers: { origin: ORIGIN, "content-type": "application/json", "x-nf-client-connection-ip": `10.1.0.${++ip}`, ...hdr }, body: JSON.stringify(body) });
const check = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); };
const reset = () => { sent = []; resendStatus = 200; Object.keys(stores).forEach((k) => delete stores[k]); sendPlan.__test.hits.ip.clear(); sendPlan.__test.hits.recipient.clear(); reserve.__test.hits.clear(); };
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

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
