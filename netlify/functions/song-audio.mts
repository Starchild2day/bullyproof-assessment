// Plays Mark's Suno songs with our own player (so a song plays once, with a Repeat button,
// instead of Suno's embed, which loops forever).
//
// GET /audio/<suno-song-id>.mp3
//   1. Only songs on Mark's own Suno account are served (checked once against Suno, then remembered).
//   2. The first request copies the audio from Suno into this site's storage; after that it's served
//      from storage. Mark's paid Suno plan gives him the rights to his songs.
//   3. Supports "Range" requests, which iPhones and iPads need to play audio at all.
import { getStore } from "@netlify/blobs";

const OWNER = "markshiningmission";
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SUNO_HEADERS = {
  "Referer": "https://suno.com/",
  "Origin": "https://suno.com",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
};

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges" };

function fail(status: number, why: string) {
  return new Response(why, { status, headers: { ...CORS, "Content-Type": "text/plain", "Cache-Control": "no-store" } });
}

async function ownedByMark(id: string): Promise<boolean | null> {
  try {
    const r = await fetch(`https://studio-api.prod.suno.com/api/clip/${id}`, { headers: SUNO_HEADERS });
    if (!r.ok) return null;
    const j: any = await r.json();
    const handle = String(j.handle || j.user_handle || "").toLowerCase();
    return handle === OWNER;
  } catch { return null; }
}

// Real, playable audio only: an MP3 starts with "ID3" or an MPEG frame sync byte pair.
// (Suno's streaming copies are scrambled for its own player, so we never store those.)
function isMp3(buf: ArrayBuffer | null): boolean {
  if (!buf || buf.byteLength < 4) return false;
  const b = new Uint8Array(buf, 0, 4);
  return (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
}

// The plain MP3 download that Mark's paid Suno plan provides.
async function copyFromSuno(id: string): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(`https://cdn1.suno.ai/${id}.mp3`, { headers: SUNO_HEADERS });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    return isMp3(buf) ? buf : null;
  } catch { return null; }
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Allow-Headers": "Range" } });
  if (req.method !== "GET" && req.method !== "HEAD") return fail(405, "Method not allowed");

  const name = new URL(req.url).pathname.split("/").pop() || "";
  const id = name.replace(/\.(mp3|m4a)$/, "").toLowerCase();
  if (!ID_RE.test(id)) return fail(404, "Not found");

  const store = getStore("song-audio");
  let data: ArrayBuffer | null = await store.get(id, { type: "arrayBuffer" });
  if (data && !isMp3(data)) { await store.delete(id); data = null; }  // clear any unplayable copy

  if (!data) {
    const owned = await ownedByMark(id);
    if (owned === false) return fail(403, "Not one of our songs");
    if (owned === null) return fail(502, "Couldn't check the song with Suno");
    const copied = await copyFromSuno(id);
    if (!copied) return fail(502, "Couldn't copy the song from Suno");
    await store.set(id, copied);
    data = copied;
  }

  const total = data.byteLength;
  const base = { ...CORS, "Content-Type": "audio/mpeg", "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=604800" };
  const range = req.headers.get("range");
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (m) {
    let start = m[1] === "" ? Math.max(0, total - Number(m[2])) : Number(m[1]);
    let end = m[1] !== "" && m[2] !== "" ? Math.min(Number(m[2]), total - 1) : total - 1;
    if (start >= total || start > end) return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${total}` } });
    const body = req.method === "HEAD" ? null : data.slice(start, end + 1);
    return new Response(body, { status: 206, headers: { ...base, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(end - start + 1) } });
  }
  return new Response(req.method === "HEAD" ? null : data, { status: 200, headers: { ...base, "Content-Length": String(total) } });
};

export const config = { path: "/audio/*" };
