// ============================================================
// STATE
// ============================================================
const state = { screen: "landing", qIndex: 0, answers: {}, safetyFlags: [], email: null, sessionId: null };
const appEl = document.getElementById("app");
const progressTrack = document.getElementById("progressTrack");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");


// Simple, private visit counts kept in our own Netlify storage (no analytics company, no cookies,
// nothing personal): just "this step happened", plus which question for question steps.
function track(eventName, props) {
  try {
    if (!/^https?:/.test(window.location.protocol) || /localhost|127\.0\.0\.1/.test(window.location.hostname)) return;
    const q = props && (props.question || props.trigger);
    fetch("/.netlify/functions/track", {
      method: "POST", keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ e: eventName, d: q || "" })
    }).catch(() => {});
  } catch (e) { /* counting must never get in a parent's way */ }
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
// Text typed in Spanish is folded (accents removed, "ñ" -> "n") before matching, because many parents
// type on phones without accents. Both the English and Spanish patterns run on EVERY free-text answer,
// whichever language the screen is in.
const foldText = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const SPANISH_SELF_HARM = /\bsuicid\w*|\bautolesion\w*|\bmatar(me|se)\b|\b(me|se)\s+(quiero|quiere|voy\s+a|va\s+a|iba\s+a)\s+matar\b|\bquit(ar|arme|arse)\s*(me|se)?\s+la\s+vida\b|\b(quiero|quiere|quieren|queria|queremos)\s+morir(me|se)?\b|\b(me|se)\s+(quiero|quiere)\s+morir\b|\bno\s+(quiero|quiere)\s+(seguir\s+)?viv(ir|iendo)\b|\bno\s+(quiero|quiere)\s+estar\s+(aqui|vivo|viva)\b|\bhacer(me|se)\s+dano\b|\b(me|se)\s+(quiero|quiere)\s+(hacer\s+dano|lastimar)\b|\blastimar(me|se)\b|\b(acabar|terminar)\s+con\s+(mi|su)\s+vida\b|\bmejor\s+(estar\s+|estaria\s+)?muert[oa]\b|\bdesear\w*\s+(estar\s+)?muert[oa]\b/;
const SPANISH_VIOLENCE = /\bmat(ar|arlo|arla|arlos|arlas|arle|arles|ando)\b|\b(lo|la|los|las|le|les)\s+mato\b|\basesin\w*|\blastimar(lo|la|los|las|le|les)?\b|\bhacer(le|les|lo|la|los|las)\s+dano\b|\bhacer\s+dano\s+a\b/;
function checkTextSafety(rawText) {
  if (!rawText) return;
  const folded = foldText(rawText);
  if (SPANISH_SELF_HARM.test(folded)) { addFlag("selfHarmOrSuicide"); return; }
  if (SPANISH_VIOLENCE.test(folded)) { addFlag("violenceRisk"); return; }
  // Phones type curly apostrophes (doesn’t), so straighten them before matching.
  const text = rawText.toLowerCase().replace(/[\u2018\u2019\u02BC]/g, "'");
  // Covers first AND third person ("I don't want to be here", "he doesn't want to be here anymore"),
  // since parents usually describe what their child said.
  const selfHarmPattern = /\b(suicide|suicidal|self[-\s]?harm\w*)\b|\b(kill|hurt|harm)(s|ing)?\s+(myself|himself|herself|themselves|themself)\b|\b(cuts|cutting)\s+(myself|himself|herself|themselves|themself)\b|\bwant(s|ed)?\s+to\s+die\b|\bend(s|ing)?\s+(my|his|her|their)\s+(own\s+)?life\b|\b(do|does|did)\s*(n'?t|not)\s+want\s+to\s+(live|be\s+(here|alive|around)|exist|wake\s+up)\b|\bno\s+longer\s+wants?\s+to\s+(live|be\s+(here|alive))\b|\bbetter\s+off\s+dead\b|\bwish(es|ed)?\s+(i|he|she|they)\s+(was|were)\s+(dead|never\s+born)\b|\bend\s+it\s+all\b(?!\s+with)/;
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
  if (state.screen !== "question") document.body.classList.remove("safety-mini");
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (state.screen === "landing") return renderLanding();
  if (state.screen === "question") return renderQuestion();
  if (state.screen === "results") return renderResults();
  if (state.screen === "invite") return renderInvite();
  if (state.screen === "plan") return renderPlanView();
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
          <p style="margin:0;font-size:14px;color:var(--navy-deep);"><strong>${L(`Welcome back.`, `Qué gusto verle de nuevo.`)}</strong> ${L(`It looks like you've already taken this check-in. If your situation has changed, go ahead and take it again. For ongoing, personalized support as things keep changing, that's exactly what`, `Parece que ya hizo este chequeo. Si su situación ha cambiado, puede hacerlo de nuevo. Para recibir apoyo continuo y personalizado a medida que las cosas cambian, para eso mismo fueron creados`)} <a href="${NETWORK_HOME_URL}" style="color:var(--navy);font-weight:600;">Bullyproof.Support</a> ${L(`and the upcoming Parent Playbook are built for.`, `y el próximo Bullyproof Parent Playbook.`)}</p>
        </div>`;
    }
  } catch (e) { /* storage unavailable — just skip the notice */ }
  appEl.innerHTML = `
    <div class="card">
      ${banner(LANDING_ICON, { large: true, imageSrc: assetUrl("icon-landing.png"), showLogo: true })}
      <div class="card-body">
      <h1>${L(`You don't have to figure this out alone.`, `No tiene que resolver esto por su cuenta.`)}</h1>
      <p class="body-text">${L(`Twelve quick questions — about 3 minutes — and you'll have a personalized action plan for your exact situation, sent straight to your inbox tonight.`, `Doce preguntas rápidas, unos 3 minutos, y tendrá un plan de acción personalizado para su situación exacta, enviado directamente a su correo esta noche.`)}</p>
      ${returningNotice}
      <p class="privacy-note">${L(`Your answers are only used to build your action plan, and we never sell your information.`, `Sus respuestas solo se usan para crear su plan de acción, y nunca vendemos su información.`)} <a href="${privacyUrl()}" target="_blank" rel="noopener">${L(`Privacy policy`, `Política de privacidad`)}</a></p>
      <div class="checkbox-row">
        <input type="checkbox" id="consentCheck">
        <label for="consentCheck">${L(`I understand this tool gives general information only. It is not medical, mental health, or legal advice, and it doesn't guarantee any specific result. If my child is in immediate danger, I'll call 911 or a crisis line right away instead of relying on this tool. I agree to the`, `Entiendo que esta herramienta ofrece solo información general. No es asesoría médica, de salud mental ni legal, y no garantiza ningún resultado específico. Si mi hijo o hija está en peligro inmediato, llamaré al 911 o a una línea de crisis de inmediato, en lugar de depender de esta herramienta. Acepto los`)} <a href="https://www.bullyproof.support/about/terms" target="_blank">${L(`Terms of Use`, `Términos de Uso (en inglés)`)}</a> ${L(`and`, `y la`)} <a href="https://www.bullyproof.support/about/privacy" target="_blank">${L(`Privacy Policy`, `Política de Privacidad`)}</a>.</label>
      </div>
      <div class="nav-row" style="justify-content:flex-start;">
        <button class="primary" id="startBtn" disabled>${L(`Start the Assessment`, `Comenzar la evaluación`)}</button>
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
  progressLabel.textContent = L(`Question ${state.qIndex + 1} of ${total}`, `Pregunta ${state.qIndex + 1} de ${total}`);
}

function renderQuestion() {
  const q = currentQuestion();
  if (!q) { state.screen = "results"; return render(); }
  renderProgress();
  const miniSafety = state.safetyFlags.length > 0 && !!state.safetyAcknowledged;
  document.body.classList.toggle("safety-mini", miniSafety);
  // Full notice (not yet closed) sits above the card; once closed, the thin line goes inside the card under the banner.
  let safetyHTML = state.safetyFlags.length && !miniSafety ? renderSafetyBanner() : "";
  const crisisLine = miniSafety ? renderSafetyBanner() : "";
  let bodyHTML = "";
  if (q.type === "choice") bodyHTML = renderChoice(q);
  else if (q.type === "multi") bodyHTML = renderMulti(q);
  else if (q.type === "text") bodyHTML = renderText(q);
  appEl.innerHTML = `
    ${safetyHTML}
    <div class="card">
      ${q.icon ? banner(q.icon, { imageSrc: questionIconUrl(q.id) }) : ""}
      ${crisisLine}
      <div class="card-body">
      <div class="card-fixed">
        <h2 class="question">${qTitle(q)}</h2>
        ${qSub(q) ? `<p class="sub">${qSub(q)}</p>` : ""}
      </div>
      <div class="options-scroll">
        ${bodyHTML}
      </div>
      <p id="validationMsg" style="display:none;color:#B23A48;font-size:13.5px;margin:0 0 8px;font-weight:600;">${L(`Please select an answer to continue.`, `Por favor, elija una respuesta para continuar.`)}</p>
      <div class="nav-row">
        <button class="ghost" id="backBtn" ${state.qIndex === 0 ? "disabled style='visibility:hidden'" : ""}>${L(`Back`, `Atrás`)}</button>
        <button class="primary" id="nextBtn">${L(`Next`, `Siguiente`)}</button>
      </div>
      </div>
    </div>
  `;
  wireQuestionEvents(q);
  wireSafetyBanner();
  track("question_answered_view", { question: q.id });
}

// The bedtime essay's key phrase, picked out in bold (both languages).
function dreamtimeEmphasis(para) {
  return para.replace('Think of it as "Dreamtime Programming":', '<strong>Think of it as "Dreamtime Programming":</strong>')
             .replace('Piense en ello como "programación de ensueño":', '<strong>Piense en ello como "programación de ensueño":</strong>');
}
// Splits off a paragraph's last sentence, so it can be set apart as the takeaway line.
function splitClosingSentence(para) {
  const m = String(para).match(/^([\s\S]*[.!?])\s+([^.!?]+[.!?])$/);
  return m ? [m[1], m[2]] : [para, ""];
}

// Short, tappable versions of each crisis resource for the thin line shown after the notice is closed.
function crisisLineItems(variant) {
  const short = {
    "988 Suicide & Crisis Lifeline": L(`<a href="tel:988">Call or text 988</a>`, `<a href="tel:988">Llame o envíe AYUDA al 988</a>`),
    "Crisis Text Line": L(`<a href="sms:741741">Text HOME to 741741</a>`, `<a href="sms:741741">Envíe AYUDA al 741741</a>`),
    "Childhelp National Child Abuse Hotline": L(`Childhelp <a href="tel:18004224453">1-800-422-4453</a>`, `Childhelp <a href="tel:18004224453">1-800-422-4453</a>`)
  };
  return variant.resources.map(r => short[r.name] || `${resName(r)}: ${resDetail(r)}`);
}

function renderSafetyBanner() {
  const priority = ["selfHarmOrSuicide", "violenceRisk", "sexualOrPower", "physicalSigns"];
  const key = priority.find(k => state.safetyFlags.includes(k));
  const variant = SAFETY_VARIANTS[key];

  if (state.safetyAcknowledged) {
    // After the parent has read and closed the full notice: one thin line, tucked directly under the
    // (shrunken) banner, with tap-to-call / tap-to-text links — so the answers keep most of the screen.
    return `<div class="crisis-line" role="note"><strong>${L(`Help now:`, `Ayuda ahora:`)}</strong> ${crisisLineItems(variant).join(`<span class="sep"> · </span>`)}</div>`;
  }

  return `
    <div class="safety-banner">
      <h3>${L(`Please know help is available right now`, `Sepa que hay ayuda disponible ahora mismo`)}</h3>
      <p>${L(`Based on what you've shared, we want to make sure you have these resources close by. You can keep going with the assessment whenever you're ready.`, `Con base en lo que nos compartió, queremos asegurarnos de que tenga estos recursos a la mano. Puede continuar con la evaluación cuando lo desee.`)}</p>
      <ul>${variant.resources.map(r => `<li><strong>${resName(r)}</strong> — ${resDetail(r)}</li>`).join("")}</ul>
      <button type="button" id="safetyAckBtn" class="safety-ack-btn">${L(`I've seen these — continue`, `Ya los vi — continuar`)}</button>
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
// What the parent SEES comes from the Spanish layer when Spanish is chosen; what is STORED is always the
// exact English option text (the plan logic matches on it).
function qText(q) { return (getLang() === "es" && QUESTIONS_ES[q.id]) ? QUESTIONS_ES[q.id] : q; }
function qTitle(q) { const s = qText(q); return (isPreventive() && s.preventTitle) || s.title; }
function qSub(q) { const s = qText(q); return (isPreventive() && s.preventSub) || s.sub; }
function optLabel(opt) { return (getLang() === "es" && OPTIONS_ES[opt]) ? OPTIONS_ES[opt] : opt; }
function resName(r) { return (getLang() === "es" && RESOURCE_NAME_ES[r.name]) || r.name; }
function resDetail(r) { return (getLang() === "es" && RESOURCE_DETAIL_ES[r.detail]) || r.detail; }
function qOptions(q) {
  if (!isPreventive()) return q.options;
  const base = q.preventReplace ? q.options.map(o => q.preventReplace[o] || o) : q.options;
  return q.preventExtra ? [...base, ...q.preventExtra] : base;
}

function renderChoice(q) {
  const selected = state.answers[q.id];
  return `<div class="options" role="radiogroup">${qOptions(q).map(opt => `<button type="button" class="option-btn ${selected === opt ? "selected" : ""}" data-value="${escapeAttr(opt)}" role="radio" aria-checked="${selected === opt}"><span class="check">${CHECKMARK_SVG}</span><span>${optLabel(opt)}</span></button>`).join("")}</div>`;
}

function renderMulti(q) {
  const selected = state.answers[q.id] || [];
  return `<div class="options" role="group">${qOptions(q).map(opt => `<button type="button" class="option-btn multi-opt ${selected.includes(opt) ? "selected" : ""}" data-value="${escapeAttr(opt)}" role="checkbox" aria-checked="${selected.includes(opt)}"><span class="check">${CHECKMARK_SVG}</span><span>${optLabel(opt)}</span></button>`).join("")}</div>`;
}

function renderText(q) {
  const val = state.answers[q.id] || "";
  return `<textarea id="textInput" rows="5" placeholder="${L(`Type here...`, `Escriba aquí...`)}">${val}</textarea>`;
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

function renderResults() {
  progressTrack.style.display = "none";
  if (!state.completionTracked) { state.completionTracked = true; track("assessment_completed"); }
  if (!state.completionRecorded) {
    state.completionRecorded = true;
    try {
      const prior = JSON.parse(localStorage.getItem("bp_completions") || "[]");
      prior.push(Date.now());
      localStorage.setItem("bp_completions", JSON.stringify(prior.slice(-10)));
    } catch (e) { /* storage unavailable — not critical, just skip the nudge later */ }
  }
  const summary = deriveSummary();
  const q2Answer = state.answers.q2 ? optLabel(state.answers.q2) : L("your situation", "su situación");
  const reflection = [communicationReflection(), openingValidation()].filter(Boolean).join(" ");
  appEl.innerHTML = `
    ${state.safetyFlags.length ? renderSafetyBanner() : ""}
    <div class="card">
      ${banner(RESULTS_ICON, { imageSrc: assetUrl("icon-results.png") })}
      <div class="card-body">
      <div class="results-summary">
        <h3>${L(`Here's what we're seeing`, `Esto es lo que vemos`)}</h3>
        <p class="summary-label">${L(`You told us:`, `Usted nos dijo:`)}</p>
        <p class="summary-quote">"${q2Answer}"</p>
        ${reflection ? `<p class="summary-reflection">${reflection}</p>` : ""}
      </div>
      <h2 class="question">${L(`Where should we send your action plan?`, `¿A dónde enviamos su plan de acción?`)}</h2>
      <p class="sub">${L(`One email with a private link to your personalized plan, easy to read on your phone — plus a printable copy to keep.`, `Un correo con un enlace privado a su plan personalizado, fácil de leer en su teléfono, más una copia para imprimir y guardar.`)}</p>
      <input type="email" id="finalEmail" placeholder="${L(`you@email.com`, `usted@correo.com`)}" value="${state.email || ""}">
      <div style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;" aria-hidden="true"><label>${L(`Leave this empty`, `Deje esto vacío`)}<input type="text" id="hpWebsite" tabindex="-1" autocomplete="off"></label></div>
      <div id="turnstileBox" style="margin-top:12px;"></div>
      <div class="nav-row">
        <button class="ghost" id="backToQ">${L(`Back`, `Atrás`)}</button>
        <button class="primary" id="getPlanBtn">${L(`Get My Action Plan`, `Recibir mi plan de acción`)}</button>
      </div>
      <p id="planStatus" role="status" aria-live="polite" style="display:none;margin:12px 0 0;font-size:14.5px;line-height:1.5;"></p>
      <div class="results-summary" id="includedPreview" style="margin-top:18px;">
        <p style="margin:0;font-size:14.5px;">${L(`Included in your complimentary Action Plan:`, `Incluido en su Plan de Acción de cortesía:`)}</p>
        <ul style="margin:6px 0 0;padding-left:20px;font-size:14px;">
          <li>${L(`Top 3 next steps for your specific situation`, `Los 3 mejores próximos pasos para su situación`)}</li>
          <li>${L(`Targeted, recommended reading`, `Lecturas recomendadas, a su medida`)}</li>
          <li>${L(`Links to free helpful tools`, `Enlaces a herramientas útiles y gratuitas`)}</li>
          <li>${L(`Connections to appropriate local professionals`, `Conexiones con profesionales locales adecuados`)}</li>
          <li>${L(`...and more!`, `...¡y más!`)}</li>
        </ul>
      </div>
      <p class="privacy-note">${L(`Your answers are only used to build your action plan, and we never sell your information. After your plan, we'll send a few short emails with more help for your situation — unsubscribe any time. Every email includes a "Delete my data" link.`, `Sus respuestas solo se usan para crear su plan de acción, y nunca vendemos su información. Después de su plan, le enviaremos algunos correos breves con más ayuda para su situación; puede cancelar la suscripción en cualquier momento. Cada correo incluye un enlace de "Eliminar mis datos".`)} <a href="${privacyUrl()}" target="_blank" rel="noopener">${L(`Privacy policy`, `Política de privacidad`)}</a></p>
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { emailInput.style.borderColor = "#C53030"; setPlanStatus(L("Please enter a valid email address.", "Por favor, escriba un correo electrónico válido."), "error"); return; }
    if (CONFIG.TURNSTILE_SITE_KEY && !state.turnstileToken) { setPlanStatus(L("Please complete the quick check above so we know you're a person.", "Por favor, complete la verificación rápida de arriba para saber que es una persona."), "error"); return; }
    emailInput.style.borderColor = "";
    state.email = email;
    state.honeypot = document.getElementById("hpWebsite").value;
    btn.disabled = true; btn.textContent = "Sending…";
    setPlanStatus(L("Sending your plan…", "Enviando su plan…"), "info");
    const sent = await sendPlanByEmail();
    let pdfOk = true;
    try { await generatePDF(); track("pdf_downloaded"); } catch (err) { pdfOk = false; console.warn("PDF creation failed:", err); }
    btn.disabled = false; btn.textContent = sent.ok ? L("Send it again", "Enviarlo de nuevo") : L("Try again", "Intentar de nuevo");
    setPlanStatus(planStatusMessage(sent, pdfOk, email), sent.ok ? "success" : "error");
    if (sent.ok && sent.planUrl) showPlanLink(sent.planUrl);
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
function PLAYBOOK_INVITE_LABEL() { return L("Yes, please send me the invitation to try the Bullyproof Parent Playbook, plus occasional updates. I can unsubscribe any time.", "Sí, por favor envíenme la invitación para probar el Bullyproof Parent Playbook, además de novedades ocasionales. Puedo cancelar la suscripción en cualquier momento."); }
function playbookInviteUrl() {
  return `${window.location.origin}/?invite=1${getLang() === "es" ? "&lang=es" : ""}`;
}

function playbookInviteHtml(askEmail) {
  return `
    <div style="background:#F5F6FB;border:1px solid #E1E4EA;border-radius:12px;padding:18px;margin:18px 0 0;">
      <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;">
        <img src="${playbookBoxImageUrl()}" alt="The Bullyproof Parent Playbook" style="width:96px;border-radius:6px;flex-shrink:0;">
        <div style="flex:1;min-width:200px;">
          <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:var(--navy-deep);">The Bullyproof Parent Playbook</p>
          <p style="margin:0 0 8px;font-size:14.5px;font-weight:600;color:var(--navy-deep);">${L(`Personalized guidance that grows with your child.`, `Orientación personalizada que crece con su hijo o hija.`)}</p>
          <p style="margin:0 0 8px;font-size:14.5px;color:var(--text);">${PLAYBOOK_BLURB()}</p>
          <p style="margin:0;font-size:14px;color:var(--text);">${L(`When it launches, you can try it FREE for one week.`, `Cuando salga, podrá probarlo GRATIS durante una semana.`)}</p>
        </div>
      </div>
      ${askEmail ? `<input type="email" id="inviteEmail" placeholder="${L(`you@email.com`, `usted@correo.com`)}" style="margin-top:14px;">` : ""}
      <div class="checkbox-row" style="margin-top:14px;">
        <input type="checkbox" id="marketingConsent">
        <label for="marketingConsent">${PLAYBOOK_INVITE_LABEL()}</label>
      </div>
      <div class="nav-row" style="justify-content:flex-start;margin-top:10px;">
        <button class="primary" id="saveInviteBtn" disabled>${L(`Reserve my copy`, `Reservar mi copia`)}</button>
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
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { input.style.borderColor = "#C53030"; status.style.display = "block"; status.style.color = "#C53030"; status.textContent = L("Please enter a valid email address.", "Por favor, escriba un correo electrónico válido."); return; }
      input.style.borderColor = "";
    }
    btn.disabled = true; btn.textContent = "Saving…";
    const ok = await submitPlaybookInvite(email);
    status.style.display = "block";
    status.style.color = ok ? "#276749" : "#C53030";
    status.textContent = ok
      ? L(`Your copy is reserved. We'll send your invitation to ${email} when the Playbook launches.`, `Su copia está reservada. Le enviaremos la invitación a ${email} cuando salga el Playbook.`)
      : L("We couldn't save that just now. Please try again in a minute.", "No pudimos guardarlo en este momento. Por favor, intente de nuevo en un minuto.");
    btn.textContent = ok ? "Reserved" : L("Reserve my copy", "Reservar mi copia");
    btn.disabled = ok;
    if (ok) { state.marketingConsent = true; box.disabled = true; }
  });
}

async function submitPlaybookInvite(email) {
  // Saved by our own Netlify function (no Formspree, no monthly limit).
  try {
    const res = await fetch("/.netlify/functions/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, consent: true, lang: getLang(), website: "" })
    });
    if (res.ok) track("playbook_invite_optin");
    return res.ok;
  } catch (err) { console.warn("Playbook reservation failed:", err); return false; }
}

function renderInvite() {
  progressTrack.style.display = "none";
  appEl.innerHTML = `
    <div class="card">
      ${banner(RESULTS_ICON, { imageSrc: assetUrl("icon-results.png") })}
      <div class="card-body">
        <h2 class="question">${L(`Reserve your copy of the Playbook`, `Reserve su copia del Playbook`)}</h2>
        <p class="sub">${L(`Enter the email where you received your action plan.`, `Escriba el correo donde recibió su plan de acción.`)}</p>
        ${playbookInviteHtml(true)}
        <p class="privacy-note">${L(`We never sell your information. Every email includes a way to unsubscribe.`, `Nunca vendemos su información. Cada correo incluye una forma de cancelar la suscripción.`)} <a href="${privacyUrl()}" target="_blank" rel="noopener">${L(`Privacy policy`, `Política de privacidad`)}</a></p>
      </div>
    </div>`;
  wirePlaybookInvite(true);
}

// ============================================================
// PRIVATE PLAN PAGE  (/plan/<ID> — the link in the "your plan is ready" email)
// Rebuilds the parent's plan from their saved answers with the SAME code as the email and PDF,
// so all three always match. The ID is long and random; the page is kept out of search engines.
// ============================================================
async function loadSavedPlan() {
  try {
    const res = await fetch(`/.netlify/functions/plan?id=${encodeURIComponent(state.planId)}`, { cache: "no-store" });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    return { ok: true, data };
  } catch (e) { return { ok: false, status: 0 }; }
}

function planPageMessage(title, body) {
  appEl.innerHTML = `
    <div class="card">
      ${banner(RESULTS_ICON, { imageSrc: assetUrl("icon-results.png") })}
      <div class="card-body">
        <h2 class="question">${title}</h2>
        <p class="sub">${body}</p>
        <div class="nav-row" style="justify-content:flex-start;"><a class="primary-link" href="/">${L(`Take the Parent Clarity Check`, `Hacer el Chequeo de Claridad para Padres`)}</a></div>
      </div>
    </div>`;
}

async function renderPlanView() {
  progressTrack.style.display = "none";
  try { let m = document.querySelector('meta[name="robots"]'); if (!m) { m = document.createElement("meta"); m.name = "robots"; document.head.appendChild(m); } m.content = "noindex, nofollow"; } catch (e) { /* header also set by Netlify */ }

  if (!state.planLoaded) {
    appEl.innerHTML = `<div class="card"><div class="card-body"><p class="sub" style="margin:0;">${L(`Opening your plan…`, `Abriendo su plan…`)}</p></div></div>`;
    const r = await loadSavedPlan();
    if (!r.ok) {
      if (r.status === 404 || r.status === 410) {
        planPageMessage(L(`This plan link isn't available`, `Este enlace del plan no está disponible`),
          L(`The link may have expired, or the plan was deleted at your request. You can take the check-in again any time — it takes about 3 minutes.`, `Es posible que el enlace haya vencido o que el plan se haya eliminado a petición suya. Puede hacer el chequeo de nuevo cuando quiera; toma unos 3 minutos.`));
      } else {
        planPageMessage(L(`We couldn't open your plan just now`, `No pudimos abrir su plan en este momento`),
          L(`Please try again in a minute. If it keeps happening, the PDF copy you downloaded has your full plan.`, `Por favor, inténtelo de nuevo en un minuto. Si sigue pasando, la copia en PDF que descargó tiene su plan completo.`));
      }
      return;
    }
    const d = r.data || {};
    state.answers = d.answers || {};
    state.safetyFlags = Array.isArray(d.safetyFlags) ? d.safetyFlags : [];
    state.marketingConsent = d.marketingConsent === true;
    state.planView = true;
    state.planLoaded = true;
    if (!state.langChosenOnPlan) { setLang(d.lang === "es" ? "es" : "en"); applyStaticLanguage(); }
    track("plan_page_viewed");
  }

  appEl.innerHTML = `
    <div class="card plan-toolbar">
      <div class="card-body">
        <p class="plan-kicker">${L(`Your private plan page`, `La página privada de su plan`)}</p>
        <p class="sub" style="margin:4px 0 14px;">${L(`Bookmark this page to come back any time. Want a copy to print or keep?`, `Guarde esta página en favoritos para volver cuando quiera. ¿Quiere una copia para imprimir o guardar?`)}</p>
        <button class="primary" id="planPdfBtn">${L(`Download printable PDF`, `Descargar PDF para imprimir`)}</button>
        <p id="planStatus" role="status" aria-live="polite" style="display:none;margin:12px 0 0;font-size:14.5px;line-height:1.5;"></p>
      </div>
    </div>
    <div class="card plan-sheet">${buildEmailHtml()}</div>`;
  const btn = document.getElementById("planPdfBtn");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try { await generatePDF(); track("pdf_downloaded"); setPlanStatus(L(`Your PDF is downloading.`, `Su PDF se está descargando.`), "success"); }
    catch (e) { setPlanStatus(L(`We couldn't create the PDF just now. Please try again in a moment.`, `No pudimos crear el PDF en este momento. Inténtelo de nuevo en un momento.`), "error"); }
    btn.disabled = false;
  });
}

