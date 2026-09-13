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
      <div class="results-summary"><h3>Here's what we're seeing</h3><p>${summary}</p></div>
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
  return state.answers.q2 || "a bullying situation you're working through.";
}

async function submitToFormspree() {
  if (!CONFIG.FORMSPREE_ENDPOINT) { console.warn("Formspree endpoint not configured."); return; }
  try {
    await fetch(CONFIG.FORMSPREE_ENDPOINT, { method: "POST", headers: { "Accept": "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ email: state.email, answers: state.answers, safetyFlags: state.safetyFlags }) });
    track("email_captured");
  } catch (err) { console.warn("Formspree submission failed (non-blocking):", err); }
}

function chapterRecommendation() {
  const q2 = state.answers.q2 || "";
  if (q2.includes("online")) return "Chapter: Navigating Cyberbullying — screenshots, reporting, and the conversation to have tonight.";
  if (q2.includes("school")) return "Chapter: When It's Happening at School — documenting incidents and working with the school.";
  if (q2.includes("treated badly")) return "Chapter: When Other Kids Are Unkind — rebuilding your child's confidence and circle.";
  if (q2.includes("prevent")) return "Chapter: Getting Ahead of It — building resilience before problems start.";
  return "Chapter: Getting Your Bearings — what to watch for and how to open the conversation.";
}

function actionSteps() {
  const q7 = state.answers.q7 || [];
  const isOnline = q7.some(loc => loc.includes("social media") || loc.includes("text messages") || loc.includes("gaming platform"));
  if (isOnline) {
    return [
      "Save screenshots and timestamps before anything gets deleted.",
      "Review the platform's reporting and blocking tools together with your child.",
      "Set a calm, non-punitive time this week to talk through device boundaries."
    ];
  }
  return [
    "Write down what your child told you, in their words, with dates.",
    "Reach out to the school counselor or a trusted staff member this week.",
    "Check in daily with a simple, low-pressure question: 'How was today, really?'"
  ];
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

  // Opening line: parent's own words from Q4
  if (state.answers.q4) {
    doc.setFontSize(13); doc.setTextColor(44, 82, 130); doc.text("You told us:", 15, y); y += 7;
    doc.setFontSize(11); doc.setFont(undefined, "italic");
    doc.text(doc.splitTextToSize(`"${state.answers.q4}"`, 180), 15, y);
    doc.setFont(undefined, "normal");
    y += 14;
  }

  doc.setFontSize(13); doc.setTextColor(44, 82, 130); doc.text("What's happening:", 15, y); y += 7;
  doc.setFontSize(11); doc.text(doc.splitTextToSize(deriveSummary(), 180), 15, y); y += 12;

  doc.setFontSize(13); doc.text("Recommended reading:", 15, y); y += 7;
  doc.setFontSize(11); doc.text(doc.splitTextToSize(chapterRecommendation(), 180), 15, y); y += 16;

  doc.setFontSize(13); doc.text("Your next 3 steps:", 15, y); y += 7;
  doc.setFontSize(11);
  actionSteps().forEach((step, i) => { doc.text(doc.splitTextToSize(`${i + 1}. ${step}`, 180), 15, y); y += 12; });

  // Closing acknowledgment: parent's own words from Q12
  if (state.answers.q12) {
    y += 4;
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
