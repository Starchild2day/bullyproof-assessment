// ============================================================
// STATE
// ============================================================
const state = { screen: "landing", qIndex: 0, answers: {}, safetyFlags: [], email: null, sessionId: null };
const appEl = document.getElementById("app");
const progressTrack = document.getElementById("progressTrack");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");

(function loadPlausible() {
  if (!CONFIG.PLAUSIBLE_DOMAIN) return;
  const s = document.createElement("script");
  s.defer = true;
  s.setAttribute("data-domain", CONFIG.PLAUSIBLE_DOMAIN);
  s.src = "https://plausible.io/js/script.js";
  document.head.appendChild(s);
})();

function track(eventName, props) {
  if (window.plausible) { window.plausible(eventName, props ? { props } : undefined); }
  console.log("[analytics]", eventName, props || "");
}

function visibleQuestions() { return QUESTIONS.filter(q => !q.condition || q.condition(state.answers)); }
function currentQuestion() { return visibleQuestions()[state.qIndex]; }

function checkSafety(question, selected) {
  const sel = Array.isArray(selected) ? selected : [selected];

  if (question.safetyEvaluator) {
    const result = question.safetyEvaluator(sel);
    if (result) addFlag(result);
    return;
  }
  if (!question.safetyTriggers) return;
  if (question.safetyTriggers.sexualOrPower) {
    const hit = question.safetyTriggers.sexualOrPower.some(opt => sel.includes(opt));
    if (hit) addFlag("sexualOrPower");
  }
}

// Free-text answers (Q4, Q12) were never being scanned for safety signals
// at all — only fixed-choice answers on other questions triggered the
// escalation banner. This closes that gap: a parent can write anything in
// their own words, and language indicating risk of harm to someone else,
// or risk of self-harm/suicide (the parent's own, or described for the
// child), should surface the same crisis resources immediately, not a
// routine action plan.
function checkTextSafety(rawText) {
  if (!rawText) return;
  const text = rawText.toLowerCase();
  const selfHarmPattern = /\b(suicide|suicidal)\b|\b(kill|hurt|harm)(ing)?\s+(myself|himself|herself|themselves)\b|\bwant(s|ed)?\s+to\s+die\b|\bend(ing)?\s+(my|his|her|their)\s+life\b|\bdon'?t\s+want\s+to\s+(live|be\s+here)\b/;
  const violencePattern = /\bkill(ing)?\b|\b(hurt|harm)(ing)?\s+(him|her|them|someone|somebody)\b|\bwant(s|ed)?\s+to\s+hurt\b/;
  if (selfHarmPattern.test(text)) { addFlag("selfHarmOrSuicide"); return; }
  if (violencePattern.test(text)) { addFlag("violenceRisk"); }
}

function addFlag(key) {
  if (!state.safetyFlags.includes(key)) { state.safetyFlags.push(key); track("safety_escalation_triggered", { trigger: key }); }
}

function render() {
  const useFixedShell = state.screen === "question" && (state.safetyFlags.length === 0 || state.safetyAcknowledged);
  document.body.classList.toggle("question-mode", useFixedShell);
  document.body.classList.toggle("landing-mode", state.screen === "landing");
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (state.screen === "landing") return renderLanding();
  if (state.screen === "question") return renderQuestion();
  if (state.screen === "results") return renderResults();
  if (state.screen === "invite") return renderInvite();
}

function renderLanding() {
  progressTrack.style.display = "none";
  let returningNotice = "";
  try {
    const prior = JSON.parse(localStorage.getItem("bp_completions") || "[]");
    const preview = new URLSearchParams(window.location.search).get("returning") === "1";
    if (prior.length >= 1 || preview) {
      returningNotice = `
        <div style="background:var(--gold-soft);border-left:4px solid var(--gold);border-radius:10px;padding:14px 16px;margin:0 0 18px;">
          <p style="margin:0;font-size:14px;color:var(--navy-deep);"><strong>Welcome back.</strong> It looks like you've already taken this check-in. If your situation has changed, go ahead and take it again. For ongoing, personalized support as things keep changing, that's exactly what <a href="${NETWORK_HOME_URL}" style="color:var(--navy);font-weight:600;">Bullyproof.Support</a> and the upcoming Parent Playbook are built for.</p>
        </div>`;
    }
  } catch (e) { /* storage unavailable — just skip the notice */ }
  appEl.innerHTML = `
    <div class="card">
      ${banner(LANDING_ICON, { large: true, imageSrc: assetUrl("icon-landing.png"), showLogo: true })}
      <div class="card-body">
      <h1>You don't have to figure this out alone.</h1>
      <p class="body-text">Twelve quick questions — about 3 minutes — and you'll have a personalized action plan for your exact situation, sent straight to your inbox tonight.</p>
      ${returningNotice}
      <p class="privacy-note">Your responses are saved securely and only used to generate your action plan. We never share your data.</p>
      <div class="checkbox-row">
        <input type="checkbox" id="consentCheck">
        <label for="consentCheck">I understand this tool gives general information only. It is not medical, mental health, or legal advice, and it doesn't guarantee any specific result. If my child is in immediate danger, I'll call 911 or a crisis line right away instead of relying on this tool. I agree to the <a href="https://www.bullyproof.support/about/terms" target="_blank">Terms of Use</a> and <a href="https://www.bullyproof.support/about/privacy" target="_blank">Privacy Policy</a>.</label>
      </div>
      <div class="nav-row" style="justify-content:flex-start;">
        <button class="primary" id="startBtn" disabled>Start the Assessment</button>
      </div>
      </div>
    </div>
  `;
  const consentCheck = document.getElementById("consentCheck");
  const startBtn = document.getElementById("startBtn");
  consentCheck.addEventListener("change", () => { startBtn.disabled = !consentCheck.checked; });
  startBtn.addEventListener("click", () => {
    if (startBtn.disabled) return;
    state.consentGiven = true;
    track("assessment_started");
    state.screen = "question";
    state.qIndex = 0;
    render();
  });
}

function renderProgress() {
  const total = visibleQuestions().length;
  const pct = Math.round((state.qIndex / total) * 100);
  progressTrack.style.display = "block";
  progressFill.style.width = pct + "%";
  progressLabel.textContent = `Question ${state.qIndex + 1} of ${total}`;
}

function renderQuestion() {
  const q = currentQuestion();
  if (!q) { state.screen = "results"; return render(); }
  renderProgress();
  let safetyHTML = state.safetyFlags.length ? renderSafetyBanner() : "";
  let bodyHTML = "";
  if (q.type === "choice") bodyHTML = renderChoice(q);
  else if (q.type === "multi") bodyHTML = renderMulti(q);
  else if (q.type === "text") bodyHTML = renderText(q);
  appEl.innerHTML = `
    ${safetyHTML}
    <div class="card">
      ${q.icon ? banner(q.icon, { imageSrc: questionIconUrl(q.id) }) : ""}
      <div class="card-body">
      <div class="card-fixed">
        <h2 class="question">${qTitle(q)}</h2>
        ${qSub(q) ? `<p class="sub">${qSub(q)}</p>` : ""}
      </div>
      <div class="options-scroll">
        ${bodyHTML}
      </div>
      <p id="validationMsg" style="display:none;color:#B23A48;font-size:13.5px;margin:0 0 8px;font-weight:600;">Please select an answer to continue.</p>
      <div class="nav-row">
        <button class="ghost" id="backBtn" ${state.qIndex === 0 ? "disabled style='visibility:hidden'" : ""}>Back</button>
        <button class="primary" id="nextBtn">Next</button>
      </div>
      </div>
    </div>
  `;
  wireQuestionEvents(q);
  wireSafetyBanner();
  track("question_answered_view", { question: q.id });
}

function renderSafetyBanner() {
  const priority = ["selfHarmOrSuicide", "violenceRisk", "sexualOrPower", "physicalSigns"];
  const key = priority.find(k => state.safetyFlags.includes(k));
  const variant = SAFETY_VARIANTS[key];

  if (state.safetyAcknowledged) {
    return `
      <div class="safety-banner safety-banner-mini">
        <strong>Crisis resources:</strong> ${variant.resources.map(r => r.name + " — " + r.detail).join(" · ")}
      </div>
    `;
  }

  return `
    <div class="safety-banner">
      <h3>Please know help is available right now</h3>
      <p>Based on what you've shared, we want to make sure you have these resources close by. You can keep going with the assessment whenever you're ready.</p>
      <ul>${variant.resources.map(r => `<li><strong>${r.name}</strong> — ${r.detail}</li>`).join("")}</ul>
      <button type="button" id="safetyAckBtn" class="safety-ack-btn">I've seen these — continue</button>
    </div>
  `;
}

function wireSafetyBanner() {
  const btn = document.getElementById("safetyAckBtn");
  if (btn) {
    btn.addEventListener("click", () => {
      state.safetyAcknowledged = true;
      render();
    });
  }
}

const CHECKMARK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;

// Prevention-path wording: a parent who chose "I'm trying to prevent
// problems before they start" should never be asked questions that
// assume something is already happening, so questions can carry their own
// prevention title/subtitle and extra options (listed last, so they read every option first).
function qTitle(q) { return (isPreventive() && q.preventTitle) || q.title; }
function qSub(q) { return (isPreventive() && q.preventSub) || q.sub; }
function qOptions(q) {
  if (!isPreventive()) return q.options;
  const base = q.preventReplace ? q.options.map(o => q.preventReplace[o] || o) : q.options;
  return q.preventExtra ? [...base, ...q.preventExtra] : base;
}

function renderChoice(q) {
  const selected = state.answers[q.id];
  return `<div class="options" role="radiogroup">${qOptions(q).map(opt => `<button type="button" class="option-btn ${selected === opt ? "selected" : ""}" data-value="${escapeAttr(opt)}" role="radio" aria-checked="${selected === opt}"><span class="check">${CHECKMARK_SVG}</span><span>${opt}</span></button>`).join("")}</div>`;
}

function renderMulti(q) {
  const selected = state.answers[q.id] || [];
  return `<div class="options" role="group">${qOptions(q).map(opt => `<button type="button" class="option-btn multi-opt ${selected.includes(opt) ? "selected" : ""}" data-value="${escapeAttr(opt)}" role="checkbox" aria-checked="${selected.includes(opt)}"><span class="check">${CHECKMARK_SVG}</span><span>${opt}</span></button>`).join("")}</div>`;
}

function renderText(q) {
  const val = state.answers[q.id] || "";
  return `<textarea id="textInput" rows="5" placeholder="Type here...">${val}</textarea>`;
}

