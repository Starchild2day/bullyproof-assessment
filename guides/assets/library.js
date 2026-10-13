/* Bullyproof Quick Help Guides — description search.
   Parents type what's happening in their own words; we match against Mark's parent-phrase
   vocabulary, the titles, and distinctive words from each guide. Crisis words always pin the
   free crisis guide first. No results never dead-ends: it falls back to the sections. */
(function () {
  var CRISIS = /(want(s|ed)?\s+to\s+die|wish(es)?\s+(he|she|they|i)\s+(was|were|wasn'?t|weren'?t)\s+(dead|born)|kill(ing)?\s+(him|her|them|my|your)sel|suicid|self[\s-]?harm|hurt(ing|s)?\s+(him|her|them)sel|cutting\s+(him|her|them)sel|cuts?\s+(him|her|them)sel|do(es)?n'?t\s+want\s+to\s+(be\s+here|live|be\s+alive)|end(ing)?\s+(it\s+all|(his|her|their|my)\s+life)|can'?t\s+go\s+on|better\s+off\s+without\s+(him|her|me|them)|not\s+be\s+(here|around)\s+(anymore|next)|overdose)/i;
  var STOP = ("a an and the to of in on at is are was were be been it its i im i'm my me we our you your he she him her his hers they them their " +
    "this that these those with for from about what how when do does did doesnt dont not no so just really very " +
    "child kid kids son daughter boy girl teen children can cant will would should could has have had get got keep keeps " +
    "anymore all any some there here").split(" ");
  var stop = {}; STOP.forEach(function (w) { stop[w] = 1; });
  var SYN = { cyber: "online", cyberbullying: "online", texting: "texts", text: "texts", insta: "instagram", snap: "snapchat",
    bus: "bus", excluded: "left", exclude: "left", ignoring: "ignored", ignores: "ignored", crying: "cries", cry: "cries",
    sobbing: "cries", tears: "cries", talking: "talk", talks: "talk", fight: "fighting", fights: "fighting", hitting: "hit",
    hits: "hit", popular: "popular", teacher: "teacher", teachers: "teacher", principal: "principal", weight: "weight",
    fat: "weight", looks: "looks", appearance: "looks", homeschool: "homeschooled", quit: "quit", quitting: "quit" };

  function norm(s) {
    return (" " + String(s || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ") + " ").replace(/\s+/g, " ");
  }
  function stem(w) {
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

  fetch("/guides/assets/index.json").then(function (r) { return r.json(); }).then(function (d) {
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
    return '<a class="res' + (extra || "") + '" href="/guides/' + e.slug + '/"><span class="s">' + esc(e.section) +
      (e.free ? ' · Free' : '') + '</span><span class="t">' + esc(e.title) + '</span><span class="l">' + esc(e.line) + "</span></a>";
  }

  var timer;
  function run() {
    if (!DATA) return;
    var q = $q.value.trim();
    document.body.classList.toggle("typing", q.length > 0);
    if (q.length < 2) { $r.innerHTML = ""; return; }
    var qn = norm(q), qt = toks(q), out = "", crisis = CRISIS.test(q.toLowerCase().replace(/[’]/g, "'"));
    var ranked = DATA.map(function (d) { return { d: d, s: score(d, qn, qt) }; })
      .filter(function (x) { return x.s >= 3 && !(crisis && x.d.e.crisis) && !(!crisis && x.d.e.crisis && x.s < 10); })
      .sort(function (a, b) { return b.s - a.s; }).slice(0, crisis ? 4 : 6);
    if (crisis) {
      var c = DATA.filter(function (d) { return d.e.crisis; })[0].e;
      out += '<div class="crisis-box"><b>If your child may be in danger right now, call 911.</b> For thoughts of suicide, call or text <a href="tel:988">988</a> (Suicide &amp; Crisis Lifeline), or text HOME to <a href="sms:741741&body=HOME">741741</a>. Both are free, any time.</div>';
      out += card(c, " crisis");
    }
    if (ranked.length) {
      out = (crisis ? "" : '<p class="res-head">Best match' + (ranked.length > 1 ? "es" : "") + " for what you described</p>") + out;
      ranked.forEach(function (x) { out += card(x.d.e); });
    } else if (!crisis) {
      out = '<div class="nores">Nothing matched those exact words yet. Try describing it another way, like what your child said or did, or <a href="#contents">look through the situations below</a>. Each heading describes what parents are seeing at home.</div>';
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
    if (owns) { btn.textContent = "You have all 25 guides"; btn.className = "btn navy"; btn.href = "#contents"; note.textContent = "Open any guide above."; }
    else if (url) { btn.href = url; }
    else { btn.className = "btn disabled"; btn.removeAttribute("href"); btn.textContent = "Checkout opening soon"; }
  }
  if (owns) { var o = document.getElementById("owner-note"); if (o) o.hidden = false; }
})();
