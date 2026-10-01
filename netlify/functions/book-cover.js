// Netlify function — serves a recommended book's real cover image from our own address.
//
// Why: the email and the PDF both need book covers. Fetching covers straight from other sites in the
// browser can be blocked (CORS), and hot-linked images can break. This fetches the cover server-side,
// sends it back from our own domain, and lets browsers and email apps cache it for 30 days.
//
// Only ISBNs on the allowlist below are served, so this can't be used as an open image proxy.
// If no real cover can be found, it redirects to our own simple title card in /assets.

const ALLOWED = new Set([
  "9780262047357", // Behind Their Screens — Weinstein & James (2022)
  "9780738235080", // Middle School Matters — Fagell (2019)
  "9780593085271", // Thrivers — Borba (2021)
  "9781524797713", // The Power of Showing Up — Siegel & Bryson (2020)
  "9781684030491"  // Kid Confidence — Kennedy-Moore (2019)
]);

function isbn10(isbn13) {
  const core = isbn13.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(core[i]);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? "X" : String(check));
}

exports.handler = async function (event) {
  const isbn = String((event.queryStringParameters || {}).isbn || "").replace(/[^0-9X]/gi, "");
  if (!ALLOWED.has(isbn)) return { statusCode: 404, body: "Not found" };

  const sources = [
    `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`,
    `https://images-na.ssl-images-amazon.com/images/P/${isbn10(isbn)}.01.L.jpg`
  ];
  for (const url of sources) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) continue;
      const type = res.headers.get("content-type") || "";
      if (!type.startsWith("image/")) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 2000) continue; // tiny = a "no image" placeholder, not a real cover
      return {
        statusCode: 200,
        headers: { "Content-Type": type, "Cache-Control": "public, max-age=2592000" },
        body: buf.toString("base64"),
        isBase64Encoded: true
      };
    } catch (e) { /* try the next source */ }
  }
  return { statusCode: 302, headers: { Location: `/assets/cover-fallback-${isbn}.jpg`, "Cache-Control": "public, max-age=86400" }, body: "" };
};
