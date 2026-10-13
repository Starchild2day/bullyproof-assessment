#!/usr/bin/env python3
"""Builds The Bullyproof Quick Help Guides library from Mark's source guides.

Output:
  guides/                              static pages (library home, free Guide 20, assets)
  netlify/lib/qhg-content.enc.mjs      encrypted paid guide pages (served only to buyers)
"""
import json, re, math, os, html, shutil
from collections import Counter
import markdown

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get("QHG_SRC", "/home/claude/guides/src")  # private guide sources (from Marketing Secrets)
REPO = os.path.abspath(os.path.join(ROOT, "..", ".."))
PUB = os.path.join(REPO, "guides")
FN = os.path.join(REPO, "netlify", "lib")
KEYFILE = os.environ["QHG_KEYFILE"]  # file holding the hex QHG_CONTENT_KEY; never commit it

PRODUCT = "The Bullyproof Quick Help Guides"
PRICE = "$37"

# ---------------------------------------------------------------------------
# The library, in the order from Mark's Bundle Packaging & Launch Plan.
# Numbers stay internal; parents never see them.
# ---------------------------------------------------------------------------
SECTIONS = [
    ("When Something Feels Wrong", [1, 2, 5, 9]),
    ("When It's Out in the Open", [3, 4, 6, 12]),
    ("When It's Affecting Their Body and Their Days", [7, 8, 11, 14]),
    ("When It's Happening on a Screen", [10]),
    ("When They're Trying to Get Help", [17, 19]),
    ("When It's Gone Sideways", [13]),
    ("When It's About Who They Are", [21, 22, 23]),
    ("When There's No Adult Around", [24, 25]),
    ("When It's Serious", [20]),
    ("Before and After", [16, 18, 15]),
]
SLUGS = {
    1: "i-think-my-child-is-being-bullied", 2: "my-child-wont-talk",
    3: "my-child-finally-admits-theyre-being-bullied", 4: "my-child-says-please-dont-tell-the-school",
    5: "my-child-tells-me-only-part-of-the-story", 6: "my-child-says-its-their-fault",
    7: "my-child-cries-every-morning", 8: "my-child-wants-to-quit-school",
    9: "my-child-says-nobody-likes-me", 10: "my-child-is-being-bullied-online",
    11: "my-child-is-being-left-out", 12: "bullied-by-a-friend",
    13: "my-child-started-fighting-back", 14: "my-child-is-losing-confidence",
    15: "my-child-is-starting-to-come-back", 16: "lower-the-odds-before-anything-happens",
    17: "afraid-to-tell-the-teacher", 18: "the-school-on-my-side",
    19: "told-the-teacher-and-nothing-changed", 20: "my-child-doesnt-want-to-be-here-anymore",
    21: "teased-about-their-appearance", 22: "bullied-because-theyre-different",
    23: "bullied-by-the-popular-kids", 24: "left-out-of-group-chats", 25: "bullied-on-the-bus",
}
FREE = {20}
EXTRAS = [
    # (slug, source file, title, short line, search phrases)
    ("why-they-do-it", "why-they-do-it-a-companion-piece.md", "Why They Do It",
     "A companion piece for the question underneath almost every situation: why are they like this?",
     "why do kids bully · why are kids so mean · why are they so mean · why do they pick on him · why do they pick on her · bullies · why is my child the target · why him · why her · the psychology of bullying · why won't it stop"),
    ("what-your-child-can-say", "bullyproof-what-a-target-can-say-response-cheat-sheet.md",
     "What Your Child Can Say",
     "A cheat sheet of calm, practiced lines your child can use to end it, plus what not to say.",
     "what should my child say · what to say back · what should he say · what should she say · what to say to a bully · how to stand up to a bully · comeback · comebacks · how to respond to a bully · walk away · stand up for himself · stand up for herself · what to tell my kid to say"),
]


def slug_for(n):
    return SLUGS[n]


def read(path):
    return open(os.path.join(SRC, path), encoding="utf-8").read()