function escapeAttr(s) { return String(s).replace(/"/g, "&quot;"); }
// Free-text answers (Q4, Q12) come from the parent's keyboard — always escape them before they go inside email HTML.
function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

function banner(svgInner, opts) {
  opts = opts || {};
  const large = !!opts.large;
  const vbH = large ? 130 : 84;
  // Fixed CSS pixel sizes for the icon — independent of any SVG viewBox
  // scaling math, which is exactly what kept producing inconsistent
  // results across renders. A plain <img>, centered by the container's
  // own flexbox, behaves the same everywhere.
  const iconPx = large ? 116 : 74;
  const logoContent = opts.showLogo ? `
    <div style="position:absolute;top:22px;left:24px;display:flex;align-items:center;gap:8px;z-index:2;">
      <div style="width:16px;height:16px;border-radius:4px;background:#101B33;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <span style="font-family:Inter,sans-serif;font-size:9px;font-weight:800;color:#C89B3C;line-height:1;">B</span>
      </div>
      <span style="font-family:Inter,sans-serif;font-size:8px;font-weight:600;color:#EFDFB8;">Bullyproof.Guide</span>
    </div>
  ` : "";
  const iconHtml = opts.imageSrc
    ? `<img src="${opts.imageSrc}" alt="" style="width:${iconPx}px;height:${iconPx}px;object-fit:contain;display:block;position:relative;z-index:1;">`
    : `<svg width="${Math.round(iconPx * 0.65)}" height="${Math.round(iconPx * 0.65)}" viewBox="0 0 24 24" fill="none" stroke="#EFDFB8" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" style="position:relative;z-index:1;">${svgInner}</svg>`;
  return `<div class="banner${large ? " landing-banner" : ""}">
    <svg viewBox="0 0 400 ${vbH}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="position:absolute;top:0;left:0;width:100%;height:100%;z-index:0;">
      <circle cx="46" cy="${vbH - 18}" r="42" fill="#4F7C82" opacity="0.28"/>
      <circle cx="366" cy="14" r="54" fill="#C89B3C" opacity="0.16"/>
      <circle cx="330" cy="${vbH - 12}" r="22" fill="#FFFFFF" opacity="0.05"/>
    </svg>
    ${iconHtml}
    ${logoContent}
  </div>`;
}

function questionIconUrl(qid) {
  return `${window.location.origin}/assets/icon-${qid}.png`;
}

function rerenderCurrentQuestion() {
  const scrollEl = document.querySelector(".options-scroll");
  const savedOptionsScroll = scrollEl ? scrollEl.scrollTop : 0;
  const savedWindowScroll = window.scrollY;

  const useFixedShell = state.safetyFlags.length === 0 || state.safetyAcknowledged;
  document.body.classList.toggle("question-mode", useFixedShell);
  renderQuestion();

  const newScrollEl = document.querySelector(".options-scroll");
  if (newScrollEl) newScrollEl.scrollTop = savedOptionsScroll;
  else window.scrollTo(0, savedWindowScroll);
}

function wireQuestionEvents(q) {
  document.getElementById("backBtn").addEventListener("click", () => { if (state.qIndex > 0) { state.qIndex--; render(); } });
  document.getElementById("nextBtn").addEventListener("click", () => onNext(q));
  if (q.type === "choice") { document.querySelectorAll(".option-btn").forEach(btn => { btn.addEventListener("click", () => { state.answers[q.id] = btn.dataset.value; checkSafety(q, btn.dataset.value); rerenderCurrentQuestion(); }); }); }
  if (q.type === "multi") { document.querySelectorAll(".multi-opt").forEach(btn => { btn.addEventListener("click", () => { const val = btn.dataset.value; const arr = state.answers[q.id] || []; const idx = arr.indexOf(val); if (idx >= 0) arr.splice(idx, 1); else arr.push(val); state.answers[q.id] = arr; checkSafety(q, arr); rerenderCurrentQuestion(); }); }); }
}

function onNext(q) {
  if (q.type === "text") {
    state.answers[q.id] = document.getElementById("textInput").value.trim();
    checkTextSafety(state.answers[q.id]);
  }
  if (q.type === "choice" && !state.answers[q.id]) {
    const msg = document.getElementById("validationMsg");
    if (msg) msg.style.display = "block";
    return;
  }
  if (q.type === "multi" && (!state.answers[q.id] || state.answers[q.id].length === 0)) {
    const msg = document.getElementById("validationMsg");
    if (msg) msg.style.display = "block";
    return;
  }
  track("question_answered", { question: q.id });
  state.qIndex++;
  render();
}

function saveProgressToFirebase() {
  if (!CONFIG.FIREBASE_DATABASE_URL) return;
  if (!state.sessionId) state.sessionId = "s_" + Math.random().toString(36).slice(2, 12);
  const payload = { answers: state.answers, qIndex: state.qIndex, email: state.email, updatedAt: Date.now() };
  fetch(`${CONFIG.FIREBASE_DATABASE_URL}/sessions/${state.sessionId}.json`, { method: "PUT", body: JSON.stringify(payload) }).catch(err => console.warn("Firebase save failed (non-blocking):", err));
}

function renderResults() {
  progressTrack.style.display = "none";
  track("assessment_completed");
  saveProgressToFirebase();
  if (!state.completionRecorded) {
    state.completionRecorded = true;
    try {
      const prior = JSON.parse(localStorage.getItem("bp_completions") || "[]");
      prior.push(Date.now());
      localStorage.setItem("bp_completions", JSON.stringify(prior.slice(-10)));
    } catch (e) { /* storage unavailable — not critical, just skip the nudge later */ }
  }
  const summary = deriveSummary();
  const q2Answer = state.answers.q2 || "your situation";
  const reflection = [communicationReflection(), openingValidation()].filter(Boolean).join(" ");
  appEl.innerHTML = `
    ${state.safetyFlags.length ? renderSafetyBanner() : ""}
    <div class="card">
      ${banner(RESULTS_ICON, { imageSrc: assetUrl("icon-results.png") })}
      <div class="card-body">
      <div class="results-summary">
        <h3>Here's what we're seeing</h3>
        <p class="summary-label">You told us:</p>
        <p class="summary-quote">"${q2Answer}"</p>
        ${reflection ? `<p class="summary-reflection">${reflection}</p>` : ""}
      </div>
      <h2 class="question">Where should we send your action plan?</h2>
      <p class="sub">One email. Your personalized plan, plus a copy you can keep.</p>
      <input type="email" id="finalEmail" placeholder="you@email.com" value="${state.email || ""}">
      <div style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;" aria-hidden="true"><label>Leave this empty<input type="text" id="hpWebsite" tabindex="-1" autocomplete="off"></label></div>
      <div id="turnstileBox" style="margin-top:12px;"></div>
      <div class="nav-row">
        <button class="ghost" id="backToQ">Back</button>
        <button class="primary" id="getPlanBtn">Get My Action Plan</button>
      </div>
      <p id="planStatus" role="status" aria-live="polite" style="display:none;margin:12px 0 0;font-size:14.5px;line-height:1.5;"></p>
      <div class="results-summary" id="includedPreview" style="margin-top:18px;">
        <p style="margin:0;font-size:14.5px;">Included in your complimentary Action Plan:</p>
        <ul style="margin:6px 0 0;padding-left:20px;font-size:14px;">
          <li>Top 3 next steps for your specific situation</li>
          <li>Targeted, recommended reading</li>
          <li>Links to free helpful tools</li>
          <li>Connections to appropriate local professionals</li>
          <li>...and more!</li>
        </ul>
      </div>
      <p class="privacy-note">Your responses are saved securely and only used to generate your action plan. We never share your data. Every follow-up email includes a "Delete my data" link.</p>
      </div>
    </div>
  `;
  document.getElementById("backToQ").addEventListener("click", () => { state.screen = "question"; state.qIndex = visibleQuestions().length - 1; render(); });
  wireSafetyBanner();
  initTurnstile();
  document.getElementById("getPlanBtn").addEventListener("click", async () => {
    const btn = document.getElementById("getPlanBtn");
    const emailInput = document.getElementById("finalEmail");
    const email = emailInput.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { emailInput.style.borderColor = "#C53030"; setPlanStatus("Please enter a valid email address.", "error"); return; }
    if (CONFIG.TURNSTILE_SITE_KEY && !state.turnstileToken) { setPlanStatus("Please complete the quick check above so we know you're a person.", "error"); return; }
    emailInput.style.borderColor = "";
    state.email = email;
    state.honeypot = document.getElementById("hpWebsite").value;
    btn.disabled = true; btn.textContent = "Sending…";
    setPlanStatus("Sending your plan…", "info");
    await submitToFormspree();
    const sent = await sendPlanByEmail();
    let pdfOk = true;
    try { await generatePDF(); track("pdf_downloaded"); } catch (err) { pdfOk = false; console.warn("PDF creation failed:", err); }
    btn.disabled = false; btn.textContent = sent.ok ? "Send it again" : "Try again";
    setPlanStatus(planStatusMessage(sent, pdfOk, email), sent.ok ? "success" : "error");
    // Once the plan is on its way, the "what's included" preview has done its job — hide it.
    if (sent.ok || pdfOk) { const inc = document.getElementById("includedPreview"); if (inc) inc.style.display = "none"; }
  });
}

// ============================================================
// PLAYBOOK INVITATION (opt-in)
// The invitation checkbox appears only AFTER the Playbook has been
// introduced, so parents know what they're saying yes to: from the
// "Reserve my copy" boxes in the Playbook section of the
// email and the PDF, which opens ?invite=1. (Per Mark: not on the
// email-entry screen, before or after sending.)
// ============================================================
const PLAYBOOK_INVITE_LABEL = "Yes, please send me the invitation to try the Bullyproof Parent Playbook, plus occasional updates. I can unsubscribe any time.";

function playbookInviteUrl() {
  return `${window.location.origin}/?invite=1`;
}

function playbookInviteHtml(askEmail) {
  return `
    <div style="background:#F5F6FB;border:1px solid #E1E4EA;border-radius:12px;padding:18px;margin:18px 0 0;">
      <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;">
        <img src="${playbookBoxImageUrl()}" alt="The Bullyproof Parent Playbook" style="width:96px;border-radius:6px;flex-shrink:0;">
        <div style="flex:1;min-width:200px;">
          <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:var(--navy-deep);">The Bullyproof Parent Playbook</p>
          <p style="margin:0 0 8px;font-size:14.5px;font-weight:600;color:var(--navy-deep);">Personalized guidance that grows with your child.</p>
          <p style="margin:0 0 8px;font-size:14.5px;color:var(--text);">${PLAYBOOK_BLURB}</p>
          <p style="margin:0;font-size:14px;color:var(--text);">When it launches, you can try it FREE for one week.</p>
        </div>
      </div>
      ${askEmail ? `<input type="email" id="inviteEmail" placeholder="you@email.com" style="margin-top:14px;">` : ""}
      <div class="checkbox-row" style="margin-top:14px;">
        <input type="checkbox" id="marketingConsent">
        <label for="marketingConsent">${PLAYBOOK_INVITE_LABEL}</label>
      </div>
      <div class="nav-row" style="justify-content:flex-start;margin-top:10px;">
        <button class="primary" id="saveInviteBtn" disabled>Reserve my copy</button>
      </div>
      <p id="inviteStatus" role="status" aria-live="polite" style="display:none;margin:10px 0 0;font-size:14.5px;line-height:1.5;"></p>
    </div>`;
}

function wirePlaybookInvite(askEmail) {
  const box = document.getElementById("marketingConsent");
  const btn = document.getElementById("saveInviteBtn");
  const status = document.getElementById("inviteStatus");
  box.addEventListener("change", () => { btn.disabled = !box.checked; });
  btn.addEventListener("click", async () => {
    if (!box.checked) return;
    let email = state.email;
    if (askEmail) {
      const input = document.getElementById("inviteEmail");
      email = input.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { input.style.borderColor = "#C53030"; status.style.display = "block"; status.style.color = "#C53030"; status.textContent = "Please enter a valid email address."; return; }
      input.style.borderColor = "";
    }
    btn.disabled = true; btn.textContent = "Saving…";
    const ok = await submitPlaybookInvite(email);
    status.style.display = "block";
    status.style.color = ok ? "#276749" : "#C53030";
    status.textContent = ok
      ? `Your copy is reserved. We'll send your invitation to ${email} when the Playbook launches.`
      : "We couldn't save that just now. Please try again in a minute.";
    btn.textContent = ok ? "Reserved" : "Reserve my copy";
    btn.disabled = ok;
    if (ok) { state.marketingConsent = true; box.disabled = true; }
  });
}

async function submitPlaybookInvite(email) {
  if (!CONFIG.FORMSPREE_ENDPOINT) { console.warn("Formspree endpoint not configured."); return false; }
  try {
    const res = await fetch(CONFIG.FORMSPREE_ENDPOINT, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        _replyto: email,
        _subject: "Playbook invitation request",
        marketing_consent: "yes",
        source: "Playbook invitation opt-in"
      })
    });
    if (res.ok) track("playbook_invite_optin");
    return res.ok;
  } catch (err) { console.warn("Playbook invite submission failed:", err); return false; }
}

function renderInvite() {
  progressTrack.style.display = "none";
  appEl.innerHTML = `
    <div class="card">
      ${banner(RESULTS_ICON, { imageSrc: assetUrl("icon-results.png") })}
      <div class="card-body">
        <h2 class="question">Reserve your copy of the Playbook</h2>
        <p class="sub">Enter the email where you received your action plan.</p>
        ${playbookInviteHtml(true)}
        <p class="privacy-note">We never share your data. Every email includes a way to unsubscribe.</p>
      </div>
    </div>`;
  wirePlaybookInvite(true);
}

function isPreventive() {
  return (state.answers.q2 || "").includes("prevent");
}

// Sunbeam/Shining Moments is valuable beyond the prevention path — anywhere
// a child is showing signs of an emotional challenge, regardless of age,
// since the bedtime redirection technique works whether or not they have
// words for what they're feeling yet.
function hasEmotionalChallengeSignals() {
  const q6 = state.answers.q6 || [];
  const distressBehaviors = [
    "Withdrawing from family activities they used to enjoy",
    "More irritable, tearful, or anxious than usual",
    "Reluctant to go to school or ride the bus",
    "Avoiding certain places, people, or activities they used to like"
  ];
  if (q6.some(b => distressBehaviors.includes(b))) return true;
  const comm = communicationStatus();
  if (comm === "behavior-only" || comm === "no-signals") return true;
  return false;
}

// The Q2 choices are worded in the parent's own first-person voice ("My
// child told me..."), which clashed with the rest of the plan speaking TO
// them ("Your child hasn't said anything..."). Restate them in second person.
function q2Statement() {
  const q2 = state.answers.q2 || "";
  if (q2.includes("not sure yet")) return "You have a feeling something's off, but you're not sure what yet.";
  if (q2.includes("concerning at school")) return "You've noticed something concerning at school.";
  if (q2.includes("Something happened online")) return "Something happened online or on social media.";
  if (q2.includes("treated badly")) return "Your child told you they're being treated badly by other kids.";
  return q2 ? q2.replace(/\.$/, "") + "." : "You're working through a bullying situation.";
}

function deriveSummary() {
  if (isPreventive()) return "Nothing has gone wrong that you know of, and you're getting ahead of it. That's the best time to build the habits that protect kids.";
  const status = communicationStatus();
  const statusText = {
    "clear": "Your child has spoken with you directly about it.",
    "hints": "Your child has shared pieces of it, but not the full picture yet.",
    "behavior-only": "Your child hasn't said anything directly, but their behavior is telling you something.",
    "no-signals": "Nothing concrete yet — you're going on instinct."
  }[status] || "";
  // Don't say the same thing twice when Q2 already says the child told them.
  const redundant = (state.answers.q2 || "").includes("treated badly") && status === "clear";
  return `${q2Statement()}${statusText && !redundant ? " " + statusText : ""}`;
}

// Same underlying observation as deriveSummary(), but returned separately
// from the parent's own quoted words — used on-screen so "what they said"
// and "what we're reflecting back" read as two clearly distinct things,
// not one blended paragraph the reader has to untangle.
function communicationReflection() {
  if (isPreventive()) return "";
  return {
    "clear": "Your child has spoken with you directly about it.",
    "hints": "Your child has shared pieces of it, but not the full picture yet.",
    "behavior-only": "Your child hasn't said anything directly, but their behavior is telling you something.",
    "no-signals": "Nothing concrete yet — you're going on instinct."
  }[communicationStatus()] || "";
}

function buildReadableSummary() {
  const lines = [];
  QUESTIONS.forEach(q => {
    const ans = state.answers[q.id];
    if (ans === undefined || ans === null || ans === "") return;
    const formatted = Array.isArray(ans)
      ? ans.join(", ")
      : (typeof ans === "object" ? Object.entries(ans).map(([k, v]) => `${k}: ${v}`).join(" | ") : ans);
    lines.push(`Q: ${q.title}\nA: ${formatted}`);
  });
  return lines.join("\n\n");
}

