#!/usr/bin/env python3
"""Builds the Spanish edition of The Bullyproof Quick Help Guides at /guides/es/.

Inputs:
  tools/qhg/es/meta.json             Spanish titles, section names, one-line questions, parent search phrases (public)
  $QHG_ES_SRC/<slug>.html            Spanish guide pages (the inside of each guide). PRIVATE: never commit these.
  $QHG_ES_KEYFILE                    file holding the hex key also saved in Netlify as QHG_CONTENT_KEY_ES. Never commit it.
  guides/assets/index.json           the English index (for order, sections, free and crisis flags)

Output:
  guides/es/                          Spanish library home, free crisis guide, welcome and restore pages
  guides/assets/index-es.json         Spanish search index (titles, phrases, keywords; no guide text)
  netlify/lib/qhg-content-es.enc.mjs  encrypted Spanish paid pages, served only to buyers

One purchase opens both languages (the same access cookie covers all of /guides).
Set LIVE = True once the Spanish edition is approved: pages become indexable by search engines
(and set QHG_SPANISH_LIVE = true in tools/qhg/static/library.js to show the "Español" switch on English pages).
"""
import json, os, re, math, html, shutil, subprocess
from collections import Counter

LIVE = False

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(ROOT, "..", ".."))
PUB = os.path.join(REPO, "guides")
ES = os.path.join(PUB, "es")
FN = os.path.join(REPO, "netlify", "lib")
SRC = os.environ["QHG_ES_SRC"]
KEYFILE = os.environ["QHG_ES_KEYFILE"]

PRODUCT = "Las Guías de Ayuda Rápida de Bullyproof"
PRICE = "$37"

meta = json.load(open(os.path.join(ROOT, "es", "meta.json"), encoding="utf-8"))
en_index = json.load(open(os.path.join(PUB, "assets", "index.json"), encoding="utf-8"))
SEC = meta["sections"]
G = meta["guides"]
FREE = {e["slug"] for e in en_index if e["free"]}

# keep the English order and grouping
order, sections = [], []
for e in en_index:
    s = SEC[e["section"]]
    if not sections or sections[-1][0] != s:
        sections.append((s, []))
    sections[-1][1].append(e["slug"])
    order.append(e)

# The shared "Why they do it" block (the same in several guides) is written once, in _why.html,
# and placed wherever a guide has <!--WHY-->.
WHY = open(os.path.join(SRC, "_why.html"), encoding="utf-8").read().strip()
bodies = {}
for e in en_index:
    p = os.path.join(SRC, e["slug"] + ".html")
    if not os.path.exists(p):
        raise SystemExit("missing Spanish guide: " + e["slug"])
    bodies[e["slug"]] = open(p, encoding="utf-8").read().replace("<!--WHY-->", WHY)
    if "/guides/" in re.sub(r'href="/guides/es/', "", bodies[e["slug"]]):
        raise SystemExit("an English link is left in " + e["slug"])

# ---------------------------------------------------------------------------
# Search index: Spanish parent phrases + distinctive words from each Spanish guide (keywords only)
# ---------------------------------------------------------------------------
STOP = set("""a al algo algun alguna algunas alguno algunos ante antes aqui asi aun aunque cada casi como con contra cual cuando
de del desde donde dos e el ella ellas ellos en entre era eran es esa esas ese eso esos esta estaba estan estar este esto estos
fue fueron ha hace hacer han hasta hay la las le les lo los mas me mi mis mucho muy nada ni no nos o otra otro para pero poco por
porque puede pueden que quien se sea ser si sin sino sobre solo son su sus tambien tan tanto te tiene tienen todo todos tu tus
un una uno unos usted ustedes va van vez y ya yo hijo hija hijos hijas nino nina ninos ninas padre padres madre guia guias
decir dice dijo cosa cosas momento algo bien asi tiempo vez veces""".split())


def fold(s):
    import unicodedata
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def toks(s):
    s = fold(re.sub(r"<[^>]+>", " ", s))
    return [t for t in re.findall(r"[a-z]+", s) if len(t) > 3 and t not in STOP]


docs = {slug: Counter(toks(b)) for slug, b in bodies.items()}
N = len(docs)
df = Counter()
for c in docs.values():
    df.update(set(c))


def keywords(c, k=45):
    scored = {w: (1 + math.log(cnt)) * math.log(N / df[w]) for w, cnt in c.items() if df[w] < N * 0.6 and cnt >= 2}
    return [w for w, _ in sorted(scored.items(), key=lambda x: -x[1])[:k]]