# ---------------------------------------------------------------------------
# Load guides
# ---------------------------------------------------------------------------
guides = {}
for n in range(1, 26):
    md = read(f"guide-{n:02d}.md")
    # Guide 15 points to a "Guide 33" from the larger 50-guide arc, which isn't in this library.
    md = md.replace(" Guide 33 covers that.", "")
    h1 = re.match(r"#\s*Guide\s+\d+\s*—\s*(.+)", md.strip().splitlines()[0])
    title = h1.group(1).strip()
    q = re.search(r"^>\s*One parenting question:\s*\*?(.+?)\*?\s*$", md, re.M)
    sit = re.search(r"\*\*1\. The Situation\*\*\s*\n(.+)", md)
    guides[n] = {
        "n": n, "slug": slug_for(n), "title": title, "md": md,
        "question": (q.group(1).strip().strip("*") if q else ""),
        "situation": (sit.group(1).strip() if sit else ""),
        "free": n in FREE,
    }
section_of = {n: s for s, ns in SECTIONS for n in ns}
assert sorted(section_of) == list(range(1, 26))

# Parent search vocabulary (Mark's doc)
vocab = {}
vmd = read("guide-library-parent-search-vocabulary.md")
for m in re.finditer(r"\*\*Guide (\d+) — [^*]+\*\*\s*\n([^\n]+)", vmd):
    vocab[int(m.group(1))] = [p.strip() for p in m.group(2).split("·") if p.strip()]
assert len(vocab) == 25, len(vocab)

# Extra parent phrases, checked against what each guide actually covers (the vocabulary doc
# asks for this check). Invisible to parents; matched behind the search box.
MORE = {
 1: "think my child is being bullied · is my child being bullied · acting different · coming home upset · not acting like herself · not acting like himself",
 2: "won't open up · doesn't talk to me · quiet lately · says nothing happened · won't tell me anything",
 3: "finally told me · admitted being bullied · just found out · told me they're being bullied · told me he's being bullied · told me she's being bullied",
 4: "don't tell the school · begged me not to tell · doesn't want me to call the school · afraid it will make it worse · promise not to tell",
 5: "only told me part · story keeps changing · not telling me everything · leaves things out",
 6: "says it's his fault · says it's her fault · blames himself · thinks they deserve it · says it's their fault · thinks he deserved it",
 7: "cries in the morning · stomach hurts before school · anxious before school · won't get out of the car · panics before school",
 8: "hates school · wants to leave school · change schools · begs to stay home · wants to stay home",
 9: "says nobody likes him · says nobody likes her · has no friends · no friends · feels unliked · lonely",
 10: "bullied online · mean comments · posted about him · posted about her · fake account · bullied in a game · roblox · discord · youtube comments",
 11: "sits alone at lunch · no one to sit with · not invited to parties · excluded at recess · nobody plays with her",
 12: "best friend is bullying · friend is being mean · frenemy · friend turned on him · friend turned on her · his friend · her friend",
 13: "fighting at school · punched · got in a fight · defended himself · defended herself · in trouble for fighting · hit back",
 14: "lost confidence · doesn't believe in himself · doesn't believe in herself · calls himself stupid · calls herself stupid · gave up",
 15: "doing better · things are improving · after the bullying stopped · moving forward · seems happier",
 16: "prevent bullying · starting a new school · first day of school · make my child resilient · teach confidence · prepare my kid",
 17: "won't tell the teacher · afraid to report · scared to tell an adult · afraid of being a snitch · snitching · tattling",
 18: "meet the teacher · talk to the principal · partner with the school · parent teacher conference · email the teacher",
 19: "school isn't doing anything · nothing changed · still being bullied · school ignored it · principal did nothing · reported it",
 21: "made fun of his looks · made fun of her looks · teased about clothes · called ugly · teased about her body · teased about his body · skin",
 22: "autism · adhd · bullied for being disabled · bullied for his religion · bullied for her religion · bullied for being new · called weird · lgbtq",
 23: "popular group · queen bee · clique · the cool crowd · popular girls · popular boys",
 24: "removed from the group chat · kicked out of the group chat · not added to the chat · group text",
 25: "on the school bus · bus seat · bus ride · waiting for the bus",
}
for n, ph in MORE.items():
    vocab[n] = vocab[n] + [p.strip() for p in ph.split("·") if p.strip()]

