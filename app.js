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

function addFlag(key) {
  if (!state.safetyFlags.includes(key)) { state.safetyFlags.push(key); track("safety_escalation_triggered", { trigger: key }); }
}

function render() {
  if (state.screen === "landing") return renderLanding();
  if (state.screen === "question") return renderQuestion();
  if (state.screen === "results") return renderResults();
}

function renderLanding() {
  progressTrack.style.display = "none";
  appEl.innerHTML = `
    <div class="card">
      ${iconBadge(LANDING_ICON, "landing-badge")}
      <h1>Get clarity on what's happening.</h1>
      <p class="body-text">Twelve quick questions. About 3 minutes. At the end you'll get a personalized action plan you can start using tonight — sent straight to your inbox.</p>
      <p class="privacy-note">Your responses are saved securely and only used to generate your action plan. We never share your data.</p>
      <div class="nav-row" style="justify-content:flex-start;">
        <button class="primary" id="startBtn">Start the Assessment</button>
      </div>
    </div>
  `;
  document.getElementById("startBtn").addEventListener("click", () => { track("assessment_started"); state.screen = "question"; state.qIndex = 0; render(); });
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
      ${q.icon ? iconBadge(q.icon) : ""}
      <h2 class="question">${q.title}</h2>
      ${q.sub ? `<p class="sub">${q.sub}</p>` : ""}
      ${bodyHTML}
      <div class="nav-row">
        <button class="ghost" id="backBtn" ${state.qIndex === 0 ? "disabled style='visibility:hidden'" : ""}>Back</button>
        <button class="primary" id="nextBtn">Next</button>
      </div>
    </div>
  `;
  wireQuestionEvents(q);
  track("question_answered_view", { question: q.id });
}

function renderSafetyBanner() {
  const priority = ["sexualOrPower", "physicalSigns"];
  const key = priority.find(k => state.safetyFlags.includes(k));
  const variant = SAFETY_VARIANTS[key];
  return `
    <div class="safety-banner">
      <h3>Please know help is available right now</h3>
      <p>Based on what you've shared, we want to make sure you have these resources close by. You can keep going with the assessment whenever you're ready.</p>
      <ul>${variant.resources.map(r => `<li><strong>${r.name}</strong> — ${r.detail}</li>`).join("")}</ul>
    </div>
  `;
}

function renderChoice(q) {
  const selected = state.answers[q.id];
  return `<div class="options">${q.options.map(opt => `<button type="button" class="option-btn ${selected === opt ? "selected" : ""}" data-value="${escapeAttr(opt)}">${opt}</button>`).join("")}</div>`;
}

function renderMulti(q) {
  const selected = state.answers[q.id] || [];
  return `<div class="options">${q.options.map(opt => `<button type="button" class="option-btn multi-opt ${selected.includes(opt) ? "selected" : ""}" data-value="${escapeAttr(opt)}">${opt}</button>`).join("")}</div>`;
}

function renderText(q) {
  const val = state.answers[q.id] || "";
  return `<textarea id="textInput" rows="5" style="width:100%;padding:13px 14px;border-radius:10px;border:2px solid #CFE6F8;font-size:16px;font-family:inherit;color:#2C5282;" placeholder="Type here...">${val}</textarea>`;
}

function escapeAttr(s) { return String(s).replace(/"/g, "&quot;"); }

function iconBadge(svgInner, extraClass) {
  return `<div class="icon-badge ${extraClass || ""}"><svg viewBox="0 0 24 24" fill="none" stroke="#4299E1" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${svgInner}</svg></div>`;
}

function wireQuestionEvents(q) {
  document.getElementById("backBtn").addEventListener("click", () => { if (state.qIndex > 0) { state.qIndex--; render(); } });
  document.getElementById("nextBtn").addEventListener("click", () => onNext(q));
  if (q.type === "choice") { document.querySelectorAll(".option-btn").forEach(btn => { btn.addEventListener("click", () => { state.answers[q.id] = btn.dataset.value; checkSafety(q, btn.dataset.value); render(); }); }); }
  if (q.type === "multi") { document.querySelectorAll(".multi-opt").forEach(btn => { btn.addEventListener("click", () => { const val = btn.dataset.value; const arr = state.answers[q.id] || []; const idx = arr.indexOf(val); if (idx >= 0) arr.splice(idx, 1); else arr.push(val); state.answers[q.id] = arr; checkSafety(q, arr); render(); }); }); }
}

function onNext(q) {
  if (q.type === "text") {
    state.answers[q.id] = document.getElementById("textInput").value.trim();
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
  const summary = deriveSummary();
  appEl.innerHTML = `
    ${state.safetyFlags.length ? renderSafetyBanner() : ""}
    <div class="card">
      ${iconBadge(RESULTS_ICON)}
      <div class="results-summary"><h3>Here's what we're seeing</h3><p>${summary}</p>${openingValidation() ? `<p style="margin-top:8px;">${openingValidation()}</p>` : ""}</div>
      <h2 class="question">Where should we send your action plan?</h2>
      <p class="sub">One email. Your personalized plan, plus a copy you can keep.</p>
      <input type="email" id="finalEmail" placeholder="you@email.com" value="${state.email || ""}">
      <div class="nav-row">
        <button class="ghost" id="backToQ">Back</button>
        <button class="primary" id="getPlanBtn">Get My Action Plan</button>
      </div>
      <p class="privacy-note">Your responses are saved securely and only used to generate your action plan. We never share your data. Every follow-up email includes a "Delete my data" link.</p>
    </div>
  `;
  document.getElementById("backToQ").addEventListener("click", () => { state.screen = "question"; state.qIndex = visibleQuestions().length - 1; render(); });
  document.getElementById("getPlanBtn").addEventListener("click", async () => {
    const emailInput = document.getElementById("finalEmail");
    const email = emailInput.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { emailInput.style.borderColor = "#C53030"; return; }
    state.email = email;
    await submitToFormspree();
    generatePDF();
    track("pdf_downloaded");
  });
}

function deriveSummary() {
  const q2 = state.answers.q2 || "a bullying situation you're working through";
  const statusText = {
    "clear": "Your child has spoken with you directly about it.",
    "hints": "Your child has shared pieces of it, but not the full picture yet.",
    "behavior-only": "Your child hasn't said anything directly, but their behavior is telling you something.",
    "no-signals": "Nothing concrete yet — you're going on instinct."
  }[communicationStatus()] || "";
  return `${q2}${statusText ? " " + statusText : ""}`;
}

async function submitToFormspree() {
  if (!CONFIG.FORMSPREE_ENDPOINT) { console.warn("Formspree endpoint not configured."); return; }
  try {
    await fetch(CONFIG.FORMSPREE_ENDPOINT, { method: "POST", headers: { "Accept": "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ email: state.email, answers: state.answers, safetyFlags: state.safetyFlags }) });
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
  if (q11.startsWith("Yes — both")) return "both";
  const onlineCount = q7.filter(l => l.includes("social media") || l.includes("text messages") || l.includes("gaming platform")).length;
  const inPersonCount = q7.filter(l => l.includes("At school") || l.includes("school bus") || l.includes("after-school") || l.includes("neighborhood")).length;
  if (onlineCount > inPersonCount) return "online";
  if (inPersonCount > 0) return "in-person";
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
  if (q2.includes("prevent")) return "Getting ready before a problem starts is a smart, caring move.";
  if (q2.includes("treated badly")) return "It takes courage for a child to say they're being treated badly. It takes just as much courage for a parent to believe them right away.";
  if (q2.includes("Something happened online")) return "Things online can get bad fast. It's good that you're acting now instead of waiting.";
  if (q2.includes("concerning at school")) return "Trusting what you see at school, even before your child says anything, is the right thing to do.";
  return "";
}

function focusLine() {
  const q12 = (state.answers.q12 || "").trim();
  if (!q12) return null;
  return `You told us you want help with: "${q12}" — that's exactly where we start below.`;
}

