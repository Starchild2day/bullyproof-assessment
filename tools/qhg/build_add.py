#!/usr/bin/env python3
"""Adds Guides 26, 27 and 28 (and any later guides) to the live Quick Help Guides library,
in English and Spanish, without rebuilding the original 25.

Why a separate step: the original 25 are already encrypted on the site under keys that only Netlify
holds. New guides go into their own encrypted bundle (netlify/lib/qhg-content-add.enc.mjs, key
QHG_CONTENT_KEY_ADD in Netlify), and the runtime merges both bundles, so buyers see one library.

Inputs (PRIVATE, never commit):
  $QHG_ADD_SRC/guide-26.md ...         English sources, exactly as written in Marketing Secrets
  $QHG_ADD_SRC/es/guide-26.md ...      Spanish translations, same structure
  $QHG_ADD_KEYFILE                     hex key, also saved in Netlify as QHG_CONTENT_KEY_ADD
Public metadata (titles, one-line questions, parent search phrases) lives in ADD below.

Updates in place: guides/assets/index.json, guides/assets/index-es.json, and the "Find your situation"
lists on guides/index.html and guides/es/index.html. Safe to run again: it replaces its own entries.
"""
import json, os, re, html, math, subprocess
from collections import Counter

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(ROOT, "..", ".."))
PUB = os.path.join(REPO, "guides")
FN = os.path.join(REPO, "netlify", "lib")
SRC = os.environ["QHG_ADD_SRC"]
KEYFILE = os.environ["QHG_ADD_KEYFILE"]

# ---------------------------------------------------------------------------
# Reuse the exact page-building code of build.py and build_es.py (shell, markdown, share card),
# without running their full builds (their sources are not needed for this step).
# ---------------------------------------------------------------------------
def borrow(path, cuts):
    src = open(path, encoding="utf-8").read()
    ns = {"__file__": path}
    for a, b in cuts:
        i = src.index(a)
        j = src.index(b, i) if b else len(src)
        exec(compile(src[i:j], path, "exec"), ns)
    return ns


EN = borrow(os.path.join(ROOT, "build.py"), [
    ("import json, re, math", "ROOT = os.path"),
    ('PRODUCT = "', "# ---------------------------------------------------------------------------\n# The library"),
    ("MD = markdown.Markdown", "def split_guide"),
    ('STOP = set("""a about', "def toks"),
    ("FONT = '", "# ---------------------------------------------------------------------------\n# Write output"),
])
ES = borrow(os.path.join(ROOT, "build_es.py"), [
    ("import json, os, re", "ROOT = os.path"),
    ('STOP = set("""a al', "def fold"),
    ('PRODUCT = "', "meta = json.load"),
    ("FONT = '", "def guide_page"),
])
md_html = EN["md_html"]

