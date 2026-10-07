// Tests for netlify/functions/send-plan.js and plan.js.   Run:  node scripts/build-plan-bundle.js && node scripts/test-send-plan.js
// Uses only Node built-ins. SwipeOne, Cloudflare and Netlify storage are replaced by fakes, so nothing is really sent.
const path = require("path");
const ORIGIN = "https://assessment.bullyproof.guide";
const HOOK = "https://integrations-api.swipeone.com/webhooks/apps/generic-webhooks/TESTHOOK";

process.env.SWIPEONE_WEBHOOK_URL = HOOK;
delete process.env.TURNSTILE_SECRET_KEY; delete process.env.ALLOWED_ORIGINS; delete process.env.PUBLIC_SITE_URL;

// Fake Netlify Blobs: in-memory stores.
const stores = {};
const fakeBlobs = { connectLambda() {}, getStore(name) { const m = stores[name] || (stores[name] = new Map()); return { async setJSON(k, v) { m.set(k, JSON.parse(JSON.stringify(v))); }, async get(k) { return m.has(k) ? m.get(k) : null; }, async list() { return { blobs: [...m.keys()].map((key) => ({ key })) }; }, async delete(k) { m.delete(k); } }; } };
require.cache[require.resolve("@netlify/blobs", { paths: [path.join(__dirname, "../netlify/lib")] })] = { exports: fakeBlobs, loaded: true };

let hooks = [], hookStatus = 200, turnstileOk = true;
global.fetch = async (url, opts) => {
  if (String(url) === HOOK) { const body = JSON.parse(opts.body); if (hookStatus < 400) hooks.push(body); return { ok: hookStatus < 400, status: hookStatus }; }
  if (String(url).includes("turnstile")) return { ok: true, json: async () => ({ success: turnstileOk && String(opts.body).includes("response=good") }) };
  throw new Error("unexpected fetch " + url);
};
const errors = []; const realError = console.error; console.error = (...a) => errors.push(a.join(" "));

const mod = require("../netlify/functions/send-plan.js");
const planFn = require("../netlify/functions/plan.js");
const createPlanBuilder = require("../netlify/lib/plan-bundle.js");
const QUESTIONS = createPlanBuilder(ORIGIN).QUESTIONS;
const q = (id) => QUESTIONS.find((x) => x.id === id);
const opt = (id, frag) => { const o = q(id).options.find((x) => x.includes(frag)); if (!o) throw new Error(`no option "${frag}" on ${id}`); return o; };

const worried = { q1: "8–10", q2: opt("q2", "treated badly"), q4: "She has been quiet since it happened.", q6: [opt("q6", "irritable")], q8: opt("q8", "told me clearly"), q12: "How can I help her feel better?" };
let ipCounter = 0;
const event = (over = {}) => ({
  httpMethod: "POST",
  headers: { origin: ORIGIN, "content-type": "application/json", "x-nf-client-connection-ip": over.ip || `10.0.0.${++ipCounter}`, ...(over.headers || {}) },
  body: over.rawBody !== undefined ? over.rawBody : JSON.stringify({ to: `parent${ipCounter}@example.com`, answers: worried, safetyFlags: [], marketingConsent: false, website: "", ...(over.body || {}) })
});
const reset = () => { hooks = []; errors.length = 0; mod.__test.hits.ip.clear(); mod.__test.hits.recipient.clear(); planFn.__test.hits.clear(); hookStatus = 200; Object.keys(stores).forEach((k) => delete stores[k]); };
const plans = () => [...(stores.plans || new Map()).entries()];
const getPlan = (id, ip = "9.9.9.9") => planFn.handler({ httpMethod: "GET", queryStringParameters: { id }, headers: { "x-nf-client-connection-ip": ip } });