function stepOpening() {
  const status = communicationStatus();
  if (status === "clear") {
    return "Write down what your child told you. Use their own words. Add the date. Keep this note — you can show it to a counselor or the school later.";
  }
  if (status === "hints") {
    return `Talk about what they already shared. Try saying: "You told me something was bothering you. I've been thinking about it. I'm here if you want to say more." Don't push for the whole story yet — let them go at their own pace.`;
  }
  if (status === "behavior-only") {
    const named = (state.answers.q6 || []).filter(b => b !== "No noticeable changes");
    const behavior = named.length ? named[0].toLowerCase() : "different lately";
    return `Say what you see, without asking why. Try: "I've noticed you've been ${behavior}. You don't have to explain it right now. I just want you to know I see it, and I'm here." This opens the door without any pressure.`;
  }
  if (status === "no-signals") {
    return "Nothing has been said yet, so don't ask directly right away — that can make kids close up more. Instead, spend easy time together: a car ride, a walk, cooking side by side. Kids often talk more when they aren't looking right at you.";
  }
  return "Find an easy, low-pressure time to check in with your child this week. Talking side by side, not face to face, often works better than a direct sit-down.";
}

function stepSchool() {
  const map = {
    "helping": "Check in with the school contact again this week. Ask what they're seeing, and if there's a follow-up plan.",
    "no-change": `Nothing has changed yet, so ask for a new meeting. Get a clear plan with a real date — not just "we'll keep an eye on it."`,
    "dismissed": "If the school said this isn't bullying, you can still push back. Ask to meet with a counselor or the principal, not just the first person you talked to. Bring your written notes.",
    "not-reached-out": `Contact the school counselor this week. A short email works well: "I'd like 15 minutes to talk about some changes I'm seeing in my child. Nothing urgent, just want to loop you in."`,
    "child-doesnt-want": "Ask your child what they're afraid will happen if you talk to the school. Their answer will help you decide how — or whether — to bring the school in without it feeling like a betrayal."
  };
  return map[schoolStatus()] || "Reach out to a counselor or trusted adult at school this week, just to get another set of eyes on it.";
}