index = []
for e in order:
    g = G[e["slug"]]
    index.append({"slug": e["slug"], "title": g["title"], "section": SEC[e["section"]], "free": e["free"],
                  "line": g["line"], "phrases": [p.strip() for p in g["phrases"].split("·") if p.strip()],
                  "kw": keywords(docs[e["slug"]]), "crisis": e["crisis"]})

# ---------------------------------------------------------------------------
# Page shell (Spanish)
# ---------------------------------------------------------------------------
FONT = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap" rel="stylesheet">'
ROBOTS = "" if LIVE else '<meta name="robots" content="noindex">'


def shell(title, body, desc="", body_class="", robots=ROBOTS):
    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">{robots}
<meta name="theme-color" content="#1B2A4A">
<link rel="icon" href="/guides/assets/icon.svg" type="image/svg+xml">
{FONT}<link rel="stylesheet" href="/guides/assets/library.css?v=__V__"></head>
<body class="{body_class}">
<header class="top"><div class="wrap top-in">
<a class="brand" href="/guides/es/"><span class="sun" aria-hidden="true"></span><span><b>Bullyproof</b> Guías de Ayuda Rápida</span></a>
<a class="top-search" href="/guides/es/#search" aria-label="Buscar en las guías"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Buscar</span></a>
</div></header>
{body}
<footer class="foot"><div class="wrap">
<p class="foot-crisis"><b>Si un niño puede estar en peligro ahora mismo:</b> llame al <a href="tel:911">911</a>. Si hay pensamientos de suicidio, llame al <a href="tel:988">988</a> y oprima 2 para español, o envíe AYUDA por mensaje de texto al <a href="sms:988&body=AYUDA">988</a> o al <a href="sms:741741&body=AYUDA">741741</a>.</p>
<p>Estas guías ofrecen orientación general para padres. No son consejo médico, psicológico ni legal, y no reemplazan a un consejero, médico u otro profesional que conozca a su hijo.</p>
<p>© 2026 Kidsavers International, Inc. · <a href="https://www.bullyproof.support">Bullyproof.Support</a> · <a href="mailto:mark@bullyproof.guide">mark@bullyproof.guide</a></p>
</div></footer>
<script src="/guides/assets/library.js?v=__V__"></script>
</body></html>"""


# "Help Another Parent": shares ONLY the free Clarity Check, opened in Spanish on bullyproof.support.
SHARE_URL = "https://www.bullyproof.support/parent-clarity-check?lang=es&ref=guides-share"
SHARE_MSG = ("Encontré este Chequeo de Claridad para Padres gratis y pensé que te podría servir. Ayuda a los padres a "
             "entender mejor lo que les pasa a sus hijos y a pensar qué hacer después. ¡Te lo comparto!")
HEART = '<svg width="26" height="26" viewBox="0 0 24 24" fill="#C89B3C" aria-hidden="true"><path d="M12 21s-7.2-4.4-9.6-9.1C.8 8.6 2.6 4.8 6.3 4.3c2.1-.3 4 .8 5.7 2.7 1.7-1.9 3.6-3 5.7-2.7 3.7.5 5.5 4.3 3.9 7.6C19.2 16.6 12 21 12 21z"/></svg>'
SHARE_HTML = f"""<section class="share-card" data-share-url="{SHARE_URL}" data-share-msg="{html.escape(SHARE_MSG)}">
<div class="share-icon">{HEART}</div>
<h2 class="share-title">Ayude a otro padre a encontrar su siguiente paso</h2>
<p class="share-tag">No necesita tener todas las respuestas para ayudar a alguien a encontrar las suyas.</p>
<p class="share-body">¿Conoce a otro padre o madre que esté preocupado por su hijo o que no sepa qué hacer? Compártale el Chequeo de Claridad para Padres de Bullyproof, que es gratis, y ayúdele a dar su primer paso hacia más comprensión y confianza.</p>
<div class="share-buttons"><button class="btn gold sb-share" type="button">Compartir con un padre</button><button class="btn ghost sb-copy" type="button">Copiar enlace</button></div>
<div class="share-options" hidden><a class="share-opt sb-sms" href="#">Enviar por mensaje de texto</a><a class="share-opt sb-email" href="#">Enviar por correo</a><button class="share-opt sb-copymsg" type="button">Copiar el mensaje</button></div>
<p class="share-status" role="status" aria-live="polite"></p>
<p class="share-privacy">Solo se comparte la invitación al Chequeo de Claridad gratis. Nada sobre usted ni sobre su hijo.</p>
</section>"""


def guide_page(slug):
    e = next(x for x in index if x["slug"] == slug)
    inner = bodies[slug]
    tail = "" if e["free"] else SHARE_HTML
    return (f'<main class="wrap page"><nav class="crumb"><a href="/guides/es/">Todas las guías</a><span>›</span>'
            f'<span>{html.escape(e["section"])}</span></nav>\n<article class="guide">{inner}</article>{tail}</main>')


# ---------------------------------------------------------------------------
# Write output
# ---------------------------------------------------------------------------
if os.path.isdir(ES):
    shutil.rmtree(ES)
os.makedirs(ES, exist_ok=True)
VER = str(abs(hash(json.dumps(index, ensure_ascii=False))) % 10**8)

paid = {}
for e in index:
    full = shell(f"{e['title']} · {PRODUCT}", guide_page(e["slug"]), e["line"]).replace("__V__", VER)
    if e["free"]:
        d = os.path.join(ES, e["slug"])
        os.makedirs(d, exist_ok=True)
        # the free crisis guide is always open to search engines once the edition is live
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(full)
    else:
        paid[e["slug"]] = full

teasers = {e["slug"]: {"title": e["title"], "section": e["section"], "line": e["line"]} for e in index}
payload = json.dumps({"PAGES": paid, "TEASERS": teasers,
                      "SHELL": shell("__TITLE__", "__BODY__", "__DESC__").replace("__V__", VER)}, ensure_ascii=False).encode("utf-8")
tmp = os.path.join(ROOT, ".plain-es.json")
open(tmp, "wb").write(payload)
try:
    enc = subprocess.run(["node", os.path.join(ROOT, "encrypt.mjs"), tmp, KEYFILE], capture_output=True, text=True, check=True).stdout
finally:
    os.remove(tmp)
with open(os.path.join(FN, "qhg-content-es.enc.mjs"), "w") as fh:
    fh.write("// Generated by build_es.py — encrypted Spanish paid guide pages. Decrypted at runtime by qhg-content-es.mjs.\n")
    fh.write("export const BLOB = " + enc + ";\n")

json.dump(index, open(os.path.join(PUB, "assets", "index-es.json"), "w", encoding="utf-8"), ensure_ascii=False)


def sections_html():
    out = []
    for i, (s, slugs) in enumerate(sections):
        items = "".join(
            f'<li><a href="/guides/es/{slug}/"><span class="t">{html.escape(G[slug]["title"])}</span>'
            f'{"<span class=free-tag>Gratis</span>" if slug in FREE else ""}'
            f'<span class="l">{html.escape(G[slug]["line"])}</span></a></li>' for slug in slugs)
        n = len(slugs)
        label = (f"{n} extras" if s == SEC["Also included"] else f'{n} guía{"s" if n > 1 else ""}')
        out.append(f'<details class="sec"{" open" if i == 0 else ""}><summary><span class="sec-t">{html.escape(s)}</span>'
                   f'<span class="sec-n">{label}</span></summary><ul>{items}</ul></details>')
    return "\n".join(out)


INTRO = """<div class="in-part">
<h2 class="in-title">Nadie le enseñó a hacer esto.</h2>
<ul class="in-nobody"><li>Nadie se sentó con usted a enseñarle qué decir cuando su hijo llega llorando a la casa y no le quiere decir por qué.</li><li>Nadie le enseñó la frase para cuando le dice <em>no le caigo bien a nadie</em> y lo dice en serio.</li><li>Nadie le dio las palabras para el momento en que su hijo le cuenta algo y luego le pide que no se lo diga a nadie.</li></ul>
<p class="in-strong">Y aun así, se espera que usted sepa qué hacer.</p>
<p class="in-body">En el momento. Con su propia historia de fondo, con su propio miedo haciendo ruido y sin ningún ensayo.</p>
</div>
<div class="in-part">
<p class="in-lead">La mayoría de los consejos para padres suponen que usted tiene tiempo.</p>
<ul class="in-time"><li>Tiempo para leer el libro.</li><li>Tiempo para pensarlo bien.</li><li>Tiempo para calmarse y retomarlo mañana con la cabeza fría.</li></ul>
<div class="in-now"><p class="in-now-big">Usted no tiene tiempo.</p><p>Tiene este momento, en la entrada de la casa, con su hijo en el asiento de al lado.</p></div>
</div>
<div class="in-part">
<h2 class="in-turn">Para eso son estas guías.</h2>
<ol class="in-each"><li><span class="in-lab">Una situación</span>Cada una trata una sola situación.</li><li><span class="in-lab">Las palabras exactas</span>Cada una le da las palabras exactas: qué decir, qué no decir y por qué importa la diferencia.</li><li><span class="in-lab">Lo bastante rápida</span>Cada una es lo bastante corta para leerla en el tiempo que toma estacionar el carro.</li><li><span class="in-lab">Una capa más profunda</span>Y cada una tiene una parte más larga debajo, para cuando quiera entender lo que de verdad está pasando y no solo qué decir.</li></ol>
<p class="in-note">Aquí no va a encontrar todas las respuestas. Algunas situaciones necesitan a un maestro, un consejero o un profesional. Cuando sea así, la guía se lo va a decir con claridad.</p>
<p class="in-close">Pero para las veinticinco situaciones en las que los padres se encuentran más seguido, esas en las que usted está solo y el momento es ahora, aquí está todo el juego.</p>
<p class="in-final">Lea la que se parezca a esta noche.<br>Regrese por las demás cuando las necesite.</p>
</div>"""

home = f"""<main>
<section class="hero"><div class="wrap">
<p class="kicker light">Ayuda práctica, disponible hoy</p>
<h1>{PRODUCT}</h1>
<p class="lede">Las palabras exactas para los momentos más difíciles: qué decir, qué no decir y por qué importa. Veinticinco situaciones, cada una lo bastante corta para leerla en la entrada de la casa.</p>
<div id="search" class="search-box">
<label for="q" class="sr">Describa lo que está pasando</label>
<input id="q" type="search" autocomplete="off" placeholder="Describa lo que está pasando" aria-describedby="q-hint">
<p id="q-hint" class="hint">Por ejemplo: <button type="button" class="ex">no quiere hablar conmigo</button> <button type="button" class="ex">llora antes de la escuela</button> <button type="button" class="ex">lo sacaron del chat del grupo</button></p>
</div>
<div id="results" aria-live="polite"></div>
<div id="owner-note" class="owner-note" hidden>Usted tiene acceso completo a todas las guías en este dispositivo.</div>
</div></section>