function isPreventive() {
  return (state.answers.q2 || "").includes("prevent");
}

// ============================================================
// THE BULLYPROOF QUICK HELP GUIDES — offered in the Action Plan as the thing parents can use NOW,
// while the Playbook is being finished (per Mark: a precursor to the Playbook, not a replacement).
// Never shown to safety-flagged parents: their plan stays focused on getting help, with no sales.
// Titles are the guides the assessment can match (see quickHelpGuide()); the guides themselves are
// in English for now.
// ============================================================
const QUICK_HELP_TITLES = {
  "guide-01": "I Think My Child Is Being Bullied",
  "guide-02": "My Child Won't Talk",
  "guide-03": "My Child Finally Admits They're Being Bullied",
  "guide-04": "My Child Says, \u201CPlease Don't Tell the School\u201D",
  "guide-05": "My Child Tells Me Only Part of the Story",
  "guide-10": "My Child Is Being Bullied Online",
  "guide-11": "My Child Is Being Left Out",
  "guide-16": "I Want to Lower the Odds Before Anything Happens",
  "guide-19": "My Child Told the Teacher and Nothing Changed"
};
// The parent's primary issue, named in plain words (keyed by the matched guide).
const QUICK_HELP_ISSUES = {
  "guide-01": ["You sense something is wrong", "Siente que algo anda mal"],
  "guide-02": ["Your child won't talk about it", "Su hijo o hija no quiere hablar de ello"],
  "guide-03": ["Your child has told you they're being bullied", "Su hijo o hija le contó que sufre bullying"],
  "guide-04": ["Your child doesn't want the school told", "Su hijo o hija no quiere que se le avise a la escuela"],
  "guide-05": ["Your child has shared only part of the story", "Su hijo o hija le ha contado solo una parte"],
  "guide-10": ["Bullying online", "Bullying en internet"],
  "guide-11": ["Being left out", "Que lo excluyan"],
  "guide-16": ["Building strength before problems start", "Fortalecer a su hijo o hija antes de que haya problemas"],
  "guide-19": ["The school hasn't fixed it", "La escuela no lo ha resuelto"]
};
function quickHelpOffer() {
  if (state.safetyFlags.length) return null;
  const g = quickHelpGuide();
  const num = parseInt(String(g).replace("guide-", ""), 10);
  const title = QUICK_HELP_TITLES[g];
  const url = (typeof CONFIG !== "undefined" && CONFIG.QUICK_HELP_URL) || "";
  return {
    url,
    kicker: L("Hands-on help, available today", "Ayuda práctica, disponible hoy"),
    title: "The Bullyproof Quick Help Guides",
    lead: L("25 short, practical guides for the moments parents face most, each with the exact words to say. One digital download, organized by issue, so you can go straight to yours tonight.",
            "25 guías cortas y prácticas para los momentos que los padres enfrentan con más frecuencia, cada una con las palabras exactas que puede decir. Una sola descarga digital, organizada por tema, para que vaya directo a la suya esta noche. Por ahora, las guías están en inglés."),
    issueLabel: L("Your primary issue:", "Su tema principal:"),
    issue: QUICK_HELP_ISSUES[g] ? L(QUICK_HELP_ISSUES[g][0], QUICK_HELP_ISSUES[g][1]) : "",
    matchLabel: L("Start with:", "Empiece con:"),
    guideTitle: title ? `${L("Guide", "Guía")} ${num} \u2014 ${title}` : "",
    bullets: [
      L("Instant digital download, yours to keep", "Descarga digital inmediata, para quedársela"),
      L("Organized by issue, so you find yours in seconds", "Organizada por tema, para encontrar el suyo en segundos"),
      L("A 45-second version first, with the exact words to say", "Primero, una versión de 45 segundos con las palabras exactas que puede decir")
    ],
    button: L("Get the Guides \u2014 $37", "Obtener las guías \u2014 $37"),
    soon: L("Opening soon \u2014 we'll email you the link.", "Muy pronto: le enviaremos el enlace por correo."),
    note: L("$37, one time. All 25 guides are included.", "$37, un solo pago. Incluye las 25 guías.")
  };
}

// General, non-private labels SwipeOne can use to personalize emails, in the parent's language.
// Deliberately LEFT OUT: physical signs (q3), behavior changes (q6), what was done to the child (q9),
// and anything the parent typed (q4, q12). Each label comes as a short key (for automation rules)
// and a ready-to-use phrase (for the email text). Unanswered questions come back blank.
function swipeoneProfile() {
  const a = state.answers;
  const pick = (val, table) => { const hit = table.find(([frag]) => (val || "").includes(frag)); return hit ? { key: hit[1], text: hit[2] } : { key: "", text: "" }; };
  const age = pick(a.q1, [
    ["Under 5", "under-5", L("under age 5", "menor de 5 años")],
    ["5–7", "5-7", L("ages 5–7", "de 5 a 7 años")],
    ["8–10", "8-10", L("ages 8–10", "de 8 a 10 años")],
    ["11–14", "11-14", L("ages 11–14", "de 11 a 14 años")],
    ["15–18", "15-18", L("ages 15–18", "de 15 a 18 años")]
  ]);
  const ageGroup = { "under-5": "young-child", "5-7": "young-child", "8-10": "kid", "11-14": "tween", "15-18": "teen" }[age.key] || "";
  const situation = pick(a.q2, [
    ["not sure yet", "unsure", L("you have a feeling something's off", "tiene la sensación de que algo no anda bien")],
    ["concerning at school", "school", L("you've noticed something concerning at school", "ha notado algo preocupante en la escuela")],
    ["online or on social media", "online", L("something happened online", "pasó algo en internet")],
    ["treated badly", "told-me", L("your child told you they're being treated badly", "su hijo o hija le contó que está recibiendo mal trato")],
    ["prevent", "prevention", L("you're focused on prevention", "está enfocándose en la prevención")]
  ]);
  const duration = pick(a.q5, [
    ["Just noticed", "under-a-week", L("less than a week", "menos de una semana")],
    ["A few weeks", "few-weeks", L("a few weeks", "unas semanas")],
    ["A month or two", "1-2-months", L("a month or two", "uno o dos meses")],
    ["Several months", "several-months", L("several months or longer", "varios meses o más")],
    ["Not sure", "not-sure", L("not sure yet", "todavía no se sabe")]
  ]);
  const told = pick(a.q8, [
    ["told me clearly", "told-clearly", L("your child has told you clearly what's going on", "su hijo o hija le ha contado claramente lo que pasa")],
    ["only hints", "hints", L("your child has shared hints, but not the whole story", "su hijo o hija le ha dado pistas, pero no toda la historia")],
    ["behavior tells me", "behavior-only", L("your child hasn't said anything, but their behavior has changed", "su hijo o hija no ha dicho nada, pero su comportamiento ha cambiado")],
    ["don't have any behavioral", "no-signs", L("nothing concrete yet", "todavía nada concreto")]
  ]);
  const school = pick(a.q10, [
    ["took it seriously", "helping", L("the school is helping", "la escuela está ayudando")],
    ["nothing has changed", "no-change", L("you've talked to the school, but nothing has changed yet", "habló con la escuela, pero todavía nada ha cambiado")],
    ["isn't bullying", "dismissed", L("the school said it isn't bullying", "la escuela dijo que no es bullying")],
    ["doesn't want me to contact", "child-doesnt-want", L("your child doesn't want the school told", "su hijo o hija no quiere que se le avise a la escuela")],
    ["haven't reached out", "not-yet", L("you haven't contacted the school yet", "todavía no se ha comunicado con la escuela")]
  ]);
  const online = pick(a.q11, [
    ["primarily online", "online", L("mostly online", "sobre todo en internet")],
    ["online for sure", "online-maybe-in-person", L("online, and maybe in person too", "en internet, y tal vez también en persona")],
    ["both online and in person", "both", L("both online and in person", "en internet y en persona")],
    ["only happening in person", "in-person", L("in person", "en persona")],
    ["I'm not sure", "not-sure", L("not sure yet", "todavía no se sabe")]
  ]);
  const placeTable = [
    ["At school", "school", L("at school", "en la escuela")],
    ["school bus", "bus", L("on the school bus", "en el autobús escolar")],
    ["after-school", "activities", L("in after-school activities", "en actividades después de clases")],
    ["social media", "social-media", L("on social media", "en las redes sociales")],
    ["text messages", "texts", L("in texts or group chats", "en mensajes de texto o chats de grupo")],
    ["gaming platform", "gaming", L("in online games", "en videojuegos en línea")],
    ["neighborhood", "neighborhood", L("in the neighborhood", "en el vecindario")]
  ];
  const places = placeTable.filter(([frag]) => (a.q7 || []).some(x => x.includes(frag)));
  return {
    child_age: age.key, child_age_text: age.text, age_group: ageGroup,
    situation: situation.key, situation_text: situation.text,
    how_long: duration.key, how_long_text: duration.text,
    child_told: told.key, child_told_text: told.text,
    school_status: school.key, school_status_text: school.text,
    online: online.key, online_text: online.text,
    where: places.map(p => p[1]).join(", "), where_text: places.map(p => p[2]).join(", ")
  };
}

// Which Quick Help Guide fits this parent best (the SwipeOne tag "guide-NN" that picks their follow-up
// emails). Safety-flagged parents get none — they never receive sales follow-ups.
function quickHelpGuide() {
  if (state.safetyFlags.length) return "";
  if (isPreventive()) return "guide-16";
  if (onlineWeight() === "online") return "guide-10";
  if ((state.answers.q9 || []).some(t => t.includes("left out, ignored, or excluded"))) return "guide-11";
  const school = schoolStatus();
  if (school === "no-change" || school === "dismissed") return "guide-19";
  if (school === "child-doesnt-want") return "guide-04";
  const comm = communicationStatus();
  if (comm === "clear") return "guide-03";
  if (comm === "hints") return "guide-05";
  if (comm === "behavior-only") return "guide-01";
  return "guide-02";
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
  if (q2.includes("not sure yet")) return L("You have a feeling something's off, but you're not sure what yet.", "Tiene la sensación de que algo no anda bien, pero todavía no sabe qué.");
  if (q2.includes("concerning at school")) return L("You've noticed something concerning at school.", "Ha notado algo preocupante en la escuela.");
  if (q2.includes("Something happened online")) return L("Something happened online or on social media.", "Pasó algo en internet o en las redes sociales.");
  if (q2.includes("treated badly")) return L("Your child told you they're being treated badly by other kids.", "Su hijo o hija le contó que está recibiendo mal trato de parte de otros niños.");
  return q2 ? q2.replace(/\.$/, "") + "." : L("You're working through a bullying situation.", "Está atravesando una situación de bullying.");
}

