// Tests for netlify/functions/send-plan.js.   Run:  node scripts/build-plan-bundle.js && node scripts/test-send-plan.js
// Uses only Node built-ins. Resend and Cloudflare are replaced by a fake fetch, so nothing is really sent.
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
const ORIGIN = "https://assessment.bullyproof.guide";

process.env.RESEND_API_KEY = "test_key";
process.env.FROM_EMAIL = "Bullyproof.Guide <plans@bullyproof.guide>";
delete process.env.TURNSTILE_SECRET_KEY; delete process.env.REPLY_TO; delete process.env.ALLOWED_ORIGINS;

let calls = [], resendStatus = 200, turnstileOk = true;
global.fetch = async (url, opts) => {
  if (String(url).includes("api.resend.com")) { calls.push(JSON.parse(opts.body)); return { ok: resendStatus < 400, status: resendStatus, json: async () => resendStatus < 400 ? { id: "x" } : { message: "SECRET-DETAIL from provider" } }; }
  if (String(url).includes("turnstile")) return { ok: true, json: async () => ({ success: turnstileOk && String(opts.body).includes("response=good") }) };
  throw new Error("unexpected fetch " + url);
};
const errors = []; const realError = console.error; console.error = (...a) => errors.push(a.join(" "));

const mod = require("../netlify/functions/send-plan.js");
const createPlanBuilder = require("../netlify/lib/plan-bundle.js");
const QUESTIONS = createPlanBuilder(ORIGIN).QUESTIONS;
const q = (id) => QUESTIONS.find((x) => x.id === id);
const opt = (id, frag) => q(id).options.find((o) => o.includes(frag));

const worried = { q1: "8–10", q2: opt("q2", "treated badly"), q4: "She has been quiet since it happened.", q6: [opt("q6", "irritable")], q8: opt("q8", "told me clearly"), q12: "How can I help her feel better?" };
let ipCounter = 0;
const event = (over = {}) => ({
  httpMethod: "POST",
  headers: { origin: ORIGIN, "content-type": "application/json", "x-nf-client-connection-ip": over.ip || `10.0.0.${++ipCounter}`, ...(over.headers || {}) },
  body: over.rawBody !== undefined ? over.rawBody : JSON.stringify({ to: `parent${ipCounter}@example.com`, answers: worried, safetyFlags: [], marketingConsent: false, website: "", ...(over.body || {}) })
});
const reset = () => { calls = []; errors.length = 0; mod.__test.hits.ip.clear(); mod.__test.hits.recipient.clear(); resendStatus = 200; };