let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { (ok ? pass++ : fail++); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  <-- " + extra}`); };

(async () => {
  let r;
  // --- Happy path ---
  reset(); r = await mod.handler(event());
  const body = JSON.parse(r.body);
  check("happy path: 200 and exactly one SwipeOne webhook", r.statusCode === 200 && hooks.length === 1, r.body);
  const h = hooks[0] || {};
  check("  webhook has the parent's email, plan-standard, a guide tag and the language", h.email === "parent1@example.com" && h.plan_type === "plan-standard" && /^guide-\d\d$/.test(h.guide) && h.language === "en" && h.tags.includes("plan-standard") && h.tags.includes(h.guide));
  check("  webhook NEVER carries the parent's answers about their child", !JSON.stringify(h).includes("quiet since") && !JSON.stringify(h).includes("8–10") && !("answers" in h) && !("summary" in h));
  check("  plan link is on the site the parent used, with a 24-character random ID", /^https:\/\/assessment\.bullyproof\.guide\/plan\/[A-Za-z0-9_-]{24}$/.test(h.plan_link) && body.planUrl === h.plan_link, h.plan_link);
  const id = (h.plan_link || "").split("/plan/")[1];
  check("  plan saved under that ID with the answers and language", plans().length === 1 && plans()[0][0] === id && plans()[0][1].answers.q4 === worried.q4 && plans()[0][1].lang === "en");

  // --- Plan page endpoint ---
  r = await getPlan(id); const pg = JSON.parse(r.body);
  check("plan page: returns the answers, flags and language", r.statusCode === 200 && pg.answers.q2 === worried.q2 && Array.isArray(pg.safetyFlags) && pg.lang === "en");
  check("plan page: never returns the parent's email", !r.body.includes("@example.com"));
  check("plan page: not cached, not indexed, no referrer", r.headers["Cache-Control"] === "no-store" && /noindex/.test(r.headers["X-Robots-Tag"]) && r.headers["Referrer-Policy"] === "no-referrer");
  r = await getPlan("AAAAAAAAAAAAAAAAAAAAAAAA"); check("plan page: unknown ID -> 404", r.statusCode === 404);
  r = await getPlan("../../leads"); check("plan page: malformed ID -> 404 without touching storage", r.statusCode === 404);
  r = await planFn.handler({ httpMethod: "POST", queryStringParameters: { id }, headers: {} }); check("plan page: POST refused (405)", r.statusCode === 405);
  stores.plans.set(id, { ...stores.plans.get(id), createdAt: new Date(Date.now() - 400 * 864e5).toISOString() });
  r = await getPlan(id); check("plan page: older than 12 months -> 410 expired", r.statusCode === 410);
  const codes = []; for (let i = 0; i < 61; i++) codes.push((await getPlan("BBBBBBBBBBBBBBBBBBBBBBBB", "5.5.5.5")).statusCode);
  check("plan page: one visitor hammering IDs is slowed down (429 after 60)", codes[59] === 404 && codes[60] === 429);

  // --- Two parents never share an ID ---
  reset(); await mod.handler(event()); await mod.handler(event());
  check("every plan gets its own ID", hooks.length === 2 && hooks[0].plan_link !== hooks[1].plan_link && plans().length === 2);

  // --- Safety ---
  reset(); r = await mod.handler(event({ body: { answers: { ...worried, q12: "Learn how to keep from killing someone. And How to make him feel better" } } }));
  check("harm language -> plan-safety tag, NO guide (no sales emails)", hooks[0].plan_type === "plan-safety" && hooks[0].guide === "" && hooks[0].tags.length === 1 && hooks[0].tags[0] === "plan-safety");
  check("  safety flag saved with the plan, so the page shows crisis resources first", plans()[0][1].safetyFlags.length > 0);
  check("  the webhook does not say WHICH concern was flagged", !/selfHarm|violence|sexual|physicalSigns/i.test(JSON.stringify(hooks[0])));
  reset(); r = await mod.handler(event({ body: { safetyFlags: ["physicalSigns", "made_up_flag"] } }));
  check("flags the browser raised are kept (known ones only)", hooks[0].plan_type === "plan-safety" && JSON.stringify(plans()[0][1].safetyFlags) === '["physicalSigns"]');

  // Third-person and phone-typed phrasings (curly apostrophes) are caught too — parents usually quote their child.
  for (const phrase of ["He said he doesn\u2019t want to be here anymore", "She doesnt want to live", "my son does not want to be alive", "she has been cutting herself", "He said everyone would be better off dead", "he says he wishes he was dead"]) {
    reset(); await mod.handler(event({ body: { answers: { ...worried, q12: phrase } } }));
    check(`safety phrasing caught -> plan-safety, no sales emails: "${phrase}"`, hooks[0] && hooks[0].plan_type === "plan-safety" && hooks[0].guide === "");
  }
  for (const phrase of ["She doesn't want to go to school", "I cut myself a break this week", "my kid killed it at the game"]) {
    reset(); await mod.handler(event({ body: { answers: { ...worried, q12: phrase } } }));
    check(`everyday phrasing is NOT flagged: "${phrase}"`, hooks[0] && hooks[0].plan_type === "plan-standard");
  }

  // --- Consent ---
  reset(); await mod.handler(event({ body: { marketingConsent: true } }));
  check("Playbook opt-in adds the playbook-interest tag", hooks[0].tags.includes("playbook-interest") && hooks[0].playbook_interest === "yes");
  reset(); await mod.handler(event({ body: { marketingConsent: false } }));
  check("no opt-in -> no playbook-interest tag", !hooks[0].tags.includes("playbook-interest") && hooks[0].playbook_interest === "no");

  // --- Language ---
  reset(); await mod.handler(event({ body: { lang: "es" } })); check("Spanish -> language es on the webhook and the plan", hooks[0].language === "es" && plans()[0][1].lang === "es");
  reset(); await mod.handler(event({ body: { lang: "fr" } })); check("unknown language falls back to English", hooks[0].language === "en");

  // --- Guide matching (the Quick Help Guides table) ---
  const guideFor = async (answers, extra = {}) => { reset(); await mod.handler(event({ body: { answers, ...extra } })); return hooks[0] && hooks[0].guide; };
  const base = { q1: "8–10", q12: "What do I do?" };
  check("guide: prevention -> guide-16", (await guideFor({ ...base, q2: opt("q2", "prevent") })) === "guide-16");
  check("guide: mostly online -> guide-10", (await guideFor({ ...base, q2: opt("q2", "Something happened online"), q11: opt("q11", "primarily online") })) === "guide-10");
  check("guide: left out / excluded -> guide-11", (await guideFor({ ...base, q2: opt("q2", "treated badly"), q9: [opt("q9", "left out, ignored, or excluded")] })) === "guide-11");
  check("guide: school did nothing -> guide-19", (await guideFor({ ...base, q2: opt("q2", "treated badly"), q10: opt("q10", "nothing has changed") })) === "guide-19");
  check("guide: school said it isn't bullying -> guide-19", (await guideFor({ ...base, q2: opt("q2", "treated badly"), q10: opt("q10", "said it isn't bullying") })) === "guide-19");
  check("guide: child doesn't want the school told -> guide-04", (await guideFor({ ...base, q2: opt("q2", "treated badly"), q10: opt("q10", "doesn't want") })) === "guide-04");
  check("guide: child told clearly -> guide-03", (await guideFor({ ...base, q2: opt("q2", "treated badly"), q8: opt("q8", "told me clearly") })) === "guide-03");
  check("guide: only hints -> guide-05", (await guideFor({ ...base, q2: opt("q2", "not sure yet"), q8: opt("q8", "only hints") })) === "guide-05");
  check("guide: behavior only -> guide-01", (await guideFor({ ...base, q2: opt("q2", "not sure yet"), q8: opt("q8", "behavior") })) === "guide-01");
  check("guide: nothing concrete -> guide-02", (await guideFor({ ...base, q2: opt("q2", "not sure yet"), q8: opt("q8", "don't have") })) === "guide-02");

  // --- SwipeOne problems ---
  reset(); hookStatus = 500; r = await mod.handler(event());
  check("SwipeOne down -> parent told it's on its way (202 queued), webhook waits in the outbox", r.statusCode === 202 && JSON.parse(r.body).queued === true && stores.outbox && stores.outbox.size === 1);
  check("  plan page still works while it waits", plans().length === 1);
  reset(); delete process.env.SWIPEONE_WEBHOOK_URL; r = await mod.handler(event()); process.env.SWIPEONE_WEBHOOK_URL = HOOK;
  check("webhook not configured -> queued (sent automatically once it's set) + clear log line", r.statusCode === 202 && stores.outbox.size === 1 && errors.some((e) => e.includes("SWIPEONE_WEBHOOK_URL")));
  reset(); const realStore = fakeBlobs.getStore; fakeBlobs.getStore = () => { throw new Error("storage down"); };
  r = await mod.handler(event()); fakeBlobs.getStore = realStore;
  check("storage down -> generic 502 (the PDF still downloads in the browser), nothing sent to SwipeOne", r.statusCode === 502 && hooks.length === 0);

  // --- Security ---
  reset(); r = await mod.handler(event({ body: { html: "<h1>EVIL</h1>", plan_link: "https://evil.example", tags: ["admin"] } }));
  check("attacker-supplied html/link/tags are ignored", r.statusCode === 200 && !JSON.stringify(hooks[0]).includes("evil") && !hooks[0].tags.includes("admin"));
  const e2 = event(); delete e2.headers.origin; reset(); r = await mod.handler(e2);
  check("request with no Origin is rejected (403)", r.statusCode === 403 && hooks.length === 0);
  reset(); r = await mod.handler(event({ headers: { origin: "https://evil.example" } }));
  check("request from another website is rejected (403)", r.statusCode === 403 && hooks.length === 0);
  reset(); const e3 = event(); delete e3.headers.origin; e3.headers.referer = ORIGIN + "/index.html"; r = await mod.handler(e3);
  check("allowed Referer is accepted when Origin is absent", r.statusCode === 200);
  reset(); r = await mod.handler(event({ headers: { origin: "https://shimmering-pegasus-4a4a21.netlify.app" } }));
  check("plan link follows the address the parent used (works before the custom domain is pointed)", hooks[0].plan_link.startsWith("https://shimmering-pegasus-4a4a21.netlify.app/plan/"));
  for (const bad of ["a@b.com,c@d.com", "a@b.com\nBcc: x@y.com", "not-an-email", "", "a b@c.com", "<x@y.com>"]) {
    reset(); r = await mod.handler(event({ body: { to: bad } }));
    check(`bad recipient rejected: ${JSON.stringify(bad)}`, r.statusCode === 400 && hooks.length === 0, String(r.statusCode));
  }
  reset(); r = await mod.handler(event({ body: { website: "http://spam.example" } }));
  check("honeypot filled -> looks like success but saves and sends nothing", r.statusCode === 200 && hooks.length === 0 && plans().length === 0);
  reset(); r = await mod.handler(event({ body: { answers: { ...worried, q1: "999 years old" } } }));
  check("answer that isn't a real option is rejected (400)", r.statusCode === 400 && hooks.length === 0);
  reset(); r = await mod.handler(event({ body: { answers: { ...worried, q6: ["made up option"] } } }));
  check("multi-select with a fake option is rejected (400)", r.statusCode === 400);
  reset(); r = await mod.handler(event({ body: { answers: { q4: "hi" } } }));
  check("answers missing the basics are rejected (400)", r.statusCode === 400);
  reset(); r = await mod.handler(event({ body: { answers: { ...worried, bogus_key: "x" } } }));
  check("unknown extra keys are dropped before saving", r.statusCode === 200 && !("bogus_key" in plans()[0][1].answers));
  reset(); r = await mod.handler(event({ body: { answers: { ...worried, q4: "x".repeat(5000) } } }));
  check("very long text is trimmed before saving", r.statusCode === 200 && plans()[0][1].answers.q4.length === 2000);
  reset(); r = await mod.handler(event({ rawBody: "x".repeat(31000) })); check("oversized request rejected (413)", r.statusCode === 413);
  reset(); r = await mod.handler(event({ headers: { "content-type": "text/plain" } })); check("wrong content type rejected (415)", r.statusCode === 415);
  r = await mod.handler({ httpMethod: "GET", headers: {} }); check("GET rejected (405)", r.statusCode === 405);
  reset(); r = await mod.handler(event({ rawBody: "{not json" })); check("broken JSON rejected (400)", r.statusCode === 400);
  reset(); const c1 = []; for (let i = 0; i < 6; i++) c1.push((await mod.handler(event({ ip: "1.2.3.4", body: { to: `p${i}@example.com` } }))).statusCode);
  check("same visitor: 5 allowed, 6th blocked (429)", c1.slice(0, 5).every((c) => c === 200) && c1[5] === 429, c1.join(","));
  reset(); const c2 = []; for (let i = 0; i < 4; i++) c2.push((await mod.handler(event({ body: { to: "same@example.com" } }))).statusCode);
  check("same recipient: 3 allowed, 4th blocked (429)", c2.slice(0, 3).every((c) => c === 200) && c2[3] === 429, c2.join(","));
  process.env.TURNSTILE_SECRET_KEY = "secret";
  reset(); r = await mod.handler(event()); check("Turnstile on: missing token rejected", r.statusCode === 400 && hooks.length === 0);
  reset(); r = await mod.handler(event({ body: { turnstileToken: "bad" } })); check("Turnstile on: failed check rejected", r.statusCode === 400 && hooks.length === 0);
  reset(); r = await mod.handler(event({ body: { turnstileToken: "good" } })); check("Turnstile on: passed check accepted", r.statusCode === 200 && hooks.length === 1);
  delete process.env.TURNSTILE_SECRET_KEY;
  reset(); hookStatus = 500; await mod.handler(event()); hookStatus = 200; await mod.handler(event());
  check("no parent email, answers or webhook address are ever written to the logs", errors.every((e) => !/parent\d+@example\.com|She has been quiet|TESTHOOK/.test(e)));

  console.error = realError;
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
