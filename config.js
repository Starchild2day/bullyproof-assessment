// ============================================================
// BULLYPROOF ASSESSMENT TOOL — CONFIGURATION
// ============================================================
// This is the ONLY file that needs values pasted into it.
// Everything else is done. Fill in the 4 blanks below, save,
// and the tool is fully live. No coding needed — just paste
// values you copy from each free account's dashboard.
// ============================================================

const CONFIG = {

  // --- 1. FORMSPREE (sends you the email + all 12 answers) ---
  // Sign up free at https://formspree.io  → create a new form
  // → copy the "Form endpoint" URL it gives you (looks like
  // https://formspree.io/f/abcd1234) and paste it below.
  FORMSPREE_ENDPOINT: "https://formspree.io/f/mzezzyrz",

  // --- 2. FIREBASE (lets a parent resume on another device) ---
  // Sign up free at https://firebase.google.com → create a project
  // → Project settings → your web app → copy these values.
  // Leave these blank and the tool still works perfectly —
  // it just won't offer cross-device resume until this is filled in.
  FIREBASE_API_KEY: "",
  FIREBASE_PROJECT_ID: "",
  FIREBASE_DATABASE_URL: "",

  // --- 3. PLAUSIBLE (shows you which question parents quit on) ---
  // Sign up free trial at https://plausible.io → add your domain
  // → paste the exact domain you registered there, e.g. "assessment.bullyproof.guide"
  // Leave blank and the tool still works — you just won't get the drop-off dashboard.
  PLAUSIBLE_DOMAIN: "",

  // --- 4. WHERE THE FINISHED SITE LIVES (optional, used only for links in the PDF) ---
  SITE_URL: "https://bullyproof.guide"
};