# ---------------------------------------------------------------------------
# The new guides. Section, titles and one-line questions are written to match the first 25;
# search phrases are how parents actually describe each situation.
# ---------------------------------------------------------------------------
SECTION_EN = "When It's Their Body, Their Things, or Their Name"
SECTION_ES = "Cuando es su cuerpo, sus cosas o su nombre"
AFTER_EN = "When It's Out in the Open"          # the new section is listed right after this one
ADD = [
    {"n": 26, "slug": "my-child-is-being-hurt-physically",
     "line": "Someone put hands on my child. What do I say and do tonight, and where is the line between kids being rough and something bigger?",
     "es_title": "A mi hijo lo están lastimando físicamente",
     "es_line": "Alguien le puso las manos encima a mi hijo. ¿Qué digo y qué hago esta noche, y dónde está la línea entre niños bruscos y algo más serio?",
     "phrases": "hit · hitting · got hit · punched · kicked · pushed · shoved · tripped · slapped · choked · jumped · beat up · beaten up · hurt at school · physical bullying · bruise · bruises · black eye · torn shirt · ripped clothes · scratches · injured at school · got in a fight · school called about an incident · someone put hands on my child · teach him to fight back · teach her to fight back · threatened to beat him up · assault",
     "es_phrases": "le pegan · le pegaron · lo golpean · la golpean · lo empujan · la empujan · le dan patadas · le metieron el pie · lo tumbaron · le dieron una bofetada · lo agarraron entre varios · lo lastiman · la lastiman · llegó lastimado · llegó lastimada · moretones · ojo morado · ropa rota · rasguños · acoso físico · le pegaron en la escuela · me llamaron de la escuela por un incidente · le pusieron las manos encima · llamo a la policía · que se defienda a golpes · lo amenazaron con golpearlo · agresión"},
    {"n": 27, "slug": "my-childs-things-were-taken-or-broken",
     "line": "Their things keep getting taken, hidden or broken. How do I treat it as the bullying it is, and not just lost stuff?",
     "es_title": "A mi hijo le quitaron o le rompieron sus cosas",
     "es_line": "Le quitan, le esconden o le rompen sus cosas. ¿Cómo lo trato como el acoso que es, y no como cosas perdidas?",
     "phrases": "taking his things · taking her things · taking their things · stole · stolen · stealing · took his phone · took her phone · lunch money · stealing his lunch · stealing her lunch · broke his glasses · broke her glasses · broke his phone · broke her phone · broken · damaged · ruined · backpack in the trash · threw his backpack · hid his shoes · hide her stuff · messing with his stuff · keeps losing things · lost his things · belongings · property · who pays to replace it · school won't replace it · it's just stuff",
     "es_phrases": "le quitan sus cosas · le quitaron · le roban · le robaron · le roban el almuerzo · le roban el dinero · le quitaron el celular · le rompieron los lentes · le rompieron el celular · le rompieron sus cosas · le esconden la mochila · le esconden sus cosas · le tiraron la mochila a la basura · le destrozaron · sus pertenencias · pierde sus cosas · quién paga · la escuela no lo repone · son solo cosas"},
    {"n": 28, "slug": "theyre-saying-things-about-my-child",
     "line": "There's a story going around about my child, or the same name every day. There's nothing to photograph. How do I take words seriously and make them stop?",
     "es_title": "Andan diciendo cosas de mi hijo",
     "es_line": "Anda circulando una historia sobre mi hijo, o le dicen el mismo apodo todos los días. No hay nada que fotografiar. ¿Cómo tomo en serio las palabras y hago que paren?",
     "phrases": "rumor · rumors · rumour · spreading rumors · gossip · lies about her · lies about him · telling lies about my child · saying things about my child · talking behind her back · story going around · everyone believes it · name calling · calling him names · calling her names · called names · same name every day · verbal bullying · mean words · just ignore it · reputation",
     "es_phrases": "rumores · rumor · chismes · andan diciendo · dicen mentiras de ella · dicen mentiras de él · hablan mal de mi hija · hablan mal de mi hijo · hablan a sus espaldas · una historia que anda circulando · todos se lo creyeron · le ponen apodos · le dicen apodos · le dicen nombres · lo insultan · la insultan · acoso verbal · palabras hirientes · que lo ignore · su reputación"},
]
SLUG_OF = {g["n"]: g["slug"] for g in ADD}
ADD_SLUGS = set(SLUG_OF.values())
PHYSICAL = SLUG_OF[26]


def read(p):
    return open(os.path.join(SRC, p), encoding="utf-8").read()


for g in ADD:
    g["md"] = read(f"guide-{g['n']}.md")
    g["title"] = re.match(r"#\s*Guide\s+\d+\s*—\s*(.+)", g["md"].strip().splitlines()[0]).group(1).strip()
    g["es_md"] = read(f"es/guide-{g['n']}.md")


# ---------------------------------------------------------------------------
# Render: same look as the first 25 (Quick Help card, then a "Learn more" layer that opens on tap)
# ---------------------------------------------------------------------------
L = {
    "en": {"quick": re.compile(r"^Quick Help"), "learn": re.compile(r"^Learn More"), "gives": re.compile(r"^What This Guide Gives You"),
           "quick_h": "What to say and do tonight", "learn_s": "<span>Learn more</span> The deeper layer: what's really going on, what to ask for, and when to go further",
           "physical": [("that's the physical guide", "that's ", "the physical guide"), ("Same rule as the physical guide", "Same rule as ", "the physical guide"),
                        ("that's the physical guide and the police", "that's ", "the physical guide")],
           "base": "/guides/"},
    "es": {"quick": re.compile(r"^Ayuda rápida"), "learn": re.compile(r"^Para saber más"), "gives": re.compile(r"^Lo que le da esta guía"),
           "quick_h": "Qué decir y qué hacer esta noche", "learn_s": "<span>Para saber más</span> La capa más profunda: qué está pasando de verdad, qué pedir y cuándo ir más lejos",
           "physical": [("eso corresponde a la guía sobre agresiones físicas", "eso corresponde a ", "la guía sobre agresiones físicas"),
                        ("eso corresponde a la guía sobre agresiones físicas", "eso corresponde a ", "la guía sobre agresiones físicas"),
                        ("La misma regla que en la guía sobre agresiones físicas", "La misma regla que en ", "la guía sobre agresiones físicas")],
           "base": "/guides/es/"},
}