<section class="wrap intro-wrap"><div class="intro">{INTRO}</div></section>

<section class="wrap contents"><h2>Encuentre su situación</h2>
<p class="sub">Agrupadas según lo que usted está viendo en casa, no por tema. Abra el título que se parezca a esta noche.</p>
{sections_html()}
</section>

<section class="wrap buy" id="buy"><div class="buy-card">
<div class="buy-copy"><p class="kicker">Una biblioteca digital · acceso inmediato</p>
<h2>Las 25 guías, {PRICE}</h2>
<ul class="ticks">
<li>Cada guía en dos capas: la Ayuda rápida de 45 segundos, y una capa más profunda para cuando quiera entender lo que pasa</li>
<li>Las palabras exactas para decir, los errores comunes que conviene evitar, y qué hacer esta noche y esta semana</li>
<li>Busque describiendo lo que está pasando y llegue directo a la guía correcta</li>
<li>Además, <b>Por qué lo hacen</b> y <b>Lo que su hijo puede decir</b>, una hoja de frases que su hijo puede practicar</li>
<li>En español y en inglés, con una sola compra</li>
<li>Funciona en su teléfono de inmediato. Sin cuenta, sin aplicación, sin contraseña</li>
</ul>
<p class="small">La guía de crisis, <a href="/guides/es/my-child-doesnt-want-to-be-here-anymore/">Mi hijo o hija ya no quiere estar aquí</a>, es gratis para todos los padres, siempre. Sus {PRICE} pagan las otras veinticuatro.</p>
</div>
<div class="buy-act"><a id="buy-btn" class="btn gold" href="#">Obtener las 25 guías · {PRICE}</a>
<p class="small center" id="buy-note">Pago seguro con Stripe. Kidsavers International, Inc.</p>
<p class="small center">¿Ya las compró? <a href="/guides/es/restore/">Abra sus guías de nuevo</a></p></div>
</div></section>
<div class="wrap">{SHARE_HTML}</div>
<script src="/guides/assets/config.js?v={VER}"></script>
</main>"""
open(os.path.join(ES, "index.html"), "w", encoding="utf-8").write(
    shell(PRODUCT, home, "Veinticinco guías cortas con las palabras exactas para cuando a su hijo lo están acosando. Busque describiendo lo que pasa.", body_class="home").replace("__V__", VER))

welcome = """<main class="wrap"><div class="panel">
<p class="kicker">Gracias</p>
<h1>Sus guías están listas</h1>
<p>Las 25 guías ya están abiertas para usted en este dispositivo, en español y en inglés. No hay nada que descargar ni contraseña que recordar.</p>
<p><a class="btn gold" href="/guides/es/">Abrir las guías</a></p>
<h2 style="font:700 20px Inter,sans-serif;color:var(--navy);margin:28px 0 6px">Guarde su enlace privado</h2>
<p>Este enlace abre sus guías en cualquier teléfono o computadora. Por favor guárdelo ahora, porque es la llave de su biblioteca.</p>
<div class="copybox"><input id="lnk" readonly aria-label="Su enlace privado"><button type="button" id="cp">Copiar</button></div>
<p><a id="mail" class="btn navy" href="#">Enviarme este enlace por correo</a></p>
<p class="small">Consejo: en su teléfono, abra sus guías y agregue la página a su pantalla de inicio. Se abrirá como una aplicación.</p>
</div>""" + SHARE_HTML + """</main>
<script>
(function(){var k=(location.search.match(/k=([a-f0-9]+)/)||[])[1];var i=document.getElementById('lnk');
if(!k){i.value='Abra sus guías con el botón de arriba';return;}
var u=location.origin+'/guides/access/'+k;i.value=u;
document.getElementById('cp').onclick=function(){i.select();try{navigator.clipboard.writeText(u)}catch(e){document.execCommand('copy')}this.textContent='Copiado';};
document.getElementById('mail').href='mailto:?subject='+encodeURIComponent('Mis Guías de Ayuda Rápida de Bullyproof')+'&body='+encodeURIComponent('Mi enlace privado a las 25 Guías de Ayuda Rápida de Bullyproof:\\n\\n'+u+'\\n\\nÁbralo en cualquier teléfono o computadora.');
try{history.replaceState(null,'','/guides/es/welcome/')}catch(e){}})();
</script>"""
os.makedirs(os.path.join(ES, "welcome"), exist_ok=True)
open(os.path.join(ES, "welcome", "index.html"), "w", encoding="utf-8").write(
    shell("Sus guías están listas · " + PRODUCT, welcome, robots='<meta name="robots" content="noindex">').replace("__V__", VER))

restore = """<main class="wrap"><div class="panel">
<h1>Abra sus guías de nuevo</h1>
<p>¿Tiene un teléfono o computadora nuevos, o perdió su enlace? Escriba el correo que usó al pagar y le enviaremos su enlace privado a esa dirección.</p>
<form id="rf"><label for="em" class="small">Correo que usó al pagar</label>
<input id="em" class="field" type="email" required autocomplete="email" placeholder="usted@correo.com">
<button class="btn gold" type="submit">Enviarme mi enlace</button></form>
<div id="rm" class="msg" hidden></div>
<p class="small" style="margin-top:20px">¿Sigue sin poder entrar? Escriba a <a href="mailto:mark@bullyproof.guide">mark@bullyproof.guide</a> y le ayudaremos a entrar de nuevo.</p>
</div></main>
<script>
document.getElementById('rf').onsubmit=function(e){e.preventDefault();var m=document.getElementById('rm');
fetch('/guides/api/restore',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:document.getElementById('em').value,lang:'es'})})
.then(function(r){return r.json()}).then(function(d){m.hidden=false;
if(!d.ok){m.className='msg err';m.textContent='Por favor revise ese correo e inténtelo de nuevo.';return;}
m.className='msg';m.textContent=d.emailing?'Si ese correo compró las guías, su enlace privado ya va en camino. Revise su bandeja de entrada (y la carpeta de spam) en un minuto.':'Gracias. Por favor escriba a mark@bullyproof.guide desde ese correo y le enviaremos su enlace de inmediato.';})
.catch(function(){m.hidden=false;m.className='msg err';m.textContent='Algo salió mal. Por favor inténtelo de nuevo.';});};
</script>"""
os.makedirs(os.path.join(ES, "restore"), exist_ok=True)
open(os.path.join(ES, "restore", "index.html"), "w", encoding="utf-8").write(
    shell("Abra sus guías de nuevo · " + PRODUCT, restore).replace("__V__", VER))

print("Spanish guides:", len(index), "paid pages:", len(paid), "version", VER, "live" if LIVE else "(not live: noindex)")