# Front matter / intro (Mark's words, from the launch plan)
plan = read("the-bullyproof-parent-playbook-bundle-packaging-launch-plan.md")
fm = plan.split("## 3. Front Matter")[1].split("---", 2)[1].strip()
intro_paras = [p.strip() for p in fm.split("\n\n") if p.strip()]

# ---------------------------------------------------------------------------
# Markdown → HTML, with guide numbers turned into named links
# ---------------------------------------------------------------------------
def link_guides(htm, free_view=False):
    def rep(m):
        n = int(m.group(1))
        if n not in guides:
            return m.group(0)
        g = guides[n]
        return f'<a class="xref" href="/guides/{g["slug"]}/">{html.escape(g["title"])}</a>'
    # "Guide 5 (Tells Me Only Part of the Story)" → linked full title
    htm = re.sub(r"Guide (\d+)\s*\((?:<em>)?[^()<]*(?:</em>)?\)", rep, htm)
    htm = re.sub(r"Guide (\d+)(?![\d\w])", rep, htm)
    htm = htm.replace("the guide for that situation", "the guide for that situation")
    return htm


MD = markdown.Markdown(extensions=["tables", "sane_lists", "nl2br"])


def md_html(text):
    MD.reset()
    return MD.convert(text)


def split_guide(md):
    body = "\n".join(md.strip().splitlines()[1:])  # drop H1
    body = re.sub(r"^>\s*One parenting question:.*$", "", body, count=1, flags=re.M)
    parts = re.split(r"^## (.+)$", body, flags=re.M)
    pre = parts[0]
    secs = [(parts[i].strip(), parts[i + 1]) for i in range(1, len(parts), 2)]
    return pre, secs


def clean_rules(s):
    return re.sub(r"^\s*(\*\*\*|---)\s*$", "", s, flags=re.M)


def render_guide(g):
    pre, secs = split_guide(g["md"])
    out = []
    if clean_rules(pre).strip():
        out.append(md_html(clean_rules(pre)))
    for head, txt in secs:
        txt = clean_rules(txt)
        h = head
        if h.startswith("⚡ Quick Help"):
            out.append('<section class="quick"><h2><span class="pill">Quick Help</span> The 45-second version</h2>'
                       + md_html(txt) + "</section>")
        elif h.startswith("📖 Learn More"):
            out.append('<details class="learn"><summary><span>Learn more</span> The deeper layer: why it works, '
                       'longer next steps, and related guides</summary><div class="learn-body">'
                       + md_html(txt) + "</div></details>")
        elif h.startswith("Why They Do It"):
            out.append('<details class="learn why"><summary><span>Why they do it</span> And why it isn\'t about you'
                       '</summary><div class="learn-body">' + md_html(txt) + "</div></details>")
        elif h.startswith("🚨"):
            out.append('<section class="crisis"><h2>' + html.escape(h) + "</h2>" + md_html(txt) + "</section>")
        else:
            out.append("<section><h2>" + html.escape(h) + "</h2>" + md_html(txt) + "</section>")
    return link_guides("\n".join(out))


def render_extra(md):
    # Mark's call: the cheat sheet credits named organizations only (no "YouTube creators").
    md = md.replace(" — drawn from counselors, school guidance resources, and YouTube creators who teach this.",
                    " — drawn from counselors and school guidance resources.")
    md = md.replace("school counselor training materials, and YouTube creators who teach this — including channels in the *How to Respond to a Bully* search cluster)",
                    "and school counselor training materials)")
    lines = md.strip().splitlines()
    body = "\n".join(lines[1:]) if lines[0].startswith("# ") else md
    body = clean_rules(body)
    # keep the companion piece's own framing line, but drop the internal "Unnumbered…" note
    body = body.replace(" Unnumbered. It sits alongside the library rather than inside it.", "")
    return link_guides(md_html(body))