def render(md, lang):
    c = L[lang]
    body = "\n".join(md.strip().splitlines()[1:])            # drop the H1 (shown in the page header)
    parts = re.split(r"^## (.+)$", body, flags=re.M)
    clean = lambda s: re.sub(r"^\s*(\*\*\*|---)\s*$", "", s, flags=re.M)
    out = []
    if clean(parts[0]).strip():
        out.append('<section class="g-open">' + md_html(clean(parts[0])) + "</section>")
    for i in range(1, len(parts), 2):
        head, txt = parts[i].strip(), clean(parts[i + 1])
        if c["gives"].match(head):
            # The two-layer description is what the page itself shows; keep anything else (e.g. "call 911 first").
            keep = [p for p in txt.strip().split("\n\n") if p.strip() and not re.match(r"^\*\*(Quick Help|Learn More|Ayuda rápida|Para saber más)\*\*", p.strip())]
            if keep:
                out.append('<section class="crisis">' + md_html("\n\n".join(keep)) + "</section>")
        elif c["quick"].match(head):
            out.append(f'<section class="quick"><h2><span class="pill">{"Quick Help" if lang == "en" else "Ayuda rápida"}</span> {c["quick_h"]}</h2>'
                       + md_html(txt) + "</section>")
        elif c["learn"].match(head):
            out.append(f'<details class="learn"><summary>{c["learn_s"]}</summary><div class="learn-body">' + md_html(txt) + "</div></details>")
        else:
            out.append("<section><h2>" + html.escape(head) + "</h2>" + md_html(txt) + "</section>")
    h = "\n".join(out)
    # Link "the physical guide" to Guide 26 (wording unchanged, only made clickable)
    for whole, lead, link in c["physical"]:
        h = h.replace(whole, lead + f'<a class="xref" href="{c["base"]}{PHYSICAL}/">{link}</a>' + whole[len(lead) + len(link):], 1)
    return h


def head_html(title, section, line, lang):
    home = "/guides/" if lang == "en" else "/guides/es/"
    allg = "All guides" if lang == "en" else "Todas las guías"
    return (f'<main class="wrap page"><nav class="crumb"><a href="{home}">{allg}</a><span>›</span><span>{html.escape(section)}</span></nav>\n'
            f'<article class="guide">\n<header class="g-head"><p class="kicker">{html.escape(section)}</p>\n'
            f'<h1>{html.escape(title)}</h1>\n<p class="g-q">“{html.escape(line)}”</p></header>\n')


# ---------------------------------------------------------------------------
# Search index entries (titles, phrases, keywords; no guide text)
# ---------------------------------------------------------------------------
def kw_en(md, others):
    toks = EN["toks"] if "toks" in EN else None
    stop = EN["STOP"] if "STOP" in EN else set()
    t = [w for w in re.findall(r"[a-z']+", re.sub(r"[#*>_`|]", " ", md).lower().replace("’", "'")) if len(w) > 2 and w not in stop]
    return top_kw(Counter(t), others)


def fold(s):
    import unicodedata
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(ch for ch in s if unicodedata.category(ch) != "Mn")


def kw_es(md, others):
    stop = ES.get("STOP", set())
    t = [w for w in re.findall(r"[a-z]+", fold(re.sub(r"[#*>_`|]", " ", md))) if len(w) > 3 and w not in stop]
    return top_kw(Counter(t), others)


SIBLINGS = []                      # word sets of the new guides, so words they all share don't count as keywords


def top_kw(c, others, k=45):
    shared = Counter()
    for sib in SIBLINGS:
        shared.update(sib)
    c = Counter({w: n for w, n in c.items() if shared[w] < len(SIBLINGS)})
    docs = others + [c]
    n = len(docs)
    df = Counter()
    for d in docs:
        df.update(set(d))
    scored = {w: (1 + math.log(cnt)) * math.log(n / df[w]) for w, cnt in c.items() if df[w] < n * 0.6 and cnt >= 2}
    return [w for w, _ in sorted(scored.items(), key=lambda x: -x[1])[:k]]


def word_set(md, lang):
    if lang == "en":
        return set(re.findall(r"[a-z']+", md.lower().replace("’", "'")))
    return set(re.findall(r"[a-z]+", fold(md)))


def update_index(path, lang):
    SIBLINGS[:] = [word_set(g["md"] if lang == "en" else g["es_md"], lang) for g in ADD]
    idx = [e for e in json.load(open(path, encoding="utf-8")) if e["slug"] not in ADD_SLUGS]
    others = [Counter({w: 2 for w in e["kw"]}) for e in idx]     # the first 25, as their keyword sets
    entries = []
    for g in ADD:
        if lang == "en":
            entries.append({"slug": g["slug"], "title": g["title"], "section": SECTION_EN, "free": False, "line": g["line"],
                            "phrases": [p.strip() for p in g["phrases"].split("·") if p.strip()],
                            "kw": [w for w in kw_en(g["md"], others)], "crisis": False})
        else:
            entries.append({"slug": g["slug"], "title": g["es_title"], "section": SECTION_ES, "free": False, "line": g["es_line"],
                            "phrases": [p.strip() for p in g["es_phrases"].split("·") if p.strip()],
                            "kw": kw_es(g["es_md"], others), "crisis": False})
    after = AFTER_EN if lang == "en" else ES_SECTION_NAMES[AFTER_EN]
    last = max(i for i, e in enumerate(idx) if e["section"] == after)
    idx = idx[:last + 1] + entries + idx[last + 1:]
    json.dump(idx, open(path, "w", encoding="utf-8"), ensure_ascii=False)
    return idx


