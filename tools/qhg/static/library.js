/* Bullyproof Quick Help Guides — description search.
   Parents type what's happening in their own words; we match against Mark's parent-phrase
   vocabulary, the titles, and distinctive words from each guide. Crisis words always pin the
   free crisis guide first. No results never dead-ends: it falls back to the sections. */
// Turn on when the Spanish library is approved: English pages then show the "Español" switch.
var QHG_SPANISH_LIVE = true;
var QHG_ES = document.documentElement.lang === "es";
var QHG_BASE = QHG_ES ? "/guides/es/" : "/guides/";
function QL(en, es) { return QHG_ES ? es : en; }
(function () {
  var CRISIS_ES = /(quiere(n)?\s+morir(se)?|quisiera\s+morir|desea(ria)?\s+(estar\s+muert|morir|no\s+haber\s+nacido)|matar(se|me|te)|suicid|quitar(se|me)\s+la\s+vida|(se|me)\s+(quiere|quiero|queria|va\s+a|voy\s+a)\s+matar|matarse|matarme|hacer(se|me)\s+dano|lastimar(se|me)|autolesi|cortar(se|me)|se\s+corta|se\s+esta\s+cortando|cortandose|no\s+quiere\s+(estar\s+aqui|vivir|seguir)|ya\s+no\s+quiere\s+(estar|vivir)|mejor\s+sin\s+(el|ella|mi|nosotros)|acabar\s+con\s+(todo|su\s+vida)|no\s+aguanta\s+mas|desaparecer|no\s+despertar|dormir\s+para\s+siempre|no\s+haber\s+nacido|mejor\s+muert|sobredosis)/;
  var CRISIS = /(want(s|ed)?\s+to\s+die|wish(es)?\s+(he|she|they|i)\s+(was|were|wasn'?t|weren'?t)\s+(dead|born)|kill(ing)?\s+(him|her|them|my|your)sel|suicid|self[\s-]?harm|hurt(ing|s)?\s+(him|her|them)sel|cutting\s+(him|her|them)sel|cuts?\s+(him|her|them)sel|do(es)?n'?t\s+want\s+to\s+(be\s+here|live|be\s+alive)|end(ing)?\s+(it\s+all|(his|her|their|my)\s+life)|can'?t\s+go\s+on|disappear|(never|not)\s+wake\s+up|sleep\s+forever|never\s+been\s+born|no\s+reason\s+to\s+live|better\s+off\s+dead|better\s+off\s+without\s+(him|her|me|them)|not\s+be\s+(here|around)\s+(anymore|next)|overdose)/i;
  var STOP = ("a an and the to of in on at is are was were be been it its i im i'm my me we our you your he she him her his hers they them their " +
    "this that these those with for from about what how when do does did doesnt dont not no so just really very " +
    "child kid kids son daughter boy girl teen children can cant will would should could has have had get got keep keeps " +
    "anymore all any some there here someone somebody something anyone anybody people person thing things stuff other others another every everyone lot lots always never again still being been already").split(" ").concat(("el la los las un una unos unas y o de del al a en con por para que se su sus mi mis tu es son esta estan esto eso ese esa lo le les me te nos ya no si muy mas pero como cuando porque hijo hija hijos hijas nino nina ninos ninas mi hijo me dice dice tiene hace alguien algo alguno alguna cosa cosas siempre otra otro otros todos todo nunca").split(" "));
  // Words in almost every title ("bullied") say nothing about WHICH guide, so titles ignore them.
  var GENERIC = {}; ("bullied bully bullies bullying acosan acosando acoso acosado acosada").split(" ").forEach(function (w) { GENERIC[w] = 1; });
  var stop = {}; STOP.forEach(function (w) { stop[w] = 1; });
  var SYN = { cyber: "online", cyberbullying: "online", texting: "texts", text: "texts", insta: "instagram", snap: "snapchat",
    bus: "bus", excluded: "left", exclude: "left", ignoring: "ignored", ignores: "ignored", crying: "cries", cry: "cries",
    sobbing: "cries", tears: "cries", talking: "talk", talks: "talk", fight: "fighting", fights: "fighting", hitting: "hit",
    hits: "hit", popular: "popular", teacher: "teacher", teachers: "teacher", principal: "principal", weight: "weight",
    fat: "weight", looks: "looks", appearance: "looks", homeschool: "homeschooled", quit: "quit", quitting: "quit", scared: "afraid", frightened: "afraid", terrified: "afraid" };

  // What parents mean, in their own words. Each pattern points to the guides that actually help,
  // best first. Written for real parent phrasing ("someone keeps taking his stuff"), which the
  // word-by-word match alone can miss. English and Spanish patterns run on accent-free lowercase text.
  var FIGHT_EN = /\b(hit|hits|punch\w*|push\w*|kick\w*|shov\w*|slap\w*|fight\w*|beat)\s+(someone|somebody|another|a (kid|boy|girl|classmate)|the other|back|him back|her back|them back)\b|\bfighting back\b|\b(got|get|getting) (in|into) (a )?fights?\b|\bsuspended\b|\bin trouble for\b|\bretaliat|\b(hit|punch\w*|push\w*|shov\w*|kick\w*|slap\w*)\s+(the|a|that|this)\s+(kid|boy|girl|bully|other)|\b(now|is) the one (being mean|bullying|doing it|hurting)|\b(turned into|became|is now|is becoming) (a|the) bully|\bbullying (other|younger) kids|\bmean to (other|younger) kids/;
  var FIGHT_ES = /\b(le pego a|pego a (un|una|otro|otra)|golpeo a|empujo a|se pelea|se peleo|peleas? en la escuela|lo suspendieron|la suspendieron|suspendid[oa]|se defendio|devolvio el golpe|regreso el golpe|respondio (con|a) golpes|ahora (el|ella) es (el|la) que (molesta|acosa|lastima)|se volvio (un|una) (abusador|abusona|bully)|molesta a otros ninos)/;
  var SERIOUS_EN = /\b(gun|guns|knife|knives|weapon|shoot|shooting|stab\w*|kill (him|her|them|my|you|me)\b(?!sel))/;
  var SERIOUS_ES = /\b(pistola|arma|cuchillo|navaja|disparar|balacera|matar(lo|la|los|te)?\b|apunalar)/;
  var C_ADMIT = ["my-child-finally-admits-theyre-being-bullied", "what-your-child-can-say", "the-school-on-my-side"];
  var CONCEPTS = [
    // belongings taken, hidden, broken
    { en: /\b(tak\w*|took|stol\w*|steal\w*|swip\w*|grab\w*|snatch\w*|hid|hide\w*|hiding|break\w*|broke\w*|ruin\w*|wreck\w*|destroy\w*|throw\w*|threw|trash\w*|dump\w*|rip\w*|tore|torn|mess\w* with|keeps? taking)\b.*\b(things?|stuff|belongings?|bags?|backpacks?|lunch\w*|money|phones?|shoes?|books?|pencils?|homework|toys?|food|snacks?|hats?|jackets?|coats?|glasses|binders?|clothes|ipads?|tablets?|airpods|headphones|bottles?|bikes?|lockers?|supplies|chromebook|laptop|sweater|hoodie)\b|\blunch money\b|\bstealing\b/,
      es: /\b(quit\w*|rob\w*|escond\w*|romp\w*|roto|rota|tira\w*|destroz\w*|agarr\w*|arrebat\w*|desaparec\w*)\b.*\b(cosas?|mochilas?|lonche|almuerzo|comida|dinero|telefono|celular|zapatos?|tenis|libros?|lapiz|lapices|tarea|juguetes?|gorra|chamarra|chaqueta|sueter|lentes|ropa|botella|bici\w*|casillero|utiles|tableta|audifonos)\b|\ble roban\b|\blo roban\b/,
      g: C_ADMIT, w: [14, 11, 9], notIf: [/\btake (away )?(his|her|their|the) (phone|tablet|ipad)\b|\b(phone|tablet) away\b|\btake away\b/, /\bquitar(le)? el (telefono|celular)\b/] },
    // hit, pushed, tripped (but not "my child hit someone")
    { en: /\b(hit|hits|hitting|punch\w*|kick\w*|push\w*|shov\w*|trip\w*|slap\w*|chok\w*|beat\w* (him|her|them|my \w+) up|beat up|beaten|beating|jump(ed)? (him|her|my)|attack\w*|spit\w*|pinch\w*|hurt(s|ing)? (him|her|them|my)\b(?! ?sel)|physical\w*|rough\w* up|pick\w* fights? with (him|her))/,
      es: /\b(le pegan|le pegaron|le pega (un|una|otro|otra|el|la)|lo golpe\w*|la golpe\w*|golpean|empuj\w*|pate\w*|zancadill\w*|cachete\w*|bofet\w*|ahorc\w*|lo lastim\w*|la lastim\w*|lo agred\w*|la agred\w*|agresion|fisic\w*|escupe|escupen|pellizc\w*|lo tumb\w*|la tumb\w*)/,
      g: ["my-child-finally-admits-theyre-being-bullied", "what-your-child-can-say", "told-the-teacher-and-nothing-changed"], w: [14, 11, 8], notIf: [FIGHT_EN, FIGHT_ES], minus: { "my-child-started-fighting-back": 12 } },
    { en: FIGHT_EN, es: FIGHT_ES, g: ["my-child-started-fighting-back"], w: [16] },
    // bruises, torn clothes, coming home hurt: signs first
    { en: /\b(bruis\w*|scratch\w*|torn clothes|ripped clothes|black eye|came home hurt|injur\w*)/, es: /\b(moret\w*|rasgun\w*|ropa rota|ojo morado|llego lastimad\w*|herid\w*)/,
      g: ["i-think-my-child-is-being-bullied", "my-child-finally-admits-theyre-being-bullied"], w: [14, 11] },
    // threats
    { en: /\b(threat\w*|gonna (hurt|kill|beat|get|jump)|going to (hurt|kill|beat|get|jump|shoot|stab)|said (he|she|they)( would| will|d)? (hurt|kill|beat|shoot|stab|bring)|weapon|gun|guns|knife)\b/,
      es: /\b(amenaz\w*|lo van a|la van a|le van a|pistola|arma|cuchillo|navaja|disparar)\b/,
      g: ["what-your-child-can-say", "the-school-on-my-side", "my-child-finally-admits-theyre-being-bullied"], w: [14, 11, 9] },
    // rumors and lies
    { en: /\b(rumou?rs?|gossip\w*|lies about|lying about|telling lies|spread\w* (stuff|things|lies|stories)|talk\w* behind|saying things about|said things about|turned (everyone|people|the class) against)/,
      es: /\b(rumor\w*|chism\w*|mentiras sobre|inventan|hablan mal|hablan a sus espaldas|pusieron a todos en contra)/,
      g: ["my-child-is-being-left-out", "my-child-finally-admits-theyre-being-bullied", "what-your-child-can-say"], w: [13, 10, 8] },
    // looks
    { en: /\b(weight|fat|chubby|skinny|ugly|glasses|braces|hair|acne|pimples|zits|skin|nose|teeth|short|tall|clothes|body|looks|appearance|height|freckles|smell\w*)\b/,
      es: /\b(peso|gord\w*|flac\w*|fe[oa]s?|lentes|anteojos|frenos|brackets|pelo|cabello|granos|acne|piel|nariz|dientes|bajit\w*|chaparr\w*|alt[oa]s?|ropa|cuerpo|apariencia|huele|olor|pecas)\b/,
      g: ["teased-about-their-appearance"], w: [12] },
    // who they are
    { en: /\b(accent|race|racis\w*|religio\w*|muslim|jewish|christian|black|brown|asian|latin\w*|hispanic|mexican|immigrant|gay|lesbian|trans\w*|lgbt\w*|queer|autis\w*|adhd|disab\w*|special (needs|ed)|wheelchair|deaf|stutter\w*|different|weird|poor|culture|language|english|spanish|new kid|adopted|two moms|two dads|divorce\w*)\b/,
      es: /\b(acento|raza|racis\w*|religi\w*|musulman\w*|judi\w*|negr\w*|morenit\w*|indigena|inmigrante|gay|lesbiana|trans\w*|lgbt\w*|autis\w*|tdah|discapac\w*|necesidades especiales|silla de ruedas|sord[oa]|tartamud\w*|diferente|rar[oa]|pobre|cultura|idioma|ingles|espanol|nuevo en la escuela|nueva en la escuela|adoptad\w*|dos mamas|dos papas)\b/,
      g: ["bullied-because-theyre-different"], w: [12] },
    // names, teasing, laughing at
    { en: /\b(call\w* (him|her|them|my \w+) (names|\w+)|names|name.?call\w*|mak\w* fun|made fun|laugh\w* at|teas\w*|mock\w*|insult\w*|picking on|pick on|picked on|being mean|mean to|cruel to|embarrass\w*|humiliat\w*|swear\w* at|cuss\w* at)/,
      es: /\b(apod\w*|insult\w*|groserias|le dicen|se burl\w*|burlas?|se rien|rien de|lo molestan|la molestan|molest\w*|humill\w*|avergonz\w*|lo tratan mal|la tratan mal)/,
      g: ["what-your-child-can-say", "my-child-finally-admits-theyre-being-bullied", "why-they-do-it"], w: [8, 7, 6] },
    // an adult is the problem
    { en: /\b(teacher|coach|principal|aide|staff|bus driver)\b.*\b(mean|yell\w*|bully\w*|bullies|picks? on|picking on|embarrass\w*|humiliat\w*|unfair|singl\w* (him|her) out|targets?)\b/,
      es: /\b(maestr[oa]|profesor\w*|entrenador\w*|director\w*)\b.*\b(grit\w*|humill\w*|se burla|trata mal|acos\w*|injust\w*|la trae contra|lo trae contra)\b/,
      g: ["told-the-teacher-and-nothing-changed", "the-school-on-my-side"], w: [13, 11] },
    // pictures or videos shared
    { en: /\b(photos?|pictures?|pics?|videos?|nudes?|naked)\b.*\b(post\w*|shar\w*|sent|send\w*|spread\w*|around|online|everyone)\b|\b(post\w*|shar\w*|sent|spread\w*|record\w*|filmed)\b.*\b(photos?|pictures?|pics?|videos?)\b/,
      es: /\b(fotos?|videos?|imagen\w*|desnud\w*)\b.*\b(public\w*|compart\w*|mand\w*|envi\w*|subi\w*|circul\w*|grab\w*)\b|\b(grab\w*|subi\w*|public\w*)\b.*\b(fotos?|videos?)\b/,
      g: ["my-child-is-being-bullied-online"], w: [15] },
    // body signs
    { en: /\b(nightmares?|can.?t sleep|not sleeping|trouble sleeping|won.?t sleep|bed.?wet\w*|wetting the bed|not eating|won.?t eat|stopped eating|appetite|skipping lunch)\b/,
      es: /\b(pesadillas?|no duerme|no puede dormir|no quiere dormir|moja la cama|no come|no quiere comer|dejo de comer|apetito)\b/,
      g: ["i-think-my-child-is-being-bullied", "my-child-cries-every-morning"], w: [12, 9] },
    // mood signs
    { en: /\b(sad|withdrawn|moody|irritable|angry all the time|mad all the time|snaps at|stays in (his|her|their) room|isolat\w*|not (him|her|them)self|depressed|down lately|quiet lately|different lately|changed)\b/,
      es: /\b(triste|retraid\w*|aislad\w*|enojad\w*|irritable|no es (el|la) mism[oa]|se encierra|encerrad\w*|deprimid\w*|cambiad[oa]|callad[oa])\b/,
      g: ["i-think-my-child-is-being-bullied", "my-child-wont-talk"], w: [11, 8] },
    // grades
    { en: /\b(grades?|failing|homework|report card|stopped trying|doesn.?t care about school)\b/, es: /\b(calificaciones|notas|reprob\w*|boleta|dejo de esforzarse|ya no le importa la escuela)\b/,
      g: ["i-think-my-child-is-being-bullied", "my-child-is-losing-confidence"], w: [11, 10] },
    // sick to avoid school
    { en: /\b(fak\w* (being )?sick|pretend\w* (to be )?sick|says (he|she|they)?.?s? sick|claims? (to be )?sick|sick every|school nurse|nurse.?s office|calls? (me )?(to come home|from school)|stomach\w*|headaches?)\b/,
      es: /\b(fing\w*|se hace (el|la) enferm[oa]|dice que (esta|se siente) enferm[oa]|dolor de (estomago|cabeza|panza)|enfermeria|la enfermera|me llaman de la escuela)\b/,
      g: ["my-child-cries-every-morning", "my-child-wants-to-quit-school"], w: [13, 9] },
    // "fine", "nothing"
    { en: /\b(says?|saying|answers?|tells me)\b.*\b(fine|ok|okay|nothing|good|i dont know|idk)\b/, es: /\b(dice|contesta|responde)\b.*\b(bien|nada|no se)\b/,
      g: ["my-child-wont-talk"], w: [12] },
    // not sure yet
    { en: /\b(i think|think (my|he|she|they)|suspect|wonder\w*|not sure|how (do|can|would) i (know|tell)|signs?|is (he|she|my \w+) being bullied)\b/,
      es: /\b(creo que|sospech\w*|no (estoy|se) segur\w*|como (se|saber) si|senales|sera que)\b/,
      g: ["i-think-my-child-is-being-bullied"], w: [12] },
    // just found out
    { en: /\b(told me|just found out|found out|admitted|finally (told|said|opened up)|opened up)\b/,
      es: /\b(me conto|me dijo que|me acabo de enterar|me entere|admitio|por fin me)\b/,
      g: ["my-child-finally-admits-theyre-being-bullied"], w: [12] },
    // the bus
    { en: /\b(bus|buses|bus stop|bus driver)\b/, es: /\b(autobus|camion escolar|el bus|en el bus|la parada)\b/, g: ["bullied-on-the-bus"], w: [14] },
    // left out of a group chat
    { en: /\b(group ?chats?|group texts?|the chat|chat group|groupchat)\b/, es: /\b(chats? de grupo|grupo de (whatsapp|chat|texto)|el chat|el grupo)\b/, g: ["left-out-of-group-chats", "my-child-is-being-bullied-online"], w: [16, 6] },
    // online and games
    { en: /\b(online|internet|social media|instagram|insta|snapchat|snap|tiktok|youtube|discord|roblox|fortnite|minecraft|xbox|playstation|ps5|gaming|video ?games?|game chat|whatsapp|texts?|texting|dms?|messages?|messag\w*|comments?|posted|posting|post|fake (account|profile)|hacked|cyber\w*)\b/,
      es: /\b(internet|en linea|redes sociales|instagram|snapchat|tiktok|youtube|discord|roblox|fortnite|minecraft|whatsapp|mensajes?|textos?|comentarios?|publica\w*|cuenta falsa|perfil falso|videojuegos?|jueg\w* en linea|ciberacoso)\b/,
      g: ["my-child-is-being-bullied-online"], w: [13] },
    // the school isn't acting
    { en: /\b((won.?t|didn.?t|doesn.?t|don.?t|isn.?t|aren.?t|never|not) (do|doing|did|done|help\w*) (anything|nothing|much)|did nothing|does nothing|nothing (changed|happened|was done|is being done)|keeps happening|still happening|reported (it|this|them)|take (it|this|us|me|him|her) seriously|get the school to|make the school|told the (teacher|school|principal|counselor|office)|school (ignored|ignores|isn.?t|won.?t|didn.?t))\b/,
      es: /\b(no (hace|hizo|hacen|hicieron) nada|nada cambio|sigue pasando|lo reporte|lo reportamos|le dije a la (maestra|escuela)|le avise a|la escuela no|tomen en serio|tome en serio)\b/,
      g: ["told-the-teacher-and-nothing-changed"], w: [14] },
    // won't tell ME
    { en: /\b(won.?t|doesn.?t|refuses to|will not|does not|wont|doesnt) (tell|talk to|talk with|open up to|say anything to) me\b|\bshut\w* (me out|down)\b/,
      es: /\b(no me (quiere )?(cuenta|dice|habla)|no quiere hablar(me)?|se cierra)\b/,
      g: ["my-child-wont-talk", "my-child-tells-me-only-part-of-the-story"], w: [14, 8] },
    // confidence
    { en: /\b(stupid|dumb|idiot|loser|hates (himself|herself|themselves)|worthless|not good enough|can.?t do anything right|gave up|giving up|try ?outs?|stopped (doing|playing|going to|trying)|quit (the team|soccer|band|sports|baseball|basketball|dance)|no confidence|self.?esteem|(doesn.?t|does not|won.?t) want to (go to|play) (practice|soccer|baseball|basketball|football|dance|band|the team|lessons)|self.?confidence|insecure|doubts (himself|herself))\b/,
      es: /\b(tont[oa]|estupid[oa]|burr[oa]|inutil|no sirve para nada|se odia|no vale nada|se rindio|dejo (el equipo|de jugar|de ir|de intentar)|autoestima|confianza en si|insegur[oa]|(ya no quiere|no quiere) (ir|jugar)( al| a la| a| en el)? (equipo|futbol|beisbol|basquet\w*|danza|baile|clases?|practicas?|entrenamientos?)|dejar el equipo)\b/,
      g: ["my-child-is-losing-confidence"], w: [13] },
    // mornings
    { en: /\b(melt\w*|meltdowns?|tantrums?|panic\w*|freak\w* out|anxious|anxiety|dread\w*|cling\w*|screams?|screaming)\b.*\b(morning|mornings|school|before|drop.?off|car)\b|\bevery (school )?morning\b|\bmornings? are\b/,
      es: /\b(berrinche\w*|ataque\w*|panico|ansiedad|ansios[oa]|se aferra|grita\w*)\b.*\b(manana|mananas|escuela|antes)\b|\btodas las mananas\b/,
      g: ["my-child-cries-every-morning"], w: [13] },
    // left out
    { en: /\b((won.?t|don.?t|wont|dont|doesn.?t|didn.?t) let (him|her|them|me) (play|sit|join|hang)|left out|leave (him|her|them) out|leaving (him|her|them) out|excluded|excluding|uninvited|not invited|wasn.?t invited|no one (plays|sits|talks|hangs)|nobody (plays|sits|talks|hangs)|alone at (recess|lunch)|sits? alone|by (himself|herself) at|sleepover|birthday part(y|ies)|parties)\b/,
      es: /\b(no (lo|la|los) dejan (jugar|sentarse|juntarse)|(lo|la) dejan (fuera|de lado)|excluid\w*|no (lo|la) invit\w*|nadie juega|nadie se sienta|sol[oa] en el (recreo|almuerzo)|pijamada|fiesta\w*)\b/,
      g: ["my-child-is-being-left-out"], w: [13] },
    // nobody likes me
    { en: /\b(no ?one|nobody|noone) (wants to be|likes|wants to play with|wants to sit with|cares about) (his|her|their|my|him|her|them|me)?\b|\bno friends\b|\bdoesn.?t have (any )?friends\b|\beveryone hates\b|\bhates me\b/,
      es: /\b(nadie (lo|la|me) quiere|nadie quiere ser su amig\w*|no le caigo bien|no tiene amig\w*|todos (lo|la|me) odian)\b/,
      g: ["my-child-says-nobody-likes-me"], w: [14] },
    // a friend or family member
    { en: /\b(best friend|bff|cousin|cousins|neighbor|teammate|frenemy|friend group|used to be (close|friends)|(his|her|their) (own )?friends? (is|are|keeps|has been|was|turned|started)|friends? (is|are|keeps|turned|started) (being )?(mean|bullying|picking|excluding|ignoring))\b/,
      es: /\b(mejor amig\w*|prim[oa]s?|vecin\w*|compañer\w* de equipo|eran amig\w*|su amig[oa] (lo|la) (molesta|acosa|trata mal))\b/,
      g: ["bullied-by-a-friend"], w: [13] },
    // phones and screens at home
    { en: /\btake (away )?(his|her|their|the) (phone|tablet|ipad)\b|\b(phone|tablet) away\b|\bscreen time\b|\bban (the )?phone\b/, es: /\b(quitar(le)? el (telefono|celular)|tiempo de pantalla)\b/,
      g: ["my-child-is-being-bullied-online", "left-out-of-group-chats"], w: [14, 10] },
    // why do they do it
    { en: /\bwhy (do|are|would|does|is|did) (kids|children|they|bullies|bullys|people|some kids|other kids|these kids|those kids|he|she)\b|\bwhy (him|her|my (son|daughter|child|kid))\b|\bso mean\b/,
      es: /\b(por que|porque) (los ninos |las ninas |los |las )?(acos\w*|molest\w*|son (asi|tan crueles|crueles|malos)|lo hacen|le hacen)|\bpor que a (el|ella|mi hij\w*)\b/,
      g: ["why-they-do-it"], w: [14] },
    // afraid of being the one who told
    { en: /\b(snitch\w*|tattl\w*|rat (on|out)|narc|scared to (tell|report)|afraid to (tell|report)|won.?t (tell|report) (it )?(to )?(the |a |his |her |any |an )?(teacher|adult|school|counselor|principal|anyone at school)|doesn.?t want to (tell|report) (the |a |his |her )?(teacher|adult|school))\b/,
      es: /\b(chismos\w*|soplon\w*|acuse\w*|rajon\w*|miedo (de|a) (decir|contar|acusar)|no quiere (decir|contar)le)\b/,
      g: ["afraid-to-tell-the-teacher"], w: [14] },
    // plain "being bullied"
    { en: /\b(bullied|bullying|bully|bullies|being picked on)\b/, es: /\b(acos\w*|bullying|abusan)\b/,
      g: ["my-child-finally-admits-theyre-being-bullied", "i-think-my-child-is-being-bullied", "what-your-child-can-say"], w: [7, 6, 5] }
  ];
  function conceptScores(qn) {
    var out = {}, t = qn.trim();
    CONCEPTS.forEach(function (c) {
      var re = QHG_ES ? c.es : c.en;
      if (!re || !re.test(t)) return;
      if (c.notIf && c.notIf.some(function (x) { return x && x.test(t); })) return;
      c.g.forEach(function (slug, i) { out[slug] = (out[slug] || 0) + c.w[i]; });
      if (c.minus) for (var k in c.minus) out[k] = (out[k] || 0) - c.minus[k];
    });
    return out;
  }

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

  function score(d, qn, qt, cs) {
    var strong = cs[d.e.slug] || 0, weak = 0, set = {}, th = 0, kh = 0; qt.forEach(function (t) { set[t] = 1; });
    var part = 0;
    d.phrases.forEach(function (p) {
      if (p.n.length > 3 && qn.indexOf(p.n) > -1) { strong += 12; return; }
      if (!p.t.length) return;
      var hit = p.t.filter(function (t) { return set[t]; }).length;
      var r = hit / p.t.length;
      // a longer phrase must share at least two of its words; one shared word ("tell", "say") is not a match
      if (r >= 0.5 && hit && (hit >= 2 || p.t.length === 1)) part += 6 * r * Math.min(p.t.length, 3) / 2;
    });
    strong += Math.min(part, 7);
    d.title.forEach(function (t) { if (set[t] && !GENERIC[t]) th++; });
    d.line.forEach(function (t) { if (set[t] && !GENERIC[t]) weak += 0.8; });
    d.kw.forEach(function (t) { if (set[t]) kh++; });
    if (kh >= 2) weak += Math.min(kh * 1.2, 2.4);
    weak += th * 3;
    // A guide counts as a real match only on a parent phrase, a "what parents mean" pattern, or two title words.
    return { s: strong + weak, ok: strong >= 4 || th >= 2 };
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
    var cs = conceptScores(qn);
    var ranked = DATA.map(function (d) { var r = score(d, qn, qt, cs); return { d: d, s: r.s, ok: r.ok }; })
      .filter(function (x) { return x.ok && !(crisis && x.d.e.crisis) && !(!crisis && x.d.e.crisis && x.s < 10); })
      .sort(function (a, b) { return b.s - a.s; });
    // keep the clear front-runners; drop long tails that only share a word or two
    if (ranked.length) { var top = ranked[0].s; ranked = ranked.filter(function (x) { return x.s >= Math.min(top * 0.4, 9); }); }
    if (crisis) ranked = ranked.filter(function (x) { return (cs[x.d.e.slug] || 0) >= 10; });
    ranked = ranked.slice(0, crisis ? 4 : 5);
    if (crisis) {
      var c = DATA.filter(function (d) { return d.e.crisis; })[0].e;
      out += QL('<div class="crisis-box"><b>If your child may be in danger right now, call 911.</b> For thoughts of suicide, call or text <a href="tel:988">988</a> (Suicide &amp; Crisis Lifeline), or text HOME to <a href="sms:741741&body=HOME">741741</a>. Both are free, any time.</div>',
        '<div class="crisis-box"><b>Si su hijo puede estar en peligro ahora mismo, llame al 911.</b> Si hay pensamientos de suicidio, llame al <a href="tel:988">988</a> y oprima 2 para español, o envíe AYUDA por texto al <a href="sms:988&body=AYUDA">988</a> o al <a href="sms:741741&body=AYUDA">741741</a>. Es gratis, a cualquier hora.</div>');
      out += card(c, " crisis");
    } else if ((QHG_ES ? SERIOUS_ES : SERIOUS_EN).test(qn)) {
      out += QL('<div class="crisis-box"><b>If anyone has threatened your child with a weapon or with serious harm, call 911 or the school office today.</b> Don\'t wait for it to happen again. Then use the guides below for the next steps.</div>',
        '<div class="crisis-box"><b>Si alguien amenazó a su hijo con un arma o con hacerle daño grave, llame al 911 o a la oficina de la escuela hoy mismo.</b> No espere a que vuelva a pasar. Después use las guías de abajo para los siguientes pasos.</div>');
    }
    if (ranked.length) {
      out = (crisis ? "" : '<p class="res-head">' + QL("Best match" + (ranked.length > 1 ? "es" : "") + " for what you described", (ranked.length > 1 ? "Las guías que más se parecen" : "La guía que más se parece") + " a lo que describió") + "</p>") + out;
      ranked.forEach(function (x) { out += card(x.d.e); });
    } else if (!crisis) {
      // Never a dead end, never a random guess: the three guides that help with any kind of bullying.
      out += QL('<div class="nores">We don\'t have a guide for those exact words yet. These three help with any kind of bullying, or you can <a href="#contents">look through all the situations below</a>.</div>',
        '<div class="nores">Todavía no tenemos una guía para esas palabras exactas. Estas tres ayudan con cualquier tipo de acoso, o puede <a href="#contents">revisar todas las situaciones de abajo</a>.</div>');
      C_ADMIT.forEach(function (slug) { var d = DATA.filter(function (x) { return x.e.slug === slug; })[0]; if (d) out += card(d.e); });
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