function stepContext() {
  const weight = onlineWeight();
  if (weight === "online" || weight === "both") {
    return "Save screenshots and dates before anything gets deleted. Sit down with your child and look at the app's report and block settings together — as a team, not as spying.";
  }
  if (weight === "in-person") {
    return "Ask your child if certain times or places feel worse — recess, lunch, the bus. This helps the school watch the right spots instead of everywhere.";
  }
  return "Keep a short daily note. Just one line, no pressure — write down your child's mood and anything small they say. Patterns often show up after a week or two.";
}

function professionalSupportNote() {
  if (!needsProfessionalSupport()) return null;
  return "Based on what you shared, it may help to bring in a school counselor or child therapist now, not just as a backup plan. A trained professional can help things move faster.";
}

function chapterRecommendation() {
  const BOOK = "Bullyproof Kids in 10 Minutes a Day";
  const q9 = state.answers.q9 || [];
  if (q9.some(t => t.includes("pressuring them sexually") || t.includes("using power over them"))) {
    return `In ${BOOK}, look for the section on when someone has power over a child — it covers how to spot this and what to do.`;
  }
  if (q9.some(t => t.includes("hit, pushed, tripped"))) {
    return `In ${BOOK}, look for the section on physical bullying — it covers writing things down and working with the school.`;
  }
  if (q9.some(t => t.includes("left out, ignored, or excluded"))) {
    return `In ${BOOK}, look for the section on being left out — it covers rebuilding your child's confidence and friend group.`;
  }
  if (q9.some(t => t.includes("called names, teased"))) {
    return `In ${BOOK}, look for the section on name-calling and teasing — it covers how to respond without brushing it off.`;
  }
  if (onlineWeight() === "online") {
    return `In ${BOOK}, look for the section on cyberbullying — it covers screenshots, reporting, and how to talk about it tonight.`;
  }
  const q2 = state.answers.q2 || "";
  if (q2.includes("prevent")) return `In ${BOOK}, look for the section on building strength early, before problems start.`;
  return `In ${BOOK}, look for the section on getting your bearings — what to watch for and how to start the conversation.`;
}