# ---------------------------------------------------------------------------
# Search index: Mark's parent phrases + distinctive words from each guide
# (keywords only, never guide prose, so the index gives nothing away)
# ---------------------------------------------------------------------------
STOP = set("""a about above after again against all am an and any are aren't as at be because been before being
below between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for
from further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how
how's i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most mustn't my myself no nor not of off on
once only or other ought our ours ourselves out over own same shan't she she'd she'll she's should shouldn't so some such
than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this those
through to too under until up very was wasn't we we'd we'll we're we've were weren't what what's when when's where where's
which while who who's whom why why's with won't would wouldn't you you'd you'll you're you've your yours yourself
yourselves child children kid kids parent parents guide guides one also just like get got really even still much many
something someone thing things way may might will said says say go going know want new time back make made tell told
""".split())


def toks(s):
    s = s.lower().replace("’", "'")
    return [t for t in re.findall(r"[a-z']+", s) if len(t) > 2 and t not in STOP]


docs = {n: Counter(toks(re.sub(r"[#*>_`|]", " ", g["md"]))) for n, g in guides.items()}
for slug, f, *_ in EXTRAS:
    docs[slug] = Counter(toks(read(f)))
N = len(docs)
df = Counter()
for c in docs.values():
    df.update(set(c))


def keywords(c, k=45):
    scored = {w: (1 + math.log(cnt)) * math.log(N / df[w]) for w, cnt in c.items() if df[w] < N * 0.6 and cnt >= 2}
    return [w for w, _ in sorted(scored.items(), key=lambda x: -x[1])[:k]]


index = []
for s, ns in SECTIONS:
    for n in ns:
        g = guides[n]
        index.append({
            "slug": g["slug"], "title": g["title"], "section": s, "free": g["free"],
            "line": g["question"] or g["situation"], "phrases": vocab[n],
            "kw": keywords(docs[n]), "crisis": n == 20,
        })
for slug, f, title, line, phrases in EXTRAS:
    index.append({"slug": slug, "title": title, "section": "Also included", "free": False,
                  "line": line, "phrases": [p.strip() for p in phrases.split("·")], "kw": keywords(docs[slug]),
                  "crisis": False})

# ---------------------------------------------------------------------------
# Page shell
# ---------------------------------------------------------------------------
FONT = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap" rel="stylesheet">'


def shell(title, body, desc="", extra_head="", body_class=""):
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<meta name="theme-color" content="#1B2A4A">
<link rel="icon" href="/guides/assets/icon.svg" type="image/svg+xml">
{FONT}<link rel="stylesheet" href="/guides/assets/library.css?v=__V__">{extra_head}</head>
<body class="{body_class}">
<header class="top"><div class="wrap top-in">
<a class="brand" href="/guides/"><span class="sun" aria-hidden="true"></span><span><b>Bullyproof</b> Quick Help Guides</span></a>
<a class="top-search" href="/guides/#search" aria-label="Search the guides"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Search</span></a>
</div></header>
{body}
<footer class="foot"><div class="wrap">
<p class="foot-crisis"><b>If a child may be in danger right now:</b> call <a href="tel:911">911</a>. For thoughts of suicide, call or text <a href="tel:988">988</a>, or text HOME to <a href="sms:741741&body=HOME">741741</a>.</p>
<p>These guides offer general guidance for parents. They are not medical, psychological, or legal advice, and they don't replace a counselor, doctor, or other professional who knows your child.</p>
<p>© 2026 Kidsavers International, Inc. · <a href="https://www.bullyproof.support">Bullyproof.Support</a> · <a href="mailto:mark@bullyproof.guide">mark@bullyproof.guide</a></p>
</div></footer>
<script src="/guides/assets/library.js?v=__V__"></script>
</body></html>"""



# "Help Another Parent" — Mark's approved wording from the Action Plan. Shares ONLY an invitation
# to the free Clarity Check (never a paid guide), tagged ref=guides-share so library shares can be counted.
SHARE_URL = "https://www.bullyproof.support/parent-clarity-check?ref=guides-share"
SHARE_MSG = ("I found this free Parent Clarity Check and thought you might appreciate it. It helps parents better "
             "understand what's happening with their kids and consider what to do next. Thought I'd pass it along!")
HEART = '<svg width="26" height="26" viewBox="0 0 24 24" fill="#C89B3C" aria-hidden="true"><path d="M12 21s-7.2-4.4-9.6-9.1C.8 8.6 2.6 4.8 6.3 4.3c2.1-.3 4 .8 5.7 2.7 1.7-1.9 3.6-3 5.7-2.7 3.7.5 5.5 4.3 3.9 7.6C19.2 16.6 12 21 12 21z"/></svg>'
SHARE_HTML = f"""<section class="share-card" data-share-url="{SHARE_URL}" data-share-msg="{html.escape(SHARE_MSG)}">
<div class="share-icon">{HEART}</div>
<h2 class="share-title">Help Another Parent Find Their Next Step</h2>
<p class="share-tag">You don't have to have all the answers to help someone find theirs.</p>
<p class="share-body">Know another parent who might be worried about their child or unsure what to do next? Share the free Bullyproof Parent Clarity Check and help them take their first step toward greater understanding and confidence.</p>
<div class="share-buttons"><button class="btn gold sb-share" type="button">Share with a Parent</button><button class="btn ghost sb-copy" type="button">Copy Link</button></div>
<div class="share-options" hidden><a class="share-opt sb-sms" href="#">Send by text</a><a class="share-opt sb-email" href="#">Send by email</a><button class="share-opt sb-copymsg" type="button">Copy the message</button></div>
<p class="share-status" role="status" aria-live="polite"></p>
<p class="share-privacy">Only the free Clarity Check invitation is shared. Nothing about you or your child.</p>
</section>"""

def guide_body(g, inner, locked=False):
    sec = section_of.get(g.get("n"), g.get("section", ""))
    q = g.get("question") or ""
    head = f"""<main class="wrap page"><nav class="crumb"><a href="/guides/">All guides</a><span>›</span><span>{html.escape(sec)}</span></nav>