function deriveSummary() {
  if (isPreventive()) return L("You're focused on prevention — and that's the best time to build the habits that keep kids strong, confident and connected.", "Está enfocándose en la prevención, y ese es el mejor momento para crear los hábitos que mantienen a los niños fuertes, seguros y conectados.");
  const status = communicationStatus();
  const statusText = {
    "clear": L("Your child has spoken with you directly about it.", "Su hijo o hija ha hablado directamente con usted sobre esto."),
    "hints": L("Your child has shared pieces of it, but not the full picture yet.", "Su hijo o hija le ha contado algunas partes, pero todavía no toda la historia."),
    "behavior-only": L("Your child hasn't said anything directly, but their behavior is telling you something.", "Su hijo o hija no ha dicho nada directamente, pero su comportamiento le está diciendo algo."),
    "no-signals": L("Nothing concrete yet — you're going on instinct.", "Todavía nada concreto: usted se está guiando por su instinto.")
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
    "clear": L("Your child has spoken with you directly about it.", "Su hijo o hija ha hablado directamente con usted sobre esto."),
    "hints": L("Your child has shared pieces of it, but not the full picture yet.", "Su hijo o hija le ha contado algunas partes, pero todavía no toda la historia."),
    "behavior-only": L("Your child hasn't said anything directly, but their behavior is telling you something.", "Su hijo o hija no ha dicho nada directamente, pero su comportamiento le está diciendo algo."),
    "no-signals": L("Nothing concrete yet — you're going on instinct.", "Todavía nada concreto: usted se está guiando por su instinto.")
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
        <p style="margin:0 0 8px;font-weight:700;color:#B23A48;font-size:16px;">${L(`Please reach out to one of these resources first:`, `Por favor, comuníquese primero con uno de estos recursos:`)}</p>
        <ul style="margin:0;padding-left:20px;color:#7A2E31;font-size:14px;">
          ${variant.resources.map(r => `<li><strong>${resName(r)}</strong> — ${resDetail(r)}</li>`).join("")}
        </ul>
      </div>
    `);
  }

  if (state.answers.q4) {
    sections.push(`${sectionHeader(L("You told us", "Usted nos dijo"))}<p style="color:${text};font-size:15.5px;font-style:italic;margin:0;">"${escapeHtml(state.answers.q4)}"</p>`);
  }
  if (openingValidation()) {
    sections.push(`<p style="color:${muted};font-size:14.5px;margin:10px 0 0;">${openingValidation()}</p>`);
  }
  sections.push(`${sectionHeader(isPreventive() ? L("Where you're starting", "Su punto de partida") : L("What's happening", "Qué está pasando"))}<p style="color:${text};font-size:15px;margin:0;">${deriveSummary()}</p>`);
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
      <p style="color:${muted};font-size:14px;margin:0 0 10px;"><strong style="color:${navy};">${L(`Why it helps:`, `Por qué ayuda:`)}</strong> ${w.why}</p>
      <p style="color:${muted};font-size:13.5px;margin:0;">${w.teaser}</p>`);
  }
  if (multiChildNote()) {
    sections.push(`<p style="color:${text};background:#F9FAFC;border:1px solid #E1E4EA;border-radius:8px;padding:12px 14px;font-size:14.5px;margin:14px 0 0;">${multiChildNote()}</p>`);
  }
  if (selfReflectionNote()) {
    sections.push(`<p style="color:${muted};font-size:14.5px;margin:10px 0 0;">${selfReflectionNote()}</p>`);
  }
  sections.push(`${sectionHeader(L("What actually helps", "Lo que de verdad ayuda"))}<p style="color:${text};font-size:15px;margin:0;">${whyThisMattersNote()}</p>`);
  sections.push(`
    ${sectionHeader(L("Your next 3 steps", "Sus próximos 3 pasos"))}
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
      ${sectionHeader(L("What to watch for", "Qué debe observar"))}
      <p style="color:${text};font-size:15px;margin:0 0 10px;">${watchFor.intro}</p>
      <ul style="color:${text};font-size:14.5px;padding-left:20px;margin:0 0 10px;">
        ${watchFor.items.map(i => `<li style="margin-bottom:8px;">${i}</li>`).join("")}
      </ul>
      <p style="color:${muted};font-size:14px;margin:0;">${watchFor.outro}</p>
    `);
  }
  const proNote = professionalSupportNote();
  if (proNote) {
    sections.push(`${sectionHeader(L("Worth considering", "Vale la pena considerar"))}<p style="color:${text};font-size:15px;margin:0;">${proNote}</p>`);
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
    ${sectionHeader(L("A nightly opportunity", "Una oportunidad cada noche"))}
      <table role="presentation" style="width:100%;background:#FFFBF3;border:1px solid #EADFC6;border-top:4px solid ${gold};border-radius:12px;margin:0;overflow:hidden;"><tr><td style="padding:28px 26px 26px;">
        ${sunbeamResource().introCaption.split("\n\n").map((para, i) => {
          if (i === 0) return `<p style="color:${navyDeep};font-family:Georgia,'Times New Roman',serif;font-size:19px;line-height:1.6;margin:0 0 18px;">${para}</p>`;
          if (i === 1) {
            return `<p style="color:${text};font-size:15.5px;line-height:1.75;margin:0 0 18px;">${para}</p>
              <table role="presentation" style="width:100%;margin:0 0 22px;"><tr><td style="border-left:4px solid ${gold};padding:6px 0 6px 18px;"><p style="color:${navyDeep};font-family:Arial,Helvetica,sans-serif;font-style:normal;font-size:20px;font-weight:700;line-height:1.45;letter-spacing:-0.005em;margin:0;">${sunbeamResource().pullQuote}</p></td></tr></table>`;
          }
          if (i === 2) {
            // "Every night…" — set as a featured passage: a small gold label, larger navy text,
            // and the key idea ("dreamtime programming") picked out in bold.
            return `<p style="color:#A87C2A;font-size:11.5px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;margin:6px 0 8px;">${L(`What happens at bedtime`, `Lo que pasa a la hora de dormir`)}</p>
              <p style="color:${navyDeep};font-size:17px;line-height:1.75;margin:0 0 16px;">${dreamtimeEmphasis(para)}</p>`;
          }
          if (i === 3) {
            // "Which means…" — the turn of the argument, then its last line set apart as the takeaway.
            const [body, closer] = splitClosingSentence(para);
            return `<p style="color:${navyDeep};font-size:17px;line-height:1.75;margin:0 0 20px;">${body}</p>
              ${closer ? `<table role="presentation" style="width:100%;margin:0 0 6px;"><tr><td style="text-align:center;padding:4px 10px 0;">
                <table role="presentation" style="margin:0 auto 12px;"><tr><td style="width:44px;border-top:2px solid ${gold};font-size:0;line-height:0;">&nbsp;</td></tr></table>
                <p style="color:${navyDeep};font-size:19px;font-weight:800;line-height:1.4;letter-spacing:-0.005em;margin:0;">${closer}</p>
              </td></tr></table>` : ""}`;
          }
          return `<p style="color:${text};font-size:15.5px;line-height:1.75;margin:0 0 18px;">${para}</p>`;
        }).join("")}
        <table role="presentation" style="width:100%;background:${navyDeep};border-radius:10px;margin:26px 0 0;"><tr><td style="padding:30px 22px 32px;text-align:center;">
          <table role="presentation" style="margin:0 auto 16px;"><tr><td style="width:44px;border-top:2px solid ${gold};font-size:0;line-height:0;">&nbsp;</td></tr></table>
          <p style="color:#DCE3F2;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:16px;line-height:1.55;margin:0 0 14px;">${L(`You'll find these pages waiting in the back of the award-winning children's book`, `Encontrará estas páginas al final del libro infantil galardonado`)}</p>
          <p style="color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:18px;letter-spacing:0.04em;margin:0 0 2px;">The Adventures of the</p>
          <p style="color:#E3B85A;font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:700;letter-spacing:0.03em;line-height:1.15;margin:0;">True Sunbeam</p>
          <table role="presentation" style="margin:16px auto 0;"><tr><td style="width:44px;border-top:2px solid ${gold};font-size:0;line-height:0;">&nbsp;</td></tr></table>
        </td></tr></table>
        <table role="presentation" style="width:100%;background:#ffffff;border:1px solid #EADFC6;border-radius:8px;margin:16px 0 0;"><tr><td style="padding:16px 18px;">
          <p style="color:#A87C2A;font-size:11px;font-weight:800;letter-spacing:0.12em;margin:0 0 6px;text-transform:uppercase;">${L(`How it works`, `Cómo funciona`)}</p>
          <p style="color:${navyDeep};font-size:15px;line-height:1.65;margin:0;">${sunbeamResource().closeupCaption}</p>
        </td></tr></table>
        <p style="color:#A87C2A;font-size:12px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;text-align:center;margin:24px 0 12px;">${L(`Start collecting your child's Shining Moments`, `Comience a juntar los Shining Moments (Momentos Brillantes) de su hijo o hija`)}</p>
        <img src="${sunbeamResource().shiningMomentsSpreadImg}" alt="${L(`Shining Moments pages from the back of the book`, `Páginas de Shining Moments al final del libro`)}" width="100%" style="border-radius:8px;display:block;max-width:100%;">
          <!-- Coloring book (left) · Ray (center) · Story book (right), each with its own caption, link and button -->
          <table role="presentation" style="width:100%;margin:22px 0 0;border-collapse:collapse;">
            <tr>
              <td style="text-align:center;width:33%;vertical-align:bottom;padding:0 4px;">
                <a href="${sunbeamResource().coloringPagesUrl}" style="text-decoration:none;border:0;"><img src="${sunbeamResource().coloringImg}" alt="The Adventures of the True Sunbeam Coloring Book" width="92" border="0" style="border-radius:4px;display:block;margin:0 auto;border:0;"></a>
              </td>
              <td style="text-align:center;width:34%;vertical-align:bottom;padding:0 4px;">
                <img src="${sunbeamResource().rayImg}" alt="${L(`Ray the Sunbeam plush toy`, `Peluche de Ray the Sunbeam`)}" width="80" style="display:block;margin:0 auto;">
              </td>
              <td style="text-align:center;width:33%;vertical-align:bottom;padding:0 4px;">
                <a href="${sunbeamResource().animatedCoverUrl}" style="text-decoration:none;border:0;"><img src="${sunbeamResource().fullColorImg}" alt="The Adventures of the True Sunbeam" width="92" border="0" style="border-radius:4px;display:block;margin:0 auto;border:0;"></a>
              </td>
            </tr>
            <tr>
              <td style="text-align:center;vertical-align:top;padding:8px 4px 0;line-height:1.35;">
                <span style="color:${muted};font-size:11.5px;">${L(`Coloring book`, `Libro para colorear`)}</span><br>
                <a href="${sunbeamResource().coloringPagesUrl}" style="color:${navy};font-size:11px;text-decoration:underline;">${sunbeamResource().coloringHint}</a>
              </td>
              <td style="text-align:center;vertical-align:top;padding:8px 4px 0;line-height:1.35;">
                <span style="color:${muted};font-size:11.5px;">${L(`Meet Ray, the Sunbeam plush toy`, `Conozca a Ray, el peluche Sunbeam`)}</span>
              </td>
              <td style="text-align:center;vertical-align:top;padding:8px 4px 0;line-height:1.35;">
                <span style="color:${muted};font-size:11.5px;">${L(`Full-color story book`, `Libro de cuentos a todo color`)}</span><br>
                <a href="${sunbeamResource().animatedCoverUrl}" style="color:${navy};font-size:11px;text-decoration:underline;">${sunbeamResource().fullColorHint}</a>
              </td>
            </tr>
            <tr>
              <td style="text-align:center;vertical-align:top;padding:10px 4px 0;"><a href="${sunbeamResource().coloringUrl}" style="display:inline-block;background:${navyDeep};color:#ffffff;font-size:12.5px;font-weight:700;padding:8px 14px;border-radius:6px;text-decoration:none;white-space:nowrap;">${L(`Buy now`, `Comprar ahora`)}</a></td>
              <td style="text-align:center;vertical-align:top;padding:10px 4px 0;"><a href="${sunbeamResource().rayPreorderUrl}" style="display:inline-block;background:${navyDeep};color:#ffffff;font-size:12.5px;font-weight:700;padding:8px 14px;border-radius:6px;text-decoration:none;white-space:nowrap;">${sunbeamResource().rayPreorderLabel}</a><br><span style="color:${muted};font-size:11px;line-height:2;">${sunbeamResource().rayPreorderNote}</span></td>
              <td style="text-align:center;vertical-align:top;padding:10px 4px 0;"><a href="${sunbeamResource().fullColorUrl}" style="display:inline-block;background:${navyDeep};color:#ffffff;font-size:12.5px;font-weight:700;padding:8px 14px;border-radius:6px;text-decoration:none;white-space:nowrap;">${L(`Buy now`, `Comprar ahora`)}</a></td>
            </tr>
          </table>
        <table role="presentation" style="width:100%;margin-top:18px;"><tr>
          <td style="text-align:center;line-height:1.8;white-space:nowrap;">
            <img src="${sunbeamResource().bibaBadgeImg}" alt="${L(`Best Indie Book Award Winner`, `Ganador del Best Indie Book Award`)}" width="170" style="display:block;margin:0 auto 8px;max-width:100%;">
            <a href="${sunbeamResource().bothBooksUrl}" style="color:${navy};font-size:13px;font-weight:700;">${L(`Buy both books →`, `Comprar los dos libros →`)}</a><br>
            <a href="${sunbeamResource().setUrl}" style="color:${navy};font-size:12px;">${L(`Book + Ray plush set (coming soon) →`, `Paquete de libro + peluche de Ray (próximamente) →`)}</a>
          </td>
        </tr></table>
        <div style="margin-top:20px;">
          <p style="color:${navyDeep};font-size:15px;line-height:1.7;margin:0 0 4px;">${sunbeamResource().text.replace(/"(What happened today[^"]*)"/, `<span style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:700;color:#8A6420;">&ldquo;$1&rdquo;</span>`)}</p>
        </div>
        <img src="${sunbeamResource().heroImg}" alt="${L(`A child writing in the Shining Moments pages with Ray`, `Un niño o niña escribiendo en las páginas de Shining Moments junto a Ray`)}" width="100%" style="display:block;max-width:100%;border-radius:8px;margin:18px 0 0;">
      </td></tr></table>
    `);
  }
  sections.push(`
    ${sectionHeader(L("Recommended reading", "Lecturas recomendadas"))}
    <table role="presentation" style="width:100%;background:#F9FAFC;border:1px solid #E1E4EA;border-radius:12px;"><tr><td style="padding:20px 22px;">
    <p style="color:${text};font-size:14.5px;margin:0 0 16px;">${topicLabel()}</p>
    ${recommendedBooks().map((b, i) => `
      <table role="presentation" style="width:100%;background:#ffffff;border:1px solid #E1E4EA;border-radius:10px;margin:0 0 ${i === recommendedBooks().length - 1 ? "0" : "12px"};"><tr>
        ${b.coverUrl ? `<td style="padding:16px 0 16px 16px;vertical-align:top;"><img src="${b.coverUrl}" alt="${b.title} by ${b.author}" width="70" style="border-radius:4px;display:block;"></td>` : ""}
        <td style="vertical-align:top;padding:16px;">
          <p style="color:${text};font-size:14.5px;margin:0 0 4px;">${b.display}</p>
          <p style="color:${muted};font-size:13px;margin:0 0 6px;">${b.chapter ? L(`Look for ${b.chapter}.`, `Busque ${b.chapter}.`) : L("Relevant throughout — worth reading in full.", "Es relevante de principio a fin; vale la pena leerlo completo.")}</p>
          <a href="${b.url}" style="display:inline-block;background:${navyDeep};color:#ffffff;font-size:13px;font-weight:700;padding:8px 14px;border-radius:6px;text-decoration:none;">${L(`Buy now on Amazon`, `Comprar ahora en Amazon`)}</a>
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
  const reserveBox = (align) => `<a href="${playbookInviteUrl()}" style="display:inline-block;text-decoration:none;color:${navyDeep};font-size:13.5px;font-weight:700;line-height:1.3;white-space:nowrap;text-align:${align};"><span style="display:inline-block;width:14px;height:14px;border:2px solid ${navyDeep};border-radius:3px;background:#ffffff;vertical-align:-3px;margin-right:7px;"></span>${L(`Reserve my copy`, `Reservar mi copia`)}</a>`;
  const qh = quickHelpOffer();
  if (qh) sections.push(`
    <table role="presentation" style="width:100%;background:${navyDeep};border-top:4px solid ${gold};border-radius:12px;margin:28px 0 8px;"><tr><td style="padding:24px 22px 22px;">
      <p style="color:${gold};font-size:11.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;margin:0 0 8px;">${qh.kicker}</p>
      <p style="color:#ffffff;font-size:20px;font-weight:800;line-height:1.3;margin:0 0 10px;">${qh.title}</p>
      <p style="color:#D5DAE6;font-size:14.5px;line-height:1.55;margin:0 0 16px;">${qh.lead}</p>
      ${qh.guideTitle ? `<table role="presentation" style="width:100%;background:#1C2A4A;border:1px solid #8A6D2E;border-radius:10px;"><tr><td style="padding:14px 16px;">
        ${qh.issue ? `<p style="color:${gold};font-size:12.5px;font-weight:700;margin:0 0 3px;">${qh.issueLabel}</p>
        <p style="color:#ffffff;font-size:16px;font-weight:700;line-height:1.4;margin:0 0 10px;">${qh.issue}</p>` : ""}
        <p style="color:${gold};font-size:12.5px;font-weight:700;margin:0 0 4px;">${qh.matchLabel}</p>
        <p style="color:#ffffff;font-size:16px;font-weight:700;line-height:1.4;margin:0;">${escapeHtml(qh.guideTitle)}</p>
      </td></tr></table>` : ""}
      <ul style="color:#D5DAE6;font-size:14px;line-height:1.5;padding-left:20px;margin:16px 0 18px;">
        ${qh.bullets.map(b => `<li style="margin-bottom:5px;">${b}</li>`).join("")}
      </ul>
      ${qh.url
        ? `<a href="${escapeAttr(qh.url)}" style="display:inline-block;background:${gold};color:${navyDeep};font-size:15.5px;font-weight:800;padding:13px 22px;border-radius:8px;text-decoration:none;">${qh.button}</a>`
        : `<p style="color:${gold};font-size:15px;font-weight:700;margin:0;">${qh.soon}</p>`}
      <p style="color:#AEB6C8;font-size:12.5px;line-height:1.5;margin:12px 0 0;">${qh.note}</p>
    </td></tr></table>
  `);
  sections.push(`
    ${sectionHeader(L("What comes next", "Lo que sigue"))}
    <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
      <td style="vertical-align:top;padding:0 14px 0 0;">
        <p style="color:${text};font-size:15px;margin:0 0 12px;">${WHAT_COMES_NEXT_INTRO()}</p>
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
        <p style="color:${muted};font-size:13.5px;margin:0 0 10px;font-weight:600;">${L(`Personalized guidance that grows with your child.`, `Orientación personalizada que crece con su hijo o hija.`)}</p>
        <p style="color:${muted};font-size:13.5px;margin:0 0 10px;">${PLAYBOOK_BLURB()}</p>
        <p style="color:${muted};font-size:13px;margin:0 0 10px;">${PLAYBOOK_SOON()}</p>
        <a href="${NETWORK_HOME_URL}" style="color:${navy};font-size:14.5px;font-weight:700;">${L(`Join Bullyproof.Support FREE today →`, `Únase GRATIS hoy a Bullyproof.Support →`)}</a>
        <p style="color:${muted};font-size:12.5px;margin:12px 0 4px;font-weight:700;">${L(`What membership includes, starting today:`, `Lo que incluye la membresía, desde hoy:`)}</p>
        <ul style="color:${muted};font-size:12.5px;padding-left:18px;margin:0;">
          ${MEMBERSHIP_BENEFITS().map((b, i) => `<li style="margin-bottom:${i === MEMBERSHIP_BENEFITS().length - 1 ? 0 : 4}px;">${b}</li>`).join("")}
        </ul>
      </td>
    </tr></table>
    <p style="color:${muted};font-size:13.5px;margin:0 0 14px;">${L(`Your membership does not start your free trial today. When the Playbook launches, you'll receive an invitation to try it FREE for one week.`, `Su membresía no inicia hoy su prueba gratuita. Cuando el Playbook salga a la venta, recibirá una invitación para probarlo GRATIS durante una semana.`)}</p>
    ${state.marketingConsent ? "" : `<p style="margin:0;">${reserveBox("left")}</p>`}
  `);

  sections.push(`
    ${sectionHeader(L("Prefer to talk to a licensed professional?", "¿Prefiere hablar con un profesional con licencia?"))}
    <p style="color:${text};font-size:15px;margin:0;">
      ${L(`That's always an option too.`, `Esa también es siempre una opción.`)} <a href="${NETWORK_MATCH_URL}" style="color:${navy};">${L(`Search the Bullyproof Support network`, `Busque en la red de Bullyproof Support`)}</a> ${L(`to get matched with a professional near you — just enter your location, no cost to look.`, `para encontrar a un profesional cerca de usted: solo escriba su ubicación; buscar no cuesta nada.`)}<br>
      ${L(`If your area doesn't have a strong match yet,`, `Si en su zona todavía no hay una buena coincidencia,`)} <a href="${FIND_SUPPORT_URL}" style="color:${navy};">${L(`Psychology Today's broader directory`, `el directorio más amplio de Psychology Today`)}</a> ${L(`is a good backup.`, `es una buena alternativa.`)}
    </p>
  `);
  sections.push(`
    <p style="color:#8896B8;font-size:12px;margin-top:28px;border-top:1px solid #E1E4EA;padding-top:14px;">
    ${L(`This plan is for general information only. It is not medical, mental health, or legal advice, and it doesn't guarantee any specific result. Please use your own judgment and talk to a licensed professional about your specific situation. If your child is in immediate danger, call 911.`, `Este plan es solo para información general. No es asesoría médica, de salud mental ni legal, y no garantiza ningún resultado específico. Use su propio criterio y hable con un profesional con licencia sobre su situación específica. Si su hijo o hija está en peligro inmediato, llame al 911.`)}
    </p>
  `);

  const footContact = (typeof CONFIG !== "undefined" && CONFIG.CONTACT_EMAIL) || "";
  const footAddress = (typeof CONFIG !== "undefined" && CONFIG.MAILING_ADDRESS) || "";
  const footIntro = state.planView
    ? L("This is your private plan page from Bullyproof.Guide. Anyone with the link can open it, so share it only with people you trust.",
        "Esta es la página privada de su plan de Bullyproof.Guide. Cualquier persona con el enlace puede abrirla, así que compártala solo con personas de confianza.")
    : L("You're receiving this email because this address was entered at Bullyproof.Guide to get an action plan.",
        "Usted recibe este correo porque esta dirección se ingresó en Bullyproof.Guide para obtener un plan de acción.");
  const footConsent = state.marketingConsent
    ? L(`You also asked to hear about the Bullyproof Parent Playbook and occasional updates. To stop them, just reply with the word "unsubscribe".`,
        `También pidió recibir información sobre el Bullyproof Parent Playbook y novedades ocasionales. Para dejar de recibirlas, simplemente responda con la palabra "cancelar".`)
    : "";
  const footDelete = footContact
    ? `${L("Want your answers deleted?", "¿Quiere que se eliminen sus respuestas?")} <a href="mailto:${escapeAttr(footContact)}?subject=${L("Delete%20my%20data", "Eliminar%20mis%20datos")}" style="color:#8896B8;">${L("Delete my data", "Eliminar mis datos")}</a>.`
    : "";
  sections.push(`
    <p style="color:#8896B8;font-size:12px;line-height:1.6;margin:10px 0 0;">
      ${footIntro}
      ${footConsent}
      ${footDelete}
      <a href="${escapeAttr(privacyUrl())}" style="color:#8896B8;">${L("Privacy policy", "Política de privacidad")}</a>.
      ${footAddress ? `<br>${escapeHtml(footAddress)}` : ""}
    </p>
  `);

  return `
    <div${getLang() === "es" ? ' lang="es"' : ""} style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;">
      <table role="presentation" style="width:100%;background-color:${navyDeep};border-bottom:3px solid ${gold};"><tr><td style="padding:36px 30px 32px;text-align:center;">
        <img src="${assetUrl("icon-landing.png")}" width="58" alt="" style="display:block;margin:0 auto 16px;">
        <p style="color:${gold};font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;margin:0 0 8px;">Bullyproof.Guide</p>
        <p style="color:#ffffff;font-size:25px;font-weight:800;letter-spacing:-0.01em;margin:0;">${L(`Your Personalized Action Plan`, `Su Plan de Acción Personalizado`)}</p>
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
  if (sent.ok && sent.queued) {
    return pdfOk
      ? L(`Your PDF just downloaded, so you have your full plan right now. Your email to ${email} is in line and will arrive automatically, usually within the hour.`, `Su PDF acaba de descargarse, así que ya tiene su plan completo. Su correo a ${email} está en fila y llegará automáticamente, normalmente en menos de una hora.`)
      : L(`Your email to ${email} is in line and will arrive automatically, usually within the hour.`, `Su correo a ${email} está en fila y llegará automáticamente, normalmente en menos de una hora.`);
  }
  if (sent.ok) {
    return pdfOk
      ? L(`Your plan is on its way to ${email}. It usually arrives within a few minutes — if you don't see it, check your spam or promotions folder. The email has a private link to your plan, easy to read on your phone. The PDF that just downloaded is your printable copy.`, `Su plan va en camino a ${email}. Normalmente llega en unos minutos; si no lo ve, revise su carpeta de spam o de promociones. El correo tiene un enlace privado a su plan, fácil de leer en su teléfono. El PDF que se acaba de descargar es su copia para imprimir.`)
      : L(`Your plan is on its way to ${email}. We couldn't create the PDF copy this time; tap the button to try again.`, `Su plan va en camino a ${email}. Esta vez no pudimos crear la copia en PDF; toque el botón para intentarlo de nuevo.`);
  }
  if (sent.status === 429) return L("We're getting a lot of requests right now. Please wait a few minutes and tap the button to try again.", "Estamos recibiendo muchas solicitudes en este momento. Espere unos minutos y toque el botón para intentarlo de nuevo.") + (pdfOk ? L(" Your PDF copy did download, so you still have your plan.", " Su copia en PDF sí se descargó, así que todavía tiene su plan.") : "");
  return L("We couldn't send the email just now.", "No pudimos enviar el correo en este momento.") + (pdfOk ? L(" Your PDF copy did download, so you still have your plan. You can tap the button to try the email again in a minute.", " Su copia en PDF sí se descargó, así que todavía tiene su plan. Puede tocar el botón para volver a intentar el correo en un minuto.") : L(" Please tap the button to try again in a minute.", " Por favor, toque el botón para intentarlo de nuevo en un minuto."));
}

// A link to the parent's private plan page, shown right under the status message once it's saved.
// Built with DOM methods (never innerHTML), and only for a link on our own site.
function showPlanLink(url) {
  try {
    const u = new URL(url);
    if (u.origin !== window.location.origin || !/^\/plan\/[A-Za-z0-9_-]{24}$/.test(u.pathname)) return;
    const status = document.getElementById("planStatus"); if (!status) return;
    let p = document.getElementById("planLinkRow");
    if (!p) { p = document.createElement("p"); p.id = "planLinkRow"; p.style.cssText = "margin:10px 0 0;font-size:14.5px;"; status.insertAdjacentElement("afterend", p); }
    p.textContent = "";
    const a = document.createElement("a");
    a.href = u.href; a.target = "_blank"; a.rel = "noopener";
    a.style.cssText = "color:var(--navy);font-weight:700;";
    a.textContent = L("Open your plan page now →", "Abrir la página de su plan ahora →");
    p.appendChild(a);
  } catch (e) { /* the email has the link too */ }
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
        safetyAcknowledged: !!state.safetyAcknowledged,
        consentGiven: !!state.consentGiven,
        marketingConsent: !!state.marketingConsent,
        lang: getLang(),
        website: state.honeypot || "",
        turnstileToken: state.turnstileToken || ""
      })
    });
    if (res.ok) {
      let body = {};
      try { body = await res.json(); } catch (e) { /* plain success */ }
      track("plan_email_sent");
      return { ok: true, queued: res.status === 202 && body.queued === true, planUrl: typeof body.planUrl === "string" ? body.planUrl : "", status: res.status };
    }
    console.warn("Email delivery failed with status", res.status);
    return { ok: false, status: res.status };
  } catch (err) {
    console.warn("Email delivery failed (network):", err);
    return { ok: false, status: 0 };
  }
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
  if (q2.includes("not sure yet")) return L("It's OK to feel worried even without proof. Many parents notice small changes before anything big happens.", "Está bien sentir preocupación aunque no tenga pruebas. Muchos padres notan pequeños cambios antes de que ocurra algo grave.");
  if (q2.includes("prevent")) return L("Focusing on prevention is one of the smartest, most caring things a parent can do.", "Enfocarse en la prevención es una de las cosas más inteligentes y cariñosas que puede hacer un padre o una madre.");
  if (q2.includes("treated badly")) return L("It takes courage for a child to say they're being treated badly. It takes just as much courage for a parent to believe them right away.", "Se necesita valor para que un hijo o una hija diga que está recibiendo mal trato. Se necesita el mismo valor para que un padre o una madre le crea de inmediato.");
  if (q2.includes("Something happened online")) return L("Things online can get bad fast. It's good that you're acting now instead of waiting.", "Las cosas en internet pueden empeorar rápido. Qué bueno que usted esté actuando ahora en lugar de esperar.");
  if (q2.includes("concerning at school")) return L("Trusting what you see at school, even before your child says anything, is the right thing to do.", "Confiar en lo que usted observa en la escuela, aun antes de que su hijo o hija diga algo, es lo correcto.");
  return "";
}

