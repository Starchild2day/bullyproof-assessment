// ============================================================
// SPANISH DISPLAY TEXT for the questions, answer options and crisis resources
// ============================================================
// The tool stores every answer as the exact ENGLISH option text from assessment-data.js (all of the
// plan logic matches on those strings). This file only changes what the parent SEES.
//
//  * QUESTIONS_ES — per-question title / sub / preventTitle / preventSub (same keys as English).
//  * OPTIONS_ES   — keyed by the exact English option text (including the prevention-path extras).
//  * RESOURCE_*_ES — crisis-line names and instructions. The 988 and Crisis Text Line instructions
//    were checked against 988lifeline.org and Crisis Text Line's own 2023 Spanish-service release;
//    Childhelp offers interpreters in 170+ languages (childhelphotline.org).
//
// RULE: if an English question or option changes in assessment-data.js, change its Spanish here.
// scripts/test-i18n.js fails if any option or question text is missing a Spanish version.
const QUESTIONS_ES = {
  q1: { title: "¿Cuántos años tiene su hijo o hija?" },
  q2: { title: "¿Qué lo trae por aquí hoy?" },
  q3: { title: "¿Ha notado alguna señal física de que algo podría andar mal?", sub: "Marque todas las que correspondan." },
  q4: {
    title: "En sus propias palabras, ¿qué está pasando con su hijo o hija en este momento?",
    sub: "Escriba lo que sienta que es verdad; aquí no hay respuestas incorrectas.",
    preventTitle: "En sus propias palabras, ¿qué le gustaría fortalecer más en su hijo o hija?"
  },
  q5: { title: "¿Desde cuándo está pasando esto?", preventTitle: "¿Desde cuándo está pasando algo?" },
  q6: { title: "¿Ha cambiado el comportamiento de su hijo o hija recientemente?" },
  q7: {
    title: "¿Dónde está pasando esto?",
    sub: "Marque todas las que correspondan.",
    preventTitle: "¿Dónde le preocupa más que pueda pasar?",
    preventSub: "Marque todas las que correspondan; esto nos ayuda a señalarle lo que conviene observar."
  },
  q8: { title: "¿Ha dicho su hijo o hija algo directamente sobre lo que está pasando?" },
  q9: { title: "¿Qué tipo de trato describió?", sub: "Marque todas las que correspondan." },
  q10: {
    title: "¿Ya habló con alguien en la escuela sobre esto?",
    sub: "Maestros, consejeros, director: cualquier persona con un cargo en la escuela.",
    preventTitle: "¿Ya se comunicó con alguien en la escuela?"
  },
  q11: {
    title: "¿Esto está pasando en internet o a través de pantallas?",
    sub: "Aunque también esté pasando en persona.",
    preventTitle: "¿Está pasando algo en internet o a través de pantallas?",
    preventSub: "Aunque también pase en persona; o si no pasa nada, simplemente dígalo."
  },
  q12: {
    title: "¿Con qué quiere más ayuda en este momento?",
    sub: "¿Qué le ayudaría a sentir menos soledad en esto?",
    preventSub: "¿Qué es lo que más le gustaría aprender?"
  }
};

