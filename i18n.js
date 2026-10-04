// ============================================================
// LANGUAGE SUPPORT (English / Spanish)
// ============================================================
// Every piece of parent-facing text in app.js is written as  L("English", "Español")  so the two
// languages sit side by side and can't drift apart when copy is edited. English is the default;
// the same code runs in the browser and on the server (which builds the emailed plan).
//
// RULE FOR FUTURE EDITS: if you change an English string inside L(...), change its Spanish in the
// same place. scripts/test-i18n.js fails if any Spanish is missing or if English text leaks into a
// Spanish plan.
//
// Parent answers are always stored as the exact ENGLISH option text (that is what the plan logic
// matches on); only what the parent SEES is translated.
let __lang = "en";
const __missingTranslations = [];
function setLang(l) { __lang = (l === "es") ? "es" : "en"; }
function getLang() { return __lang; }
function L(en, es) {
  if (__lang !== "es") return en;
  if (es === undefined || es === null || es === "") { __missingTranslations.push(String(en).slice(0, 90)); return en; }
  return es;
}
function missingTranslations() { return __missingTranslations.slice(); }