function buildEmailHtml() {
  const navy = "#1B2A4A", navyDeep = "#101B33", text = "#1F2430", muted = "#5B6472", gold = "#C89B3C";
  const sections = [];

  // One consistent section-header treatment used everywhere below —
  // this is the single biggest visual-hierarchy fix: previously every
  // section (You told us, What actually helps, Recommended reading, etc.)
  // used the exact same flat inline-bold text with no real distinction
  // from body copy, so nothing stood out and the whole plan read as one
  // undifferentiated block.
  const sectionHeader = (label) => `<table role="presentation" style="width:100%;margin:28px 0 10px;"><tr><td style="border-bottom:2px solid ${gold};padding-bottom:8px;"><span style="color:${navy};font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">${label}</span></td></tr></table>`;

  if (state.safetyFlags.length) {
    const priority = ["selfHarmOrSuicide", "violenceRisk", "sexualOrPower", "physicalSigns"];
    const key = priority.find(k => state.safetyFlags.includes(k));
    const variant = SAFETY_VARIANTS[key];
    sections.push(`
      <div style="background:#FDEDED;border-left:4px solid #B23A48;border-radius:8px;padding:16px 18px;margin-bottom:20px;">
        <p style="margin:0 0 8px;font-weight:700;color:#B23A48;font-size:16px;">Please reach out to one of these resources first:</p>
        <ul style="margin:0;padding-left:20px;color:#7A2E31;font-size:14px;">
          ${variant.resources.map(r => `<li><strong>${r.name}</strong> — ${r.detail}</li>`).join("")}
        </ul>
      </div>
    `);
  }

  if (state.answers.q4) {
    sections.push(`${sectionHeader("You told us")}<p style="color:${text};font-size:15.5px;font-style:italic;margin:0;">"${escapeHtml(state.answers.q4)}"</p>`);
  }
  if (openingValidation()) {
    sections.push(`<p style="color:${muted};font-size:14.5px;margin:10px 0 0;">${openingValidation()}</p>`);
  }
  sections.push(`${sectionHeader(isPreventive() ? "Where you're starting" : "What's happening")}<p style="color:${text};font-size:15px;margin:0;">${deriveSummary()}</p>`);
  if (focusLine()) {
    sections.push(`<p style="color:${text};font-size:14.5px;font-style:italic;margin:10px 0 0;">${escapeHtml(focusLine())}</p>`);
  }
  if (wordsAnswer()) {
    const w = wordsAnswer();
    sections.push(`
      ${sectionHeader(w.title)}
      <p style="color:${text};font-size:15px;line-height:1.6;margin:0 0 14px;">${w.lead}</p>
      <table role="presentation" style="width:100%;margin:0 0 16px;"><tr><td style="background:#EEF2F7;border-left:4px solid ${gold};border-radius:6px;padding:16px 18px;"><p style="color:${navyDeep};font-size:18px;font-weight:700;line-height:1.5;margin:0;">“${w.quote}”</p></td></tr></table>
      <p style="color:${muted};font-size:13px;font-weight:700;margin:0 0 4px;">${w.reframeLead}</p>
      <p style="color:${text};font-size:15px;font-style:italic;margin:0 0 14px;">“${w.reframe}”</p>
      <p style="color:${muted};font-size:14px;margin:0 0 10px;"><strong style="color:${navy};">Why it works:</strong> ${w.why}</p>
      <p style="color:${muted};font-size:13.5px;margin:0;">${w.teaser}</p>`);
  }
  if (multiChildNote()) {
    sections.push(`<p style="color:${text};background:#F9FAFC;border:1px solid #E1E4EA;border-radius:8px;padding:12px 14px;font-size:14.5px;margin:14px 0 0;">${multiChildNote()}</p>`);
  }
  if (selfReflectionNote()) {
    sections.push(`<p style="color:${muted};font-size:14.5px;margin:10px 0 0;">${selfReflectionNote()}</p>`);
  }
  sections.push(`${sectionHeader("What actually helps")}<p style="color:${text};font-size:15px;margin:0;">${whyThisMattersNote()}</p>`);
  sections.push(`
    ${sectionHeader("Your next 3 steps")}
    <table role="presentation" style="width:100%;">
      ${stepParts().map(([stepT, stepR], i) => `
        <tr>
          <td style="width:28px;vertical-align:top;padding:0 10px 14px 0;">
            <div style="width:24px;height:24px;border-radius:50%;background:${navy};color:#fff;font-size:13px;font-weight:700;text-align:center;line-height:24px;">${i + 1}</div>
          </td>
          <td style="vertical-align:top;padding:0 0 14px;">
            ${stepT ? `<p style="color:${navyDeep};font-size:16px;font-weight:700;margin:1px 0 4px;">${stepT}</p>` : ""}<p style="color:${text};font-size:14.5px;margin:${stepT ? "0" : "1px 0 0"};">${stepR}</p>
          </td>
        </tr>
      `).join("")}
    </table>
  `);
  const watchFor = preventionWatchForNote();
  if (watchFor) {
    sections.push(`
      ${sectionHeader("What to watch for")}
      <p style="color:${text};font-size:15px;margin:0 0 10px;">${watchFor.intro}</p>
      <ul style="color:${text};font-size:14.5px;padding-left:20px;margin:0 0 10px;">
        ${watchFor.items.map(i => `<li style="margin-bottom:8px;">${i}</li>`).join("")}
      </ul>
      <p style="color:${muted};font-size:14px;margin:0;">${watchFor.outro}</p>
    `);
  }
  const proNote = professionalSupportNote();
  if (proNote) {
    sections.push(`${sectionHeader("Worth considering")}<p style="color:${text};font-size:15px;margin:0;">${proNote}</p>`);
  }

  // Recommended reading now comes after the steps — a natural answer to
  // "okay, what do I actually read," not a cold opener. On the prevention
  // path, Sunbeam leads — it's the most directly actionable, tonight,
  // of anything recommended here. Everything here now sits inside one
  // consistent card, matching the visual weight the Playbook section
  // already had — previously this was the one major section with no
  // card treatment at all, which made it feel like an afterthought.
  if (sunbeamResource()) {
    sections.push(`
    ${sectionHeader("A nightly opportunity")}
      <table role="presentation" style="width:100%;background:#FFFBF3;border:1px solid #EADFC6;border-top:4px solid ${gold};border-radius:12px;margin:0;overflow:hidden;"><tr><td style="padding:28px 26px 26px;">
        ${sunbeamResource().introCaption.split("\n\n").map((para, i) => {
          if (i === 0) return `<p style="color:${navyDeep};font-family:Georgia,'Times New Roman',serif;font-size:19px;line-height:1.6;margin:0 0 18px;">${para}</p>`;
          if (i === 1) {
            return `<p style="color:${text};font-size:15.5px;line-height:1.75;margin:0 0 18px;">${para}</p>
              <table role="presentation" style="width:100%;margin:0 0 22px;"><tr><td style="border-left:4px solid ${gold};padding:6px 0 6px 18px;"><p style="color:${navyDeep};font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:21px;font-weight:700;line-height:1.45;margin:0;">${sunbeamResource().pullQuote}</p></td></tr></table>`;
          }
          return `<p style="color:${text};font-size:15.5px;line-height:1.75;margin:0 0 18px;">${para}</p>`;
        }).join("")}
        <p style="color:#A87C2A;font-size:12px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;text-align:center;margin:26px 0 12px;">Start collecting your child's Shining Moments</p>
        <img src="${sunbeamResource().shiningMomentsSpreadImg}" alt="Shining Moments pages from the back of the book" width="100%" style="border-radius:8px;display:block;max-width:100%;">
        <table role="presentation" style="width:100%;background:#ffffff;border:1px solid #EADFC6;border-radius:8px;margin:16px 0 24px;"><tr><td style="padding:16px 18px;">
          <p style="color:#A87C2A;font-size:11px;font-weight:800;letter-spacing:0.12em;margin:0 0 6px;text-transform:uppercase;">How it works</p>
          <p style="color:${navyDeep};font-size:15px;line-height:1.65;margin:0;">${sunbeamResource().closeupCaption}</p>
        </td></tr></table>
        <table role="presentation" style="width:100%;background:${navyDeep};border-radius:10px;"><tr><td style="padding:30px 22px 32px;text-align:center;">
          <table role="presentation" style="margin:0 auto 16px;"><tr><td style="width:44px;border-top:2px solid ${gold};font-size:0;line-height:0;">&nbsp;</td></tr></table>
          <p style="color:#DCE3F2;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:16px;line-height:1.55;margin:0 0 14px;">You'll find these pages waiting in the back of the award-winning children's book</p>
          <p style="color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:18px;letter-spacing:0.04em;margin:0 0 2px;">The Adventures of the</p>
          <p style="color:#E3B85A;font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:700;letter-spacing:0.03em;line-height:1.15;margin:0;">True Sunbeam</p>
          <table role="presentation" style="margin:16px auto 0;"><tr><td style="width:44px;border-top:2px solid ${gold};font-size:0;line-height:0;">&nbsp;</td></tr></table>
        </td></tr></table>
          <!-- Coloring book (left) · Ray (center) · Story book (right), each with its own caption, link and button -->
          <table role="presentation" style="width:100%;margin:22px 0 0;border-collapse:collapse;">
            <tr>
              <td style="text-align:center;width:33%;vertical-align:bottom;padding:0 4px;">
                <a href="${sunbeamResource().coloringPagesUrl}" style="text-decoration:none;border:0;"><img src="${sunbeamResource().coloringImg}" alt="The Adventures of the True Sunbeam Coloring Book" width="92" border="0" style="border-radius:4px;display:block;margin:0 auto;border:0;"></a>
              </td>
              <td style="text-align:center;width:34%;vertical-align:bottom;padding:0 4px;">
                <img src="${sunbeamResource().rayImg}" alt="Ray the Sunbeam plush toy" width="80" style="display:block;margin:0 auto;">
              </td>
              <td style="text-align:center;width:33%;vertical-align:bottom;padding:0 4px;">
                <a href="${sunbeamResource().animatedCoverUrl}" style="text-decoration:none;border:0;"><img src="${sunbeamResource().fullColorImg}" alt="The Adventures of the True Sunbeam" width="92" border="0" style="border-radius:4px;display:block;margin:0 auto;border:0;"></a>
              </td>
            </tr>
            <tr>
              <td style="text-align:center;vertical-align:top;padding:8px 4px 0;line-height:1.35;">
                <span style="color:${muted};font-size:11.5px;">Coloring book</span><br>
                <a href="${sunbeamResource().coloringPagesUrl}" style="color:${navy};font-size:11px;text-decoration:underline;">${sunbeamResource().coloringHint}</a>
              </td>
              <td style="text-align:center;vertical-align:top;padding:8px 4px 0;line-height:1.35;">
                <span style="color:${muted};font-size:11.5px;">Meet Ray, the Sunbeam plush toy</span>
              </td>
              <td style="text-align:center;vertical-align:top;padding:8px 4px 0;line-height:1.35;">
                <span style="color:${muted};font-size:11.5px;">Full-color story book</span><br>
                <a href="${sunbeamResource().animatedCoverUrl}" style="color:${navy};font-size:11px;text-decoration:underline;">${sunbeamResource().fullColorHint}</a>
              </td>
            </tr>
            <tr>
              <td style="text-align:center;vertical-align:top;padding:10px 4px 0;"><a href="${sunbeamResource().coloringUrl}" style="display:inline-block;background:${navyDeep};color:#ffffff;font-size:12.5px;font-weight:700;padding:8px 14px;border-radius:6px;text-decoration:none;white-space:nowrap;">Buy now</a></td>
              <td style="text-align:center;vertical-align:top;padding:10px 4px 0;"><a href="${sunbeamResource().rayPreorderUrl}" style="display:inline-block;background:${navyDeep};color:#ffffff;font-size:12.5px;font-weight:700;padding:8px 14px;border-radius:6px;text-decoration:none;white-space:nowrap;">${sunbeamResource().rayPreorderLabel}</a><br><span style="color:${muted};font-size:11px;line-height:2;">${sunbeamResource().rayPreorderNote}</span></td>
              <td style="text-align:center;vertical-align:top;padding:10px 4px 0;"><a href="${sunbeamResource().fullColorUrl}" style="display:inline-block;background:${navyDeep};color:#ffffff;font-size:12.5px;font-weight:700;padding:8px 14px;border-radius:6px;text-decoration:none;white-space:nowrap;">Buy now</a></td>
            </tr>
          </table>
        <table role="presentation" style="width:100%;margin-top:18px;"><tr>
          <td style="text-align:center;line-height:1.8;white-space:nowrap;">
            <img src="${sunbeamResource().bibaBadgeImg}" alt="Best Indie Book Award Winner" width="170" style="display:block;margin:0 auto 8px;max-width:100%;">
            <a href="${sunbeamResource().bothBooksUrl}" style="color:${navy};font-size:13px;font-weight:700;">Buy both books →</a><br>
            <a href="${sunbeamResource().setUrl}" style="color:${navy};font-size:12px;">Book + Ray plush set (coming soon) →</a>
          </td>
        </tr></table>
        <div style="margin-top:20px;">
          <p style="color:${navyDeep};font-size:15px;line-height:1.7;margin:0 0 4px;">${sunbeamResource().text.replace(/"(What happened today[^"]*)"/, `<span style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:700;color:#8A6420;">&ldquo;$1&rdquo;</span>`)}</p>
        </div>
        <img src="${sunbeamResource().heroImg}" alt="A child writing in the Shining Moments pages with Ray" width="100%" style="display:block;max-width:100%;border-radius:8px;margin:18px 0 0;">
      </td></tr></table>
    `);
  }
  sections.push(`
    ${sectionHeader("Recommended reading")}
    <table role="presentation" style="width:100%;background:#F9FAFC;border:1px solid #E1E4EA;border-radius:12px;"><tr><td style="padding:20px 22px;">
    <p style="color:${text};font-size:14.5px;margin:0 0 16px;">${topicLabel()}</p>
    ${recommendedBooks().map((b, i) => `
      <table role="presentation" style="width:100%;background:#ffffff;border:1px solid #E1E4EA;border-radius:10px;margin:0 0 ${i === recommendedBooks().length - 1 ? "0" : "12px"};"><tr>
        ${b.coverUrl ? `<td style="padding:16px 0 16px 16px;vertical-align:top;"><img src="${b.coverUrl}" alt="${b.title} by ${b.author}" width="70" style="border-radius:4px;display:block;"></td>` : ""}
        <td style="vertical-align:top;padding:16px;">
          <p style="color:${text};font-size:14.5px;margin:0 0 4px;">${b.display}</p>
          <p style="color:${muted};font-size:13px;margin:0 0 6px;">${b.chapter ? `Look for ${b.chapter}.` : "Relevant throughout — worth reading in full."}</p>
          <a href="${b.url}" style="color:${navy};font-size:14px;">View this book →</a>
        </td>
      </tr></table>
    `).join("")}
    ${affiliateDisclosure() ? `<p style="color:#8896B8;font-size:12px;margin:14px 0 0;">${affiliateDisclosure()}</p>` : ""}
    </td></tr></table>
  `);
  // "What comes next": the Playbook picture sits on the RIGHT, beside the intro
  // and the list, so parents are looking at it while they read what it does
  // (per Mark). A "Reserve my copy" box sits right under the picture, and again
  // after the full details below. Email can't hold a working checkbox, so both
  // open the reserve page, where the real checkbox is.
  const reserveBox = (align) => `<a href="${playbookInviteUrl()}" style="display:inline-block;text-decoration:none;color:${navyDeep};font-size:13.5px;font-weight:700;line-height:1.3;white-space:nowrap;text-align:${align};"><span style="display:inline-block;width:14px;height:14px;border:2px solid ${navyDeep};border-radius:3px;background:#ffffff;vertical-align:-3px;margin-right:7px;"></span>Reserve my copy</a>`;
  sections.push(`
    ${sectionHeader("What comes next")}
    <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
      <td style="vertical-align:top;padding:0 14px 0 0;">
        <p style="color:${text};font-size:15px;margin:0 0 12px;">${WHAT_COMES_NEXT_INTRO}</p>
        <ul style="color:${text};font-size:14.5px;padding-left:20px;margin:0;">
          ${furtherStepsTeaser().map(t => `<li style="margin-bottom:6px;">${t}</li>`).join("")}
        </ul>
      </td>
      <td style="vertical-align:top;width:140px;text-align:center;">
        <img src="${playbookBoxImageUrl()}" alt="The Bullyproof Parent Playbook" width="130" style="display:block;width:130px;max-width:130px;border-radius:6px;margin:0 0 10px;">
        ${state.marketingConsent ? "" : reserveBox("center")}
      </td>
    </tr></table>
  `);
  sections.push(`
    <table role="presentation" style="width:100%;background:#F5F6FB;border-radius:10px;margin:18px 0 16px;border:1px solid #E1E4EA;"><tr>
      <td style="padding:20px;vertical-align:top;">
        <p style="color:${navyDeep};font-size:17px;font-weight:700;margin:0 0 8px;">The Bullyproof Parent Playbook</p>
        <p style="color:${muted};font-size:13.5px;margin:0 0 10px;font-weight:600;">Personalized guidance that grows with your child.</p>
        <p style="color:${muted};font-size:13.5px;margin:0 0 10px;">${PLAYBOOK_BLURB}</p>
        <p style="color:${muted};font-size:13px;margin:0 0 10px;">${PLAYBOOK_SOON}</p>
        <a href="${NETWORK_HOME_URL}" style="color:${navy};font-size:14.5px;font-weight:700;">Join Bullyproof.Support FREE today →</a>
        <p style="color:${muted};font-size:12.5px;margin:12px 0 4px;font-weight:700;">What membership includes, starting today:</p>
        <ul style="color:${muted};font-size:12.5px;padding-left:18px;margin:0;">
          ${MEMBERSHIP_BENEFITS.map((b, i) => `<li style="margin-bottom:${i === MEMBERSHIP_BENEFITS.length - 1 ? 0 : 4}px;">${b}</li>`).join("")}
        </ul>
      </td>
    </tr></table>
    <p style="color:${muted};font-size:13.5px;margin:0 0 14px;">Your membership does not start your free trial today. When the Playbook launches, you'll receive an invitation to try it FREE for one week.</p>
    ${state.marketingConsent ? "" : `<p style="margin:0;">${reserveBox("left")}</p>`}
  `);
  sections.push(`
    ${sectionHeader("Prefer to talk to a licensed professional?")}
    <p style="color:${text};font-size:15px;margin:0;">
      That's always an option too. <a href="${NETWORK_MATCH_URL}" style="color:${navy};">Search the Bullyproof Support network</a> to get matched with a professional near you — just enter your location, no cost to look.<br>
      If your area doesn't have a strong match yet, <a href="${FIND_SUPPORT_URL}" style="color:${navy};">Psychology Today's broader directory</a> is a good backup.
    </p>
  `);
  sections.push(`
    <p style="color:#8896B8;font-size:12px;margin-top:28px;border-top:1px solid #E1E4EA;padding-top:14px;">
    This plan is for general information only. It is not medical, mental health, or legal advice, and it doesn't guarantee any specific result. Please use your own judgment and talk to a licensed professional about your specific situation. If your child is in immediate danger, call 911.
    </p>
  `);

  const footContact = (typeof CONFIG !== "undefined" && CONFIG.CONTACT_EMAIL) || "";
  const footAddress = (typeof CONFIG !== "undefined" && CONFIG.MAILING_ADDRESS) || "";
  sections.push(`
    <p style="color:#8896B8;font-size:12px;line-height:1.6;margin:10px 0 0;">
      You're receiving this email because this address was entered at Bullyproof.Guide to get an action plan.
      ${state.marketingConsent ? `You also asked to hear about the Bullyproof Parent Playbook and occasional updates. To stop them, just reply with the word "unsubscribe".` : ""}
      ${footContact ? `Want your answers deleted? <a href="mailto:${escapeAttr(footContact)}?subject=Delete%20my%20data" style="color:#8896B8;">Delete my data</a>.` : ""}
      ${footAddress ? `<br>${escapeHtml(footAddress)}` : ""}
    </p>
  `);

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;">
      <table role="presentation" style="width:100%;background-color:${navyDeep};border-bottom:3px solid ${gold};"><tr><td style="padding:36px 30px 32px;text-align:center;">
        <img src="${assetUrl("icon-landing.png")}" width="58" alt="" style="display:block;margin:0 auto 16px;">
        <p style="color:${gold};font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;margin:0 0 8px;">Bullyproof.Guide</p>
        <p style="color:#ffffff;font-size:25px;font-weight:800;letter-spacing:-0.01em;margin:0;">Your Personalized Action Plan</p>
      </td></tr></table>
      <div style="padding:34px 24px 24px;">
      ${sections.join("\n")}
      </div>
    </div>
  `;
}

function setPlanStatus(msg, kind) {
  const el = document.getElementById("planStatus"); if (!el) return;
  el.style.display = "block"; el.textContent = msg;   // textContent, never innerHTML: the message contains the parent's email address
  el.style.color = kind === "success" ? "#276749" : kind === "error" ? "#C53030" : "#4A5568";
}

function planStatusMessage(sent, pdfOk, email) {
  if (sent.ok) {
    return pdfOk
      ? `Your plan is on its way to ${email}. It usually arrives within a minute. If you don't see it, check your spam or promotions folder. Your PDF copy also just downloaded.`
      : `Your plan is on its way to ${email}. We couldn't create the PDF copy this time; tap the button to try again.`;
  }
  if (sent.status === 429) return "We're getting a lot of requests right now. Please wait a few minutes and tap the button to try again." + (pdfOk ? " Your PDF copy did download, so you still have your plan." : "");
  return "We couldn't send the email just now." + (pdfOk ? " Your PDF copy did download, so you still have your plan. You can tap the button to try the email again in a minute." : " Please tap the button to try again in a minute.");
}

// Optional bot check (Cloudflare Turnstile). Does nothing until CONFIG.TURNSTILE_SITE_KEY is filled in.
function initTurnstile() {
  if (!CONFIG.TURNSTILE_SITE_KEY || !document.getElementById("turnstileBox")) return;
  const mount = () => window.turnstile.render("#turnstileBox", {
    sitekey: CONFIG.TURNSTILE_SITE_KEY,
    callback: (token) => { state.turnstileToken = token; },
    "expired-callback": () => { state.turnstileToken = ""; }
  });
  if (window.turnstile) { mount(); return; }
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; s.async = true; s.onload = mount;
  document.head.appendChild(s);
}

// The browser sends the parent's ANSWERS. The server checks them and builds the email itself from our
// approved template — so this endpoint can't be used to send arbitrary content from our domain.
async function sendPlanByEmail() {
  try {
    const res = await fetch("/.netlify/functions/send-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: state.email,
        answers: state.answers,
        safetyFlags: state.safetyFlags,
        marketingConsent: !!state.marketingConsent,
        website: state.honeypot || "",
        turnstileToken: state.turnstileToken || ""
      })
    });
    if (res.ok) { track("plan_email_sent"); return { ok: true, status: res.status }; }
    console.warn("Email delivery failed with status", res.status);
    return { ok: false, status: res.status };
  } catch (err) {
    console.warn("Email delivery failed (network):", err);
    return { ok: false, status: 0 };
  }
}

