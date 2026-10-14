/* Bullyproof Quick Help Guides — description search.
   Parents type what's happening in their own words; we match against Mark's parent-phrase
   vocabulary, the titles, and distinctive words from each guide. Crisis words always pin the
   free crisis guide first. No results never dead-ends: it falls back to the sections. */
// Turn on when the Spanish library is approved: English pages then show the "Español" switch.
var QHG_SPANISH_LIVE = false;
var QHG_ES = document.documentElement.lang === "es";
var QHG_BASE = QHG_ES ? "/guides/es/" : "/guides/";
function QL(en, es) { return QHG_ES ? es : en; }
(function () {
  var CRISIS_ES = /(quiere(n)?\s+morir(se)?|quisiera\s+morir|desea(ria)?\s+(estar\s+muert|morir|no\s+haber\s+nacido)|matar(se|me|te)|suicid|quitar(se|me)\s+la\s+vida|hacer(se|me)\s+dano|lastimar(se|me)|autolesi|cortar(se|me)|se\s+corta|no\s+quiere\s+(estar\s+aqui|vivir|seguir)|ya\s+no\s+quiere\s+(estar|vivir)|mejor\s+sin\s+(el|ella|mi|nosotros)|acabar\s+con\s+(todo|su\s+vida)|no\s+aguanta\s+mas|sobredosis)/;
  var CRISIS = /(want(s|ed)?\s+to\s+die|wish(es)?\s+(he|she|they|i)\s+(was|were|wasn'?t|weren'?t)\s+(dead|born)|kill(ing)?\s+(him|her|them|my|your)sel|suicid|self[\s-]?harm|hurt(ing|s)?\s+(him|her|them)sel|cutting\s+(him|her|them)sel|cuts?\s+(him|her|them)sel|do(es)?n'?t\s+want\s+to\s+(be\s+here|live|be\s+alive)|end(ing)?\s+(it\s+all|(his|her|their|my)\s+life)|can'?t\s+go\s+on|better\s+off\s+without\s+(him|her|me|them)|not\s+be\s+(here|around)\s+(anymore|next)|overdose)/i;
  var STOP = ("a an and the to of in on at is are was were be been it its i im i'm my me we our you your he she him her his hers they them their " +
    "this that these those with for from about what how when do does did doesnt dont not no so just really very " +
    "child kid kids son daughter boy girl teen children can cant will would should could has have had get got keep keeps " +
    "anymore all any some there here").split(" ").concat(("el la los las un una unos unas y o de del al a en con por para que se su sus mi mis tu es son esta estan esto eso ese esa lo le les me te nos ya no si muy mas pero como cuando porque hijo hija hijos hijas nino nina ninos ninas mi hijo me dice dice tiene hace").split(" "));
  var stop = {}; STOP.forEach(function (w) { stop[w] = 1; });
  var SYN = { cyber: "online", cyberbullying: "online", texting: "texts", text: "texts", insta: "instagram", snap: "snapchat",
    bus: "bus", excluded: "left", exclude: "left", ignoring: "ignored", ignores: "ignored", crying: "cries", cry: "cries",
    sobbing: "cries", tears: "cries", talking: "talk", talks: "talk", fight: "fighting", fights: "fighting", hitting: "hit",
    hits: "hit", popular: "popular", teacher: "teacher", teachers: "teacher", principal: "principal", weight: "weight",
    fat: "weight", looks: "looks", appearance: "looks", homeschool: "homeschooled", quit: "quit", quitting: "quit" };

  function fold(s) { s = String(s || "").toLowerCase(); try { s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) {} return s; }
  function norm(s) {
    return (" " + fold(s).replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ") + " ").replace(/\s+/g, " ");
  }
  function stem(w) {
    if (QHG_ES) {
      if (w.length > 6 && /(ando|iendo)$/.test(w)) return w.replace(/(ando|iendo)$/, "");
      if (w.length > 5 && /(ado|ada|ido|ida)s?$/.test(w)) return w.replace(/(ado|ada|ido|ida)s?$/, "");
      if (w.length > 4 && /es$/.test(w)) return w.slice(0, -2);
      if (w.length > 3 && /[aeo]s$/.test(w)) return w.slice(0, -1);
      return w;
    }
    if (SYN[w]) w = SYN[w];
    if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3);
    if (w.length > 4 && /ed$/.test(w)) return w.slice(0, -2);
    if (w.length > 4 && /es$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function toks(s) {
    return norm(s).trim().split(" ").filter(function (w) { return w.length > 1 && !stop[w]; }).map(stem);
  }

  var DATA = null, $q = document.getElementById("q"), $r = document.getElementById("results");
  if (!$q) return;

  fetch(QHG_ES ? "/guides/assets/index-es.json" : "/guides/assets/index.json").then(function (r) { return r.json(); }).then(function (d) {
    DATA = d.map(function (e) {
      return { e: e, title: toks(e.title), phrases: e.phrases.map(function (p) { return { n: norm(p), t: toks(p) }; }),
        kw: e.kw.map(stem), line: toks(e.line) };
    });
    if ($q.value) run();
    var h = location.hash.match(/q=([^&]+)/); if (h) { $q.value = decodeURIComponent(h[1]); run(); }
  });

  function score(d, qn, qt) {
    var s = 0, set = {}; qt.forEach(function (t) { set[t] = 1; });
    d.phrases.forEach(function (p) {
      if (p.n.length > 3 && qn.indexOf(p.n) > -1) { s += 12; return; }
      if (!p.t.length) return;
      var hit = p.t.filter(function (t) { return set[t]; }).length;
      var r = hit / p.t.length;
      if (r >= 0.5) s += 6 * r * Math.min(p.t.length, 3) / 2;
    });
    d.title.forEach(function (t) { if (set[t]) s += 3; });
    d.line.forEach(function (t) { if (set[t]) s += 0.8; });
    d.kw.forEach(function (t) { if (set[t]) s += 1.2; });
    return s;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function card(e, extra) {
    return '<a class="res' + (extra || "") + '" href="' + QHG_BASE + e.slug + '/"><span class="s">' + esc(e.section) +
      (e.free ? QL(' · Free', ' · Gratis') : '') + '</span><span class="t">' + esc(e.title) + '</span><span class="l">' + esc(e.line) + "</span></a>";
  }

  var timer;
  function run() {
    if (!DATA) return;
    var q = $q.value.trim();
    document.body.classList.toggle("typing", q.length > 0);
    if (q.length < 2) { $r.innerHTML = ""; return; }
    var qn = norm(q), qt = toks(q), out = "", crisis = QHG_ES ? CRISIS_ES.test(norm(q)) : CRISIS.test(q.toLowerCase().replace(/[’]/g, "'"));
    var ranked = DATA.map(function (d) { return { d: d, s: score(d, qn, qt) }; })
      .filter(function (x) { return x.s >= 3 && !(crisis && x.d.e.crisis) && !(!crisis && x.d.e.crisis && x.s < 10); })
      .sort(function (a, b) { return b.s - a.s; }).slice(0, crisis ? 4 : 6);
    if (crisis) {
      var c = DATA.filter(function (d) { return d.e.crisis; })[0].e;
      out += QL('<div class="crisis-box"><b>If your child may be in danger right now, call 911.</b> For thoughts of suicide, call or text <a href="tel:988">988</a> (Suicide &amp; Crisis Lifeline), or text HOME to <a href="sms:741741&body=HOME">741741</a>. Both are free, any time.</div>',
        '<div class="crisis-box"><b>Si su hijo puede estar en peligro ahora mismo, llame al 911.</b> Si hay pensamientos de suicidio, llame al <a href="tel:988">988</a> y oprima 2 para español, o envíe AYUDA por texto al <a href="sms:988&body=AYUDA">988</a> o al <a href="sms:741741&body=AYUDA">741741</a>. Es gratis, a cualquier hora.</div>');
      out += card(c, " crisis");
    }
    if (ranked.length) {
      out = (crisis ? "" : '<p class="res-head">' + QL("Best match" + (ranked.length > 1 ? "es" : "") + " for what you described", (ranked.length > 1 ? "Las guías que más se parecen" : "La guía que más se parece") + " a lo que describió") + "</p>") + out;
      ranked.forEach(function (x) { out += card(x.d.e); });
    } else if (!crisis) {
      out = QL('<div class="nores">Nothing matched those exact words yet. Try describing it another way, like what your child said or did, or <a href="#contents">look through the situations below</a>. Each heading describes what parents are seeing at home.</div>',
        '<div class="nores">Todavía no encontramos esas palabras exactas. Pruebe a describirlo de otra forma, por ejemplo lo que su hijo dijo o hizo, o <a href="#contents">revise las situaciones de abajo</a>. Cada título describe lo que los padres están viendo en casa.</div>');
    }
    $r.innerHTML = out;
    try { history.replaceState(null, "", "#q=" + encodeURIComponent(q)); } catch (e) {}
  }
  $q.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(run, 160); });
  Array.prototype.forEach.call(document.querySelectorAll(".ex"), function (b) {
    b.addEventListener("click", function () { $q.value = b.textContent; run(); $q.focus(); });
  });
  var contents = document.querySelector(".contents"); if (contents) contents.id = "contents";

  // Buy button + owner note
  var btn = document.getElementById("buy-btn"), note = document.getElementById("buy-note");
  var url = (window.QHG_CONFIG && window.QHG_CONFIG.CHECKOUT_URL) || "";
  var owns = /(?:^|;\s*)qhg_has=1/.test(document.cookie);
  if (btn) {
    if (owns) { btn.textContent = QL("You have all 25 guides", "Ya tiene las 25 guías"); btn.className = "btn navy"; btn.href = "#contents"; note.textContent = QL("Open any guide above.", "Abra cualquier guía de arriba."); }
    else if (url) { btn.href = url; }
    else { btn.className = "btn disabled"; btn.removeAttribute("href"); btn.textContent = QL("Checkout opening soon", "El pago abre muy pronto"); }
  }
  if (owns) { var o = document.getElementById("owner-note"); if (o) o.hidden = false; }
})();

/* Help Another Parent: wire every share card on the page */
(function () {
  function copy(text) {
    if (navigator.clipboard) return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
    return Promise.resolve(fallback());
    function fallback() { try { var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); var ok = document.execCommand("copy"); ta.remove(); return ok; } catch (e) { return false; } }
  }
  Array.prototype.forEach.call(document.querySelectorAll(".share-card"), function (card) {
    var link = new URL(card.getAttribute("data-share-url"), location.origin).toString(), msg = card.getAttribute("data-share-msg");
    var status = card.querySelector(".share-status"), opts = card.querySelector(".share-options");
    function say(t) { status.textContent = t; }
    card.querySelector(".sb-sms").href = "sms:?&body=" + encodeURIComponent(msg + " " + link);
    card.querySelector(".sb-email").href = "mailto:?subject=" + encodeURIComponent(QL("A free resource I thought you'd appreciate", "Un recurso gratis que pensé que le serviría")) + "&body=" + encodeURIComponent(msg + "\n\n" + link);
    card.querySelector(".sb-share").addEventListener("click", function () {
      if (navigator.share) {
        navigator.share({ title: QL("Bullyproof Parent Clarity Check", "Chequeo de Claridad para Padres de Bullyproof"), text: msg, url: link })
          .then(function () { say(QL("Thank you for sharing.", "Gracias por compartir.")); }, function (e) { if (!e || e.name !== "AbortError") opts.hidden = false; });
      } else { opts.hidden = false; }
    });
    card.querySelector(".sb-copy").addEventListener("click", function () {
      copy(link).then(function (ok) { say(ok ? QL("Link copied. Paste it anywhere to share.", "Enlace copiado. Péguelo donde quiera para compartirlo.") : link); });
    });
    card.querySelector(".sb-copymsg").addEventListener("click", function () {
      copy(msg + " " + link).then(function (ok) { say(ok ? QL("Message copied. Paste it into a text or email.", "Mensaje copiado. Péguelo en un mensaje de texto o correo.") : msg + " " + link); });
    });
  });
})();

