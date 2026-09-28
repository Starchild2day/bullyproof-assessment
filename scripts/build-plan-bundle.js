// Builds netlify/lib/plan-bundle.js from the SAME files the browser runs
// (config.js + assessment-data.js + app.js), so the email the server sends is
// built by exactly the same code as the on-screen plan and the PDF — one source of truth.
//
// Netlify runs this on every deploy (see netlify.toml). To run it yourself:
//   node scripts/build-plan-bundle.js
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

const config = read("config.js");
const data = read("assessment-data.js");
// app.js ends by calling render() to draw the page in a browser — the server has no page to draw.
const app = read("app.js").split("\n").filter((l) => l.trim() !== "render();").join("\n");

const header = `// GENERATED FILE — DO NOT EDIT BY HAND.
// Built by scripts/build-plan-bundle.js from config.js + assessment-data.js + app.js.
module.exports = function createPlanBuilder(ORIGIN) {
  const window = { location: { origin: ORIGIN, search: "" }, addEventListener() {} };
  const stubEl = () => ({ style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
  const document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: stubEl, addEventListener() {}, body: stubEl(), head: stubEl() };
  const localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const console = { log() {}, info() {}, warn: globalThis.console.warn.bind(globalThis.console), error: globalThis.console.error.bind(globalThis.console) };
`;
const footer = `
  return { CONFIG, state, QUESTIONS, SAFETY_VARIANTS, buildEmailHtml, checkSafety, checkTextSafety };
};
`;
const out = header + config + "\n" + data + "\n" + app + "\n" + footer;
const dest = path.join(root, "netlify", "lib", "plan-bundle.js");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log("Built netlify/lib/plan-bundle.js (" + Math.round(out.length / 1024) + " KB)");