// A parent who writes "both kids" (or "my two", "twins", etc.) is telling us
// more than one child is involved, but this check-in follows one child at a
// time. Acknowledge that out loud instead of silently treating it as one.
function mentionsMultipleChildren() {
  const t = `${state.answers.q4 || ""} ${state.answers.q12 || ""}`.toLowerCase();
  if (/\bmis\s+(dos|tres|2|3)\s+(hij[oa]s|ninos|ninas|chicos|chicas)\b|\bmis\s+(hij[oa]s|ninos|ninas)\b|\b(gemel[oa]s|hermanos|hermanas)\b|\b(ambos|ambas)\b(?!\s+padres)|\b(los|las)\s+(dos|tres)\b/.test(foldText(t))) return true;
  return /\b(both|two|three|all)\s+(of\s+)?(my\s+|our\s+)?(kids|children|boys|girls|sons|daughters)\b|\bboth\s+of\s+(them|my)\b|\bmy\s+(two|three|2|3)\s+(kids|children|boys|girls)\b|\b(twins|siblings)\b|\bmy\s+(kids|children)\b/.test(t);
}
function multiChildNote() {
  if (!mentionsMultipleChildren()) return null;
  return L("You mentioned more than one child. Each child's situation can look a little different, so this plan is written for one child at a time. Start with the child you're most worried about, then come back and take this check-in again for the other, so their plan fits them, too. When it's more than one, it also helps to talk with each child alone first, so neither one has to speak for the other.", "Usted mencionó a más de un hijo. La situación de cada hijo puede ser un poco distinta, por eso este plan está escrito para un hijo a la vez. Empiece con el hijo que más le preocupa y luego vuelva a hacer este chequeo para el otro, para que su plan también sea a su medida. Cuando son varios, también ayuda hablar primero con cada uno a solas, para que ninguno tenga que hablar por el otro.");
}

// When a parent asks for something to say, the plan should hand them
// actual words — not echo the request and move on to generic advice.
function askedForWords() {
  const t = `${state.answers.q12 || ""} ${state.answers.q4 || ""}`.toLowerCase();
  // Explicit asks for words only. A bare "tell" or "sound" is not enough
  // ("how do I tell if my child is being bullied" is not a request for a script).
  const tf = foldText(t);
  if ([
    /\bque\s+(le\s+|les\s+)?(digo|decir|debo\s+decir|puedo\s+decir|podria\s+decir|deberia\s+decir)\b/,
    /\balgo\b[^.?!]{0,25}\b(decir|decirle|decirles)\b/,
    /\blas\s+(palabras|frases)\s+(correctas|adecuadas|indicadas|exactas)\b/,
    /\bque\s+decirle\b/,
    /\bcomo\s+(le\s+|les\s+)?(hablo|hablarle|hablarles|digo)\b|\bcomo\s+hablar(le|les)?\s+(con|a)\b/,
    /\b(animar|alentar|animarl[oa]s?|alentarl[oa]s?)\b/,
    /\bsonar\s+como\s+si\b/
  ].some(re => re.test(tf))) return true;
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
    ? (young ? L("If anyone is ever mean to you, or something feels yucky, tell me. I will always listen, and you will never be in trouble.", "Si alguien se porta mal contigo, o algo te hace sentir feo, dímelo. Siempre te voy a escuchar, y nunca te vas a meter en problemas por contármelo.")
      : teen ? L("You can tell me anything, anytime — even the stuff that's embarrassing. I won't freak out. I'm on your side.", "Puedes contarme lo que sea, cuando sea, incluso lo que te dé pena. No me voy a alterar. Estoy de tu lado.")
      : L("If anything ever happens that feels wrong, big or small, come tell me. You will never be in trouble for telling me, and I'll always be on your side.", "Si alguna vez pasa algo que te parece mal, grande o pequeño, ven y cuéntamelo. Nunca te vas a meter en problemas por contármelo, y siempre voy a estar de tu lado."))
    : (young ? L("I love you. You did nothing wrong. I'm going to help.", "Te quiero. No hiciste nada malo. Yo te voy a ayudar.")
      : teen ? L("I'm on your side. Whatever is going on, it's not your fault, and you don't have to handle it alone. You don't have to tell me everything right now. I'm here when you're ready.", "Estoy de tu lado. Sea lo que sea que esté pasando, no es tu culpa, y no tienes que enfrentarlo sin ayuda. No tienes que contarme todo ahora mismo. Aquí estoy cuando quieras hablar.")
      : L("I'm on your side, always. Whatever happened is not your fault, and you are not in trouble. We'll figure it out together.", "Estoy de tu lado, siempre. Lo que haya pasado no es tu culpa, y no estás en problemas. Lo vamos a resolver juntos."));
  const reframe = prevent
    ? L("If someone is ever mean to you, that says something about them. It doesn't say anything about you.", "Si alguien es cruel contigo, eso dice algo sobre esa persona. No dice nada sobre ti.")
    : (young ? L("When someone is mean, that's a choice they made. It's not about you.", "Cuando alguien es malo con otros, es una decisión que tomó. No tiene que ver contigo.")
      : L("What someone does to you tells you about them. It doesn't tell you who you are.", "Lo que alguien te hace dice cómo es esa persona. No dice quién eres tú."));
  const why = prevent
    ? L("Kids often stay quiet because they're afraid of getting in trouble or upsetting their parent. Saying this ahead of time answers both worries before they ever have to ask.", "Los niños suelen quedarse callados por miedo a meterse en problemas o a molestar a sus padres. Decir esto con anticipación responde a las dos preocupaciones antes de que tengan que preguntar.")
    : L("Kids who are hurting often wonder two things first: \"Am I in trouble?\" and \"Is my parent upset with me?\" Words like these answer both, which can make it easier for them to relax and start talking.", "Los niños que sufren suelen preguntarse primero dos cosas: \"¿Estoy en problemas?\" y \"¿Mi papá o mi mamá está enojado conmigo?\" Palabras como estas responden a ambas, y eso les puede ayudar a tranquilizarse y empezar a hablar.");
  return {
    title: L("Words that can help", "Palabras que pueden ayudar"),
    lead: L("You asked what to say. There's no perfect script, and you know your child best. Many parents find it helps to start simply, with something like this:", "Usted preguntó qué decir. No hay un guion perfecto, y nadie conoce a su hijo o hija mejor que usted. A muchos padres les ayuda empezar de forma sencilla, con algo como esto:"),
    quote,
    reframeLead: L("Later, if it feels right, you might add:", "Más adelante, si le parece bien, podría agregar:"),
    reframe,
    why,
    teaser: L("The Bullyproof Parent Playbook will offer words like these, matched to your child's age, personality, and what happened, so you'll have support whenever you're not sure what to say.", "El Bullyproof Parent Playbook le ofrecerá palabras como estas, adaptadas a la edad y la personalidad de su hijo o hija y a lo que pasó, para que tenga apoyo siempre que no esté seguro de qué decir.")
  };
}

function focusLine() {
  const q12 = (state.answers.q12 || "").trim();
  if (!q12) return null;
  if (state.safetyFlags.length) {
    return L(`You told us: "${q12}" — please reach out to the resources above first. Everything below is still here when you're ready.`, `Usted nos dijo: "${q12}". Por favor, comuníquese primero con los recursos de arriba. Todo lo de abajo seguirá aquí cuando pueda leerlo.`);
  }
  if (wordsAnswer()) return null;
  return L(`You told us what you most want help with: "${q12}" — that's what we kept in mind as we built this plan.`, `Usted nos dijo con qué quiere más ayuda: "${q12}". Eso tuvimos presente al crear este plan.`);
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
  const signalsEs = ["algo que hice", "algo que yo hice", "lo que hice mal", "hice algo mal", "mi culpa", "tengo la culpa", "soy el culpable", "soy la culpable", "yo cause", "lo cause", "causado esto", "soy la razon", "soy el motivo", "estoy haciendo mal", "contribuido a esto", "como puedo cambiar", "algo que estoy haciendo"];
  const textFolded = foldText(text);
  if (!signals.some(s => text.includes(s)) && !signalsEs.some(s => textFolded.includes(s))) return null;
  return L("You also asked whether you might have played a role in this. Wondering that is a sign of self-awareness, not evidence you did something wrong — most of the time there's no single cause to find. The most useful thing to do with that instinct right now isn't searching for a mistake, it's showing your child, through how you respond today, that this is safe to keep bringing to you. Looking at specific patterns worth adjusting — without blame — is exactly the kind of ongoing, personalized work the Bullyproof Parent Playbook is built for.", "También preguntó si usted pudo haber tenido algún papel en esto. Hacerse esa pregunta es señal de autoconciencia, no prueba de que hizo algo mal; la mayoría de las veces no hay una sola causa que encontrar. Lo más útil que puede hacer con ese instinto ahora no es buscar un error, sino mostrarle a su hijo o hija, con la manera en que responde hoy, que es seguro seguir acudiendo a usted con esto. Revisar patrones específicos que valga la pena ajustar, sin culpas, es justo el tipo de trabajo continuo y personalizado para el que fue creado el Bullyproof Parent Playbook.");
}

