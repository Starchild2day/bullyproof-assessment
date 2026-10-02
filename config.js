// ============================================================
// BULLYPROOF ASSESSMENT TOOL — CONFIGURATION
// ============================================================
// This is the ONLY file that needs values pasted into it.
// Everything else is done. Fill in the 4 blanks below, save,
// and the tool is fully live. No coding needed — just paste
// values you copy from each free account's dashboard.
// ============================================================

const CONFIG = {

  // --- 1. LEADS: no longer Formspree. Every plan request is saved by the send-plan function to
  // Netlify Blobs, and safety alerts are emailed straight to you through Resend. Download leads
  // with the leads-admin function (see netlify/functions/leads-admin.js). ---

  // --- 3. VISIT COUNTS: kept privately in Netlify storage by the "track" function (no Plausible,
  // no cookies, nothing personal). Download them with the leads-admin link (&list=counts). ---

  // --- 4. WHERE THE FINISHED SITE LIVES (optional, used only for links in the PDF) ---
  SITE_URL: "https://bullyproof.guide",

  // --- 5. WHERE "RESERVE MY TRIAL" EMAIL LINKS SHOULD GO ---
  CONTACT_EMAIL: "mark@bullyproof.guide",

  // --- 6. ANTI-SPAM CHECK (optional, free) — Cloudflare Turnstile SITE key ---
  // Create a free Turnstile widget at dash.cloudflare.com, paste the SITE key here,
  // and put the SECRET key in Netlify as TURNSTILE_SECRET_KEY. Blank = check is off.
  TURNSTILE_SITE_KEY: "",

  // --- 7. MAILING ADDRESS shown at the bottom of every email (good practice / required for marketing email) ---
  MAILING_ADDRESS: "Bullyproof.Guide, 11720 S. Foothills Blvd, Suite 234, Yuma, AZ 85367",

  // --- 8. PRIVACY POLICY address. Blank = the copy hosted with this tool (/privacy/).
  // When the policy is also posted on bullyproof.guide, put that full address here. ---
  PRIVACY_URL: ""
};