let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { (ok ? pass++ : fail++); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  <-- " + extra}`); };

(async () => {
  let r;
  reset(); r = await mod.handler(event());
  check("happy path sends exactly one email", r.statusCode === 200 && calls.length === 1, r.body);
  const sent = calls[0] || {};
  check("  from / reply_to / subject come from the server", sent.from === process.env.FROM_EMAIL && !!sent.reply_to && sent.subject === "Your Bullyproof.Guide Action Plan", JSON.stringify([sent.from, sent.reply_to, sent.subject]));
  check("  email is the real branded plan with footer + Delete my data link", /Your Personalized Action Plan/.test(sent.html) && /Delete my data/.test(sent.html) && /receiving this email because/.test(sent.html));
  check("  images point at the site the parent used", sent.html.includes(ORIGIN + "/assets/"));

  reset(); r = await mod.handler(event({ body: { html: "<h1>EVIL PHISHING</h1>", subject: "You won a prize" } }));
  check("attacker-supplied html and subject are ignored", r.statusCode === 200 && !calls[0].html.includes("EVIL") && calls[0].subject === "Your Bullyproof.Guide Action Plan");

  reset(); r = await mod.handler(event({ body: { answers: { ...worried, q4: '<a href="http://evil.example/login">Verify your account</a><script>alert(1)</script>' } } }));
  check("free-text HTML is escaped, not sent as live HTML", r.statusCode === 200 && !calls[0].html.includes('<a href="http://evil.example') && !calls[0].html.includes("<script>alert") && calls[0].html.includes("&lt;a href="));

  reset(); r = await mod.handler(event({ headers: { origin: undefined } })); const noOrigin = r.statusCode;
  const e2 = event(); delete e2.headers.origin; r = await mod.handler(e2);
  check("request with no Origin is rejected (403)", r.statusCode === 403 && calls.length === 0, String(r.statusCode));
  reset(); r = await mod.handler(event({ headers: { origin: "https://evil.example" } }));
  check("request from another website is rejected (403)", r.statusCode === 403 && calls.length === 0);
  reset(); const e3 = event(); delete e3.headers.origin; e3.headers.referer = ORIGIN + "/index.html"; r = await mod.handler(e3);
  check("allowed Referer is accepted when Origin is absent", r.statusCode === 200);

  for (const bad of ["a@b.com,c@d.com", "a@b.com\nBcc: x@y.com", "not-an-email", "", "a b@c.com", "<x@y.com>"]) {
    reset(); r = await mod.handler(event({ body: { to: bad } }));
    check(`bad recipient rejected: ${JSON.stringify(bad)}`, r.statusCode === 400 && calls.length === 0, String(r.statusCode));
  }

  reset(); r = await mod.handler(event({ body: { website: "http://spam.example" } }));
  check("honeypot filled -> looks like success but sends nothing", r.statusCode === 200 && calls.length === 0);

  reset(); r = await mod.handler(event({ body: { answers: { ...worried, q1: "999 years old" } } }));
  check("answer that isn't a real option is rejected (400)", r.statusCode === 400 && calls.length === 0);
  reset(); r = await mod.handler(event({ body: { answers: { ...worried, q6: ["made up option"] } } }));
  check("multi-select with a fake option is rejected (400)", r.statusCode === 400);
  reset(); r = await mod.handler(event({ body: { answers: { q4: "hi" } } }));
  check("answers missing the basics are rejected (400)", r.statusCode === 400);
  reset(); r = await mod.handler(event({ body: { answers: { ...worried, bogus_key: "x" } } }));
  check("unknown extra keys are simply ignored", r.statusCode === 200);
  reset(); r = await mod.handler(event({ body: { answers: { ...worried, q4: "x".repeat(5000) } } }));
  check("very long text is trimmed, not rejected", r.statusCode === 200 && !calls[0].html.includes("x".repeat(2100)));

  reset(); r = await mod.handler(event({ rawBody: "x".repeat(31000) })); check("oversized request rejected (413)", r.statusCode === 413);
  reset(); r = await mod.handler(event({ headers: { "content-type": "text/plain" } })); check("wrong content type rejected (415)", r.statusCode === 415);
  r = await mod.handler({ httpMethod: "GET", headers: {} }); check("GET rejected (405)", r.statusCode === 405);
  reset(); r = await mod.handler(event({ rawBody: "{not json" })); check("broken JSON rejected (400)", r.statusCode === 400);

  reset(); const codes = []; for (let i = 0; i < 6; i++) codes.push((await mod.handler(event({ ip: "1.2.3.4", body: { to: `p${i}@example.com` } }))).statusCode);
  check("same visitor: 5 allowed, 6th blocked (429)", codes.slice(0, 5).every((c) => c === 200) && codes[5] === 429, codes.join(","));
  reset(); const codes2 = []; for (let i = 0; i < 4; i++) codes2.push((await mod.handler(event({ body: { to: "same@example.com" } }))).statusCode);
  check("same recipient: 3 allowed, 4th blocked (429)", codes2.slice(0, 3).every((c) => c === 200) && codes2[3] === 429, codes2.join(","));

  process.env.TURNSTILE_SECRET_KEY = "secret";
  reset(); r = await mod.handler(event()); check("Turnstile on: missing token rejected", r.statusCode === 400 && calls.length === 0);
  reset(); r = await mod.handler(event({ body: { turnstileToken: "bad" } })); check("Turnstile on: failed check rejected", r.statusCode === 400 && calls.length === 0);
  reset(); r = await mod.handler(event({ body: { turnstileToken: "good" } })); check("Turnstile on: passed check accepted", r.statusCode === 200 && calls.length === 1);
  delete process.env.TURNSTILE_SECRET_KEY;

  reset(); r = await mod.handler(event({ body: { answers: { ...worried, q12: "Learn how to keep from killing someone. And How to make him feel better" } } }));
  check("harm language: crisis resources lead the email and subject says 'please read'", /reach out to one of these resources first/.test(calls[0].html) && /please read/.test(calls[0].subject));
  reset(); r = await mod.handler(event({ body: { safetyFlags: ["physicalSigns", "made_up_flag"] } }));
  check("flags the browser raised are kept (known ones only)", r.statusCode === 200 && /reach out to one of these resources first/.test(calls[0].html));
  reset(); r = await mod.handler(event({ body: { marketingConsent: true } })); const withC = calls[0].html;
  reset(); r = await mod.handler(event({ body: { marketingConsent: false } })); const noC = calls[0].html;
  check("consent line appears only when the parent opted in", /reply with the word "unsubscribe"/.test(withC) && !/reply with the word "unsubscribe"/.test(noC));

  reset(); resendStatus = 403; r = await mod.handler(event());
  check("provider failure -> generic 502, provider details never shown to the visitor", r.statusCode === 502 && !r.body.includes("SECRET-DETAIL") && errors.some((e) => e.includes("SECRET-DETAIL")));
  reset(); const key = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY; r = await mod.handler(event()); process.env.RESEND_API_KEY = key;
  check("missing RESEND_API_KEY -> 503 with a clear log line", r.statusCode === 503 && errors.some((e) => e.includes("RESEND_API_KEY")));
  reset(); const from = process.env.FROM_EMAIL; delete process.env.FROM_EMAIL; r = await mod.handler(event()); process.env.FROM_EMAIL = from;
  check("missing FROM_EMAIL -> logs a loud warning about the test sender", errors.some((e) => e.includes("FROM_EMAIL is not set")) && /onboarding@resend.dev/.test(calls[0].from));
  reset(); r = await mod.handler(event()); check("no parent email or answers are ever written to the logs", errors.every((e) => !/parent\d+@example\.com|She has been quiet/.test(e)));

  // The server's email must equal what the browser code itself produces for the same answers.
  const src = ["config.js", "i18n.js", "assessment-data.js", "assessment-data.es.js", "app.js"].map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n").split("\n").filter((l) => l.trim() !== "render();").join("\n");
  const stub = () => ({ style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
  const makeCtx = () => vm.createContext({ window: { location: { origin: ORIGIN, search: "" } }, document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: stub, addEventListener() {}, body: stub(), head: stub() }, localStorage: { getItem: () => null, setItem() {} }, console: { log() {}, warn() {}, error() {} }, URLSearchParams });
  const browserHtml = (answers, consent, lang = "en") => vm.runInContext(`${src}\n;setLang(${JSON.stringify(lang)}); state.answers = ${JSON.stringify(answers)}; state.safetyFlags = []; QUESTIONS.forEach(q => { const v = state.answers[q.id]; if (v === undefined) return; if (q.type === "text") checkTextSafety(v); else checkSafety(q, v); }); state.marketingConsent = ${consent}; buildEmailHtml();`, makeCtx());
  const scenarios = { worried, prevent: { q1: "5–7", q2: opt("q2", "prevent"), q4: "I'm all about prevention.", q12: "How to talk to my kids" }, harm: { ...worried, q12: "Learn how to keep from killing someone" }, teen: { q1: "11–14", q2: opt("q2", "Something happened online"), q6: [opt("q6", "Withdrawing")], q8: opt("q8", "hints"), q12: "What can I say to help?" } };
  for (const lang of ["en", "es"]) for (const [name, ans] of Object.entries(scenarios)) for (const consent of [false, true]) {
    reset(); r = await mod.handler(event({ body: { answers: ans, marketingConsent: consent, lang } }));
    const same = calls[0] && calls[0].html === browserHtml(ans, consent, lang);
    check(`server email is IDENTICAL to the browser-built email (${lang}, ${name}, consent=${consent})`, r.statusCode === 200 && same);
  }
  // Spanish subject lines, and an unknown language falls back to English
  reset(); r = await mod.handler(event({ body: { lang: "es" } }));
  check("Spanish request -> Spanish subject and a Spanish plan", /^Su Plan de Acción/.test(calls[0].subject) && /lang="es"/.test(calls[0].html) && /Su Plan de Acción Personalizado/.test(calls[0].html), calls[0] && calls[0].subject);
  reset(); r = await mod.handler(event({ body: { lang: "fr" } }));
  check("unknown language falls back to English", calls[0].subject === "Your Bullyproof.Guide Action Plan" && !/lang="es"/.test(calls[0].html));

  console.error = realError;
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