function stepOpening() {
  const status = communicationStatus();
  if (status === "clear") {
    return L("Write it down today. You told us your child has told you clearly what's going on, so capture it while it's fresh: use your child's own words, and add the date. Keep this note — you can show it to a counselor or the school later. StopBullying.gov, the U.S. government's bullying resource, recommends keeping exactly this kind of record: the date, what happened, and who was involved.", "Anótelo hoy. Usted nos dijo que su hijo o hija le contó claramente lo que pasa, así que regístrelo mientras está fresco: use sus propias palabras y agregue la fecha. Guarde esta nota: podrá mostrarla más adelante a un consejero o a la escuela. StopBullying.gov, el recurso del gobierno de EE. UU. sobre el bullying, recomienda llevar justo este tipo de registro: la fecha, lo que pasó y quiénes estuvieron involucrados.");
  }
  if (status === "hints") {
    return L(`Keep the door open. You told us your child has shared only hints or pieces so far. Try saying: "You told me something was bothering you. I've been thinking about it. I'm here if you want to say more." Don't push for the whole story yet — let them go at their own pace. That patience matters: the U.S. Department of Education's most recent survey (2022) found more than half of bullied kids never told an adult at school, so a child who has hinted is already trusting you more than most.`, `Mantenga la puerta abierta. Usted nos dijo que su hijo o hija solo le ha dado pistas o partes de la historia. Pruebe decir: "Me dijiste que algo te molestaba. He estado pensando en eso. Aquí estoy si quieres contarme más." No insista todavía en saber toda la historia; deje que su hijo o hija avance a su propio ritmo. Esa paciencia importa: la encuesta más reciente del Departamento de Educación de EE. UU. (2022) encontró que más de la mitad de los niños que sufren bullying nunca se lo contaron a un adulto en la escuela, así que un niño que ya insinuó algo confía en usted más que la mayoría.`);
  }
  if (status === "behavior-only") {
    const named = (state.answers.q6 || []).filter(b => b !== "No noticeable changes");
    // Q6's option text is written in checkbox/clinical language for a
    // parent to select ("withdrawing", "reluctant", "irritable") — but a
    // parent would never actually say these words out loud to their own
    // child. Rewritten here in the plain, warm language a parent would
    // really use, not just swapped to second person.
    const secondPerson = {
      "Withdrawing from family activities they used to enjoy": L("you haven't wanted to join in on things with us that you used to love doing", "no has querido participar en las cosas que hacíamos juntos y que antes te encantaban"),
      "More irritable, tearful, or anxious than usual": L("you've seemed more upset, or more worried, than usual", "has estado con más enojo o preocupación que de costumbre"),
      "Reluctant to go to school or ride the bus": L("you haven't wanted to go to school or get on the bus", "no has querido ir a la escuela ni subirte al autobús"),
      "Avoiding certain places, people, or activities they used to like": L("you've been staying away from some places or people you used to like being around", "te has estado alejando de algunos lugares o personas que antes disfrutabas")
    };
    const behavior = named.length ? (secondPerson[named[0]] || named[0].toLowerCase()) : L("a little different lately", "has estado un poco diferente últimamente");
    const age1 = state.answers.q1 || "";
    // "Want to build something with me?" reads like a suggestion for a young
    // child, not a 16-year-old — a drive together is the teen equivalent of
    // the same side-by-side, hands-or-eyes-busy idea.
    const sideBySide = (age1 === "11–14" || age1 === "15–18")
      ? L(`"Want to grab a burger?" or "Show me that game you've been playing." Pick the thing they love that you rarely get time to join in on.`, `"¿Vamos por una hamburguesa?" o "Enséñame ese juego que has estado jugando." Elija lo que a su hijo o hija le encanta y en lo que usted casi nunca tiene tiempo de acompañarle.`)
      : L(`"I've got some time right now. Want to ___ together?" Fill in the blank with their favorite thing, the one you rarely get time for: a board game, building with Legos, shooting hoops, baking cookies.`, `"Tengo un rato libre. ¿Quieres que ___ juntos?" Llene el espacio con su actividad favorita, esa para la que casi nunca hay tiempo: un juego de mesa, armar con Legos, tirar canastas, hornear galletas.`);
    return L(`Say what you see, without asking why. You told us your child hasn't said anything, but their behavior tells you something's wrong. Try: "I've noticed ${behavior}. You don't have to explain it right now — I just want you to know I see it, and I'm here." Or, if a side-by-side moment feels more natural for your child, try: ${sideBySide} Sometimes it's easier for kids to open up when their hands or feet are busy, not sitting face to face. Watching closely matters, because behavior is often the only clue you'll get: the U.S. Department of Education's most recent survey (2022) found more than half of bullied kids never told an adult at school.`, `Diga lo que ve, sin preguntar por qué. Usted nos dijo que su hijo o hija no ha dicho nada, pero su comportamiento le dice que algo anda mal. Pruebe: "He notado que ${behavior}. No tienes que explicármelo ahora; solo quiero que sepas que lo veo y que aquí estoy." O, si un momento lado a lado le resulta más natural a su hijo o hija, pruebe: ${sideBySide} A veces es más fácil para los niños abrirse cuando tienen las manos o los pies ocupados, y no sentados cara a cara. Observar de cerca importa, porque el comportamiento suele ser la única pista que tendrá: la encuesta más reciente del Departamento de Educación de EE. UU. (2022) encontró que más de la mitad de los niños que sufren bullying nunca se lo contaron a un adulto en la escuela.`);
  }
  if (status === "no-signals") {
    return L("Start with easy time together. You told us nothing has been said and you haven't seen clear signs yet, so don't ask directly right away — that can make kids close up more. Instead, spend easy time together: a car ride, a walk, cooking side by side. Kids often talk more when they aren't looking right at you. Harvard's Center on the Developing Child found that the most common thing kids who bounce back share is at least one steady adult they trust — and ordinary time like this is how that trust gets built.", "Comience con tiempo tranquilo juntos. Usted nos dijo que todavía no se ha dicho nada y que no ha visto señales claras, así que no pregunte directamente de inmediato: eso puede hacer que los niños se cierren más. En cambio, pasen tiempo sin presión: un paseo en carro, una caminata, cocinar uno al lado del otro. Los niños suelen hablar más cuando no tienen a alguien mirándolos directamente. El Center on the Developing Child de la Universidad de Harvard encontró que lo más común entre los niños que logran sobreponerse es contar con al menos un adulto estable en quien confían; y el tiempo cotidiano como este es lo que construye esa confianza.");
  }
  return L("Check in, side by side. Find an easy, low-pressure time to check in with your child this week. Talking side by side, not face to face, often works better than a direct sit-down. Harvard's Center on the Developing Child found that the most common thing kids who bounce back share is at least one steady adult they trust — these small check-ins are how you stay that adult.", "Converse, lado a lado. Busque un momento tranquilo y sin presión esta semana para ver cómo está su hijo o hija. Hablar lado a lado, y no cara a cara, muchas veces funciona mejor que sentarse a conversar directamente. El Center on the Developing Child de la Universidad de Harvard encontró que lo más común entre los niños que logran sobreponerse es contar con al menos un adulto estable en quien confían; estas pequeñas conversaciones son la manera de seguir siendo ese adulto.");
}

function stepSchool() {
  const map = {
    "helping": L("Keep the school in the loop. You told us the school took this seriously and is helping, which is great news. Check in with your school contact again this week. Ask what they're seeing, and if there's a follow-up plan. It's worth the effort: a 2019 review of 100 school anti-bullying programs (Gaffney, Ttofi & Farrington) found that when schools take real action, bullying drops by about 20%.", "Mantenga informada a la escuela. Usted nos dijo que la escuela lo tomó en serio y está ayudando, lo cual es una gran noticia. Comuníquese de nuevo esta semana con su contacto en la escuela. Pregunte qué están observando y si hay un plan de seguimiento. Vale la pena el esfuerzo: una revisión de 2019 de 100 programas escolares contra el bullying (Gaffney, Ttofi y Farrington) encontró que, cuando las escuelas toman medidas reales, el bullying baja cerca de un 20%."),
    "no-change": L(`Ask for a real plan. You told us you've already talked to the school, but nothing has changed yet. So ask for a new meeting, and leave with a clear plan and a real date — not just "we'll keep an eye on it." Research is on your side: a 2019 review of 100 school anti-bullying programs (Gaffney, Ttofi & Farrington) found that when schools take real action, bullying drops by about 20%.`, `Pida un plan de verdad. Usted nos dijo que ya habló con la escuela, pero todavía nada ha cambiado. Así que pida una nueva reunión y salga con un plan claro y una fecha real, no solo un "vamos a estar pendientes". La investigación está de su lado: una revisión de 2019 de 100 programas escolares contra el bullying (Gaffney, Ttofi y Farrington) encontró que, cuando las escuelas toman medidas reales, el bullying baja cerca de un 20%.`),
    "dismissed": L("You can still push back. You told us the school said this isn't bullying, or told you to handle it at home. Ask to meet with a counselor or the principal, not just the first person you talked to. Bring your written notes. It's worth pressing for: a 2019 review of 100 school anti-bullying programs (Gaffney, Ttofi & Farrington) found that when schools take real action, bullying drops by about 20%.", "Todavía puede insistir. Usted nos dijo que la escuela dijo que esto no es bullying, o que lo resolvieran en casa. Pida reunirse con un consejero o con la dirección de la escuela, no solo con la primera persona con la que habló. Lleve sus notas escritas. Vale la pena insistir: una revisión de 2019 de 100 programas escolares contra el bullying (Gaffney, Ttofi y Farrington) encontró que, cuando las escuelas toman medidas reales, el bullying baja cerca de un 20%."),
    "not-reached-out": L(`Loop in the school counselor. You told us you haven't reached out to the school yet because you're not sure how to start. Here's an easy way: contact the counselor this week. A short email works well: "I'd like 15 minutes to talk about some changes I'm seeing in my child. Nothing urgent, just want to loop you in." It's worth that small step: a 2019 review of 100 school anti-bullying programs (Gaffney, Ttofi & Farrington) found that when schools take real action, bullying drops by about 20% — and a short note from you can be how that action starts.`, `Incluya al consejero escolar. Usted nos dijo que todavía no se ha comunicado con la escuela porque no sabe cómo empezar. Esta es una manera fácil: comuníquese con el consejero esta semana. Un correo corto funciona bien: "Me gustaría tener 15 minutos para hablar de unos cambios que estoy viendo en mi hijo o hija. Nada urgente, solo quiero ponerle al tanto." Vale la pena ese pequeño paso: una revisión de 2019 de 100 programas escolares contra el bullying (Gaffney, Ttofi y Farrington) encontró que, cuando las escuelas toman medidas reales, el bullying baja cerca de un 20%, y una nota breve suya puede ser el comienzo de esa acción.`),
    "child-doesnt-want": L("Ask what they're afraid of. You told us your child doesn't want you to contact the school. Before deciding anything, ask your child what they're afraid will happen if you talk to the school. Their answer will help you decide how — or whether — to bring the school in without it feeling like a betrayal.", "Pregunte a qué le tiene miedo. Usted nos dijo que su hijo o hija no quiere que se comunique con la escuela. Antes de decidir nada, pregúntele qué teme que pase si usted habla con la escuela. Su respuesta le ayudará a decidir cómo, o si, involucrar a la escuela sin que se sienta como una traición.")
  };
  return map[schoolStatus()] || L("Get another set of eyes on it. Reach out to a counselor or trusted adult at school this week. Adults at school often see things you can't — especially in the busy, crowded parts of the day.", "Consiga otro par de ojos. Comuníquese esta semana con un consejero o un adulto de confianza en la escuela. Los adultos de la escuela a menudo ven cosas que usted no puede, sobre todo en los momentos del día con más gente y movimiento.");
}

function stepContext() {
  const weight = onlineWeight();
  if (weight === "online" || weight === "both") {
    const so = communicationStatus() === "clear"
      ? L("StopBullying.gov also", "StopBullying.gov también")
      : L("StopBullying.gov, the U.S. government's bullying resource,", "StopBullying.gov, el recurso del gobierno de EE. UU. sobre el bullying,");
    return L(`Save the evidence first. You told us this is happening online. Take screenshots and note the dates before anything gets deleted. Then sit down with your child and look at the app's report and block settings together — as a team, not as spying. That's exactly the order ${so} recommends: keep the evidence, then report and block.`, `Primero guarde las pruebas. Usted nos dijo que esto está pasando en internet. Tome capturas de pantalla y anote las fechas antes de que algo se borre. Luego siéntese con su hijo o hija y revisen juntos las opciones de denuncia y bloqueo de la aplicación: como equipo, no como espionaje. Ese es justo el orden que ${so} recomienda: guardar las pruebas, y luego denunciar y bloquear.`);
  }
  const saidInPerson = (state.answers.q11 || "").startsWith("No — this is only happening in person");
  if (weight === "in-person" || saidInPerson) {
    const age = state.answers.q1 || "";
    const teen = age === "11–14" || age === "15–18";
    // "Recess" means nothing to a parent of a teenager — the real equivalent
    // at that age is the hallway between classes, not a playground period.
    const spots = teen ? L("passing periods between classes, lunch, the bus", "los cambios de clase, el almuerzo, el autobús") : L("recess, lunch, the bus", "el recreo, el almuerzo, el autobús");
    return L(`Find the hot spots. You told us this is happening in person. Ask your child if certain times or places feel worse — ${spots}. This helps the school watch the right spots instead of everywhere. The most recent federal data (2019–20) show bullying at school happens most in classrooms, then hallways and the cafeteria — busy places where adults can't see everything at once.`, `Encuentre los puntos críticos. Usted nos dijo que esto está pasando en persona. Pregúntele a su hijo o hija si hay momentos o lugares que se sienten peor: ${spots}. Eso ayuda a que la escuela vigile los lugares correctos en lugar de todos. Los datos federales más recientes (2019–20) muestran que el bullying en la escuela ocurre sobre todo en los salones de clase, y luego en los pasillos y la cafetería: lugares concurridos donde los adultos no pueden ver todo a la vez.`);
  }
  if (wordsAnswer()) {
    return L(`Say it, then listen. You asked what to say to help, so start with the words in "Words that can help" above, said calmly at a quiet moment like a car ride or bedtime. Then stop talking and just listen. Whatever your child shares, answer with "Thank you for telling me" before anything else. Feeling heard is what lets those words sink in and begin to ease the hurt.`, `Dígalo y luego escuche. Usted preguntó qué decir para ayudar, así que empiece con las palabras de "Palabras que pueden ayudar", más arriba, dichas con calma en un momento tranquilo, como un paseo en carro o la hora de dormir. Luego deje de hablar y solo escuche. Cuente lo que cuente su hijo o hija, responda primero: "Gracias por contármelo". Sentirse escuchado es lo que permite que esas palabras calen y empiecen a aliviar el dolor.`);
  }
  const saidNotSure = (state.answers.q7 || []).some(x => x.startsWith("I'm not sure")) || (state.answers.q11 || "").startsWith("I'm not sure");
  return saidNotSure
    ? L("Keep a short daily note. You told us you're not sure yet where this is happening, so a one-line note each day helps you find out. Write down your child's mood and anything small they say. Patterns often show up after a week or two.", "Lleve una breve nota diaria. Usted nos dijo que todavía no sabe dónde está pasando esto, así que una nota de una línea cada día le ayudará a averiguarlo. Anote el estado de ánimo de su hijo o hija y cualquier cosa pequeña que diga. Los patrones suelen aparecer después de una o dos semanas.")
    : L("Keep a short daily note. It isn't clear yet where or when this is happening, so a one-line note each day helps you find out. Write down your child's mood and anything small they say. Patterns often show up after a week or two.", "Lleve una breve nota diaria. Todavía no está claro dónde o cuándo está pasando esto, así que una nota de una línea cada día le ayudará a averiguarlo. Anote el estado de ánimo de su hijo o hija y cualquier cosa pequeña que diga. Los patrones suelen aparecer después de una o dos semanas.");
}

function professionalSupportNote() {
  if (!needsProfessionalSupport()) return null;
  return L("Based on what you shared, it may help to bring in a school counselor or child therapist now, not just as a backup plan. A trained professional can help things move faster.", "Con base en lo que compartió, puede ayudar involucrar ahora a un consejero escolar o a un terapeuta infantil, y no solo como plan de respaldo. Un profesional capacitado puede ayudar a que las cosas avancen más rápido.");
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
    power: L("This falls into what's often called a power-imbalance situation — someone using power over a child in a way that isn't okay.", "Esto entra en lo que suele llamarse una situación de desequilibrio de poder: alguien que usa su poder sobre un niño de una manera que no está bien."),
    physical: L("This falls into what's often called physical bullying — situations where writing things down and working with the school make the biggest difference.", "Esto entra en lo que suele llamarse bullying físico: situaciones en las que anotar lo ocurrido y trabajar con la escuela hacen la mayor diferencia."),
    exclusion: L("This falls into what's often called social exclusion — being deliberately left out or frozen out by other kids.", "Esto entra en lo que suele llamarse exclusión social: que otros niños excluyan o ignoren a un niño a propósito."),
    namecalling: L("This falls into what's often called verbal bullying — name-calling and teasing that shouldn't be brushed off.", "Esto entra en lo que suele llamarse bullying verbal: apodos y burlas que no deben tomarse a la ligera."),
    online: L("This falls into what's often called cyberbullying — situations where screenshots, reporting, and a calm conversation matter most.", "Esto entra en lo que suele llamarse ciberacoso: situaciones en las que importan más las capturas de pantalla, las denuncias y una conversación tranquila."),
    prevent: L("This is about building strength early, before problems start — one of the most effective things a parent can do.", "Se trata de fortalecer a su hijo o hija desde temprano, antes de que empiecen los problemas: una de las cosas más eficaces que puede hacer un padre o una madre."),
    default: L("This is about getting your bearings — figuring out what to watch for and how to open the conversation.", "Se trata de orientarse: saber qué observar y cómo abrir la conversación.")
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
  return AMAZON_ASSOCIATE_TAG ? L("As an Amazon Associate, we may earn from qualifying purchases.", "Como afiliados de Amazon, podemos ganar comisiones por compras que califiquen.") : null;
}