async function submitToFormspree() {
  if (!CONFIG.FORMSPREE_ENDPOINT) { console.warn("Formspree endpoint not configured."); return; }
  const flagged = state.safetyFlags.length > 0;
  const subject = flagged
    ? "⚠️ Bullyproof Assessment — safety flag triggered"
    : "New Bullyproof Assessment submission";
  try {
    await fetch(CONFIG.FORMSPREE_ENDPOINT, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        email: state.email,
        _replyto: state.email,
        _subject: subject,
        safety_flags: flagged ? state.safetyFlags.join(", ") : "none",
        consent_given: state.consentGiven ? "yes" : "no",
        marketing_consent: state.marketingConsent ? "yes" : "no",
        safety_resources_acknowledged: state.safetyFlags.length ? (state.safetyAcknowledged ? "yes" : "no") : "n/a",
        summary: buildReadableSummary()
      })
    });
    track("email_captured");
  } catch (err) { console.warn("Formspree submission failed (non-blocking):", err); }
}

// ============================================================
// RECOMMENDATION ENGINE
// Reads across Q1, Q2, Q5, Q6, Q7, Q8, Q9, Q10, Q11 together —
// not just one field — so the advice actually matches the
// parent's real situation instead of a single category.
// ============================================================

function communicationStatus() {
  const q8 = state.answers.q8 || "";
  if (q8.startsWith("Yes — they've told me clearly")) return "clear";
  if (q8.startsWith("Yes — but only hints")) return "hints";
  if (q8.startsWith("No — but their behavior")) return "behavior-only";
  if (q8.startsWith("No — and I don't have")) return "no-signals";
  return "unknown";
}

function schoolStatus() {
  const q10 = state.answers.q10 || "";
  if (q10.startsWith("Yes — and they took it seriously")) return "helping";
  if (q10.startsWith("Yes — but nothing has changed")) return "no-change";
  if (q10.startsWith("Yes — and they said it isn't bullying")) return "dismissed";
  if (q10.startsWith("No — I haven't reached out")) return "not-reached-out";
  if (q10.startsWith("No — my child doesn't want")) return "child-doesnt-want";
  return "unknown";
}

function onlineWeight() {
  const q7 = state.answers.q7 || [];
  const q11 = state.answers.q11 || "";
  if (q11.startsWith("Yes — primarily online")) return "online";
  if (q11.startsWith("Yes — online for sure")) return "online";
  if (q11.startsWith("Yes — both")) return "both";
  const onlineCount = q7.filter(l => l.includes("social media") || l.includes("text messages") || l.includes("gaming platform")).length;
  const inPersonCount = q7.filter(l => l.includes("At school") || l.includes("school bus") || l.includes("after-school") || l.includes("neighborhood")).length;
  if (onlineCount > inPersonCount) return "online";
  if (inPersonCount > 0) return "in-person";
  if (/online|social media/i.test(state.answers.q2 || "")) return "online";
  return "unclear";
}

function behavioralSignalCount() {
  return (state.answers.q6 || []).filter(b => b !== "No noticeable changes").length;
}

function physicalSignalCount() {
  return (state.answers.q3 || []).filter(s => s !== "None of these — I haven't noticed physical signs").length;
}

function needsProfessionalSupport() {
  return behavioralSignalCount() >= 3 || physicalSignalCount() >= 2 || state.answers.q5 === "Several months or longer";
}

function openingValidation() {
  const q2 = state.answers.q2 || "";
  if (q2.includes("not sure yet")) return "It's OK to feel worried even without proof. Many parents notice small changes before anything big happens.";
  if (q2.includes("prevent")) return "Focusing on prevention is one of the smartest, most caring things a parent can do.";
  if (q2.includes("treated badly")) return "It takes courage for a child to say they're being treated badly. It takes just as much courage for a parent to believe them right away.";
  if (q2.includes("Something happened online")) return "Things online can get bad fast. It's good that you're acting now instead of waiting.";
  if (q2.includes("concerning at school")) return "Trusting what you see at school, even before your child says anything, is the right thing to do.";
  return "";
}

// A parent who writes "both kids" (or "my two", "twins", etc.) is telling us
// more than one child is involved, but this check-in follows one child at a
// time. Acknowledge that out loud instead of silently treating it as one.
function mentionsMultipleChildren() {
  const t = `${state.answers.q4 || ""} ${state.answers.q12 || ""}`.toLowerCase();
  return /\b(both|two|three|all)\s+(of\s+)?(my\s+|our\s+)?(kids|children|boys|girls|sons|daughters)\b|\bboth\s+of\s+(them|my)\b|\bmy\s+(two|three|2|3)\s+(kids|children|boys|girls)\b|\b(twins|siblings)\b|\bmy\s+(kids|children)\b/.test(t);
}
function multiChildNote() {
  if (!mentionsMultipleChildren()) return null;
  return "You mentioned more than one child. Each child's situation can look a little different, so this plan is written for one child at a time. Start with the child you're most worried about, then come back and take this check-in again for the other, so their plan fits them, too. When it's more than one, it also helps to talk with each child alone first, so neither one has to speak for the other.";
}

// When a parent asks for something to say, the plan should hand them
// actual words — not echo the request and move on to generic advice.
function askedForWords() {
  const t = `${state.answers.q12 || ""} ${state.answers.q4 || ""}`.toLowerCase();
  // Explicit asks for words only. A bare "tell" or "sound" is not enough
  // ("how do I tell if my child is being bullied" is not a request for a script).
  return [
    /\bwhat (do|should|can|could|would|to) (i |we )?(say|tell)\b/,
    /\b(something|anything|one thing|the right thing|the right words?|words?)\b[^.?!]{0,20}\b(say|tell)\b/,
    /\b(say|tell|talk to|talk with|speak to|speak with) (them|him|her|my (son|daughter|child|kid|kids|teen|children))\b/,
    /\bencourage (them|him|her)\b/,
    /\bhow (do|can|should|could) (i|we) (talk|speak)\b/,
    /\bsound like i\b/
  ].some(re => re.test(t));
}
function wordsAnswer() {
  if (state.safetyFlags.length || !askedForWords()) return null;
  const age = state.answers.q1 || "";
  const young = age === "Under 5" || age === "5–7";
  const teen = age === "11–14" || age === "15–18";
  const prevent = isPreventive();
  // Someone getting ready ahead of time has no incident to talk about, so
  // their words open the door instead of repairing one ("You did nothing
  // wrong" would make no sense to a child nothing has happened to).
  const quote = prevent
    ? (young ? "If anyone is ever unkind to you, or something feels yucky, tell me. I will always listen, and you will never be in trouble."
      : teen ? "You can tell me anything, anytime — even the stuff that's embarrassing. I won't freak out. I'm on your side."
      : "If anything ever happens that feels wrong, big or small, come tell me. You will never be in trouble for telling me, and I'll always be on your side.")
    : (young ? "I love you. You did nothing wrong. I'm going to help."
      : teen ? "I'm on your side. Whatever is going on, it's not your fault, and you don't have to handle it alone. You don't have to tell me everything right now. I'm here when you're ready."
      : "I'm on your side, always. Whatever happened is not your fault, and you are not in trouble. We'll figure it out together.");
  const reframe = prevent
    ? "If someone is ever unkind to you, that says something about them. It doesn't say anything about you."
    : (young ? "When someone is unkind, that's a choice they made. It's not about you."
      : "What someone does to you tells you about them. It doesn't tell you who you are.");
  const why = prevent
    ? "Kids often stay quiet because they're afraid of getting in trouble or upsetting their parent. Saying this ahead of time answers both worries before they ever have to ask."
    : "Kids who are hurting usually wonder two things first: \"Am I in trouble?\" and \"Is my parent upset with me?\" These words answer both, so they can breathe and start to talk.";
  return {
    title: "You asked what to say. Here it is.",
    lead: "You don't have to sound like an expert. Calm and simple works better than clever. If you only say one thing, say this:",
    quote,
    reframeLead: "Then, to help them see it a different way:",
    reframe,
    why,
    teaser: "The Bullyproof Parent Playbook will give you words like these matched to your child's age, personality, and exactly what happened, so you're never left wondering what to say."
  };
}

