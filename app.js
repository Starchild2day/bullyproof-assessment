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
  const useFixedShell = state.screen === "question" && state.safetyFlags.length === 0;
  document.body.classList.toggle("question-mode", useFixedShell);
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (state.screen === "landing") return renderLanding();
  if (state.screen === "question") return renderQuestion();
  if (state.screen === "results") return renderResults();
}

function renderLanding() {
  progressTrack.style.display = "none";
  appEl.innerHTML = `
    <div class="card">
      ${banner(LANDING_ICON, { large: true })}
      <div class="card-body">
      <h1>Get clarity on what's happening.</h1>
      <p class="body-text">Twelve quick questions. About 3 minutes. At the end you'll get a personalized action plan you can start using tonight — sent straight to your inbox.</p>
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
      ${q.icon ? banner(q.icon) : ""}
      <div class="card-body">
      <div class="card-fixed">
        <h2 class="question">${q.title}</h2>
        ${q.sub ? `<p class="sub">${q.sub}</p>` : ""}
      </div>
      <div class="options-scroll">
        ${bodyHTML}
      </div>
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
  const priority = ["sexualOrPower", "physicalSigns"];
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

function renderChoice(q) {
  const selected = state.answers[q.id];
  return `<div class="options" role="radiogroup">${q.options.map(opt => `<button type="button" class="option-btn ${selected === opt ? "selected" : ""}" data-value="${escapeAttr(opt)}" role="radio" aria-checked="${selected === opt}"><span class="check">${CHECKMARK_SVG}</span><span>${opt}</span></button>`).join("")}</div>`;
}

function renderMulti(q) {
  const selected = state.answers[q.id] || [];
  return `<div class="options" role="group">${q.options.map(opt => `<button type="button" class="option-btn multi-opt ${selected.includes(opt) ? "selected" : ""}" data-value="${escapeAttr(opt)}" role="checkbox" aria-checked="${selected.includes(opt)}"><span class="check">${CHECKMARK_SVG}</span><span>${opt}</span></button>`).join("")}</div>`;
}

function renderText(q) {
  const val = state.answers[q.id] || "";
  return `<textarea id="textInput" rows="5" placeholder="Type here...">${val}</textarea>`;
}

function escapeAttr(s) { return String(s).replace(/"/g, "&quot;"); }

function banner(svgInner, opts) {
  opts = opts || {};
  const large = !!opts.large;
  const vbH = large ? 180 : 100;
  const cy = vbH / 2;
  const size = large ? 72 : 44;
  const x = 200 - size / 2;
  const y = cy - size / 2;
  return `<div class="banner${large ? " landing-banner" : ""}">
    <svg viewBox="0 0 400 ${vbH}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="46" cy="${vbH - 28}" r="72" fill="#4F7C82" opacity="0.28"/>
      <circle cx="366" cy="24" r="94" fill="#C89B3C" opacity="0.16"/>
      <circle cx="330" cy="${vbH - 18}" r="38" fill="#FFFFFF" opacity="0.05"/>
      <svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#EFDFB8" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${svgInner}</svg>
    </svg>
  </div>`;
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
      ${banner(RESULTS_ICON)}
      <div class="card-body">
      <div class="results-summary"><h3>Here's what we're seeing</h3><p>${summary}</p>${openingValidation() ? `<p style="margin-top:8px;">${openingValidation()}</p>` : ""}</div>
      <p class="sub" style="margin-bottom:20px;">Want to talk to someone? <a href="${NETWORK_MATCH_URL}" target="_blank" style="color:var(--navy);font-weight:600;">Get matched with a professional near you</a> through the Bullyproof Support network — this will also be in your emailed plan.</p>
      <h2 class="question">Where should we send your action plan?</h2>
      <p class="sub">One email. Your personalized plan, plus a copy you can keep.</p>
      <input type="email" id="finalEmail" placeholder="you@email.com" value="${state.email || ""}">
      <div class="playbook-teaser">
        <h3>Want more than these 3 steps?</h3>
        <p>This plan covers what matters most right now. Your full situation usually needs more, though — things like <strong>${furtherStepsTeaser()[0].toLowerCase()}</strong> or <strong>${furtherStepsTeaser()[1].toLowerCase()}</strong>. That's what the <strong>Bullyproof Parent Playbook</strong> is being built for: ongoing help, personalized to your child by name and age, that adapts as things change.</p>
        <p>It's not live yet. Checking the box costs nothing and commits you to nothing — it just means we'll email you the moment it's ready, with a free 3-day trial waiting.</p>
      </div>
      <div class="checkbox-row">
        <input type="checkbox" id="playbookInterest">
        <label for="playbookInterest">Reserve my spot for the free 3-day trial of the Bullyproof Parent Playbook</label>
      </div>
      <div class="network-invite">
        <h3>Also worth knowing about — free, live today</h3>
        <p>Bullyproof Support is a free community for parents in situations like yours: other parents' stories, articles and a podcast on exactly this kind of thing, and the professional directory you just saw — searchable anytime once you have an account, not just this once. It's still growing, so joining now makes you a Founding Member.</p>
        <a href="${NETWORK_HOME_URL}" target="_blank" class="network-invite-link">Create your free account →</a>
      </div>
      <div class="nav-row">
        <button class="ghost" id="backToQ">Back</button>
        <button class="primary" id="getPlanBtn">Get My Action Plan</button>
      </div>
      <p class="privacy-note">Your responses are saved securely and only used to generate your action plan. We never share your data. Every follow-up email includes a "Delete my data" link.</p>
      </div>
    </div>
  `;
  document.getElementById("backToQ").addEventListener("click", () => { state.screen = "question"; state.qIndex = visibleQuestions().length - 1; render(); });
  wireSafetyBanner();
  document.getElementById("getPlanBtn").addEventListener("click", async () => {
    const emailInput = document.getElementById("finalEmail");
    const email = emailInput.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { emailInput.style.borderColor = "#C53030"; return; }
    state.email = email;
    state.playbookInterest = document.getElementById("playbookInterest").checked;
    await submitToFormspree();
    generatePDF();
    track("pdf_downloaded");
  });
}

