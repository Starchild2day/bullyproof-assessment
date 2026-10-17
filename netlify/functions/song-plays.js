// Netlify function — public, read-only song play totals.
//
// Each time someone starts a song (class song page, Parents' Corner, or the Clarity Check),
// the page sends one anonymous "song_played" count to the track function. This adds those
// counts up. It shows only totals per song: no people, no dates of individual plays, no IPs.
//
//   GET /.netlify/functions/song-plays            -> { updated, total, songs: [...] }
//   GET /.netlify/functions/song-plays?since=2026-10-19   -> only plays from that day on
//
// Detail format sent by the pages: "<song>_<where>", where <where> is
//   c  = a class link (kids in class)      l  = listen-only page (parents)
//   t  = the hidden preview page (testing)  p  = Parents' Corner grown-up songs
// Class-link plays end with a school tag too: "<song>_c_pue" (Pueblo), "<song>_c_cen" (Centennial).
// Old Clarity Check plays have no detail; they are Draw the Line, played inside the plan.
"use strict";

const { openStore } = require("../lib/records.js");

const WHERE = { c: "class", l: "listen", t: "preview", p: "parents" };
const SCHOOLS = { pue: "Pueblo", cen: "Centennial" };

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return { statusCode: 405, body: "" };
  const q = event.queryStringParameters || {};
  const since = /^\d{4}-\d{2}-\d{2}$/.test(q.since || "") ? q.since : "";
  const store = openStore(event, "counts");
  if (!store) return json(503, { error: "Storage is not available." });

  let blobs = [];
  try { ({ blobs } = await store.list()); } catch (e) { return json(503, { error: "Could not read counts." }); }

  const tally = new Map();
  let total = 0;
  for (const { key } of blobs) {
    const [day, step] = key.split("/");
    if (!step || (since && day < since)) continue;
    const [ev, detail = ""] = step.split(":");
    if (ev !== "song_played") continue;
    let song = "draw_the_line", where = "clarity_check", school = "";
    const m = /^(.+)_([cltp])(?:_([a-z]{3}))?$/.exec(detail);
    if (m) { song = m[1]; where = WHERE[m[2]]; school = SCHOOLS[m[3]] || m[3] || ""; }
    else if (detail) { song = detail; where = "other"; }
    const k = song + "|" + where + "|" + school;
    tally.set(k, (tally.get(k) || 0) + 1);
    total++;
  }
  const songs = [...tally.entries()].map(([k, plays]) => { const [song, where, school] = k.split("|"); return school ? { song, where, school, plays } : { song, where, plays }; })
    .sort((a, b) => b.plays - a.plays || a.song.localeCompare(b.song));
  return json(200, { updated: new Date().toISOString(), since: since || null, total, songs });
};

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(body)
  };
}