function focusLine() {
  const q12 = (state.answers.q12 || "").trim();
  if (!q12) return null;
  if (state.safetyFlags.length) {
    return `You told us: "${q12}" — please reach out to the resources above first. Everything below is still here when you're ready.`;
  }
  if (wordsAnswer()) return null;
  return `You told us what you most want help with: "${q12}" — that's what we kept in mind as we built this plan.`;
}

// Detects when a parent has asked, in their own words, whether they
// contributed to the situation. This never attempts to answer that — no
// static plan should try to diagnose a parent's role from one free-text
// answer. It only acknowledges the question honestly and points at where
// it actually gets worked through: an ongoing relationship, not a report.
function selfReflectionNote() {
  const text = `${state.answers.q4 || ""} ${state.answers.q12 || ""}`.toLowerCase();
  const signals = [
    "something i've done", "something i have done", "something i did",
    "what i'm doing wrong", "what i am doing wrong", "did i cause",
    "have i caused", "am i the reason", "my fault", "contribute to this",
    "contributed to this", "what i did wrong", "how i can change",
    "something i'm doing", "something i am doing"
  ];
  if (!signals.some(s => text.includes(s))) return null;
  return "You also asked whether you might have played a role in this. Wondering that is a sign of self-awareness, not evidence you did something wrong — most of the time there's no single cause to find. The most useful thing to do with that instinct right now isn't searching for a mistake, it's showing your child, through how you respond today, that this is safe to keep bringing to you. Looking at specific patterns worth adjusting — without blame — is exactly the kind of ongoing, personalized work the Bullyproof Parent Playbook is built for.";
}

function stepOpening() {
  const status = communicationStatus();
  if (status === "clear") {
    return "Write it down today. Use your child's own words, and add the date. Keep this note — you can show it to a counselor or the school later. StopBullying.gov, the U.S. government's bullying resource, recommends keeping exactly this kind of record: the date, what happened, and who was involved.";
  }
  if (status === "hints") {
    return `Keep the door open. Try saying: "You told me something was bothering you. I've been thinking about it. I'm here if you want to say more." Don't push for the whole story yet — let them go at their own pace. That patience matters: the U.S. Department of Education's most recent survey (2022) found more than half of bullied kids never told an adult at school, so a child who has hinted is already trusting you more than most.`;
  }
  if (status === "behavior-only") {
    const named = (state.answers.q6 || []).filter(b => b !== "No noticeable changes");
    // Q6's option text is written in checkbox/clinical language for a
    // parent to select ("withdrawing", "reluctant", "irritable") — but a
    // parent would never actually say these words out loud to their own
    // child. Rewritten here in the plain, warm language a parent would
    // really use, not just swapped to second person.
    const secondPerson = {
      "Withdrawing from family activities they used to enjoy": "you haven't wanted to join in on things with us that you used to love doing",
      "More irritable, tearful, or anxious than usual": "you've seemed more upset, or more worried, than usual",
      "Reluctant to go to school or ride the bus": "you haven't wanted to go to school or get on the bus",
      "Avoiding certain places, people, or activities they used to like": "you've been staying away from some places or people you used to like being around"
    };
    const behavior = named.length ? (secondPerson[named[0]] || named[0].toLowerCase()) : "a little different lately";
    return `Say what you see, without asking why. Try: "I've noticed ${behavior}. You don't have to explain it right now — I just want you to know I see it, and I'm here." Or, if a side-by-side moment feels more natural for your child: "Want to build something with me?" or "Want to go for a walk?" — sometimes it's easier for kids to open up when their hands or feet are busy, not sitting face to face. Watching closely matters, because behavior is often the only clue you'll get: the U.S. Department of Education's most recent survey (2022) found more than half of bullied kids never told an adult at school.`;
  }
  if (status === "no-signals") {
    return "Start with easy time together. Nothing has been said yet, so don't ask directly right away — that can make kids close up more. Instead, spend easy time together: a car ride, a walk, cooking side by side. Kids often talk more when they aren't looking right at you. Harvard's Center on the Developing Child found that the most common thing kids who bounce back share is at least one steady adult they trust — and ordinary time like this is how that trust gets built.";
  }
  return "Check in, side by side. Find an easy, low-pressure time to check in with your child this week. Talking side by side, not face to face, often works better than a direct sit-down. Harvard's Center on the Developing Child found that the most common thing kids who bounce back share is at least one steady adult they trust — these small check-ins are how you stay that adult.";
}

function stepSchool() {
  const map = {
    "helping": "Keep the school in the loop. Check in with the school contact again this week. Ask what they're seeing, and if there's a follow-up plan. It's worth the effort: a 2019 review of 100 school anti-bullying programs (Gaffney, Ttofi & Farrington) found that when schools take real action, bullying drops by about 20%.",
    "no-change": `Ask for a real plan. Nothing has changed yet, so ask for a new meeting. Get a clear plan with a real date — not just "we'll keep an eye on it." Research is on your side: a 2019 review of 100 school anti-bullying programs (Gaffney, Ttofi & Farrington) found that when schools take real action, bullying drops by about 20%.`,
    "dismissed": "You can still push back. If the school said this isn't bullying, ask to meet with a counselor or the principal, not just the first person you talked to. Bring your written notes. It's worth pressing for: a 2019 review of 100 school anti-bullying programs (Gaffney, Ttofi & Farrington) found that when schools take real action, bullying drops by about 20%.",
    "not-reached-out": `Loop in the school counselor. Contact the counselor this week. A short email works well: "I'd like 15 minutes to talk about some changes I'm seeing in my child. Nothing urgent, just want to loop you in." It's worth that small step: a 2019 review of 100 school anti-bullying programs (Gaffney, Ttofi & Farrington) found that when schools take real action, bullying drops by about 20% — and a short note from you can be how that action starts.`,
    "child-doesnt-want": "Ask what they're afraid of. Ask your child what they're afraid will happen if you talk to the school. Their answer will help you decide how — or whether — to bring the school in without it feeling like a betrayal."
  };
  return map[schoolStatus()] || "Get another set of eyes on it. Reach out to a counselor or trusted adult at school this week. Adults at school often see things you can't — especially in the busy, crowded parts of the day.";
}

function stepContext() {
  const weight = onlineWeight();
  if (weight === "online" || weight === "both") {
    return `Save the evidence first. Take screenshots and note the dates before anything gets deleted. Then sit down with your child and look at the app's report and block settings together — as a team, not as spying. That's exactly the order ${communicationStatus() === "clear" ? "StopBullying.gov also" : "StopBullying.gov, the U.S. government's bullying resource,"} recommends: keep the evidence, then report and block.`;
  }
  if (weight === "in-person") {
    return "Find the hot spots. Ask your child if certain times or places feel worse — recess, lunch, the bus. This helps the school watch the right spots instead of everywhere. The most recent federal data (2019–20) show bullying at school happens most in classrooms, then hallways and the cafeteria — busy places where adults can't see everything at once.";
  }
  return "Keep a short daily note. Just one line, no pressure — write down your child's mood and anything small they say. Patterns often show up after a week or two.";
}

function professionalSupportNote() {
  if (!needsProfessionalSupport()) return null;
  return "Based on what you shared, it may help to bring in a school counselor or child therapist now, not just as a backup plan. A trained professional can help things move faster.";
}

function topicBranch() {
  const q9 = state.answers.q9 || [];
  if (q9.some(t => t.includes("pressuring them sexually") || t.includes("using power over them"))) return "power";
  if (q9.some(t => t.includes("hit, pushed, tripped"))) return "physical";
  if (q9.some(t => t.includes("left out, ignored, or excluded"))) return "exclusion";
  if (q9.some(t => t.includes("called names, teased"))) return "namecalling";
  if (onlineWeight() === "online") return "online";
  const q2 = state.answers.q2 || "";
  if (q2.includes("prevent")) return "prevent";
  return "default";
}

function topicLabel() {
  const map = {
    power: "This falls into what's often called a power-imbalance situation — someone using power over a child in a way that isn't okay.",
    physical: "This falls into what's often called physical bullying — situations where writing things down and working with the school make the biggest difference.",
    exclusion: "This falls into what's often called social exclusion — being deliberately left out or frozen out by other kids.",
    namecalling: "This falls into what's often called verbal bullying — name-calling and teasing that shouldn't be brushed off.",
    online: "This falls into what's often called cyberbullying — situations where screenshots, reporting, and a calm conversation matter most.",
    prevent: "This is about building strength early, before problems start — one of the most effective things a parent can do.",
    default: "This is about getting your bearings — figuring out what to watch for and how to open the conversation."
  };
  return map[topicBranch()];
}

// Real, verifiable books — not invented, and matched to the same branch as
// the guide recommendation above. Swap or expand this list any time.
// Amazon Associates tag — leave blank until Mark's account is approved.
// The moment a real tag goes here, every book link (PDF, email, and any
// future on-screen use) picks it up automatically, and the FTC disclosure
// line below starts appearing automatically too.
const AMAZON_ASSOCIATE_TAG = "bullyproof20-20";

// Direct Amazon product page (ASIN) — clean link, no search-session tracking.
// Carries the Associate tag automatically whenever one is configured.
function amazonProductUrl(asin, slug) {
  const base = `https://www.amazon.com/${slug}/dp/${asin}`;
  return AMAZON_ASSOCIATE_TAG ? `${base}?tag=${encodeURIComponent(AMAZON_ASSOCIATE_TAG)}` : base;
}

function bookSearchUrl(title, author) {
  const base = `https://www.amazon.com/s?k=${encodeURIComponent(title + " " + author)}`;
  return AMAZON_ASSOCIATE_TAG ? `${base}&tag=${encodeURIComponent(AMAZON_ASSOCIATE_TAG)}` : base;
}

function affiliateDisclosure() {
  return AMAZON_ASSOCIATE_TAG ? "As an Amazon Associate, we may earn from qualifying purchases." : null;
}

// Chapter references verified against real published tables of contents
// (Coloroso and Faber & Mazlish) — not invented. Where a specific chapter
// couldn't be verified for a book, "chapter" is left null and the copy
// says so honestly rather than guessing at a section title.
const BOOKS = {
  power: [
    { title: "Protecting the Gift", author: "Gavin de Becker", coverImg: "book-debecker.jpg", chapter: null },
    { title: "The Bully, the Bullied, and the Bystander", author: "Barbara Coloroso", coverImg: "book-coloroso.jpg", chapter: `the chapter "Is There a Bullied Kid in the House?"` }
  ],
  physical: [
    { title: "The Bully, the Bullied, and the Bystander", author: "Barbara Coloroso", coverImg: "book-coloroso.jpg", chapter: `the chapters "The Bullied" and "Is There a Bullied Kid in the House?"` },
    { title: "Protecting the Gift", author: "Gavin de Becker", coverImg: "book-debecker.jpg", chapter: null }
  ],
  exclusion: [
    { title: "Queen Bees and Wannabes", author: "Rosalind Wiseman", coverImg: "book-wiseman.jpg", chapter: "the core \"Queen Bee\" framework on social hierarchies and exclusion" },
    { title: "The Bully, the Bullied, and the Bystander", author: "Barbara Coloroso", coverImg: "book-coloroso.jpg", chapter: `the chapter "The Bystander"` }
  ],
  namecalling: [
    { title: "How to Talk So Kids Will Listen & Listen So Kids Will Talk", author: "Adele Faber & Elaine Mazlish", coverImg: "book-fabermazlish.jpg", chapter: `Chapter 1, "Helping Children Deal with Their Feelings"` },
    { title: "The Bully, the Bullied, and the Bystander", author: "Barbara Coloroso", coverImg: "book-coloroso.jpg", chapter: `the chapter "The Bullied"` }
  ],
  online: [
    { title: "The Bully, the Bullied, and the Bystander", author: "Barbara Coloroso", coverImg: "book-coloroso.jpg", chapter: `the chapter "Cyberbullying: High-Tech Harassment in the Net Neighborhood"` },
    { title: "Cyberbullying: Bullying in the Digital Age", author: "Robin Kowalski, Susan Limber & Patricia Agatston", coverImg: "book-kowalski.jpg", chapter: null }
  ],
  prevent: [
    { title: "How to Talk So Kids Will Listen & Listen So Kids Will Talk", author: "Adele Faber & Elaine Mazlish", coverImg: "book-fabermazlish.jpg", chapter: `Chapters 1 and 2, "Helping Children Deal with Their Feelings" and "Engaging Cooperation"` },
    { title: "The Bully, the Bullied, and the Bystander", author: "Barbara Coloroso", coverImg: "book-coloroso.jpg", chapter: `the chapter "Breaking the Cycle of Violence: Creating Circles of Caring"` }
  ],
  default: [
    { title: "The Bully, the Bullied, and the Bystander", author: "Barbara Coloroso", coverImg: "book-coloroso.jpg", chapter: `the opening chapter, "Three Characters and a Tragedy," for a clear overview` },
    { title: "How to Talk So Kids Will Listen & Listen So Kids Will Talk", author: "Adele Faber & Elaine Mazlish", coverImg: "book-fabermazlish.jpg", chapter: `Chapter 1, "Helping Children Deal with Their Feelings"` }
  ]
};