const OPTIONS_ES = {
  // q1 — ages
  "Under 5": "Menos de 5", "5–7": "5–7", "8–10": "8–10", "11–14": "11–14", "15–18": "15–18",
  // q2
  "I'm not sure yet — I just have a feeling something's off": "Todavía no lo sé; solo tengo la sensación de que algo no anda bien",
  "I've noticed something concerning at school": "He notado algo preocupante en la escuela",
  "Something happened online or on social media": "Pasó algo en internet o en las redes sociales",
  "My child told me they're being treated badly by other kids": "Mi hijo o hija me contó que está recibiendo mal trato de parte de otros niños",
  "I'm trying to prevent problems before they start": "Quiero prevenir problemas antes de que empiecen",
  // q3
  "Unexplained scratches or bruises": "Rasguños o moretones sin explicación",
  "Sudden change in wardrobe preferences (long sleeves, long pants, hoodie in warm weather)": "Cambio repentino en la ropa que quiere usar (mangas largas, pantalones largos, sudadera con capucha cuando hace calor)",
  "Any deep cuts anywhere on their body they might be hiding": "Cortadas profundas en cualquier parte del cuerpo que podría estar escondiendo",
  "Complaints of physical symptoms with no clear cause (headaches, stomachaches)": "Quejas de síntomas físicos sin causa clara (dolores de cabeza, de estómago)",
  "Changes in sleep patterns (trouble falling asleep, nightmares, sleeping too much)": "Cambios en el sueño (dificultad para dormirse, pesadillas, dormir demasiado)",
  "Changes in eating patterns (loss of appetite, eating much more than usual)": "Cambios en la alimentación (pérdida de apetito, comer mucho más de lo normal)",
  "None of these — I haven't noticed physical signs": "Ninguna de estas: no he notado señales físicas",
  // q5
  "Just noticed it (less than a week)": "Lo acabo de notar (hace menos de una semana)",
  "A few weeks": "Hace unas semanas",
  "A month or two": "Hace uno o dos meses",
  "Several months or longer": "Hace varios meses o más",
  "Not sure": "No lo sé",
  "Nothing's going on — I'm focused on prevention": "No está pasando nada: me enfoco en la prevención",
  // q6
  "Withdrawing from family activities they used to enjoy": "Se aleja de actividades familiares que antes disfrutaba",
  "More irritable, tearful, or anxious than usual": "Más irritabilidad, llanto o ansiedad que de costumbre",
  "Reluctant to go to school or ride the bus": "No quiere ir a la escuela ni subirse al autobús",
  "Avoiding certain places, people, or activities they used to like": "Evita ciertos lugares, personas o actividades que antes le gustaban",
  "No noticeable changes": "No hay cambios notorios",
  // q7
  "At school (classroom, playground, lunchroom, hallways)": "En la escuela (salón de clases, patio, cafetería, pasillos)",
  "On the school bus": "En el autobús escolar",
  "In after-school activities or sports": "En actividades o deportes después de la escuela",
  "On social media (Instagram, TikTok, Snapchat, etc.)": "En las redes sociales (Instagram, TikTok, Snapchat, etc.)",
  "In text messages or group chats": "En mensajes de texto o chats de grupo",
  "In a gaming platform (Roblox, Fortnite, Discord, etc.)": "En una plataforma de videojuegos (Roblox, Fortnite, Discord, etc.)",
  "In our neighborhood or local park": "En nuestro vecindario o en el parque",
  "I'm not sure where it's happening": "No sé dónde está pasando",
  "Nowhere in particular — I'm thinking prevention first": "En ningún lugar en particular: pienso primero en la prevención",
  "I'm not sure yet — anywhere could matter": "Todavía no lo sé: cualquier lugar podría importar",
  // q8
  "Yes — they've told me clearly what's going on": "Sí: me ha contado claramente lo que pasa",
  "Yes — but only hints or pieces (not the full story)": "Sí, pero solo pistas o partes (no toda la historia)",
  "No — but their behavior tells me something's wrong": "No, pero su comportamiento me dice que algo anda mal",
  "No — and I don't have any behavioral signals either": "No, y tampoco veo señales en su comportamiento",
  // q9
  "Being left out, ignored, or excluded by other kids": "Que otros niños lo dejen fuera, lo ignoren o lo excluyan",
  "Being called names, teased, or put down repeatedly": "Que lo insulten, se burlen o lo humillen repetidamente",
  "Being hit, pushed, tripped, or physically hurt": "Que lo golpeen, lo empujen, le pongan el pie o lo lastimen físicamente",
  "Having things taken from them or broken on purpose": "Que le quiten sus cosas o se las rompan a propósito",
  "Threats made against them — face-to-face OR online": "Amenazas en su contra, en persona O en internet",
  "Someone pressuring them sexually OR making them touch someone / show their body / send images they didn't want to send": "Alguien que lo presione sexualmente O que lo obligue a tocar a alguien, mostrar su cuerpo o enviar imágenes que no quería enviar",
  "Someone using power over them in a way that feels wrong (an older kid controlling them; an adult behaving inappropriately; someone they depend on hurting them)": "Alguien que usa su poder sobre él de una forma que se siente incorrecta (un niño mayor que lo controla; un adulto que se comporta de manera inapropiada; alguien de quien depende y que le hace daño)",
  "Not sure how to describe it": "No sé cómo describirlo",
  // q10
  "Yes — and they took it seriously and are helping": "Sí, lo tomaron en serio y están ayudando",
  "Yes — but nothing has changed yet": "Sí, pero todavía nada ha cambiado",
  "Yes — and they said it isn't bullying / told us to handle it at home": "Sí, y dijeron que no es bullying o nos dijeron que lo resolviéramos en casa",
  "No — my child doesn't want me to contact the school": "No, mi hijo o hija no quiere que yo contacte a la escuela",
  "No — I haven't reached out yet because I don't know how to start": "No, todavía no me he comunicado porque no sé cómo empezar",
  "Not yet — nothing to report; I'm building strengths early": "Todavía no: no hay nada que reportar; estoy fortaleciendo a mi hijo o hija desde temprano",
  // q11
  "Yes — primarily online": "Sí, principalmente en internet",
  "Yes — online for sure, and I'm not sure if it's also happening in person": "Sí, en internet seguro, y no sé si también pasa en persona",
  "Yes — both online and in person": "Sí, tanto en internet como en persona",
  "No — this is only happening in person": "No, solo está pasando en persona",
  "I'm not sure": "No lo sé",
  "No — nothing's happening; prevention is my focus": "No, no está pasando nada; mi enfoque es la prevención"
};

const RESOURCE_NAME_ES = {
  "988 Suicide & Crisis Lifeline": "Línea 988 de Prevención del Suicidio y Crisis",
  "Crisis Text Line": "Crisis Text Line (línea de texto para crisis)",
  "Childhelp National Child Abuse Hotline": "Línea Nacional contra el Abuso Infantil de Childhelp"
};
const RESOURCE_DETAIL_ES = {
  "Call or text 988 — available 24/7": "Llame al 988 y oprima 2 para español, o envíe AYUDA por texto al 988. Disponible las 24 horas, todos los días",
  "Call or text 988": "Llame al 988 y oprima 2 para español, o envíe AYUDA por texto al 988",
  "Text HOME to 741741": "Envíe AYUDA por texto al 741741",
  "1-800-422-4453": "1-800-422-4453 (llamada o texto; hay intérpretes de español disponibles)"
};