/* Language: remember the reader's language (so checkout and private links bring them back to it),
   and show the English/Español switch. Spanish pages always link back to English; English pages
   show "Español" once QHG_SPANISH_LIVE (top of this file) is on. */
(function () {
  try { document.cookie = "qhg_lang=" + (QHG_ES ? "es" : "en") + "; path=/guides; max-age=34560000; samesite=lax; secure"; } catch (e) {}
  var live = QHG_ES || QHG_SPANISH_LIVE;
  var bar = document.querySelector(".top-in"); if (!bar || !live) return;
  var path = location.pathname, other;
  if (QHG_ES) other = path.replace(/^\/guides\/es(\/|$)/, "/guides/");
  else other = path.replace(/^\/guides\/?/, "/guides/es/");
  if (/\/(access|unlock)(\/|$)/.test(other)) other = QHG_ES ? "/guides/" : "/guides/es/";
  var a = document.createElement("a");
  a.className = "lang-switch"; a.href = other; a.lang = QHG_ES ? "en" : "es";
  a.textContent = QHG_ES ? "English" : "Español";
  var search = bar.querySelector(".top-search");
  var wrapR = document.createElement("div"); wrapR.className = "top-right";
  bar.insertBefore(wrapR, search); wrapR.appendChild(a); if (search) wrapR.appendChild(search);
})();