function bookCoverUrl(isbn) {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
}

// Mark's own book — offered alongside the external recommendation
// specifically on the prevention path, since the "Shining Moments" pages
// in the back are a direct, purpose-built tool for the self-esteem habit
// already recommended in that path's step 1.

function recommendedBooks() {
  return BOOKS[topicBranch()].map(b => ({
    title: b.title,
    author: b.author,
    display: `"${b.title}" by ${b.author}`,
    url: bookSearchUrl(b.title, b.author),
    coverUrl: assetUrl(b.coverImg),
    chapter: b.chapter
  }));
}

// Fetches an image and returns it as a data URL for jsPDF's addImage().
// Never throws — returns null on any failure (network, CORS, 404, etc.)
// so a missing cover image never blocks the actual action plan from
// generating. This is a nice-to-have, not a dependency.
async function fetchImageAsDataUrl(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type || !blob.type.startsWith("image/")) return null;
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn("Cover image fetch failed (non-blocking):", err);
    return null;
  }
}

// Only relevant on the prevention path — the Shining Moments pages
// directly support the self-esteem habit already recommended in step 1.
// SUNBEAM_SET_URL is still a placeholder — swap for the real bundle page
// on Bullyproof.Support the moment it's live ("soon").
const SUNBEAM_SET_URL = "https://www.bullyproof.support";
// TODO (Mark asked to be reminded): point this at the Ray pre-order landing page once it exists.
// For now it goes to the Bullyproof.Support store.
const RAY_PREORDER_URL = "https://www.bullyproof.support";
const RAY_PREORDER_LABEL = "Pre-order Ray";
const RAY_PREORDER_NOTE = "Ships January 2027";
// One tap puts BOTH books in the parent's Amazon cart (Amazon Associates "Add to Cart" link), tagged with our Associate ID.
function amazonBothBooksUrl() {
  const tag = AMAZON_ASSOCIATE_TAG ? `AssociateTag=${encodeURIComponent(AMAZON_ASSOCIATE_TAG)}&` : "";
  return `https://www.amazon.com/gp/aws/cart/add.html?${tag}ASIN.1=0999371800&Quantity.1=1&ASIN.2=1616113324&Quantity.2=1`;
}
const SUNBEAM_FULLCOLOR_AMAZON_URL = amazonProductUrl("0999371800", "Adventures-True-Sunbeam-Family-Keepsake");
const SUNBEAM_COLORING_AMAZON_URL = amazonProductUrl("1616113324", "Adventures-True-Sunbeam-Keepsake-Coloring");

function assetUrl(name) {
  return `${window.location.origin}/assets/${name}`;
}

// Detect the child's gender from the parent's own free-text answers (Q4,
// Q12) when they clearly use gendered pronouns or nouns — used only to
// pick between gender-matched hero photos where we have both for the same
// age bracket. Ambiguous or silent text (neither or both signals present)
// returns "unknown" and the bracket's default photo is used instead.
function detectChildGender() {
  const text = `${state.answers.q4 || ""} ${state.answers.q12 || ""}`.toLowerCase();
  const boySignal = /\b(he|him|his|son|boy)\b/.test(text);
  const girlSignal = /\b(she|her|hers|daughter|girl)\b/.test(text);
  if (boySignal && !girlSignal) return "boy";
  if (girlSignal && !boySignal) return "girl";
  return "unknown";
}

// Age-appropriate hero images for the Sunbeam section. A young child
// typically has a parent writing in the journal for them, while an older
// child writes independently. Where matching photos exist for both a boy
// and a girl at the same age, gender is inferred from the parent's own
// wording; otherwise the bracket's default photo is used. Add more
// entries, or a boy/girl pair, as more photos become available.
const SUNBEAM_HERO_BY_AGE = {
  "Under 5": { default: assetUrl("sunbeam-hero-young.jpg") },
  "5–7": {
    boy: assetUrl("sunbeam-hero-7-8-boy.jpg"),
    girl: assetUrl("sunbeam-hero-young.jpg"),
    default: assetUrl("sunbeam-hero-young.jpg")
  },
  "8–10": { default: assetUrl("sunbeam-hero-10yo.jpg") },
  "11–14": { default: assetUrl("sunbeam-hero-11-13-boy.jpg") }
};
const SUNBEAM_HERO_DEFAULT = assetUrl("sunbeam-hero-bedtime.jpg");

function sunbeamHeroImage() {
  const bracket = SUNBEAM_HERO_BY_AGE[state.answers.q1];
  if (!bracket) return SUNBEAM_HERO_DEFAULT;
  const gender = detectChildGender();
  if (gender === "boy" && bracket.boy) return bracket.boy;
  if (gender === "girl" && bracket.girl) return bracket.girl;
  return bracket.default;
}

// Shining Moments / "A nightly opportunity" is ALWAYS part of the Action Plan,
// in every situation (per Mark). Only the wording varies by situation.
function sunbeamResource() {
  // The bridge line, the "award-winning" label, the badge and the title above
  // this already say what and where the book is (and that it won the award),
  // so this only adds what they don't: how to use the pages.
  const text = isPreventive()
    ? `Each Shining Moments page opens with a prompting question. At bedtime, try one, like: "What happened today that helped you to feel extra special or loved?" A few minutes a night is all it takes. Each Shining Moment is a little light your child gets to keep — and the more they collect now, the brighter it glows inside when harder days come along.`
    : `Each Shining Moments page opens with a prompting question. At bedtime, try one, like: "What happened today that helped you to feel extra special or loved?" If you have more time, color a page together and make it a keepsake: your signed and dated artwork in their book is lasting proof of your love and care. Each Shining Moment is a little light your child gets to keep. Collect enough of them, and even on their hardest days, there's still a light on inside.`;
  // The opening framing — a real explanation of the mechanism and why it
  // matters, introduced before the Shining Moments pages themselves and
  // before the book reveal, since this concept has to be understood and
  // "sold" on its own merits first.
  const introCaption = `A child's mind can get stuck. Whatever's bothering them — a hard day, a hurtful moment, a worry with no easy answer — often loops the loudest right at bedtime, when there's nothing left to distract from it.

Here's why that moment matters more than it seems. Cellular biologist Bruce Lipton has spent decades studying how a child's subconscious mind forms. By his account:

Every night, as your child drifts toward sleep, their mind passes through the same open, impressionable state that makes early childhood so absorbent in the first place. Call it dreamtime programming: whatever's on their mind in those last few minutes has an outsized chance of settling in.

Which means every bedtime is also an opportunity — a nightly chance to interrupt that programming before it takes hold, and redirect it toward something that builds your child up instead. That's the entire idea behind Shining Moments.`;
  return {
    text,
    introCaption,
    pullQuote: "By age 7, up to 70% of what a child's subconscious mind has been programmed with is self-sabotaging, negative, or limiting.",
    closeupCaption: `It only takes a few minutes: naming one good moment from the day, and letting that be the last thing on their mind before sleep. Do it most nights, and something happens beneath the surface — confidence builds, worry loosens its grip, and it happens so gradually your child may never notice it's working.`,
    setUrl: SUNBEAM_SET_URL,
    bothBooksUrl: amazonBothBooksUrl(),
    animatedCoverUrl: assetUrl("sunbeam-cover-animated-full.gif"),
    coloringPagesUrl: assetUrl("true-sunbeam-coloring-pages.pdf"),
    fullColorHint: "See it animated",
    coloringHint: "Print free coloring pages",
    rayPreorderUrl: RAY_PREORDER_URL,
    rayPreorderLabel: RAY_PREORDER_LABEL,
    rayPreorderNote: RAY_PREORDER_NOTE,
    fullColorUrl: SUNBEAM_FULLCOLOR_AMAZON_URL,
    coloringUrl: SUNBEAM_COLORING_AMAZON_URL,
    fullColorImg: assetUrl("sunbeam-fullcolor.jpg"),
    coloringImg: assetUrl("sunbeam-coloring.jpg"),
    rayImg: assetUrl("ray-plush.jpg"),
    shiningMomentsSpreadImg: assetUrl("shining-moments-spread.jpg"),
    shiningMomentsCloseupImg: assetUrl("shining-moments-closeup.jpg"),
    animatedCoverImg: assetUrl("sunbeam-cover-animated.gif"),
    heroImg: sunbeamHeroImage(),
    bibaBadgeImg: assetUrl("biba-badge.png")
  };
}

// Primary: your own network's real "Get Matched" request form — takes name,
// email, phone, and location, and connects the parent with a matching
// professional. Members are still mostly claim-account listings with
// minimal profiles, so this is paired with a backup search below.
const NETWORK_MATCH_URL = "https://www.bullyproof.support/getmatched";

// Safe default for "create a free account" — the homepage, since a
// confirmed general/parent signup URL wasn't available. /join reads as
// aimed at professionals, so this avoids sending parents to the wrong
// flow. Swap for a confirmed direct signup link the moment Mark has one.
// Confirmed by Mark: the direct signup page for a parent/guardian
// ("hidden profile") account — skips the account-type choice screen
// entirely, since every visitor arriving from this tool is a parent.
const NETWORK_HOME_URL = "https://www.bullyproof.support/checkout/clarity-check";

// What a free Bullyproof.Support account includes. One list, used by both
// the email and the PDF so the two can't drift apart again.
const MEMBERSHIP_BENEFITS = [
  "Free access to the Bullyproof.Support community",
  "A directory of professionals you can search anytime, not just this once",
  "Real stories from other parents navigating situations like yours",
  "Music, podcasts, and articles focused specifically on kids and bullying",
  "A free trial of the Bullyproof Parent Playbook when it's available",
  "Founding Member status while the community is still growing"
];

// Wording that appears in BOTH the email and the PDF lives here, once.
const WHAT_COMES_NEXT_INTRO = "What you just read is real and complete on its own. But situations change — and when they do, that's exactly what the Bullyproof Parent Playbook is built for: not a longer list, but ongoing, evolving help. Here's the kind of support parents find most helpful on a consistent basis:";
const PLAYBOOK_BLURB = "Being built to give you practical, personalized guidance based on your child's age, personality, and what's happening right now — with words to use, conversations to have, and next steps to take as new challenges come up.";
const PLAYBOOK_SOON = "Coming soon — and Bullyproof.Support members will be first in line.";

function playbookBoxImageUrl() {
  return `${window.location.origin}/assets/playbook-box.jpg`;
}

// Backup only — for areas where the network doesn't yet have a strong local
// match. Swap or remove once network coverage is dense enough on its own.
const FIND_SUPPORT_URL = "https://www.psychologytoday.com/us/therapists";

function whyThisMattersNote() {
  if (isPreventive()) {
    return "Prevention works. A 2019 review of 100 school anti-bullying programs (Gaffney, Ttofi & Farrington) found they cut bullying by about 20%. What you do at home builds those same skills — right where your child spends the most time.";
  }
  const status = communicationStatus();
  if (status === "behavior-only" || status === "no-signals") {
    return "Here's something worth knowing: a child's relationships are one of their strongest protections. A 2022 study that followed nearly 500 teens for several years found that support from friends helped cushion the emotional hurt of being bullied. Confidence and friendships can be built at any age. If it feels like a gap right now, that's not a failure on your part — it's simply the next thing to work on together.";
  }
  if (onlineWeight() === "online") {
    return "You're far from alone: Pew Research Center found that nearly half of U.S. teens (46%) have been bullied or harassed online. Knowing how to handle it — what to save, what to block, and who to tell — is a learned skill, not something kids are born knowing. That means it can be taught.";
  }
  return "Confidence and social skills can be built at any age — and they matter. A 2022 study that followed nearly 500 teens for several years found that support from friends helped cushion the emotional hurt of being bullied. Working on that together is one of the most powerful things a parent can do.";
}

function furtherStepsTeaser() {
  if (isPreventive()) {
    return [
      "Knowing what to say so your child will communicate with you — instead of just giving one-word answers.",
      "How to talk about kindness and boundaries — before there's a problem.",
      "A simple weekly habit that builds your child's confidence over time",
      "How to know when kids can work it out — and when they need your help.",
      "How to keep the good things you learned growing up — and give your kids better tools for the rest."
    ];
  }

  // Two anchors present in every active situation — these carry the
  // emotional core (not feeling alone, not repeating what didn't work
  // growing up), not just tactical steps.
  const items = [
    "Real-time backup for the moments this feels the most overwhelming — so you're never figuring out what to say by yourself",
    "How to keep the good things you learned growing up — and give your kids better tools for the rest."
  ];

  // A genuinely earned insight (only appears when the parent's own words
  // indicated it) — given priority over the generic fallbacks below.
  if (selfReflectionNote()) {
    items.push("A gentle way to look at any patterns worth adjusting — without blame");
  }

  // Situational pool — each only shown when it actually applies.
  const school = schoolStatus();
  if (school === "dismissed" || school === "no-change" || school === "not-reached-out") {
    items.push("The exact words to say if the school pushes back or downplays it");
  }
  const comm = communicationStatus();
  if (comm === "clear" || comm === "hints") {
    items.push("What to say to help, instead of what you've already tried that hasn't worked");
  }
  if (["11–14", "15–18"].includes(state.answers.q1)) {
    items.push("Age appropriate conversation guidance so your words are actually heard and received");
  }
  if (topicBranch() === "online") {
    items.push("How to handle screens and monitoring without it turning into a fight");
  }
  if (["physical", "namecalling", "exclusion", "power"].includes(topicBranch())) {
    items.push("What to say — and what not to say — if another family is involved");
  }

  // Generic fallbacks — always relevant, but the most replaceable if
  // space runs out, since they're not situation-specific.
  items.push("A week-by-week plan to help your child rebuild confidence");
  items.push("A simple way to track whether things are actually getting better");

  return items.slice(0, 5);
}