<article class="guide">
<header class="g-head"><p class="kicker">{html.escape(sec)}{' · <span class="free-tag">Free for every parent</span>' if g.get('free') else ''}</p>
<h1>{html.escape(g['title'])}</h1>
{f'<p class="g-q">“{html.escape(q)}”</p>' if q else ''}</header>
"""
    tail = "" if g.get("free") else SHARE_HTML
    return head + inner + "</article>" + tail + "</main>"


# ---------------------------------------------------------------------------
# Write output
# ---------------------------------------------------------------------------
if os.path.isdir(PUB):
    shutil.rmtree(PUB)
os.makedirs(os.path.join(PUB, "assets"), exist_ok=True)
os.makedirs(FN, exist_ok=True)
for f in os.listdir(os.path.join(ROOT, "static")):
    shutil.copy(os.path.join(ROOT, "static", f), os.path.join(PUB, "assets", f))

VER = str(abs(hash(json.dumps(index))) % 10**8)

# paid pages → function bundle (not public files)
paid = {}
for n, g in guides.items():
    inner = render_guide(g)
    page = guide_body(g, inner)
    full = shell(f"{g['title']} · {PRODUCT}", page, g["question"] or g["situation"]).replace("__V__", VER)
    if g["free"]:
        d = os.path.join(PUB, g["slug"])
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w").write(full)
    else:
        paid[g["slug"]] = full
for slug, f, title, line, phrases in EXTRAS:
    g = {"title": title, "section": "Also included", "question": "", "free": False}
    page = guide_body(g, '<div class="extra">' + render_extra(read(f)) + "</div>")
    paid[slug] = shell(f"{title} · {PRODUCT}", page, line).replace("__V__", VER)

# teaser data for locked pages (title, section, the one-line question only)
teasers = {e["slug"]: {"title": e["title"], "section": e["section"], "line": e["line"]} for e in index}

# Encrypt the paid pages (AES-256-GCM). Only the encrypted copy goes in the repo.
payload = json.dumps({"PAGES": paid, "TEASERS": teasers,
                      "SHELL": shell("__TITLE__", "__BODY__", "__DESC__").replace("__V__", VER)}).encode()
open(os.path.join(ROOT, ".plain.json"), "wb").write(payload)
import subprocess
enc = subprocess.run(["node", os.path.join(ROOT, "encrypt.mjs"), os.path.join(ROOT, ".plain.json"), KEYFILE],
                     capture_output=True, text=True, check=True).stdout
os.remove(os.path.join(ROOT, ".plain.json"))
with open(os.path.join(FN, "qhg-content.enc.mjs"), "w") as fh:
    fh.write("// Generated by build.py — encrypted paid guide pages. Decrypted at runtime by qhg-content.mjs.\n")
    fh.write("export const BLOB = " + enc + ";\n")

# public search index (titles, sections, parent phrases, keywords; no guide text)
json.dump(index, open(os.path.join(PUB, "assets", "index.json"), "w"), ensure_ascii=False)

# library home
def sections_html():
    out = []
    for s, ns in SECTIONS:
        items = "".join(
            f'<li><a href="/guides/{guides[n]["slug"]}/"><span class="t">{html.escape(guides[n]["title"])}</span>'
            f'{"<span class=free-tag>Free</span>" if n in FREE else ""}'
            f'<span class="l">{html.escape(guides[n]["question"] or guides[n]["situation"])}</span></a></li>'
            for n in ns)
        out.append(f'<details class="sec"{" open" if s == SECTIONS[0][0] else ""}><summary><span class="sec-t">{html.escape(s)}</span>'
                   f'<span class="sec-n">{len(ns)} guide{"s" if len(ns) > 1 else ""}</span></summary><ul>{items}</ul></details>')
    extras = "".join(
        f'<li><a href="/guides/{slug}/"><span class="t">{html.escape(title)}</span><span class="l">{html.escape(line)}</span></a></li>'
        for slug, f, title, line, _ in EXTRAS)
    out.append(f'<details class="sec"><summary><span class="sec-t">Also included</span><span class="sec-n">2 extras</span></summary><ul>{extras}</ul></details>')
    return "\n".join(out)


intro_html = "".join(f"<p>{md_html(p)[3:-4]}</p>" for p in intro_paras)
home = f"""<main>
<section class="hero"><div class="wrap">
<p class="kicker light">Hands-on help, available today</p>
<h1>{PRODUCT}</h1>
<p class="lede">The exact words for the hardest moments: what to say, what not to say, and why it matters. Twenty-five situations, each one short enough to read in the driveway.</p>
<div id="search" class="search-box">
<label for="q" class="sr">Describe what's happening</label>
<input id="q" type="search" autocomplete="off" placeholder="Describe what's happening" aria-describedby="q-hint">
<p id="q-hint" class="hint">For example: <button type="button" class="ex">he won't talk to me</button> <button type="button" class="ex">cries before school</button> <button type="button" class="ex">left out of the group chat</button></p>
</div>
<div id="results" aria-live="polite"></div>
<div id="owner-note" class="owner-note" hidden>You have full access to every guide on this device.</div>
</div></section>