// Chapter references verified against real published tables of contents
// (Coloroso and Faber & Mazlish) — not invented. Where a specific chapter
// couldn't be verified for a book, "chapter" is left null and the copy
// says so honestly rather than guessing at a section title.
function bookCatalog() {
  const B = {
    coloroso: (chapter) => ({ title: "The Bully, the Bullied, and the Bystander", author: "Barbara Coloroso", isbn: "9780061744600", coverImg: "book-coloroso.jpg", chapter }),
    faber: (chapter) => ({ title: "How to Talk So Kids Will Listen & Listen So Kids Will Talk", author: "Adele Faber & Elaine Mazlish", isbn: "9781451663884", coverImg: "book-fabermazlish.jpg", chapter }),
    showingUp: { title: "The Power of Showing Up", author: "Daniel J. Siegel & Tina Payne Bryson", isbn: "9781524797713", year: 2020,
      chapter: L(`the chapters on the "Four S's" — helping a child feel safe, seen, soothed, and secure`, `los capítulos sobre las "Four S's" (las cuatro S): ayudar a un niño a sentirse a salvo, visto, calmado y seguro`) },
    screens: { title: "Behind Their Screens", author: "Emily Weinstein & Carrie James", isbn: "9780262047357", year: 2022,
      chapter: L(`Chapter 3, "Friendship Dilemmas," and Chapter 4, "Small Slights, Big Fights"`, `el capítulo 3, "Friendship Dilemmas" (dilemas de amistad), y el capítulo 4, "Small Slights, Big Fights" (desaires pequeños, grandes peleas)`) },
    middleSchool: { title: "Middle School Matters", author: "Phyllis L. Fagell", isbn: "9780738235080", year: 2019,
      chapter: L(`the sections "Managing shifting friendships" and "Coping with gossip and social turmoil"`, `las secciones "Managing shifting friendships" (cómo manejar amistades cambiantes) y "Coping with gossip and social turmoil" (cómo sobrellevar los chismes y la agitación social)`) },
    kidConfidence: { title: "Kid Confidence", author: "Eileen Kennedy-Moore", isbn: "9781684030491", year: 2019, chapter: null },
    thrivers: { title: "Thrivers", author: "Michele Borba", isbn: "9780593085271", year: 2021,
      chapter: L(`Chapter 1, "Self-Confidence," and Chapter 2, "Empathy"`, `el capítulo 1, "Self-Confidence" (confianza en uno mismo), y el capítulo 2, "Empathy" (empatía)`) }
  };
  // Book choices (Oct 2026 refresh, per Mark): newer, research-grounded books
  // that match the plan's approach, with chapters verified against published
  // tables of contents. Older or off-tone picks (1999, 2012, label-based) were
  // retired. Friendship pick depends on age: middle-school book for 11+.
  const BOOKS = {
    power: [B.showingUp, B.coloroso(L(`the chapter "Is There a Bullied Kid in the House?"`, `el capítulo "Is There a Bullied Kid in the House?" (¿hay un niño acosado en la casa?)`))],
    physical: [B.coloroso(L(`the chapters "The Bullied" and "Is There a Bullied Kid in the House?"`, `los capítulos "The Bullied" (el acosado) e "Is There a Bullied Kid in the House?" (¿hay un niño acosado en la casa?)`)), B.showingUp],
    exclusion: [null /* age-based friendship book, filled in below */, B.faber(L(`Chapter 1, "Helping Children Deal with Their Feelings"`, `el capítulo 1, "Helping Children Deal with Their Feelings" (cómo ayudar a los niños a manejar sus sentimientos)`))],
    namecalling: [B.faber(L(`Chapter 1, "Helping Children Deal with Their Feelings"`, `el capítulo 1, "Helping Children Deal with Their Feelings" (cómo ayudar a los niños a manejar sus sentimientos)`)), B.coloroso(L(`the chapter "The Bullied"`, `el capítulo "The Bullied" (el acosado)`))],
    online: [B.screens, B.faber(L(`Chapter 1, "Helping Children Deal with Their Feelings"`, `el capítulo 1, "Helping Children Deal with Their Feelings" (cómo ayudar a los niños a manejar sus sentimientos)`))],
    prevent: [B.thrivers, B.faber(L(`Chapters 1 and 2, "Helping Children Deal with Their Feelings" and "Engaging Cooperation"`, `los capítulos 1 y 2, "Helping Children Deal with Their Feelings" (cómo ayudar a los niños a manejar sus sentimientos) y "Engaging Cooperation" (cómo lograr cooperación)`))],
    default: [B.coloroso(L(`the chapter "Is There a Bullied Kid in the House?" for the signs and first steps`, `el capítulo "Is There a Bullied Kid in the House?" (¿hay un niño acosado en la casa?) para conocer las señales y los primeros pasos`)), B.faber(L(`Chapter 1, "Helping Children Deal with Their Feelings"`, `el capítulo 1, "Helping Children Deal with Their Feelings" (cómo ayudar a los niños a manejar sus sentimientos)`))]
  };
  return { B, BOOKS };
}

function friendshipBook() {
  const age = state.answers.q1 || "";
  return (age === "11–14" || age === "15–18") ? bookCatalog().B.middleSchool : bookCatalog().B.kidConfidence;
}

function bookCoverUrl(isbn) {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
}

// Mark's own book — offered alongside the external recommendation
// specifically on the prevention path, since the "Shining Moments" pages
// in the back are a direct, purpose-built tool for the self-esteem habit
// already recommended in that path's step 1.

function bookCoverSrc(b) {
  return b.coverImg ? assetUrl(b.coverImg) : `${window.location.origin}/.netlify/functions/book-cover?isbn=${b.isbn}`;
}

// ISBN-13 -> ISBN-10, which is the book's Amazon product ID (ASIN) for print editions.
function isbnToAsin(isbn13) {
  const core = isbn13.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(core[i]);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? "X" : String(check));
}

// Straight to the book's own Amazon page (with the Associate tag), not a search page.
function bookBuyUrl(b) {
  if (!b.isbn) return bookSearchUrl(b.title, b.author);
  const slug = b.title.replace(/&/g, "and").replace(/[^A-Za-z0-9 ]/g, "").trim().split(/\s+/).slice(0, 6).join("-");
  return amazonProductUrl(isbnToAsin(b.isbn), slug);
}

