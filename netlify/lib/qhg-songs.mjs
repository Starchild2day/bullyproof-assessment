// One song per Quick Help Guide (Mark's own Suno songs). Buyers hear the full song: a "hear the song
// first" link under the guide's title and the player at the end. Everyone else hears a short hook clip
// on the locked preview. The Spanish guides play the English song for now.
// Full-song files have unguessable names and are only linked from buyers' pages.
export const SONGS = {
  "left-out-of-group-chats": { title: "The Ones Who Light Up", full: "/audio/qhg-24-f87e95bf8d0d.mp3", hook: "/audio/qhg-24-hook.mp3" },
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const T = {
  en: { first: "Hear this guide's song first", kicker: "This guide's song", line: "The heart of this guide, in a song you can play in the car.", preview: "Hear a little of this guide's song" },
  es: { first: "Escuche primero la canción de esta guía (en inglés)", kicker: "La canción de esta guía", line: "El corazón de esta guía, en una canción (en inglés) para escuchar en el carro.", preview: "Escuche un poco de la canción de esta guía (en inglés)" },
};

const CSS = `<style>.song-top{display:inline-flex;align-items:center;gap:.5em;margin:14px 0 0;padding:.6em 1em;border-radius:14px;background:#fff6dc;color:#1b2440;font-weight:600;text-decoration:none;border:1px solid #e9c46a}
.song-top:hover{background:#ffefc2}.song-box{margin:28px 0 8px;padding:20px;border-radius:16px;background:#14203d;color:#fff}
.song-box .k{margin:0;color:#e9c46a;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;font-weight:700}
.song-box h2{margin:.25em 0 .2em;color:#fff}.song-box p{margin:.2em 0 .8em;color:#dfe5f3}.song-box audio{width:100%}</style>`;

function box(song, lang, src, label) {
  const t = T[lang] || T.en;
  return `<section class="song-box" id="guide-song"><p class="k">${esc(label || t.kicker)}</p><h2>${esc(song.title)}</h2>` +
    `<p>${esc(t.line)}</p><audio controls preload="none" src="${esc(src)}"></audio></section>`;
}

// Buyer page: link at the top, full song at the end.
export function withSong(page, slug, lang = "en") {
  const song = SONGS[slug];
  if (!song || typeof page !== "string") return page;
  const t = T[lang] || T.en;
  const top = `<a class="song-top" href="#guide-song">♪ ${esc(t.first)}: ${esc(song.title)}</a>`;
  let out = page.replace("</head>", CSS + "</head>");
  out = out.replace(/(<header class="g-head">[\s\S]*?)(<\/header>)/, `$1${top}$2`);
  const i = out.lastIndexOf("</article>");
  if (i > -1) out = out.slice(0, i) + box(song, lang, song.full) + out.slice(i);
  return out;
}

// Locked preview: the hook clip only.
export function previewSong(slug, lang = "en") {
  const song = SONGS[slug];
  if (!song) return "";
  return CSS + box(song, lang, song.hook, (T[lang] || T.en).preview);
}