<section class="wrap intro-wrap"><div class="intro">{intro_html}</div></section>

<section class="wrap contents"><h2>Find your situation</h2>
<p class="sub">Grouped by what you're seeing at home, not by topic. Open the heading that sounds like tonight.</p>
{sections_html()}
</section>

<section class="wrap buy" id="buy"><div class="buy-card">
<div class="buy-copy"><p class="kicker">One digital library · instant access</p>
<h2>All 25 guides, {PRICE}</h2>
<ul class="ticks">
<li>Every guide in two layers: the 45-second Quick Help, and a deeper layer when you want to understand it</li>
<li>The exact words to say, the common mistakes to skip, and what to do tonight and this week</li>
<li>Search by describing what's happening, and get straight to the right guide</li>
<li>Plus <b>Why They Do It</b> and <b>What Your Child Can Say</b>, a cheat sheet your child can practice</li>
<li>Works on your phone right away. No account, no app, no password</li>
</ul>
<p class="small">The crisis guide, <a href="/guides/my-child-doesnt-want-to-be-here-anymore/">My Child Doesn't Want to Be Here Anymore</a>, is free for every parent, always. Your {PRICE} pays for the other twenty-four.</p>
</div>
<div class="buy-act"><a id="buy-btn" class="btn gold" href="#">Get all 25 guides · {PRICE}</a>
<p class="small center" id="buy-note">Secure checkout by Stripe. Kidsavers International, Inc.</p>
<p class="small center">Already bought them? <a href="/guides/restore/">Open your guides again</a></p></div>
</div></section>
<div class="wrap">{SHARE_HTML}</div>
<script src="/guides/assets/config.js?v={VER}"></script>
</main>"""
open(os.path.join(PUB, "index.html"), "w").write(
    shell(PRODUCT, home, "Twenty-five short guides with the exact words to say when your child is being bullied. Search by describing what's happening.", body_class="home").replace("__V__", VER))

# welcome page (after checkout) — shows the buyer's private link and ways to keep it
welcome = """<main class="wrap"><div class="panel">
<p class="kicker">Thank you</p>
<h1>Your guides are ready</h1>
<p>All 25 guides are open to you on this device right now. Nothing to download, and no password.</p>
<p><a class="btn gold" href="/guides/">Open the guides</a></p>
<h2 style="font:700 20px Inter,sans-serif;color:var(--navy);margin:28px 0 6px">Keep your private link</h2>
<p>This link opens your guides on any phone or computer. Please save it now, because it's the key to your library.</p>
<div class="copybox"><input id="lnk" readonly aria-label="Your private link"><button type="button" id="cp">Copy</button></div>
<p><a id="mail" class="btn navy" href="#">Email this link to myself</a></p>
<p class="small">Tip: on your phone, open your guides and add the page to your home screen. It will open like an app.</p>
</div>"""+SHARE_HTML+"""</main>
<script>
(function(){var k=(location.search.match(/k=([a-f0-9]+)/)||[])[1];var i=document.getElementById('lnk');
if(!k){i.value='Open your guides from the button above';return;}
var u=location.origin+'/guides/access/'+k;i.value=u;
document.getElementById('cp').onclick=function(){i.select();try{navigator.clipboard.writeText(u)}catch(e){document.execCommand('copy')}this.textContent='Copied';};
document.getElementById('mail').href='mailto:?subject='+encodeURIComponent('My Bullyproof Quick Help Guides')+'&body='+encodeURIComponent('My private link to all 25 Bullyproof Quick Help Guides:\\n\\n'+u+'\\n\\nOpen it on any phone or computer.');
try{history.replaceState(null,'','/guides/welcome/')}catch(e){}})();
</script>"""
os.makedirs(os.path.join(PUB, "welcome"), exist_ok=True)
open(os.path.join(PUB, "welcome", "index.html"), "w").write(
    shell("Your guides are ready · " + PRODUCT, welcome).replace("__V__", VER).replace('<meta name="description"', '<meta name="robots" content="noindex"><meta name="description"'))

restore = """<main class="wrap"><div class="panel">
<h1>Open your guides again</h1>
<p>On a new phone or computer, or lost your link? Enter the email you used at checkout and we'll email your private link to that address.</p>
<form id="rf"><label for="em" class="small">Email used at checkout</label>
<input id="em" class="field" type="email" required autocomplete="email" placeholder="you@example.com">
<button class="btn gold" type="submit">Email my link</button></form>
<div id="rm" class="msg" hidden></div>
<p class="small" style="margin-top:20px">Still stuck? Email <a href="mailto:mark@bullyproof.guide">mark@bullyproof.guide</a> and we'll get you back in.</p>
</div></main>
<script>
document.getElementById('rf').onsubmit=function(e){e.preventDefault();var m=document.getElementById('rm');
fetch('/guides/api/restore',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:document.getElementById('em').value})})
.then(function(r){return r.json()}).then(function(d){m.hidden=false;
if(!d.ok){m.className='msg err';m.textContent='Please check that email address and try again.';return;}
m.className='msg';m.textContent=d.emailing?'If that email bought the guides, your private link is on its way. Check your inbox (and spam folder) in a minute.':'Thanks. Please email mark@bullyproof.guide from that address and we\\'ll send your link right away.';})
.catch(function(){m.hidden=false;m.className='msg err';m.textContent='Something went wrong. Please try again.';});};
</script>"""
os.makedirs(os.path.join(PUB, "restore"), exist_ok=True)
open(os.path.join(PUB, "restore", "index.html"), "w").write(shell("Open your guides again · " + PRODUCT, restore).replace("__V__", VER))

print("guides:", len(guides), "paid pages:", len(paid), "index entries:", len(index), "version", VER)
