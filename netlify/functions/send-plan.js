// Netlify serverless function — sends the parent's action plan by email.
// The Resend API key lives only here, server-side, via an environment
// variable (RESEND_API_KEY set in Netlify's site settings) — it is never
// present in the site's public JS bundle.
//
// Deployed automatically by Netlify at:
//   /.netlify/functions/send-plan

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY is not set in this site's environment variables.");
    return { statusCode: 500, body: JSON.stringify({ error: "Email service not configured yet." }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body." }) };
  }

  const { to, subject, html } = payload;
  if (!to || !html) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing 'to' or 'html'." }) };
  }

  // Basic email format check — cheap protection against this endpoint
  // being used to spam arbitrary addresses.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid recipient address." }) };
  }

  // FROM_EMAIL: once bullyproof.guide is verified as a sending domain in
  // Resend, set FROM_EMAIL in Netlify's environment variables to something
  // like "Bullyproof.Guide <plans@bullyproof.guide>". Until then this
  // falls back to Resend's shared test sender, which works immediately
  // with no domain setup — real inboxes, just a resend.dev sender address.
  const fromAddress = process.env.FROM_EMAIL || "Bullyproof.Guide <onboarding@resend.dev>";

  try {
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject: subject || "Your Bullyproof.Guide Action Plan",
        html: html
      })
    });

    const result = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Resend API error:", result);
      return { statusCode: resendResponse.status, body: JSON.stringify({ error: result }) };
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, id: result.id }) };
  } catch (err) {
    console.error("Failed to send email:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to send email." }) };
  }
};