ES_SECTION_NAMES = json.load(open(os.path.join(ROOT, "es", "meta.json"), encoding="utf-8"))["sections"]


# ---------------------------------------------------------------------------
# Library home pages: add the new section to "Find your situation"
# ---------------------------------------------------------------------------
def update_home(path, lang):
    s = open(path, encoding="utf-8").read()
    s = re.sub(r'\n?<details class="sec" data-add="1">.*?</details>', "", s, flags=re.S)   # our previous run, if any
    base = "/guides/" if lang == "en" else "/guides/es/"
    items = "".join(
        f'<li><a href="{base}{g["slug"]}/"><span class="t">{html.escape(g["title"] if lang == "en" else g["es_title"])}</span>'
        f'<span class="l">{html.escape(g["line"] if lang == "en" else g["es_line"])}</span></a></li>' for g in ADD)
    sec = SECTION_EN if lang == "en" else SECTION_ES
    n = len(ADD)
    label = f"{n} guides" if lang == "en" else f"{n} guías"
    block = (f'\n<details class="sec" data-add="1"><summary><span class="sec-t">{html.escape(sec)}</span>'
             f'<span class="sec-n">{label}</span></summary><ul>{items}</ul></details>')
    after = html.escape(AFTER_EN if lang == "en" else ES_SECTION_NAMES[AFTER_EN])
    m = re.search(r'<details class="sec"[^>]*><summary><span class="sec-t">' + re.escape(after) + r"</span>.*?</details>", s, flags=re.S)
    assert m, "section not found on " + path
    s = s[:m.end()] + block + s[m.end():]
    open(path, "w", encoding="utf-8").write(s)


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
en_idx = update_index(os.path.join(PUB, "assets", "index.json"), "en")
es_idx = update_index(os.path.join(PUB, "assets", "index-es.json"), "es")
update_home(os.path.join(PUB, "index.html"), "en")
update_home(os.path.join(PUB, "es", "index.html"), "es")

VER = re.search(r"library\.js\?v=(\d+)", open(os.path.join(PUB, "index.html"), encoding="utf-8").read()).group(1)
VER_ES = re.search(r"library\.js\?v=(\d+)", open(os.path.join(PUB, "es", "index.html"), encoding="utf-8").read()).group(1)
bundle = {"en": {"PAGES": {}, "TEASERS": {}}, "es": {"PAGES": {}, "TEASERS": {}}}
for g in ADD:
    inner = render(g["md"], "en")
    page = head_html(g["title"], SECTION_EN, g["line"], "en") + inner + "</article>" + EN["SHARE_HTML"] + "</main>"
    bundle["en"]["PAGES"][g["slug"]] = EN["shell"](f"{g['title']} · {EN['PRODUCT']}", page, g["line"]).replace("__V__", VER)
    bundle["en"]["TEASERS"][g["slug"]] = {"title": g["title"], "section": SECTION_EN, "line": g["line"]}

    inner = render(g["es_md"], "es")
    page = head_html(g["es_title"], SECTION_ES, g["es_line"], "es") + inner + "</article>" + ES["SHARE_HTML"] + "</main>"
    bundle["es"]["PAGES"][g["slug"]] = ES["shell"](f"{g['es_title']} · {ES['PRODUCT']}", page, g["es_line"]).replace("__V__", VER_ES)
    bundle["es"]["TEASERS"][g["slug"]] = {"title": g["es_title"], "section": SECTION_ES, "line": g["es_line"]}

tmp = os.path.join(ROOT, ".plain-add.json")
open(tmp, "wb").write(json.dumps(bundle, ensure_ascii=False).encode("utf-8"))
if os.environ.get("QHG_ADD_DUMP"):                       # local preview only
    import shutil; shutil.copy(tmp, os.environ["QHG_ADD_DUMP"])
try:
    enc = subprocess.run(["node", os.path.join(ROOT, "encrypt.mjs"), tmp, KEYFILE], capture_output=True, text=True, check=True).stdout
finally:
    os.remove(tmp)
with open(os.path.join(FN, "qhg-content-add.enc.mjs"), "w") as fh:
    fh.write("// Generated by build_add.py — encrypted pages for guides added after the first 25 (English and Spanish).\n")
    fh.write("export const BLOB = " + enc + ";\n")
print("added", ", ".join(g["slug"] for g in ADD), "| en index", len(en_idx), "| es index", len(es_idx))