function recommendedBooks() {
  return bookCatalog().BOOKS[topicBranch()].map(b => b || friendshipBook()).map(b => ({
    title: b.title,
    author: b.author,
    display: L(`"${b.title}" by ${b.author}`, `"${b.title}" de ${b.author} (libro en inglés)`),
    url: bookBuyUrl(b),
    coverUrl: bookCoverSrc(b),
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
function RAY_PREORDER_LABEL() { return L("Pre-order Ray", "Preordene a Ray"); }
function RAY_PREORDER_NOTE() { return L("Ships January 2027", "Se envía en enero de 2027"); }
// One tap puts BOTH books in the parent's Amazon cart (Amazon Associates "Add to Cart" link), tagged with our Associate ID.
function amazonBothBooksUrl() {
  const tag = AMAZON_ASSOCIATE_TAG ? `AssociateTag=${encodeURIComponent(AMAZON_ASSOCIATE_TAG)}&` : "";
  return `https://www.amazon.com/gp/aws/cart/add.html?${tag}ASIN.1=0999371800&Quantity.1=1&ASIN.2=1616113324&Quantity.2=1`;
}
const SUNBEAM_FULLCOLOR_AMAZON_URL = amazonProductUrl("0999371800", "Adventures-True-Sunbeam-Family-Keepsake");
const SUNBEAM_COLORING_AMAZON_URL = amazonProductUrl("1616113324", "Adventures-True-Sunbeam-Keepsake-Coloring");

function privacyUrl() {
  return (typeof CONFIG !== "undefined" && CONFIG.PRIVACY_URL) || `${window.location.origin}/privacy/${getLang() === "es" ? "?lang=es" : ""}`;
}

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
  const tf = foldText(text);
  const boySignal = /\b(he|him|his|son|boy)\b/.test(text) || /\b(mi|su|el|un)\s+(hijo|nino|chico|muchacho)\b/.test(tf) || /(?:^|[^\p{L}])él(?![\p{L}])/u.test(text);
  const girlSignal = /\b(she|her|hers|daughter|girl)\b/.test(text) || /\b(mi|su|la|una)\s+(hija|nina|chica|muchacha)\b/.test(tf) || /\bella\b/.test(tf);
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
  const age = state.answers.q1 || "";
  const teen = age === "11–14" || age === "15–18";
  // For a teen, lead with journaling, not a picture-book page — "color a
  // page together" never fit, and now there's a cleaner angle: the pages
  // ARE a nightly journal, and a standalone journal format is coming.
  const text = teen
    ? (isPreventive()
        ? L(`For a teen, the Shining Moments pages work best as straightforward journaling: a few lines some nights, naming one good thing from the day, right before sleep. A few minutes is all it takes — no prompts needed, no pressure to make it a project. A standalone Shining Moments Journal, built just for that nightly habit, is coming soon. Each Shining Moment is a little light your child gets to keep — and the more they collect now, the brighter it glows inside when harder days come along.`, `Para un adolescente, las páginas de Shining Moments funcionan mejor como un diario sencillo: unas pocas líneas algunas noches, nombrando algo bueno del día, justo antes de dormir. Bastan unos minutos, sin preguntas guía y sin presión de convertirlo en un proyecto. Pronto habrá un Shining Moments Journal independiente, creado justo para ese hábito nocturno. Cada Shining Moment es una lucecita que su hijo o hija se queda para siempre; y mientras más junte ahora, más brillará por dentro cuando lleguen días más difíciles.`)
        : L(`For a teen, the Shining Moments pages work best as straightforward journaling: a few lines some nights, naming one good thing from the day, right before sleep. No prompts needed, no pressure to make it a project — just a few honest lines. A standalone Shining Moments Journal, built just for that nightly habit, is coming soon. Each Shining Moment is a little light your child gets to keep. Collect enough of them, and even on their hardest days, there's still a light on inside.`, `Para un adolescente, las páginas de Shining Moments funcionan mejor como un diario sencillo: unas pocas líneas algunas noches, nombrando algo bueno del día, justo antes de dormir. Sin preguntas guía y sin presión de convertirlo en un proyecto: solo unas líneas sinceras. Pronto habrá un Shining Moments Journal independiente, creado justo para ese hábito nocturno. Cada Shining Moment es una lucecita que su hijo o hija se queda para siempre. Si junta suficientes, aun en sus días más difíciles siempre habrá una luz encendida por dentro.`))
    : (isPreventive()
        ? L(`Each Shining Moments page opens with a prompting question. At bedtime, try one, like: "What happened today that helped you to feel extra special or loved?" A few minutes a night is all it takes. Each Shining Moment is a little light your child gets to keep — and the more they collect now, the brighter it glows inside when harder days come along.`, `Cada página de Shining Moments empieza con una pregunta guía. A la hora de dormir, pruebe una, como: "¿Qué pasó hoy que te hizo sentir que eres especial y que te quieren?" Bastan unos minutos cada noche. Cada Shining Moment es una lucecita que su hijo o hija se queda para siempre; y mientras más junte ahora, más brillará por dentro cuando lleguen días más difíciles.`)
        : L(`Each Shining Moments page opens with a prompting question. At bedtime, try one, like: "What happened today that helped you to feel extra special or loved?" If you have more time, color a page together and make it a keepsake: your signed and dated artwork in their book is lasting proof of your love and care. Each Shining Moment is a little light your child gets to keep. Collect enough of them, and even on their hardest days, there's still a light on inside.`, `Cada página de Shining Moments empieza con una pregunta guía. A la hora de dormir, pruebe una, como: "¿Qué pasó hoy que te hizo sentir que eres especial y que te quieren?" Si tiene más tiempo, coloreen una página juntos y háganla un recuerdo: su dibujo firmado y fechado en el libro es una prueba duradera de su amor y su cuidado. Cada Shining Moment es una lucecita que su hijo o hija se queda para siempre. Si junta suficientes, aun en sus días más difíciles siempre habrá una luz encendida por dentro.`));
  // The opening framing — a real explanation of the mechanism and why it
  // matters, introduced before the Shining Moments pages themselves and
  // before the book reveal, since this concept has to be understood and
  // "sold" on its own merits first.
  const introCaption = L(`A child's mind can get stuck. Whatever's bothering them — a hard day, a hurtful moment, a worry with no easy answer — often loops the loudest right at bedtime, when there's nothing left to distract from it.

Here's why that moment matters more than it seems. Cellular biologist Bruce Lipton has spent decades studying how a child's subconscious mind forms. By his account:

Every night, as your child drifts toward sleep, their mind passes through the same open, impressionable state that makes early childhood so absorbent in the first place. Think of it as "Dreamtime Programming": whatever's on their mind in those last few moments of the day can shape how well they sleep, what they dream about, and often how the next day goes.

Which means every bedtime is also an opportunity — a nightly chance to interrupt that programming before it takes hold, and redirect it toward something that builds your child up instead. That's the entire idea behind Shining Moments.`, `La mente de un niño puede quedarse atascada. Lo que le preocupa (un mal día, un momento que dolió, una inquietud sin respuesta fácil) suele dar más vueltas justo a la hora de dormir, cuando ya no hay nada que lo distraiga.

Por eso ese momento importa más de lo que parece. El biólogo celular Bruce Lipton lleva décadas estudiando cómo se forma la mente subconsciente de un niño. Según él:

Cada noche, mientras su hijo o hija se acerca al sueño, su mente pasa por el mismo estado abierto e impresionable que hace que la primera infancia absorba tanto. Piense en ello como "programación de ensueño": lo que tenga en la mente en esos últimos momentos del día puede influir en lo bien que duerme, en lo que sueña y, muchas veces, en cómo le va al día siguiente.

Eso significa que cada hora de dormir también es una oportunidad: la posibilidad, cada noche, de interrumpir esa programación antes de que se asiente y redirigirla hacia algo que fortalezca a su hijo o hija. Esa es toda la idea detrás de Shining Moments.`);
  return {
    text,
    introCaption,
    pullQuote: L("By age 7, up to 70% of what a child's subconscious mind has been programmed with is either self-sabotaging, negative, or limiting.", "Para los 7 años, hasta el 70% de lo que ha quedado programado en la mente subconsciente de un niño lo lleva a sabotearse a sí mismo, es negativo o lo limita."),
    closeupCaption: L(`It only takes a few minutes: naming one good moment from the day, and letting that be the last thing on their mind before sleep. Do it most nights, and watch for what starts to happen: your child falls asleep more easily, wakes up in a better mood, and carries a little more confidence into the day. That's what focusing on their light, instead of their shadows, can do.`, `Solo toma unos minutos: nombrar un buen momento del día y dejar que eso sea lo último en su mente antes de dormir. Hágalo casi todas las noches y fíjese en lo que empieza a pasar: su hijo o hija se duerme con más facilidad, se despierta de mejor humor y lleva un poco más de confianza a su día. Eso es lo que puede lograr enfocarse en su luz, en lugar de en sus sombras.`),
    setUrl: SUNBEAM_SET_URL,
    bothBooksUrl: amazonBothBooksUrl(),
    animatedCoverUrl: assetUrl("sunbeam-cover-animated-full.gif"),
    coloringPagesUrl: assetUrl("true-sunbeam-coloring-pages.pdf"),
    fullColorHint: L("See it animated", "Véalo animado"),
    coloringHint: L("Print free coloring pages", "Imprima páginas para colorear gratis"),
    rayPreorderUrl: RAY_PREORDER_URL,
    rayPreorderLabel: RAY_PREORDER_LABEL(),
    rayPreorderNote: RAY_PREORDER_NOTE(),
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
function MEMBERSHIP_BENEFITS() {
  return [
  L("Free access to the Bullyproof.Support community", "Acceso gratuito a la comunidad de Bullyproof.Support"),
  L("A directory of professionals you can search anytime, not just this once", "Un directorio de profesionales que puede consultar cuando quiera, no solo esta vez"),
  L("Real stories from other parents navigating situations like yours", "Historias reales de otros padres que atraviesan situaciones como la suya"),
  L("Music, podcasts, and articles focused specifically on kids and bullying", "Música, podcasts y artículos enfocados en los niños y el bullying"),
  L("A free trial of the Bullyproof Parent Playbook when it's available", "Una prueba gratuita del Bullyproof Parent Playbook cuando esté disponible"),
  L("Founding Member status while the community is still growing", "Estatus de Miembro Fundador mientras la comunidad sigue creciendo")
];
}

// Wording that appears in BOTH the email and the PDF lives here, once.
function WHAT_COMES_NEXT_INTRO() { return L("What you just read is real and complete on its own. But situations change — and when they do, that's exactly what the Bullyproof Parent Playbook is built for: not a longer list, but ongoing, evolving help. Here's the kind of support parents find most helpful on a consistent basis:", "Lo que acaba de leer es real y está completo por sí solo. Pero las situaciones cambian, y cuando cambian, para eso mismo fue creado el Bullyproof Parent Playbook: no una lista más larga, sino ayuda continua que evoluciona. Este es el tipo de apoyo que los padres encuentran más útil de manera constante:"); }
function PLAYBOOK_BLURB() { return L("Being built to give you practical, personalized guidance based on your child's age, personality, and what's happening right now — with words to use, conversations to have, and next steps to take as new challenges come up.", "Lo estamos creando para darle orientación práctica y personalizada según la edad y la personalidad de su hijo o hija y lo que está pasando ahora, con palabras para usar, conversaciones para tener y próximos pasos a seguir cuando surjan nuevos retos."); }
function PLAYBOOK_SOON() { return L("Coming soon — and Bullyproof.Support members will be first in line.", "Próximamente, y los miembros de Bullyproof.Support serán los primeros en la fila."); }
function playbookBoxImageUrl() {
  return `${window.location.origin}/assets/playbook-box.jpg`;
}

// Backup only — for areas where the network doesn't yet have a strong local
// match. Swap or remove once network coverage is dense enough on its own.
const FIND_SUPPORT_URL = "https://www.psychologytoday.com/us/therapists";

function whyThisMattersNote() {
  if (isPreventive()) {
    return L("Prevention works. A 2019 review of 100 school anti-bullying programs (Gaffney, Ttofi & Farrington) found they cut bullying by about 20%. What you do at home builds those same skills — right where your child spends the most time.", "La prevención funciona. Una revisión de 2019 de 100 programas escolares contra el bullying (Gaffney, Ttofi y Farrington) encontró que lo reducen cerca de un 20%. Lo que usted hace en casa desarrolla esas mismas habilidades, justo donde su hijo o hija pasa más tiempo.");
  }
  const status = communicationStatus();
  if (status === "behavior-only" || status === "no-signals") {
    return L("Here's something worth knowing: a child's relationships are one of their strongest protections. A 2022 study that followed nearly 500 teens for several years found that support from friends helped cushion the emotional hurt of being bullied. Confidence and friendships can be built at any age. If it feels like a gap right now, that's not a failure on your part — it's simply the next thing to work on together.", "Algo que vale la pena saber: las relaciones de un niño son una de sus protecciones más fuertes. Un estudio de 2022 que dio seguimiento a casi 500 adolescentes durante varios años encontró que el apoyo de los amigos ayudó a amortiguar el dolor emocional de sufrir bullying. La confianza y las amistades se pueden construir a cualquier edad. Si ahora siente que eso falta, no es un fracaso de su parte: es simplemente lo siguiente en lo que pueden trabajar juntos.");
  }
  if (onlineWeight() === "online") {
    return L("You're far from alone: Pew Research Center found that nearly half of U.S. teens (46%) have been bullied or harassed online. Knowing how to handle it — what to save, what to block, and who to tell — is a learned skill, not something kids are born knowing. That means it can be taught.", "Muchas familias pasan por esto: el Pew Research Center encontró que casi la mitad de los adolescentes de EE. UU. (46%) han sufrido bullying o acoso en internet. Saber cómo manejarlo (qué guardar, qué bloquear y a quién avisar) es una habilidad que se aprende, no algo con lo que los niños nacen. Eso significa que se puede enseñar.");
  }
  return L("Confidence and social skills can be built at any age — and they matter. A 2022 study that followed nearly 500 teens for several years found that support from friends helped cushion the emotional hurt of being bullied. Working on that together is one of the most powerful things a parent can do.", "La confianza y las habilidades sociales se pueden desarrollar a cualquier edad, y importan. Un estudio de 2022 que dio seguimiento a casi 500 adolescentes durante varios años encontró que el apoyo de los amigos ayudó a amortiguar el dolor emocional de sufrir bullying. Trabajar en eso juntos es una de las cosas más poderosas que puede hacer un padre o una madre.");
}

function furtherStepsTeaser() {
  if (isPreventive()) {
    return [
      L("Knowing what to say so your child will communicate with you — instead of just giving one-word answers.", "Saber qué decir para que su hijo o hija se comunique con usted, en lugar de dar solo respuestas de una palabra."),
      L("How to talk about kindness and boundaries — before there's a problem.", "Cómo hablar de la bondad y los límites, antes de que haya un problema."),
      L("A simple weekly habit that builds your child's confidence over time", "Un hábito semanal sencillo que fortalece la confianza de su hijo o hija con el tiempo"),
      L("How to know when kids can work it out — and when they need your help.", "Cómo saber cuándo los niños pueden resolverlo solos y cuándo necesitan su ayuda."),
      L("How to keep the good things you learned growing up — and give your kids better tools for the rest.", "Cómo conservar lo bueno que aprendió al crecer y darles a sus hijos mejores herramientas para todo lo demás.")
    ];
  }

  // Two anchors present in every active situation — these carry the
  // emotional core (not feeling alone, not repeating what didn't work
  // growing up), not just tactical steps.
  const items = [
    L("Real-time backup for the moments this feels the most overwhelming — so you're never figuring out what to say by yourself", "Respaldo en tiempo real para los momentos en que todo se siente más abrumador, para que nunca tenga que averiguar qué decir por su cuenta"),
    L("How to keep the good things you learned growing up — and give your kids better tools for the rest.", "Cómo conservar lo bueno que aprendió al crecer y darles a sus hijos mejores herramientas para todo lo demás.")
  ];

  // A genuinely earned insight (only appears when the parent's own words
  // indicated it) — given priority over the generic fallbacks below.
  if (selfReflectionNote()) {
    items.push(L("A gentle way to look at any patterns worth adjusting — without blame", "Una forma amable de revisar los patrones que valga la pena ajustar, sin culpas"));
  }

  // Situational pool — each only shown when it actually applies.
  const school = schoolStatus();
  if (school === "dismissed" || school === "no-change" || school === "not-reached-out") {
    items.push(L("The exact words to say if the school pushes back or downplays it", "Las palabras exactas para decir si la escuela se resiste o le quita importancia"));
  }
  const comm = communicationStatus();
  if (comm === "clear" || comm === "hints") {
    items.push(L("What to say to help, instead of what you've already tried that hasn't worked", "Qué decir para ayudar, en lugar de lo que ya intentó y no ha funcionado"));
  }
  if (["11–14", "15–18"].includes(state.answers.q1)) {
    items.push(L("Age appropriate conversation guidance so your words are actually heard and received", "Guía de conversación adecuada a la edad para que sus palabras sean realmente escuchadas y recibidas"));
  }
  if (topicBranch() === "online") {
    items.push(L("How to handle screens and monitoring without it turning into a fight", "Cómo manejar las pantallas y la supervisión sin que se convierta en una pelea"));
  }
  if (["physical", "namecalling", "exclusion", "power"].includes(topicBranch())) {
    items.push(L("What to say — and what not to say — if another family is involved", "Qué decir, y qué no decir, si hay otra familia involucrada"));
  }

  // Generic fallbacks — always relevant, but the most replaceable if
  // space runs out, since they're not situation-specific.
  items.push(L("A week-by-week plan to help your child rebuild confidence", "Un plan semana a semana para ayudar a su hijo o hija a recuperar la confianza"));
  items.push(L("A simple way to track whether things are actually getting better", "Una forma sencilla de saber si las cosas realmente están mejorando"));

  return items.slice(0, 5);
}

// A step that opens with a short headline sentence (7 words or fewer) shows
// that headline in bold on its own line, so a scanning parent sees the three
// big ideas at a glance. Longer openings stay as plain paragraphs.
function splitStepTitle(step) {
  const es = getLang() === "es";            // Spanish runs ~20% longer than English
  const m = step.match(new RegExp('^(.{3,' + (es ? 85 : 70) + '}?[.!?]"?)\\s+([\\s\\S]+)$'));
  if (m && m[1].split(/\s+/).length <= (es ? 9 : 7)) return [m[1], m[2]];
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
    L("Make the \"no-panic promise.\" Most bullied kids never tell an adult at school — the U.S. Department of Education's most recent survey (2022) found only 44% did. The biggest reason is fear that the grown-up will overreact and make things worse. So say this, once, on an ordinary day: \"You can tell me anything. I promise I won't freak out, and I won't go to the school without talking with you first.\" Harvard's Center on the Developing Child found that the most common thing kids who bounce back share is at least one steady adult they trust. This promise is how you become that adult before it's ever needed.", "Haga la \"promesa de no entrar en pánico.\" La mayoría de los niños que sufren bullying nunca se lo cuentan a un adulto en la escuela: la encuesta más reciente del Departamento de Educación de EE. UU. (2022) encontró que solo el 44% lo hizo. La razón principal es el miedo a que el adulto reaccione de forma exagerada y empeore las cosas. Así que diga esto, una sola vez, en un día cualquiera: \"Puedes contarme lo que sea. Te prometo que no me voy a alterar, y que no voy a ir a la escuela sin hablar contigo primero.\" El Center on the Developing Child de la Universidad de Harvard encontró que lo más común entre los niños que logran sobreponerse es contar con al menos un adulto estable en quien confían. Esta promesa es la manera de convertirse en ese adulto antes de que haga falta."),
    L("Help grow one solid friendship. Friends are real protection: a 2022 study that followed nearly 500 teens for several years found that support from friends helped cushion the emotional hurt of being bullied. Popularity doesn't matter here. One real friend does. This month, ask \"Who do you like sitting with at lunch?\" and invite that child over, even just for pizza and a movie.", "Ayude a que crezca una amistad sólida. Los amigos son una protección real: un estudio de 2022 que dio seguimiento a casi 500 adolescentes durante varios años encontró que el apoyo de los amigos ayudó a amortiguar el dolor emocional de sufrir bullying. Aquí la popularidad no importa. Un amigo de verdad, sí. Este mes, pregunte: \"¿Con quién te gusta sentarte a la hora del almuerzo?\" e invite a ese niño a su casa, aunque sea solo para una pizza y una película."),
    L("Teach quiet kindness. When your child sees someone being picked on, newer research suggests the most helpful move usually isn't confronting the bully in front of everyone — that can put more eyes on the child being picked on. It's being on that child's side afterward. A 2023 study found that bullied kids who had at least one classmate on their side felt a stronger sense of belonging nine months later. Give your child two easy lines: \"Want to sit with us?\" and, privately later, \"That wasn't okay. Are you alright?\" Kids who make a habit of this build courage and real friendships — and they'll know what kindness looks like if it's ever them.", "Enseñe la bondad discreta. Cuando su hijo o hija ve que se meten con alguien, investigaciones más recientes sugieren que lo más útil normalmente no es confrontar al agresor frente a todos, porque eso puede poner más miradas sobre el niño al que molestan. Lo útil es ponerse de su lado después. Un estudio de 2023 encontró que los niños que sufrían bullying y tenían al menos un compañero de su lado sintieron un mayor sentido de pertenencia nueve meses después. Dele a su hijo o hija dos frases fáciles: \"¿Quieres sentarte con nosotros?\" y, en privado más tarde, \"Eso no estuvo bien. ¿Estás bien?\" Los niños que hacen de esto un hábito desarrollan valentía y amistades de verdad, y sabrán cómo se ve la bondad si alguna vez les toca a ellos.")
  ];
}

// For parents with nothing to report yet — a plain list of what's actually
// worth keeping an eye on, so "just want to be prepared" gets something
// concrete. Pulled from the same categories used in the assessment itself,
// not a separate invented list.
function preventionWatchForNote() {
  if (!isPreventive()) return null;
  return {
    intro: L("Here's what's worth keeping half an eye on — not to worry over, just to notice:", "Esto es lo que vale la pena tener presente, no para preocuparse, solo para notar:"),
    items: [
      L("Physical: unexplained scratches or bruises, a sudden switch to long sleeves in warm weather, or frequent headaches/stomachaches with no clear cause", "Físico: rasguños o moretones sin explicación, un cambio repentino a mangas largas con clima cálido, o dolores frecuentes de cabeza o de estómago sin causa clara"),
      L("Sleep or appetite: trouble falling asleep, nightmares, or a real change in how much they're eating", "Sueño o apetito: dificultad para dormirse, pesadillas, o un cambio real en cuánto come"),
      L("Behavior: pulling back from things they used to enjoy, seeming more irritable or tearful than usual, or suddenly not wanting to go to school", "Comportamiento: alejarse de cosas que antes disfrutaba, mostrarse más irritable o llorar más que de costumbre, o de repente no querer ir a la escuela")
    ],
    outro: L("These are the same warning signs StopBullying.gov, the U.S. government's bullying resource, shares with parents. None of them mean something is definitely wrong — kids go through phases for all kinds of reasons. They're just the kind of thing worth a gentle check-in if you notice a few of them together.", "Estas son las mismas señales de alerta que StopBullying.gov, el recurso del gobierno de EE. UU. sobre el bullying, comparte con los padres. Ninguna significa con certeza que algo anda mal: los niños pasan por etapas por todo tipo de razones. Solo son el tipo de cosa que vale la pena revisar con suavidad si nota varias juntas.")
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
  // Print-friendly header (per Mark): a navy-outlined oval with a thin gold
  // inner line on white paper, instead of a solid navy block that eats ink.
  doc.setDrawColor(16, 27, 51); doc.setLineWidth(0.9);
  doc.roundedRect(22, 7, pageWidth - 44, 44, 22, 22, "S");
  doc.setDrawColor(200, 155, 60); doc.setLineWidth(0.35);
  doc.roundedRect(24.5, 9.5, pageWidth - 49, 39, 19.5, 19.5, "S");
  const bannerIconImg = await fetchImageAsDataUrl(assetUrl("icon-landing.png"));
  if (bannerIconImg) {
    try { doc.addImage(bannerIconImg, "PNG", pageWidth / 2 - 7, 12, 14, 14); } catch (e) {}
  }
  doc.setFontSize(9.5); doc.setTextColor(168, 124, 42); doc.setFont(undefined, "bold");
  doc.text("BULLYPROOF.GUIDE", pageWidth / 2, 32, { align: "center", charSpace: 0.5 });
  doc.setFontSize(17); doc.setTextColor(16, 27, 51);
  doc.text(L("Your Personalized Action Plan", "Su Plan de Acción Personalizado"), pageWidth / 2, 42, { align: "center" });
  doc.setFont(undefined, "normal");
  y = 64;

  if (state.safetyFlags.length) {
    const priority = ["selfHarmOrSuicide", "violenceRisk", "sexualOrPower", "physicalSigns"];
    const key = priority.find(k => state.safetyFlags.includes(k));
    const variant = SAFETY_VARIANTS[key];
    doc.setFontSize(11);
    const resLines = variant.resources.map(r => doc.splitTextToSize(resName(r) + " — " + resDetail(r), 176));
    const resBoxH = 10 + resLines.reduce((n, ls) => n + ls.length * 5 + 1, 0);
    ensureRoom(resBoxH);
    doc.setFillColor(253, 237, 237);
    doc.rect(10, y - 6, 190, resBoxH, "F");
    doc.setFontSize(13); doc.setTextColor(197, 48, 48); doc.text(L("Please reach out to one of these resources first:", "Por favor, comuníquese primero con uno de estos recursos:"), 15, y); y += 7;
    doc.setFontSize(11); doc.setTextColor(40, 40, 40);
    resLines.forEach(ls => { doc.text(ls, 15, y); y += ls.length * 5 + 1; });
    y += 6;
  }

  if (state.answers.q4) {
    heading(L("You told us:", "Usted nos dijo:"));
    body(`"${state.answers.q4}"`, { italic: true });
  }

  if (openingValidation()) body(openingValidation(), { color: [74, 109, 147] });

  heading(isPreventive() ? L("Where you're starting:", "Su punto de partida:") : L("What's happening:", "Qué está pasando:"));
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
    body(L("Why it helps: ", "Por qué ayuda: ") + w.why, { color: [90, 100, 120] });
    body(w.teaser, { color: [90, 100, 120] });
  }
  if (multiChildNote()) body(multiChildNote(), { color: [74, 109, 147] });
  if (selfReflectionNote()) body(selfReflectionNote(), { color: [74, 109, 147] });

  heading(L("What actually helps:", "Lo que de verdad ayuda:"));
  body(whyThisMattersNote());

  heading(L("Your next 3 steps:", "Sus próximos 3 pasos:"));
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
    heading(L("What to watch for:", "Qué debe observar:"));
    body(watchFor.intro);
    watchFor.items.forEach(item => body(`• ${item}`));
    body(watchFor.outro, { color: [130, 130, 130] });
  }

  const proNote = professionalSupportNote();
  if (proNote) { heading(L("Worth considering:", "Vale la pena considerar:")); body(proNote); }

  // Recommended reading comes after the steps now — a natural answer to
  // "okay, now what do I actually go read," rather than a cold opener.
  // Two books now, each pointing at a specific chapter for their situation.
  const sunbeam = sunbeamResource();
  if (sunbeam) {
    heading(L("A nightly opportunity", "Una oportunidad cada noche"));

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
      if (pi === 2) {
        // "Every night…": small gold label, larger navy text (matches the plan page)
        doc.setFont("helvetica", "normal"); doc.setFontSize(12);
        const lines = doc.splitTextToSize(introParas[pi], 180);
        ensureRoom(6 + lines.length * 6.1 + 5); // the label always travels with its paragraph
        doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(168, 124, 42);
        doc.setCharSpace(0.5); doc.text(L("WHAT HAPPENS AT BEDTIME", "LO QUE PASA A LA HORA DE DORMIR"), 15, y); doc.setCharSpace(0);
        y += 6;
        doc.setFont("helvetica", "normal"); doc.setFontSize(12); doc.setTextColor(16, 27, 51);
        doc.text(lines, 15, y, { lineHeightFactor: 1.45 }); y += lines.length * 6.1 + 5;
        continue;
      }
      if (pi === 3) {
        // "Which means…": the argument, then its last line set apart, centered, as the takeaway
        const [paraBody, closer] = splitClosingSentence(introParas[pi]);
        doc.setFont("helvetica", "normal"); doc.setFontSize(12); doc.setTextColor(16, 27, 51);
        const lines = doc.splitTextToSize(paraBody, 180);
        ensureRoom(lines.length * 6 + 26);
        doc.text(lines, 15, y, { lineHeightFactor: 1.45 }); y += lines.length * 6.1 + 6;
        if (closer) {
          doc.setDrawColor(200, 155, 60); doc.setLineWidth(0.6); doc.line(99, y, 111, y);
          doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(16, 27, 51);
          const cl = doc.splitTextToSize(closer, 170);
          doc.text(cl, 105, y + 8, { align: "center", lineHeightFactor: 1.3 });
          y += 8 + cl.length * 6.5 + 6;
        }
        doc.setFont("helvetica", "normal");
        continue;
      }
      body(introParas[pi], { color: [31, 36, 48] });
      if (pi === 1) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(14.5);
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

    // The reveal: a centered navy band with the book title set as a title lockup.
    const bandH = 52;
    // Per Mark: the reveal comes first, then "How it works", then the picture of the pages, kept together
    // as one block on the same page (moved to a fresh page only when the whole block won't fit).
    doc.setFontSize(10.5);
    const blockH = bandH + 8 + (doc.splitTextToSize(sunbeam.closeupCaption, 170).length * 5.6 + 13) + 8 + 6 + 58;
    ensureRoom(blockH);
    // Print-friendly reveal (per Mark): navy oval outline with a gold inner line.
    doc.setDrawColor(16, 27, 51); doc.setLineWidth(0.9);
    doc.roundedRect(15, y, 180, bandH, 23, 23, "S");
    doc.setDrawColor(200, 155, 60); doc.setLineWidth(0.35);
    doc.roundedRect(17.5, y + 2.5, 175, bandH - 5, 20.5, 20.5, "S");
    doc.setLineWidth(0.6);
    doc.line(99, y + 7, 111, y + 7);
    doc.setFont("times", "italic"); doc.setFontSize(12); doc.setTextColor(74, 84, 112);
    // two short lines so the words stay clear of the oval's curved ends
    doc.text(L("You'll find these pages waiting in the back of", "Encontrará estas páginas al final de"), 105, y + 14, { align: "center" });
    doc.text(L("the award-winning children's book", "el libro infantil galardonado"), 105, y + 19.5, { align: "center" });
    doc.setFont("times", "normal"); doc.setFontSize(13); doc.setTextColor(16, 27, 51);
    doc.text("The Adventures of the", 105, y + 28.5, { align: "center" });
    doc.setFont("times", "bold"); doc.setFontSize(24); doc.setTextColor(168, 124, 42);
    doc.text("True Sunbeam", 105, y + 39, { align: "center" });
    doc.line(99, y + 45.5, 111, y + 45.5);
    doc.setFont("helvetica", "normal");
    y += bandH + 8;
    doc.setFontSize(10.5);
    const howItWorksLines = doc.splitTextToSize(sunbeam.closeupCaption, 170);
    const cardH = howItWorksLines.length * 5.6 + 13;
    ensureRoom(cardH + 8);
    doc.setFillColor(255, 251, 243); doc.setDrawColor(234, 223, 198); doc.setLineWidth(0.3);
    doc.roundedRect(15, y, 180, cardH, 2, 2, "FD");
    doc.setFontSize(9); doc.setTextColor(168, 124, 42); doc.setFont(undefined, "bold");
    doc.text(L("HOW IT WORKS", "CÓMO FUNCIONA"), 21, y + 9);
    doc.setFont(undefined, "normal");
    doc.setFontSize(10.5); doc.setTextColor(16, 27, 51);
    doc.text(howItWorksLines, 21, y + 16);
    y += cardH + 8;

    ensureRoom(72); // label + spread image travel together, never split across pages
    doc.setFontSize(9.5); doc.setTextColor(168, 124, 42); doc.setFont(undefined, "bold");
    doc.setCharSpace(0.6);
    doc.text(L("START COLLECTING YOUR CHILD'S SHINING MOMENTS", "COMIENCE A JUNTAR LOS SHINING MOMENTS DE SU HIJO O HIJA"), 105, y, { align: "center" });
    doc.setCharSpace(0);
    doc.setFont(undefined, "normal");
    y += 6;

    const introSpreadImg = await fetchImageAsDataUrl(sunbeam.shiningMomentsSpreadImg);
    if (introSpreadImg) {
      try { doc.addImage(introSpreadImg, "JPEG", 15, y, 180, 54.3); } catch (e) {}
      y += 58;
    }

    // After the pages picture: coloring book (left), Ray (center), story book
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
      caption(L("Coloring book", "Libro para colorear"), colX[0]);
      centeredLink(sunbeam.coloringHint, colX[0], rowBaseline + 11, sunbeam.coloringPagesUrl);
      smallButton(L("Buy now", "Comprar ahora"), colX[0], rowBaseline + 15, sunbeam.coloringUrl);
    }
    if (rayImg) {
      try { doc.addImage(rayImg, "JPEG", colX[1] - RAY_W / 2, rowBaseline - RAY_H, RAY_W, RAY_H); } catch (e) {}
      caption(L("Meet Ray, the Sunbeam plush toy", "Conozca a Ray, el peluche Sunbeam"), colX[1]);
      smallButton(sunbeam.rayPreorderLabel, colX[1], rowBaseline + 15, sunbeam.rayPreorderUrl);
      doc.setFontSize(8.5); doc.setTextColor(90, 100, 120); doc.text(sunbeam.rayPreorderNote, colX[1], rowBaseline + 27, { align: "center" });
    }
    if (fullColorImg) {
      try { doc.addImage(fullColorImg, "JPEG", colX[2] - BOOK_SIZE / 2, rowBaseline - BOOK_SIZE, BOOK_SIZE, BOOK_SIZE); } catch (e) {}
      doc.link(colX[2] - BOOK_SIZE / 2, rowBaseline - BOOK_SIZE, BOOK_SIZE, BOOK_SIZE, { url: sunbeam.animatedCoverUrl });
      caption(L("Full-color story book", "Libro de cuentos a todo color"), colX[2]);
      centeredLink(sunbeam.fullColorHint, colX[2], rowBaseline + 11, sunbeam.animatedCoverUrl);
      smallButton(L("Buy now", "Comprar ahora"), colX[2], rowBaseline + 15, sunbeam.fullColorUrl);
    }
    y = (fullColorImg || coloringImg || rayImg) ? rowBaseline + 34 : y;

    ensureRoom(30); // badge + "buy both" + set link stay together
    const blY = y;
    const bibaImg = await fetchImageAsDataUrl(sunbeam.bibaBadgeImg);
    if (bibaImg) { try { doc.addImage(bibaImg, "PNG", 15, blY - 3, 60, 25); } catch (e) {} }
    [[L("Buy both books", "Comprar los dos libros"), sunbeam.bothBooksUrl, true], [L("Book + Ray plush set (coming soon)", "Paquete de libro + peluche de Ray (próximamente)"), sunbeam.setUrl, false]].forEach(([label, url, strong], i) => {
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

  heading(L("Recommended reading:", "Lecturas recomendadas:"));

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
      const chapterText = b.chapter ? L(`Look for ${b.chapter}.`, `Busque ${b.chapter}.`) : L("Relevant throughout — worth reading in full.", "Es relevante de principio a fin; vale la pena leerlo completo.");
      doc.text(doc.splitTextToSize(chapterText, 140), 52, by + 20);
      // Same "Buy now on Amazon" button as the email (links to the book's own page, Associate tag included)
      doc.setFontSize(9.5); doc.setFont(undefined, "bold");
      const amazonLabel = L("Buy now on Amazon", "Comprar ahora en Amazon");
      const bw = doc.getTextWidth(amazonLabel) + 10;   // measured from the words actually shown (Spanish is longer)
      doc.setFillColor(16, 27, 51); doc.roundedRect(52, by + 32, bw, 8, 1.6, 1.6, "F");
      doc.setTextColor(255, 255, 255); doc.text(amazonLabel, 57, by + 37.4);
      doc.link(52, by + 32, bw, 8, { url: b.url });
      doc.setFont(undefined, "normal");
      y = by + 50;
    } else {
      ensureRoom(20);
      doc.setFontSize(11); doc.setTextColor(40, 40, 40);
      doc.text(doc.splitTextToSize(b.display, 180), 15, y); y += 6;
      doc.setFontSize(10); doc.setTextColor(90, 100, 120);
      const chapterText = b.chapter ? L(`Look for ${b.chapter}.`, `Busque ${b.chapter}.`) : L("Relevant throughout — worth reading in full.", "Es relevante de principio a fin; vale la pena leerlo completo.");
      doc.text(doc.splitTextToSize(chapterText, 180), 15, y); y += 6;
      doc.setFontSize(11); doc.setTextColor(66, 153, 225);
      doc.textWithLink(L("Buy now on Amazon", "Comprar ahora en Amazon"), 15, y, { url: b.url });
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
    doc.text(L("Reserve my copy", "Reservar mi copia"), x + 6.2, yy);
    doc.link(x - 1, yy - 5, 40, 7, { url: playbookInviteUrl() });
    doc.setFont(undefined, "normal");
  }
  // The Quick Help Guides: their own product, level one — hands-on and available today. The Playbook follows as the next level.
  const qhOffer = quickHelpOffer();
  if (qhOffer) {
    const X = 15, W = 180, PAD = 8, inner = W - PAD * 2;
    doc.setFont(undefined, "normal"); doc.setFontSize(10.5);
    const leadL = doc.splitTextToSize(qhOffer.lead, inner);
    const bulletsL = qhOffer.bullets.map(b => doc.splitTextToSize("\u2022  " + b, inner - 4));
    const noteL = doc.splitTextToSize(qhOffer.note, inner);
    doc.setFont(undefined, "bold"); doc.setFontSize(12);
    const guideL = qhOffer.guideTitle ? doc.splitTextToSize(qhOffer.guideTitle, inner - 10) : [];
    const issueL = (guideL.length && qhOffer.issue) ? doc.splitTextToSize(qhOffer.issue, inner - 10) : [];
    const issueH = issueL.length ? 6 + issueL.length * 5.6 + 3 : 0;
    const matchH = guideL.length ? 10 + issueH + guideL.length * 5.6 + 5 : 0;
    const cardH = 10 + 6 + 9 + leadL.length * 5 + 5 + matchH + (matchH ? 6 : 0)
      + bulletsL.reduce((h, l) => h + l.length * 5 + 1.5, 0) + 5 + 12 + 5 + noteL.length * 4.4 + 8;
    ensureRoom(cardH + 8);
    const top = y;
    doc.setFillColor(16, 27, 51); doc.roundedRect(X, top, W, cardH, 3, 3, "F");
    doc.setFillColor(200, 155, 60); doc.rect(X + 3, top, W - 6, 1.4, "F");
    let cy = top + 11;
    doc.setFont(undefined, "bold"); doc.setFontSize(8.5); doc.setTextColor(200, 155, 60);
    doc.text(qhOffer.kicker.toUpperCase(), X + PAD, cy, { charSpace: 0.5 }); cy += 8;
    doc.setFontSize(16); doc.setTextColor(255, 255, 255);
    doc.text(qhOffer.title, X + PAD, cy); cy += 8;
    doc.setFont(undefined, "normal"); doc.setFontSize(10.5); doc.setTextColor(213, 218, 230);
    doc.text(leadL, X + PAD, cy, { lineHeightFactor: 1.35 }); cy += leadL.length * 5 + 4;
    if (guideL.length) {
      doc.setFillColor(28, 42, 74); doc.setDrawColor(138, 109, 46); doc.setLineWidth(0.4);
      doc.roundedRect(X + PAD, cy, inner, matchH, 2, 2, "FD");
      let my = cy + 7;
      if (issueL.length) {
        doc.setFont(undefined, "bold"); doc.setFontSize(9.5); doc.setTextColor(200, 155, 60);
        doc.text(qhOffer.issueLabel, X + PAD + 5, my);
        doc.setFontSize(12); doc.setTextColor(255, 255, 255);
        doc.text(issueL, X + PAD + 5, my + 6.5, { lineHeightFactor: 1.3 });
        my += issueH;
      }
      doc.setFont(undefined, "bold"); doc.setFontSize(9.5); doc.setTextColor(200, 155, 60);
      doc.text(qhOffer.matchLabel, X + PAD + 5, my);
      doc.setFontSize(12); doc.setTextColor(255, 255, 255);
      doc.text(guideL, X + PAD + 5, my + 6.5, { lineHeightFactor: 1.3 });
      cy += matchH + 6;
    }
    doc.setFont(undefined, "normal"); doc.setFontSize(10.5); doc.setTextColor(213, 218, 230);
    bulletsL.forEach(l => { doc.text(l, X + PAD + 1, cy, { lineHeightFactor: 1.35 }); cy += l.length * 5 + 1.5; });
    cy += 3;
    if (qhOffer.url) {
      doc.setFont(undefined, "bold"); doc.setFontSize(11.5);
      const bw = doc.getTextWidth(qhOffer.button) + 14;
      doc.setFillColor(200, 155, 60); doc.roundedRect(X + PAD, cy, bw, 11, 2, 2, "F");
      doc.setTextColor(16, 27, 51); doc.text(qhOffer.button, X + PAD + 7, cy + 7.3);
      doc.link(X + PAD, cy, bw, 11, { url: qhOffer.url });
    } else {
      doc.setFont(undefined, "bold"); doc.setFontSize(11.5); doc.setTextColor(200, 155, 60);
      doc.text(qhOffer.soon, X + PAD, cy + 7.3);
    }
    cy += 16;
    doc.setFont(undefined, "normal"); doc.setFontSize(9); doc.setTextColor(174, 182, 200);
    doc.text(noteL, X + PAD, cy, { lineHeightFactor: 1.3 });
    y = top + cardH + 10;
  }
  const playbookImg = await fetchImageAsDataUrl(playbookBoxImageUrl());
  const colW = playbookImg ? 124 : 180;
  doc.setFont(undefined, "normal"); doc.setFontSize(11);
  const introLines = doc.splitTextToSize(WHAT_COMES_NEXT_INTRO(), colW);
  const bulletBlocks = furtherStepsTeaser().map(t => doc.splitTextToSize(`• ${t}`, colW));
  const LH = 5.2; // line spacing for this block
  const textH = introLines.length * LH + 6 + bulletBlocks.reduce((h, l) => h + l.length * LH + 3.5, 0);
  ensureRoom(Math.max(textH, 72) + 22); // the heading never sits alone: it moves with its intro, list and picture
  heading(L("What comes next:", "Lo que sigue:"));
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
  const blurbLines = doc.splitTextToSize(PLAYBOOK_BLURB(), 168);
  const cardH = 42 + blurbLines.length * 4.6;
  doc.roundedRect(15, y, 180, cardH, 3, 3, "FD");
  doc.setFontSize(14); doc.setFont(undefined, "bold"); doc.setTextColor(16, 27, 51);
  doc.text("The Bullyproof Parent Playbook", 21, y + 10);
  doc.setFontSize(10); doc.setTextColor(60, 70, 100);
  doc.text(L("Personalized guidance that grows with your child.", "Orientación personalizada que crece con su hijo o hija."), 21, y + 17);
  doc.setFont(undefined, "normal"); doc.setFontSize(9.5); doc.setTextColor(90, 100, 120);
  doc.text(blurbLines, 21, y + 25);
  const afterBlurb = y + 25 + blurbLines.length * 4.6;
  doc.setFontSize(9); doc.text(PLAYBOOK_SOON(), 21, afterBlurb + 2);
  doc.setFontSize(10.5); doc.setTextColor(66, 153, 225);
  doc.textWithLink(L("Join Bullyproof.Support FREE today", "Únase GRATIS hoy a Bullyproof.Support"), 21, afterBlurb + 10, { url: NETWORK_HOME_URL });
  y += cardH + 8;
  doc.setFontSize(10.5); doc.setFont(undefined, "bold"); doc.setTextColor(27, 42, 74);
  doc.text(L("What membership includes, starting today:", "Lo que incluye la membresía, desde hoy:"), 15, y); y += 7;
  doc.setFont(undefined, "normal"); doc.setFontSize(10); doc.setTextColor(60, 70, 100);
  MEMBERSHIP_BENEFITS().forEach(b => {
    const ls = doc.splitTextToSize("• " + b, 172);
    ensureRoom(ls.length * 5 + 3);
    doc.text(ls, 17, y); y += ls.length * 5 + 2;
  });
  y += 4;
  ensureRoom(34); // the trial note and the second reserve box stay together
  body(L("Your membership does not start your free trial today. When the Playbook launches, you'll receive an invitation to try it FREE for one week.", "Su membresía no inicia hoy su prueba gratuita. Cuando el Playbook salga a la venta, recibirá una invitación para probarlo GRATIS durante una semana."), { color: [140, 140, 140] });
  if (!state.marketingConsent) { reserveBox(16, y + 2); y += 14; }


  heading(L("Prefer to talk to a licensed professional?", "¿Prefiere hablar con un profesional con licencia?"));
  body(L("That's always an option too. Search the Bullyproof Support network to get matched with a professional near you — just enter your location, no cost to look:", "Esa también es siempre una opción. Busque en la red de Bullyproof Support para encontrar a un profesional cerca de usted: solo escriba su ubicación; buscar no cuesta nada:"));
  ensureRoom(8);
  doc.setFontSize(11); doc.setTextColor(66, 153, 225);
  doc.textWithLink("bullyproof.support/getmatched", 15, y, { url: NETWORK_MATCH_URL });
  y += 12;
  body(L("If your area doesn't have a strong match yet, Psychology Today's broader directory is a good backup:", "Si en su zona todavía no hay una buena coincidencia, el directorio más amplio de Psychology Today es una buena alternativa:"));
  ensureRoom(8);
  doc.setFontSize(11); doc.setTextColor(66, 153, 225);
  doc.textWithLink("psychologytoday.com/us/therapists", 15, y, { url: FIND_SUPPORT_URL });
  y += 12;

  ensureRoom(10);
  doc.setFontSize(10); doc.setTextColor(100, 100, 100);
  body(L("This plan is for general information only. It is not medical, mental health, or legal advice, and it doesn't guarantee any specific result. Please use your own judgment and talk to a licensed professional about your specific situation. If your child is in immediate danger, call 911.", "Este plan es solo para información general. No es asesoría médica, de salud mental ni legal, y no garantiza ningún resultado específico. Use su propio criterio y hable con un profesional con licencia sobre su situación específica. Si su hijo o hija está en peligro inmediato, llame al 911."), { color: [130, 130, 130] });
  doc.setFontSize(10); doc.setTextColor(100, 100, 100);
  doc.text(L("If you need more help finding a vetted professional in your area, visit ", "Si necesita más ayuda para encontrar a un profesional verificado en su zona, visite ") + (CONFIG.SITE_URL || "bullyproof.guide") + ".", 15, y);
  y += 8;
  doc.setFontSize(9); doc.setTextColor(130, 130, 130);
  if (CONFIG.MAILING_ADDRESS) { doc.text(CONFIG.MAILING_ADDRESS, 15, y); y += 5; }
  doc.textWithLink(L("Privacy policy: ", "Política de privacidad: ") + privacyUrl().replace(/^https?:\/\//, ""), 15, y, { url: privacyUrl() });

  doc.save(getLang() === "es" ? "plan-de-accion-bullyproof.pdf" : "bullyproof-action-plan.pdf");
}

// ============================================================
// LANGUAGE SELECTION (English / Español)
// ============================================================
// Order of preference: ?lang=es (a shareable Spanish link) > the parent's saved choice > a phone set
// to Spanish > English. The button in the page header lets them switch at any time; what they've
// typed is kept, and every answer is stored as the English option text so nothing is lost.
function detectInitialLanguage() {
  try { const q = new URLSearchParams(window.location.search).get("lang"); if (q === "es" || q === "en") return q; } catch (e) { /* no URL params */ }
  try { const s = localStorage.getItem("bp_lang"); if (s === "es" || s === "en") return s; } catch (e) { /* storage unavailable */ }
  try { const langs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ""]; if (/^es(-|$)/i.test(langs[0] || "")) return "es"; } catch (e) { /* no navigator */ }
  return "en";
}

function applyStaticLanguage() {
  try {
    document.documentElement.lang = getLang() === "es" ? "es" : "en";
    document.title = L("Bullyproof.Guide — Get Clarity On What's Happening", "Bullyproof.Guide — Entienda lo que está pasando");
    const f = document.getElementById("siteFooter");
    if (f) f.innerHTML = L(
      `© Bullyproof.Guide — This tool does not replace professional help. If your child is in immediate danger, call 911.<br>Are you a helping professional? <a href="https://www.bullyproof.support/join">Join the Bullyproof Support network</a>`,
      `© Bullyproof.Guide — Esta herramienta no reemplaza la ayuda profesional. Si su hijo o hija está en peligro inmediato, llame al 911.<br>¿Es usted un profesional que ayuda a otros? <a href="https://www.bullyproof.support/join">Únase a la red de Bullyproof Support</a>`);
    const pt = document.getElementById("progressTrack");
    if (pt) pt.setAttribute("aria-label", L("Assessment progress", "Progreso de la evaluación"));
    document.querySelectorAll("#langToggle button").forEach(b => {
      const on = b.dataset.lang === getLang();
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  } catch (e) { /* page chrome only — must never get in the way of the plan */ }
}

function switchLanguage(l) {
  if (l === getLang()) return;
  try {   // keep whatever the parent has typed before the screen is redrawn
    const fe = document.getElementById("finalEmail"); if (fe) state.email = fe.value.trim();
    const ti = document.getElementById("textInput"); const q = state.screen === "question" ? currentQuestion() : null;
    if (ti && q && q.type === "text") state.answers[q.id] = ti.value;
  } catch (e) { /* nothing to keep */ }
  setLang(l);
  if (state.screen === "plan") state.langChosenOnPlan = true;
  try { localStorage.setItem("bp_lang", getLang()); } catch (e) { /* storage unavailable */ }
  applyStaticLanguage();
  render();
}

function wireLanguageToggle() {
  document.querySelectorAll("#langToggle button").forEach(b => b.addEventListener("click", () => switchLanguage(b.dataset.lang)));
}

setLang(detectInitialLanguage());
applyStaticLanguage();
wireLanguageToggle();

try { if (new URLSearchParams(window.location.search).get("invite") === "1") state.screen = "invite"; } catch (e) { /* no URL params — start normally */ }
try {
  const m = window.location.pathname.match(/^\/plan\/([A-Za-z0-9_-]{24})\/?$/);
  if (m) { state.screen = "plan"; state.planId = m[1]; }
} catch (e) { /* not a plan page */ }
render();