function isPreventive() {
  return (state.answers.q2 || "").includes("prevent");
}

function deriveSummary() {
  const q2 = state.answers.q2 || "a bullying situation you're working through";
  if (isPreventive()) return `${q2}.`;
  const statusText = {
    "clear": "Your child has spoken with you directly about it.",
    "hints": "Your child has shared pieces of it, but not the full picture yet.",
    "behavior-only": "Your child hasn't said anything directly, but their behavior is telling you something.",
    "no-signals": "Nothing concrete yet — you're going on instinct."
  }[communicationStatus()] || "";
  return `${q2}.${statusText ? " " + statusText : ""}`;
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
        wants_playbook_trial: state.playbookInterest ? "yes" : "no",
        consent_given: state.consentGiven ? "yes" : "no",
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
const BOOKS = {
  power: { title: "Protecting the Gift", author: "Gavin de Becker" },
  physical: { title: "The Bully, the Bullied, and the Bystander", author: "Barbara Coloroso" },
  exclusion: { title: "Queen Bees and Wannabes", author: "Rosalind Wiseman" },
  namecalling: { title: "How to Talk So Kids Will Listen & Listen So Kids Will Talk", author: "Adele Faber & Elaine Mazlish" },
  online: { title: "Cyberbullying: Bullying in the Digital Age", author: "Robin Kowalski, Susan Limber & Patricia Agatston" },
  prevent: { title: "How to Talk So Kids Will Listen & Listen So Kids Will Talk", author: "Adele Faber & Elaine Mazlish" },
  default: { title: "The Bully, the Bullied, and the Bystander", author: "Barbara Coloroso" }
};

function bookRecommendation() {
  const b = BOOKS[topicBranch()];
  return `"${b.title}" by ${b.author}`;
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
const NETWORK_HOME_URL = "https://www.bullyproof.support/checkout/hidden-profile";

// Backup only — for areas where the network doesn't yet have a strong local
// match. Swap or remove once network coverage is dense enough on its own.
const FIND_SUPPORT_URL = "https://www.psychologytoday.com/us/therapists";

function whyThisMattersNote() {
  const status = communicationStatus();
  if (status === "behavior-only" || status === "no-signals") {
    return "Here's something worth knowing: kids who feel confident talking to a trusted adult are less likely to be targeted in the first place. That's a skill that can be built at any age. If it feels like a gap right now, that's not a failure on your part — it's simply the next thing to work on together.";
  }
  if (onlineWeight() === "online") {
    return "One thing that often helps: kids who know how to manage their online presence, and who to tell when something feels wrong, are far more resilient. That's a learned skill, not something they're born knowing.";
  }
  return "Confidence and social skills can be built at any age. Working on that together is often the biggest thing a parent can do — even more than any single talk with the school.";
}

function furtherStepsTeaser() {
  const items = isPreventive() ? [
    "Age-by-age scripts for talking about kindness and boundaries before anything comes up",
    "A simple weekly habit that builds your child's confidence over time",
    "How to tell normal kid conflict apart from something worth stepping in on",
    "A way to check in on progress even when nothing seems wrong"
  ] : [
    "The exact words to say if the school pushes back or downplays it",
    "A week-by-week plan to help your child rebuild confidence",
    "What to say — and what not to say — if another family is involved",
    "A simple way to track whether things are actually getting better"
  ];
  if (selfReflectionNote()) {
    items.push("A gentle way to look at any patterns worth adjusting — without blame");
  }
  return items;
}

function preventionSteps() {
  return [
    "Build the habit of easy conversation now, before you'd ever need it. Try one low-stakes nightly question, like \"What was the best and worst part of your day?\" The goal isn't spotting a problem — it's making talking to you feel normal, so if something ever does happen, coming to you is already the default.",
    "Introduce yourself to your child's teacher or school counselor now, before there's anything to report. Something as simple as \"Just wanted to say hello and let you know I'm around if anything ever comes up\" opens a door you might need later, without waiting for a reason to make first contact.",
    "Practice a simple response together for handling unkindness, before they ever need it — a phrase like \"That's not okay, and I'm going to tell someone\" that they can fall back on automatically, the same way you'd practice a fire drill."
  ];
}

function actionSteps() {
  if (isPreventive()) return preventionSteps();
  return [stepOpening(), stepSchool(), stepContext()];
}

function generatePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 20;

  function ensureRoom(needed) {
    if (y + needed > 280) { doc.addPage(); y = 20; }
  }
  function heading(text) {
    ensureRoom(14);
    doc.setFontSize(13); doc.setTextColor(44, 82, 130); doc.text(text, 15, y); y += 7;
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

  doc.setFontSize(18); doc.setTextColor(44, 82, 130); doc.text("Bullyproof.Guide — Your Action Plan", 15, y); y += 12;

  if (state.safetyFlags.length) {
    const priority = ["sexualOrPower", "physicalSigns"];
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

  heading("What's happening:");
  body(deriveSummary());

  if (focusLine()) body(focusLine(), { italic: true });
  if (selfReflectionNote()) body(selfReflectionNote(), { color: [74, 109, 147] });

  heading("Recommended reading:");
  body(topicLabel());
  body(`A good place to start: ${bookRecommendation()}`);

  heading("Why this matters:");
  body(whyThisMattersNote());

  heading("Your next 3 steps:");
  actionSteps().forEach((step, i) => body(`${i + 1}. ${step}`));

  const proNote = professionalSupportNote();
  if (proNote) { heading("Worth considering:"); body(proNote); }

  heading("Find support near you:");
  body("Search the Bullyproof Support network to get matched with a professional near you — just enter your location, no cost to look:");
  ensureRoom(8);
  doc.setFontSize(11); doc.setTextColor(66, 153, 225);
  doc.textWithLink("bullyproof.support/getmatched", 15, y, { url: NETWORK_MATCH_URL });
  y += 12;
  body("If your area doesn't have a strong match yet, Psychology Today's broader directory is a good backup:");
  ensureRoom(8);
  doc.setFontSize(11); doc.setTextColor(66, 153, 225);
  doc.textWithLink("psychologytoday.com/us/therapists", 15, y, { url: FIND_SUPPORT_URL });
  y += 12;

  heading("What comes next:");
  body("What you've read above is real and complete on its own. As things unfold, though, the most useful next moves usually depend on details that shift over time — how your child responds, what changes, what works for them specifically. That's exactly what the Bullyproof Parent Playbook is built for: not a longer list, but ongoing, evolving help. A few examples of what that looks like for a situation like yours:");
  furtherStepsTeaser().forEach((t, i) => body(`${i + 4}. ${t}`));
  body("These deeper, ongoing steps — personalized to your child by name and age, and updated as things change — are what the Bullyproof Parent Playbook is built for. It's not live yet, but you can reserve a free 3-day trial the moment it is:", { color: [74, 109, 147] });
  ensureRoom(8);
  {
    const subject = encodeURIComponent("Reserve my Bullyproof Parent Playbook trial");
    const mailBody = encodeURIComponent("I'd like to reserve my spot for the free 3-day trial of the Bullyproof Parent Playbook when it's ready.");
    doc.setFontSize(11); doc.setTextColor(66, 153, 225);
    doc.textWithLink("→ Click here to reserve your free trial", 15, y, { url: `mailto:${CONFIG.CONTACT_EMAIL || "mark@bullyproof.guide"}?subject=${subject}&body=${mailBody}` });
    y += 12;
  }

  heading("Also worth knowing about — free, live today:");
  body("Bullyproof Support is a free community for parents in situations like yours: other parents' stories, articles and a podcast on exactly this kind of thing, and a professional directory you can search anytime once you have an account. It's still growing, so joining now makes you a Founding Member.");
  ensureRoom(8);
  doc.setFontSize(11); doc.setTextColor(66, 153, 225);
  doc.textWithLink("→ Create your free account at bullyproof.support", 15, y, { url: NETWORK_HOME_URL });
  y += 12;

  ensureRoom(10);
  doc.setFontSize(10); doc.setTextColor(100, 100, 100);
  body("This plan is for general information only. It is not medical, mental health, or legal advice, and it doesn't guarantee any specific result. Please use your own judgment and talk to a licensed professional about your specific situation. If your child is in immediate danger, call 911.", { color: [130, 130, 130] });
  doc.setFontSize(10); doc.setTextColor(100, 100, 100);
  doc.text("If you need more help finding a vetted professional in your area, visit " + (CONFIG.SITE_URL || "bullyproof.guide") + ".", 15, y);

  doc.save("bullyproof-action-plan.pdf");
}

render();
