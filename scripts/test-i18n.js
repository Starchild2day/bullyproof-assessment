// Tests for the English/Spanish support.   Run:  node scripts/test-i18n.js
// What it guards: (1) every question/option/resource has Spanish, (2) no L("English","Español") is missing its
// Spanish, (3) Spanish plans never fall back to English text, (4) crisis language written in Spanish is caught,
// (5) every step still gets its bold heading in Spanish.  Add a scenario here whenever you add a new kind of answer.
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const src = ["config.js", "i18n.js", "assessment-data.js", "assessment-data.es.js", "app.js"].map(read).join("\n").split("\n").filter((l) => l.trim() !== "render();").join("\n");
const stub = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, appendChild() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], dataset: {} });
const makeCtx = () => vm.createContext({ window: { location: { origin: "https://assessment.bullyproof.guide", search: "" }, addEventListener() {}, scrollTo() {} },
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: stub, addEventListener() {}, body: stub(), head: stub(), documentElement: {} },
  localStorage: { getItem: () => null, setItem() {} }, navigator: { language: "en-US", languages: ["en-US"] }, URLSearchParams, console: { log() {}, warn() {}, error() {} }, fetch: async () => ({ ok: true }) });
const ctx = makeCtx(); vm.runInContext(src, ctx);
const run = (code) => vm.runInContext(code, ctx);
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { (ok ? pass++ : fail++); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  <-- " + extra}`); };

// ---------- 1. coverage of the question data ----------
const Q = run("QUESTIONS"), QES = run("QUESTIONS_ES"), OES = run("OPTIONS_ES"), NES = run("RESOURCE_NAME_ES"), DES = run("RESOURCE_DETAIL_ES"), SV = run("SAFETY_VARIANTS"), GR = run("GENERIC_RESOURCES");
const missingQ = [], englishOptions = new Set();
for (const q of Q) {
  const es = QES[q.id] || {};
  for (const k of ["title", "sub", "preventTitle", "preventSub"]) if (q[k] && !es[k]) missingQ.push(`${q.id}.${k}`);
  for (const k of Object.keys(es)) if (!q[k]) missingQ.push(`${q.id}.${k} (Spanish exists but English does not)`);
  [...(q.options || []), ...(q.preventExtra || []), ...Object.values(q.preventReplace || {})].forEach((o) => englishOptions.add(o));
}
check("every question title/subtitle has Spanish (and no stray Spanish)", missingQ.length === 0, missingQ.join("; "));
const missingO = [...englishOptions].filter((o) => !OES[o]);
check("every answer option has Spanish", missingO.length === 0, missingO.map((o) => o.slice(0, 40)).join(" | "));
const strayO = Object.keys(OES).filter((o) => !englishOptions.has(o));
check("no Spanish option text without a matching English option (typo guard)", strayO.length === 0, strayO.join(" | "));
const allRes = [...Object.values(SV).flatMap((v) => v.resources), ...GR];
check("every crisis resource name and instruction has Spanish", allRes.every((r) => NES[r.name] && DES[r.detail]), JSON.stringify(allRes.filter((r) => !NES[r.name] || !DES[r.detail])));
check("Spanish 988 instruction says press 2 / text AYUDA (verified against 988lifeline.org)", /oprima 2/.test(DES["Call or text 988"]) && /AYUDA/.test(DES["Call or text 988"]));
check("Spanish Crisis Text Line instruction uses AYUDA to 741741 (verified against crisistextline.org)", /AYUDA/.test(DES["Text HOME to 741741"]) && /741741/.test(DES["Text HOME to 741741"]));

// ---------- 2 + 3. render Spanish plans; no missing Spanish, and no L() that returns English ----------
run(`globalThis.__pairs = []; const __origL = L; L = function (en, es) { const out = __origL(en, es); if (getLang() === "es") __pairs.push([en, es, out]); return out; };`);
const opt = (id, frag) => Q.find((q) => q.id === id).options.find((o) => o.includes(frag));
const base = { q2: opt("q2", "treated badly"), q8: opt("q8", "told me clearly") };
const scenarios = [
  { q1: "5–7", q2: Q[1].options[4] },
  { q1: "15–18", q2: Q[1].options[4], q12: "¿Qué le puedo decir a mi hijo para animarlo?" },
  { q1: "8–10", ...base, q6: [opt("q6", "irritable")], q7: [opt("q7", "social media")], q9: [opt("q9", "called names")], q10: opt("q10", "nothing has changed"), q11: opt("q11", "primarily online"), q12: "Cómo puedo ayudarla" },
  { q1: "11–14", q2: opt("q2", "concerning at school"), q6: [opt("q6", "Reluctant")], q7: [opt("q7", "At school")], q8: opt("q8", "hints"), q10: opt("q10", "don't know how to start"), q11: opt("q11", "only happening in person") },
  { q1: "5–7", q2: opt("q2", "not sure yet"), q6: [opt("q6", "Withdrawing")], q8: opt("q8", "behavior tells me"), q10: opt("q10", "doesn't want me") },
  { q1: "15–18", q2: opt("q2", "not sure yet"), q6: [opt("q6", "Avoiding")], q8: opt("q8", "behavior tells me") },
  { q1: "8–10", q2: opt("q2", "treated badly"), q12: "Quiero saber cómo evitar matar a alguien" },
  { q1: "11–14", ...base, q9: [opt("q9", "pressuring them sexually")] },
  { q1: "8–10", ...base, q4: "Mis dos hijos están sufriendo. Siento que es mi culpa." },
  { q1: "5–7", ...base, q4: "Mi hija llora cada noche", q9: [opt("q9", "hit, pushed")], q3: [opt("q3", "scratches or bruises"), opt("q3", "sleep")] }
];
const email = (ans, consent) => run(`state.answers = ${JSON.stringify(ans)}; state.safetyFlags = []; state.marketingConsent = ${!!consent}; QUESTIONS.forEach(q => { const v = state.answers[q.id]; if (v === undefined) return; if (q.type === "text") checkTextSafety(v); else checkSafety(q, v); }); buildEmailHtml();`);
run('setLang("es")');
const htmls = scenarios.flatMap((s) => [email(s, false), email(s, true)]);
check("Spanish plans are produced for every scenario", htmls.every((h) => h.length > 4000));
check("no piece of Spanish copy is missing its Spanish (checked on every L call)", run("missingTranslations()").length === 0, JSON.stringify(run("missingTranslations()").slice(0, 3)));
const pairs = JSON.parse(run("JSON.stringify(__pairs)"));
const same = pairs.filter(([en, es]) => es === en && /[A-Za-z]{3,}\s+[A-Za-z]{2,}/.test(en));
check("no L() returns the English sentence in a Spanish plan", same.length === 0, JSON.stringify(same.slice(0, 3)));
const leak = htmls.filter((h) => /Your Personalized Action Plan|Start collecting|What actually helps|Your next 3 steps|A nightly opportunity/.test(h));
check("Spanish plan has none of the English section headings", leak.length === 0);
check("Spanish plan is marked lang=es for screen readers", htmls.every((h) => /lang="es"/.test(h)));
check("English books are labeled as English editions in Spanish", htmls.filter((h) => /Recomendad|Lecturas/.test(h)).every((h) => /libro en inglés/.test(h)));

// ---------- 4. crisis language written in Spanish (with and without accents) ----------
const flagsFor = (text) => run(`state.safetyFlags = []; checkTextSafety(${JSON.stringify(text)}); state.safetyFlags.slice()`);
const mustSelf = ["Mi hija dice que quiere morir", "Se quiere matar", "no quiere vivir", "Ya no quiere seguir viviendo", "Habló de suicidio", "Se quiere quitar la vida", "Quiere hacerse daño", "se quiere hacer dano", "tiene pensamientos suicidas", "Me quiero morir", "dice que mejor estaría muerto", "QUIERE QUITARSE LA VIDA", "quiere lastimarse"];
const mustViolence = ["Aprender cómo evitar matar a alguien", "Quiero hacerle daño", "quiero lastimarlo", "voy a matarlo", "lo voy a matar", "amenazó con matar a otro niño", "quiero hacerles dano"];
const mustNot = ["Mi hija está muy triste y callada", "Quiero ayudar a mi hijo a ser más seguro", "No quiere ir a la escuela", "Me preocupa que lo molesten en el autobús", "Quiero que aprenda a defenderse con palabras", "Se burlan de él", "Tiene dolores de estómago", "Cómo hablar con mi hijo sobre esto", "Mi hijo es muy sensible", "Necesito ideas para que tenga más confianza", "La maestra no responde mis correos"];
const badSelf = mustSelf.filter((t) => !flagsFor(t).includes("selfHarmOrSuicide"));
check(`Spanish self-harm phrases are caught (${mustSelf.length})`, badSelf.length === 0, badSelf.join(" | "));
const badViol = mustViolence.filter((t) => !flagsFor(t).includes("violenceRisk"));
check(`Spanish violence phrases are caught (${mustViolence.length})`, badViol.length === 0, badViol.join(" | "));
const badNot = mustNot.filter((t) => flagsFor(t).length > 0);
check(`ordinary Spanish worries do NOT trigger crisis resources (${mustNot.length})`, badNot.length === 0, badNot.join(" | "));
check("English crisis phrases still caught after the change", flagsFor("I want to kill myself").includes("selfHarmOrSuicide") && flagsFor("Learn how to keep from killing someone").includes("violenceRisk") && flagsFor("She is sad and quiet").length === 0);
const emailFlag = email({ q1: "8–10", q2: opt("q2", "treated badly"), q12: "Aprender cómo evitar matar a alguien" });
check("Spanish crisis plan leads with Spanish crisis resources (988: oprima 2)", emailFlag.indexOf("Por favor, comuníquese primero") > -1 && emailFlag.indexOf("Por favor, comuníquese primero") < emailFlag.indexOf("Lo que de verdad ayuda") && /oprima 2/.test(emailFlag) && /AYUDA/.test(emailFlag));

// ---------- 5. other Spanish detectors ----------
const asked = (t) => run(`state.answers = { q12: ${JSON.stringify(t)} }; askedForWords()`);
check("Spanish 'what should I say' requests are recognized", ["¿Qué le puedo decir a mi hijo?", "Qué le digo para animarlo", "Necesito las palabras correctas", "Cómo hablarle a mi hija"].every(asked));
check("Spanish non-requests are not mistaken for 'what should I say'", !asked("Cómo sé si le hacen bullying") && !asked("Quiero que esté segura en la escuela"));
check("Spanish 'both kids' is recognized", ["Mis dos hijos están mal", "Ambos niños sufren", "los dos están tristes", "mis hijas"].every((t) => run(`state.answers = { q4: ${JSON.stringify(t)} }; mentionsMultipleChildren()`)));
check("Spanish self-blame is recognized", run(`state.answers = { q4: "Siento que es mi culpa, algo que hice" }; selfReflectionNote()`) !== null);
const g = (t) => run(`state.answers = { q4: ${JSON.stringify(t)} }; detectChildGender()`);
check("child's gender is picked up from Spanish wording", g("Mi hijo no quiere ir") === "boy" && g("Mi hija llora mucho") === "girl" && g("Ella está callada") === "girl" && g("Él no habla") === "boy" && g("Está muy callado") === "unknown");

// ---------- 6. every step keeps its bold heading in Spanish ----------
const titled = scenarios.every((s) => run(`state.answers = ${JSON.stringify(s)}; stepParts().every(([t]) => !!t)`));
check("every plan step has a bold heading in Spanish", titled);
run('setLang("en")');
const titledEn = scenarios.every((s) => run(`state.answers = ${JSON.stringify(s)}; stepParts().every(([t]) => !!t)`));
check("every plan step has a bold heading in English (unchanged)", titledEn);
check("switching back to English restores English text", /Your Personalized Action Plan/.test(email(scenarios[0])));

// ---------- 7. the bedtime essay keeps the same paragraph structure in both languages ----------
const essay = (lang) => run(`setLang("${lang}"); state.answers = { q1: "8–10", q2: "I'm trying to prevent problems before they start" }; sunbeamResource().introCaption`);
const parasEs = essay("es").split("\n\n").length, parasEn = essay("en").split("\n\n").length;
check("bedtime essay has the same number of paragraphs in Spanish and English", parasEs === parasEn && parasEn >= 4, `es=${parasEs} en=${parasEn}`);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