function actionSteps() {
  return [stepOpening(), stepSchool(), stepContext()];
}

function generatePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 20;
  doc.setFontSize(18); doc.setTextColor(44, 82, 130); doc.text("Bullyproof.Guide — Your Action Plan", 15, y); y += 12;

  if (state.safetyFlags.length) {
    const priority = ["sexualOrPower", "physicalSigns"];
    const key = priority.find(k => state.safetyFlags.includes(k));
    const variant = SAFETY_VARIANTS[key];
    doc.setFillColor(253, 237, 237);
    doc.rect(10, y - 6, 190, 10 + variant.resources.length * 6, "F");
    doc.setFontSize(13); doc.setTextColor(197, 48, 48); doc.text("Please reach out to one of these resources first:", 15, y); y += 7;
    doc.setFontSize(11);
    variant.resources.forEach(r => { doc.text(`${r.name} — ${r.detail}`, 15, y); y += 6; });
    y += 6;
  }

  if (state.answers.q4) {
    doc.setFontSize(13); doc.setTextColor(44, 82, 130); doc.text("You told us:", 15, y); y += 7;
    doc.setFontSize(11); doc.setFont(undefined, "italic");
    doc.text(doc.splitTextToSize(`"${state.answers.q4}"`, 180), 15, y);
    doc.setFont(undefined, "normal");
    y += 14;
  }

  const validation = openingValidation();
  if (validation) {
    doc.setFontSize(11); doc.setTextColor(74, 109, 147);
    doc.text(doc.splitTextToSize(validation, 180), 15, y); y += 14;
  }

  doc.setFontSize(13); doc.setTextColor(44, 82, 130); doc.text("What's happening:", 15, y); y += 7;
  doc.setFontSize(11); doc.text(doc.splitTextToSize(deriveSummary(), 180), 15, y); y += 12;

  const focus = focusLine();
  if (focus) {
    doc.setFontSize(11); doc.setFont(undefined, "italic");
    doc.text(doc.splitTextToSize(focus, 180), 15, y);
    doc.setFont(undefined, "normal");
    y += 14;
  }

  doc.setFontSize(13); doc.setTextColor(44, 82, 130); doc.text("Recommended reading:", 15, y); y += 7;
  doc.setFontSize(11); doc.text(doc.splitTextToSize(chapterRecommendation(), 180), 15, y); y += 16;

  doc.setFontSize(13); doc.setTextColor(44, 82, 130); doc.text("Your next 3 steps:", 15, y); y += 7;
  doc.setFontSize(11);
  actionSteps().forEach((step, i) => { doc.text(doc.splitTextToSize(`${i + 1}. ${step}`, 180), 15, y); y += 14; });

  const proNote = professionalSupportNote();
  if (proNote) {
    y += 2;
    doc.setFontSize(13); doc.setTextColor(44, 82, 130); doc.text("Worth considering:", 15, y); y += 7;
    doc.setFontSize(11); doc.text(doc.splitTextToSize(proNote, 180), 15, y); y += 14;
  }

  if (state.answers.q12) {
    y += 2;
    doc.setFontSize(13); doc.setTextColor(44, 82, 130); doc.text("You asked for help with:", 15, y); y += 7;
    doc.setFontSize(11); doc.setFont(undefined, "italic");
    doc.text(doc.splitTextToSize(`"${state.answers.q12}"`, 180), 15, y);
    doc.setFont(undefined, "normal");
    y += 14;
  }

  y += 6;
  doc.setFontSize(10); doc.setTextColor(100, 100, 100);
  doc.text("If you need more help finding a vetted professional in your area, visit " + (CONFIG.SITE_URL || "bullyproof.guide") + ".", 15, y);

  doc.save("bullyproof-action-plan.pdf");
}

render();