// A step that opens with a short headline sentence (7 words or fewer) shows
// that headline in bold on its own line, so a scanning parent sees the three
// big ideas at a glance. Longer openings stay as plain paragraphs.
function splitStepTitle(step) {
  const m = step.match(/^(.{3,70}?[.!?]"?)\s+([\s\S]+)$/);
  if (m && m[1].split(/\s+/).length <= 7) return [m[1], m[2]];
  return [null, step];
}
// Headlines only when EVERY step in the set has one — a mix looks uneven.
function stepParts() {
  const steps = actionSteps();
  const parts = steps.map(splitStepTitle);
  return parts.every(([t]) => t) ? parts : steps.map(st => [null, st]);
}

function preventionSteps() {
  // Each step leads with a real research finding, then one specific thing to do or say.
  // Sources: NCES/BJS School Crime Supplement 2021–22 — 44.2% of bullied students notified an adult at school;
  // Harvard Center on the Developing Child — at least one stable, supportive adult is the most common factor in resilience;
  // Friend support: 2022 longitudinal study, Journal of Youth and Adolescence (497 Dutch teens, 6 yearly waves) — friend support buffered the link between victimization and depression/anxiety;
  // Laninga-Wijnen et al. (2023) — victims with at least one defender reported higher belonging 9 months later; a 2021 meta-analysis found actively
  // encouraging peers to intervene as "upstanders" was linked to LESS program effectiveness, so this step favors quiet, private support.
  return [
    "Make the \"no-panic promise.\" Most bullied kids never tell an adult at school — the U.S. Department of Education's most recent survey (2022) found only 44% did. The biggest reason is fear that the grown-up will overreact and make things worse. So say this, once, on an ordinary day: \"You can tell me anything. I promise I won't freak out, and I won't go to the school without talking with you first.\" Harvard's Center on the Developing Child found that the most common thing kids who bounce back share is at least one steady adult they trust. This promise is how you become that adult before it's ever needed.",
    "Help grow one solid friendship. Friends are real protection: a 2022 study that followed nearly 500 teens for several years found that support from friends helped cushion the emotional hurt of being bullied. Popularity doesn't matter here. One real friend does. This month, ask \"Who do you like sitting with at lunch?\" and invite that child over, even just for pizza and a movie.",
    "Teach quiet kindness. When your child sees someone being picked on, newer research suggests the most helpful move usually isn't confronting the bully in front of everyone — that can put more eyes on the child being picked on. It's being on that child's side afterward. A 2023 study found that bullied kids who had at least one classmate on their side felt a stronger sense of belonging nine months later. Give your child two easy lines: \"Want to sit with us?\" and, privately later, \"That wasn't okay. Are you alright?\" Kids who make a habit of this build courage and real friendships — and they'll know what kindness looks like if it's ever them."
  ];
}

// For parents with nothing to report yet — a plain list of what's actually
// worth keeping an eye on, so "just want to be prepared" gets something
// concrete. Pulled from the same categories used in the assessment itself,
// not a separate invented list.
function preventionWatchForNote() {
  if (!isPreventive()) return null;
  return {
    intro: "Since nothing's happened yet, here's what's actually worth keeping half an eye on — not to worry over, just to notice:",
    items: [
      "Physical: unexplained scratches or bruises, a sudden switch to long sleeves in warm weather, or frequent headaches/stomachaches with no clear cause",
      "Sleep or appetite: trouble falling asleep, nightmares, or a real change in how much they're eating",
      "Behavior: pulling back from things they used to enjoy, seeming more irritable or tearful than usual, or suddenly not wanting to go to school"
    ],
    outro: "These are the same warning signs StopBullying.gov, the U.S. government's bullying resource, shares with parents. None of them mean something is definitely wrong — kids go through phases for all kinds of reasons. They're just the kind of thing worth a gentle check-in if you notice a few of them together."
  };
}

function actionSteps() {
  if (isPreventive()) return preventionSteps();
  return [stepOpening(), stepSchool(), stepContext()];
}

async function generatePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 20;

  function ensureRoom(needed) {
    if (y + needed > 280) { doc.addPage(); y = 20; }
  }
  function heading(text) {
    ensureRoom(34); // a heading always keeps at least a few lines of its own content with it
    doc.setFontSize(11); doc.setFont(undefined, "bold"); doc.setTextColor(27, 42, 74);
    doc.text(text.toUpperCase(), 15, y);
    y += 3;
    doc.setDrawColor(200, 155, 60);
    doc.setLineWidth(0.7);
    doc.line(15, y, 195, y);
    doc.setFont(undefined, "normal");
    y += 7;
  }
  function body(text, opts) {
    opts = opts || {};
    doc.setFontSize(11);
    if (opts.italic) doc.setFont(undefined, "italic");
    if (opts.color) doc.setTextColor(...opts.color); else doc.setTextColor(40, 40, 40);
    const lines = doc.splitTextToSize(text, 180);
    ensureRoom(lines.length * 6 + 6);
    doc.text(lines, 15, y);
    y += lines.length * 6 + 6;
    if (opts.italic) doc.setFont(undefined, "normal");
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(16, 27, 51);
  doc.rect(0, 0, pageWidth, 48, "F");
  const bannerIconImg = await fetchImageAsDataUrl(assetUrl("icon-landing.png"));
  if (bannerIconImg) {
    try { doc.addImage(bannerIconImg, "PNG", pageWidth / 2 - 8, 6, 16, 16); } catch (e) {}
  }
  doc.setFontSize(10); doc.setTextColor(200, 155, 60); doc.setFont(undefined, "bold");
  doc.text("BULLYPROOF.GUIDE", pageWidth / 2, 29, { align: "center", charSpace: 0.5 });
  doc.setFontSize(17); doc.setTextColor(255, 255, 255);
  doc.text("Your Personalized Action Plan", pageWidth / 2, 39, { align: "center" });
  doc.setFillColor(200, 155, 60);
  doc.rect(0, 48, pageWidth, 1.2, "F");
  doc.setFont(undefined, "normal");
  y = 62;

  if (state.safetyFlags.length) {
    const priority = ["selfHarmOrSuicide", "violenceRisk", "sexualOrPower", "physicalSigns"];
    const key = priority.find(k => state.safetyFlags.includes(k));
    const variant = SAFETY_VARIANTS[key];
    ensureRoom(10 + variant.resources.length * 6);
    doc.setFillColor(253, 237, 237);
    doc.rect(10, y - 6, 190, 10 + variant.resources.length * 6, "F");
    doc.setFontSize(13); doc.setTextColor(197, 48, 48); doc.text("Please reach out to one of these resources first:", 15, y); y += 7;
    doc.setFontSize(11); doc.setTextColor(40, 40, 40);
    variant.resources.forEach(r => { doc.text(`${r.name} — ${r.detail}`, 15, y); y += 6; });
    y += 6;
  }

  if (state.answers.q4) {
    heading("You told us:");
    body(`"${state.answers.q4}"`, { italic: true });
  }

  if (openingValidation()) body(openingValidation(), { color: [74, 109, 147] });

  heading(isPreventive() ? "Where you're starting:" : "What's happening:");
  body(deriveSummary());

  if (focusLine()) body(focusLine(), { italic: true });
  if (wordsAnswer()) {
    const w = wordsAnswer();
    heading(w.title);
    body(w.lead);
    doc.setFontSize(13); doc.setFont(undefined, "bold");
    const ql = doc.splitTextToSize("“" + w.quote + "”", 160);
    ensureRoom(ql.length * 7 + 14);
    const qTop = y;
    doc.setFillColor(238, 242, 247); doc.rect(15, qTop - 5, 180, ql.length * 7 + 8, "F");
    doc.setFillColor(200, 155, 60); doc.rect(15, qTop - 5, 1.4, ql.length * 7 + 8, "F");
    doc.setTextColor(16, 27, 51); doc.text(ql, 22, qTop + 1);
    doc.setFont(undefined, "normal");
    y = qTop + ql.length * 7 + 8;
    body(w.reframeLead, { color: [90, 100, 120] });
    body("“" + w.reframe + "”", { italic: true });
    body("Why it works: " + w.why, { color: [90, 100, 120] });
    body(w.teaser, { color: [90, 100, 120] });
  }
  if (multiChildNote()) body(multiChildNote(), { color: [74, 109, 147] });
  if (selfReflectionNote()) body(selfReflectionNote(), { color: [74, 109, 147] });

  heading("What actually helps:");
  body(whyThisMattersNote());

  heading("Your next 3 steps:");
  doc.setFontSize(11);
  stepParts().forEach(([stepTitle, stepRest], i) => {
    doc.setTextColor(40, 40, 40);
    const lines = doc.splitTextToSize(stepRest, 165);
    ensureRoom(Math.max(lines.length * 6 + (stepTitle ? 7 : 0), 10) + 6);
    const stepTopY = y;
    doc.setFillColor(16, 27, 51);
    doc.circle(19, stepTopY - 2, 4, "F");
    doc.setFontSize(10); doc.setTextColor(255, 255, 255); doc.setFont(undefined, "bold");
    doc.text(String(i + 1), 19, stepTopY - 0.5, { align: "center" });
    if (stepTitle) {
      doc.setFont(undefined, "bold"); doc.setFontSize(12); doc.setTextColor(16, 27, 51);
      doc.text(stepTitle, 28, y);
      y += 7;
    }
    doc.setFont(undefined, "normal"); doc.setFontSize(11); doc.setTextColor(40, 40, 40);
    doc.text(lines, 28, y);
    y += Math.max(lines.length * 6, 10) + 6;
  });

  const watchFor = preventionWatchForNote();
  if (watchFor) {
    heading("What to watch for:");
    body(watchFor.intro);
    watchFor.items.forEach(item => body(`• ${item}`));
    body(watchFor.outro, { color: [130, 130, 130] });
  }

  const proNote = professionalSupportNote();
  if (proNote) { heading("Worth considering:"); body(proNote); }

  // Recommended reading comes after the steps now — a natural answer to
  // "okay, now what do I actually go read," rather than a cold opener.
  // Two books now, each pointing at a specific chapter for their situation.
  const sunbeam = sunbeamResource();
  if (sunbeam) {
    heading("A nightly opportunity");

    const introParas = sunbeam.introCaption.split("\n\n");
    for (let pi = 0; pi < introParas.length; pi++) {
      if (pi === 0) {
        // lead paragraph, in the same serif voice as the email
        doc.setFont("times", "normal"); doc.setFontSize(14); doc.setTextColor(16, 27, 51);
        const lead = doc.splitTextToSize(introParas[pi], 180);
        ensureRoom(lead.length * 6.4 + 6);
        doc.text(lead, 15, y, { lineHeightFactor: 1.35 }); y += lead.length * 6.4 + 6;
        doc.setFont("helvetica", "normal");
        continue;
      }
      body(introParas[pi], { color: [31, 36, 48] });
      if (pi === 1) {
        doc.setFont("times", "bolditalic"); doc.setFontSize(15.5);
        const quoteLines = doc.splitTextToSize(sunbeam.pullQuote, 162);
        ensureRoom(quoteLines.length * 7.2 + 12);
        const qBarTopY = y - 2;
        doc.setTextColor(16, 27, 51);
        doc.text(quoteLines, 23, y + 4, { lineHeightFactor: 1.3 });
        const qBarHeight = quoteLines.length * 7.2 + 4;
        doc.setFillColor(200, 155, 60);
        doc.rect(15, qBarTopY, 1.6, qBarHeight, "F");
        doc.setFont("helvetica", "normal");
        y = qBarTopY + qBarHeight + 10;
      }
    }

    ensureRoom(72); // label + spread image travel together, never split across pages
    doc.setFontSize(9.5); doc.setTextColor(168, 124, 42); doc.setFont(undefined, "bold");
    doc.setCharSpace(0.6);
    doc.text("START COLLECTING YOUR CHILD'S SHINING MOMENTS", 105, y, { align: "center" });
    doc.setCharSpace(0);
    doc.setFont(undefined, "normal");
    y += 6;

    const introSpreadImg = await fetchImageAsDataUrl(sunbeam.shiningMomentsSpreadImg);
    if (introSpreadImg) {
      try { doc.addImage(introSpreadImg, "JPEG", 15, y, 180, 54.3); } catch (e) {}
      y += 58;
    }

    doc.setFontSize(10.5);
    const howItWorksLines = doc.splitTextToSize(sunbeam.closeupCaption, 170);
    const cardH = howItWorksLines.length * 5.6 + 13;
    ensureRoom(cardH + 8);
    doc.setFillColor(255, 251, 243); doc.setDrawColor(234, 223, 198); doc.setLineWidth(0.3);
    doc.roundedRect(15, y, 180, cardH, 2, 2, "FD");
    doc.setFontSize(9); doc.setTextColor(168, 124, 42); doc.setFont(undefined, "bold");
    doc.text("HOW IT WORKS", 21, y + 9);
    doc.setFont(undefined, "normal");
    doc.setFontSize(10.5); doc.setTextColor(16, 27, 51);
    doc.text(howItWorksLines, 21, y + 16);
    y += cardH + 8;

    // The reveal: a centered navy band with the book title set as a title lockup.
    const bandH = 46;
    ensureRoom(bandH + 8 + 90); // the reveal always stays on the same page as the books under it
    doc.setFillColor(16, 27, 51);
    doc.roundedRect(15, y, 180, bandH, 3, 3, "F");
    doc.setDrawColor(200, 155, 60); doc.setLineWidth(0.6);
    doc.line(99, y + 7, 111, y + 7);
    doc.setFont("times", "italic"); doc.setFontSize(12); doc.setTextColor(220, 227, 242);
    doc.text("You'll find these pages waiting in the back of the award-winning children's book", 105, y + 14, { align: "center" });
    doc.setFont("times", "normal"); doc.setFontSize(13); doc.setTextColor(255, 255, 255);
    doc.text("The Adventures of the", 105, y + 22.5, { align: "center" });
    doc.setFont("times", "bold"); doc.setFontSize(24); doc.setTextColor(227, 184, 90);
    doc.text("True Sunbeam", 105, y + 33, { align: "center" });
    doc.line(99, y + 39.5, 111, y + 39.5);
    doc.setFont("helvetica", "normal");
    y += bandH + 8;
    // Right under the reveal: coloring book (left), Ray (center), story book
    // (right) — each with its caption, link and its own button underneath —
    // then the award badge with "buy both" and the set, the how-to, and the
    // section ends on the picture of a child writing in the book (per Mark).
    y += 2;
    // Real-world proportions: the books are 9in square, Ray is 12in tall.
    // Bottom-aligned on one baseline so they read as a product lineup.
    const BOOK_SIZE = 40, RAY_H = 52, RAY_W = 32;
    ensureRoom(RAY_H + 34);
    const rowBaseline = y + RAY_H;
    const [fullColorImg, coloringImg, rayImg] = await Promise.all([
      fetchImageAsDataUrl(sunbeam.fullColorImg),
      fetchImageAsDataUrl(sunbeam.coloringImg),
      fetchImageAsDataUrl(sunbeam.rayImg)
    ]);
    const centeredLink = (label, cx, yy, url) => {
      doc.setFontSize(8.5); doc.setFont(undefined, "normal"); doc.setTextColor(27, 42, 74);
      const w = doc.getTextWidth(label);
      doc.textWithLink(label, cx - w / 2, yy, { url });
      doc.setDrawColor(27, 42, 74); doc.setLineWidth(0.2); doc.line(cx - w / 2, yy + 1, cx + w / 2, yy + 1);
    };
    const smallButton = (label, cx, yy, url) => {
      doc.setFontSize(9); doc.setFont(undefined, "bold");
      const bw = doc.getTextWidth(label) + 10, bh = 7.5;
      doc.setFillColor(16, 27, 51); doc.roundedRect(cx - bw / 2, yy, bw, bh, 1.6, 1.6, "F");
      doc.setTextColor(255, 255, 255); doc.text(label, cx, yy + 5, { align: "center" });
      doc.link(cx - bw / 2, yy, bw, bh, { url });
      doc.setFont(undefined, "normal");
    };
    const caption = (label, cx) => { doc.setFontSize(9); doc.setFont(undefined, "normal"); doc.setTextColor(90, 100, 120); doc.text(label, cx, rowBaseline + 6, { align: "center" }); };
    const colX = [45, 105, 165];
    if (coloringImg) {
      try { doc.addImage(coloringImg, "JPEG", colX[0] - BOOK_SIZE / 2, rowBaseline - BOOK_SIZE, BOOK_SIZE, BOOK_SIZE); } catch (e) {}
      doc.link(colX[0] - BOOK_SIZE / 2, rowBaseline - BOOK_SIZE, BOOK_SIZE, BOOK_SIZE, { url: sunbeam.coloringPagesUrl });
      caption("Coloring book", colX[0]);
      centeredLink(sunbeam.coloringHint, colX[0], rowBaseline + 11, sunbeam.coloringPagesUrl);
      smallButton("Buy now", colX[0], rowBaseline + 15, sunbeam.coloringUrl);
    }
    if (rayImg) {
      try { doc.addImage(rayImg, "JPEG", colX[1] - RAY_W / 2, rowBaseline - RAY_H, RAY_W, RAY_H); } catch (e) {}
      caption("Meet Ray, the Sunbeam plush toy", colX[1]);
      smallButton(sunbeam.rayPreorderLabel, colX[1], rowBaseline + 15, sunbeam.rayPreorderUrl);
      doc.setFontSize(8.5); doc.setTextColor(90, 100, 120); doc.text(sunbeam.rayPreorderNote, colX[1], rowBaseline + 27, { align: "center" });
    }
    if (fullColorImg) {
      try { doc.addImage(fullColorImg, "JPEG", colX[2] - BOOK_SIZE / 2, rowBaseline - BOOK_SIZE, BOOK_SIZE, BOOK_SIZE); } catch (e) {}
      doc.link(colX[2] - BOOK_SIZE / 2, rowBaseline - BOOK_SIZE, BOOK_SIZE, BOOK_SIZE, { url: sunbeam.animatedCoverUrl });
      caption("Full-color story book", colX[2]);
      centeredLink(sunbeam.fullColorHint, colX[2], rowBaseline + 11, sunbeam.animatedCoverUrl);
      smallButton("Buy now", colX[2], rowBaseline + 15, sunbeam.fullColorUrl);
    }
    y = (fullColorImg || coloringImg || rayImg) ? rowBaseline + 34 : y;

    ensureRoom(30); // badge + "buy both" + set link stay together
    const blY = y;
    const bibaImg = await fetchImageAsDataUrl(sunbeam.bibaBadgeImg);
    if (bibaImg) { try { doc.addImage(bibaImg, "PNG", 15, blY - 3, 60, 25); } catch (e) {} }
    [["Buy both books", sunbeam.bothBooksUrl, true], ["Book + Ray plush set (coming soon)", sunbeam.setUrl, false]].forEach(([label, url, strong], i) => {
      doc.setFontSize(strong ? 11 : 10); doc.setFont(undefined, strong ? "bold" : "normal"); doc.setTextColor(27, 42, 74);
      const w = doc.getTextWidth(label), ly = blY + 7 + i * 8;
      doc.textWithLink(label, 195 - w, ly, { url });
      doc.setDrawColor(27, 42, 74); doc.setLineWidth(0.25); doc.line(195 - w, ly + 1.2, 195, ly + 1.2);
    });
    doc.setFont(undefined, "normal");
    y = blY + 28;
    {
      // How-to text on the left, the picture of a child writing in the book on
      // the right — the section ends on that picture (per Mark), and sharing the
      // row keeps it on the same page as the books.
      const heroImg = await fetchImageAsDataUrl(sunbeam.heroImg);
      const HERO_W = 78, HERO_H = 52;
      const textRight = heroImg ? 195 - HERO_W - 7 : 195;
      const parts = sunbeam.text.split(/"(What happened today[^"]*)"/);
      const words = [];
      parts.forEach((part, i) => part.split(/\s+/).filter(Boolean).forEach(w => words.push({ w, q: i === 1 })));
      if (words.length) { const f = words.find(x => x.q); if (f) f.w = "\u201C" + f.w; const l = [...words].reverse().find(x => x.q); if (l) l.w = l.w + "\u201D"; }
      const fontFor = (q) => { if (q) { doc.setFont("times", "bolditalic"); doc.setFontSize(11.5); doc.setTextColor(138, 100, 32); } else { doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(16, 27, 51); } };
      const lineH = 5.8;
      // measure first, so the whole row moves together if it can't fit
      let lines = 1, mx = 15;
      words.forEach(({ w, q }) => { fontFor(q); const ww = doc.getTextWidth(w), sp = doc.getTextWidth(" "); if (mx > 15 && mx + ww > textRight) { mx = 15; lines++; } mx += ww + sp; });
      const rowH = Math.max(lines * lineH, heroImg ? HERO_H : 0);
      ensureRoom(rowH + 6);
      const rowTop = y;
      if (heroImg) { try { doc.addImage(heroImg, "JPEG", 195 - HERO_W, rowTop - 4, HERO_W, HERO_H); } catch (e) {} }
      let x = 15;
      words.forEach(({ w, q }) => {
        fontFor(q);
        const ww = doc.getTextWidth(w), sp = doc.getTextWidth(" ");
        if (x > 15 && x + ww > textRight) { x = 15; y += lineH; }
        doc.text(w, x, y); x += ww + sp;
      });
      doc.setFont("helvetica", "normal");
      y = Math.max(y + lineH, rowTop - 4 + (heroImg ? HERO_H : 0)) + 6;
    }
    y += 6;
  }

  heading("Recommended reading:");

  body(topicLabel());

  for (const b of recommendedBooks()) {
    const coverDataUrl = await fetchImageAsDataUrl(b.coverUrl);
    if (coverDataUrl) {
      ensureRoom(48);
      const by = y;
      try { doc.addImage(coverDataUrl, "JPEG", 15, by, 30, 43); } catch (err) { console.warn("Could not embed cover image:", err); }
      doc.setFontSize(11); doc.setTextColor(40, 40, 40);
      doc.text(doc.splitTextToSize(b.display, 140), 52, by + 8);
      doc.setFontSize(10); doc.setTextColor(90, 100, 120);
      const chapterText = b.chapter ? `Look for ${b.chapter}.` : "Relevant throughout — worth reading in full.";
      doc.text(doc.splitTextToSize(chapterText, 140), 52, by + 20);
      doc.setFontSize(11); doc.setTextColor(66, 153, 225);
      doc.textWithLink("View this book", 52, by + 38, { url: b.url });
      y = by + 50;
    } else {
      ensureRoom(20);
      doc.setFontSize(11); doc.setTextColor(40, 40, 40);
      doc.text(doc.splitTextToSize(b.display, 180), 15, y); y += 6;
      doc.setFontSize(10); doc.setTextColor(90, 100, 120);
      const chapterText = b.chapter ? `Look for ${b.chapter}.` : "Relevant throughout — worth reading in full.";
      doc.text(doc.splitTextToSize(chapterText, 180), 15, y); y += 6;
      doc.setFontSize(11); doc.setTextColor(66, 153, 225);
      doc.textWithLink("View this book", 15, y, { url: b.url });
      y += 10;
    }
  }

  if (affiliateDisclosure()) body(affiliateDisclosure(), { color: [140, 140, 140] });

  // One consolidated close, instead of two separate sections: what's next,
  // a simple honest card for the Playbook (not a fake screenshot — it
  // doesn't exist yet, so there's nothing real to screenshot), and a single
  // real, honest call to action. Joining Bullyproof.Support today is real;
  // "starting a tracked trial" isn't a thing that exists yet, so it's not
  // claimed here.
  // Same layout as the email: Playbook picture on the RIGHT beside the intro
  // and list, "Reserve my copy" under it, and again after the details.
  function reserveBox(x, yy) {
    doc.setDrawColor(16, 27, 51); doc.setLineWidth(0.5); doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, yy - 3.6, 4.2, 4.2, 0.7, 0.7, "FD");
    doc.setFont(undefined, "bold"); doc.setFontSize(10.5); doc.setTextColor(16, 27, 51);
    doc.text("Reserve my copy", x + 6.2, yy);
    doc.link(x - 1, yy - 5, 40, 7, { url: playbookInviteUrl() });
    doc.setFont(undefined, "normal");
  }
  heading("What comes next:");
  const playbookImg = await fetchImageAsDataUrl(playbookBoxImageUrl());
  const colW = playbookImg ? 124 : 180;
  doc.setFontSize(11);
  const introLines = doc.splitTextToSize(WHAT_COMES_NEXT_INTRO, colW);
  const bulletBlocks = furtherStepsTeaser().map(t => doc.splitTextToSize(`• ${t}`, colW));
  const LH = 5.2; // line spacing for this block
  const textH = introLines.length * LH + 6 + bulletBlocks.reduce((h, l) => h + l.length * LH + 3.5, 0);
  ensureRoom(Math.max(textH, 72) + 4); // keep the list and the picture together on one page
  const topY = y;
  if (playbookImg) {
    try { doc.addImage(playbookImg, "JPEG", 150, topY - 4, 44, 53); } catch (err) { console.warn("Could not embed Playbook box image:", err); }
    if (!state.marketingConsent) reserveBox(152, topY + 58);
  }
  doc.setFont(undefined, "normal"); doc.setFontSize(11); doc.setTextColor(40, 40, 40);
  doc.text(introLines, 15, y, { lineHeightFactor: 1.35 }); y += introLines.length * LH + 6;
  bulletBlocks.forEach(l => { doc.text(l, 15, y, { lineHeightFactor: 1.35 }); y += l.length * LH + 3.5; });
  y = Math.max(y, topY + 68) + 4;

  ensureRoom(78); // the Playbook details card and the start of the benefits list stay together
  doc.setFillColor(245, 246, 251); doc.setDrawColor(225, 228, 234); doc.setLineWidth(0.3);
  doc.setFontSize(9.5);
  const blurbLines = doc.splitTextToSize(PLAYBOOK_BLURB, 168);
  const cardH = 42 + blurbLines.length * 4.6;
  doc.roundedRect(15, y, 180, cardH, 3, 3, "FD");
  doc.setFontSize(14); doc.setFont(undefined, "bold"); doc.setTextColor(16, 27, 51);
  doc.text("The Bullyproof Parent Playbook", 21, y + 10);
  doc.setFontSize(10); doc.setTextColor(60, 70, 100);
  doc.text("Personalized guidance that grows with your child.", 21, y + 17);
  doc.setFont(undefined, "normal"); doc.setFontSize(9.5); doc.setTextColor(90, 100, 120);
  doc.text(blurbLines, 21, y + 25);
  const afterBlurb = y + 25 + blurbLines.length * 4.6;
  doc.setFontSize(9); doc.text(PLAYBOOK_SOON, 21, afterBlurb + 2);
  doc.setFontSize(10.5); doc.setTextColor(66, 153, 225);
  doc.textWithLink("Join Bullyproof.Support FREE today", 21, afterBlurb + 10, { url: NETWORK_HOME_URL });
  y += cardH + 8;
  doc.setFontSize(10.5); doc.setFont(undefined, "bold"); doc.setTextColor(27, 42, 74);
  doc.text("What membership includes, starting today:", 15, y); y += 7;
  doc.setFont(undefined, "normal"); doc.setFontSize(10); doc.setTextColor(60, 70, 100);
  MEMBERSHIP_BENEFITS.forEach(b => {
    const ls = doc.splitTextToSize("• " + b, 172);
    ensureRoom(ls.length * 5 + 3);
    doc.text(ls, 17, y); y += ls.length * 5 + 2;
  });
  y += 4;
  ensureRoom(34); // the trial note and the second reserve box stay together
  body("Your membership does not start your free trial today. When the Playbook launches, you'll receive an invitation to try it FREE for one week.", { color: [140, 140, 140] });
  if (!state.marketingConsent) { reserveBox(16, y + 2); y += 14; }

  heading("Prefer to talk to a licensed professional?");
  body("That's always an option too. Search the Bullyproof Support network to get matched with a professional near you — just enter your location, no cost to look:");
  ensureRoom(8);
  doc.setFontSize(11); doc.setTextColor(66, 153, 225);
  doc.textWithLink("bullyproof.support/getmatched", 15, y, { url: NETWORK_MATCH_URL });
  y += 12;
  body("If your area doesn't have a strong match yet, Psychology Today's broader directory is a good backup:");
  ensureRoom(8);
  doc.setFontSize(11); doc.setTextColor(66, 153, 225);
  doc.textWithLink("psychologytoday.com/us/therapists", 15, y, { url: FIND_SUPPORT_URL });
  y += 12;

  ensureRoom(10);
  doc.setFontSize(10); doc.setTextColor(100, 100, 100);
  body("This plan is for general information only. It is not medical, mental health, or legal advice, and it doesn't guarantee any specific result. Please use your own judgment and talk to a licensed professional about your specific situation. If your child is in immediate danger, call 911.", { color: [130, 130, 130] });
  doc.setFontSize(10); doc.setTextColor(100, 100, 100);
  doc.text("If you need more help finding a vetted professional in your area, visit " + (CONFIG.SITE_URL || "bullyproof.guide") + ".", 15, y);

  doc.save("bullyproof-action-plan.pdf");
}

try { if (new URLSearchParams(window.location.search).get("invite") === "1") state.screen = "invite"; } catch (e) { /* no URL params — start normally */ }
render();
