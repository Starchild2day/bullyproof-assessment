// ============================================================
// QUESTION CONTENT — Kris Revision v2 (as provided)
// ============================================================
// This matches "BullyProof Assessment Tool — 12 Questions for
// Parent Onboarding, Kris Revision v2" exactly as received.
//
// TWO THINGS STILL OPEN, PER THE DOC ITSELF ("Pending Items
// Before Final Approval"):
//  1. Kris has a pending review pass #2 on wording for Q4, Q9,
//     and column formatting — the text below is the v2 wording,
//     not yet the final-final sign-off.
//  2. "Mark review pass on safety escalation triggers and
//     routing logic" is explicitly listed as not yet done. Kris's
//     doc lists the SAME three crisis resources (988, Childhelp,
//     Crisis Text Line) for both the physical-signs trigger and
//     the sexual/power-abuse trigger. The earlier build spec you
//     had also included RAINN specifically for the sexual/power
//     trigger. I've gone with Kris's doc as written since it's
//     the most recent, but you may want RAINN back in for that
//     specific trigger — flag it to Kris if so, one-line change
//     for me either way.
//  3. Q11 in the doc appears to have lost its third option in
//     formatting (only two "Yes" options are visible, one shown
//     pre-checked as a formatting example). I've added a
//     reasonable "No" option so the question works end to end —
//     swap in Kris's real wording once confirmed.
// ============================================================

const QUESTIONS = [
  {
    id: "q1",
    title: "How old is your child?",
    type: "choice",
    options: ["Under 5", "5–7", "8–10", "11–14", "15–18"]
  },
  {
    id: "q2",
    title: "What's bringing you here today?",
    type: "choice",
    options: [
      "I've noticed something concerning at school",
      "Something happened online or on social media",
      "My child told me they're being treated badly by other kids",
      "I'm trying to prevent problems before they start",
      "I'm not sure yet — I just have a feeling something's off"
    ]
  },
  {
    id: "q3",
    title: "Have you noticed any physical signs that something might be wrong?",
    sub: "Check all that apply.",
    type: "multi",
    options: [
      "Unexplained scratches or bruises",
      "Sudden change in wardrobe preferences (long sleeves, long pants, hoodie in warm weather)",
      "Any deep cuts anywhere on their body they might be hiding",
      "Complaints of physical symptoms with no clear cause (headaches, stomachaches)",
      "Changes in sleep patterns (trouble falling asleep, nightmares, sleeping too much)",
      "Changes in eating patterns (loss of appetite, eating much more than usual)",
      "None of these — I haven't noticed physical signs"
    ],
    // Custom evaluation: deep cuts alone triggers; bruises/scratches only
    // trigger when combined with at least one other concerning answer.
    safetyEvaluator: (selected) => {
      const deepCuts = "Any deep cuts anywhere on their body they might be hiding";
      const bruises = "Unexplained scratches or bruises";
      const none = "None of these — I haven't noticed physical signs";
      if (selected.includes(deepCuts)) return "physicalSigns";
      const others = selected.filter(s => s !== bruises && s !== none);
      if (selected.includes(bruises) && others.length > 0) return "physicalSigns";
      return null;
    }
  },
  {
    id: "q4",
    title: "In your own words, what's going on with your child right now?",
    sub: "Write whatever feels true to you — there's no wrong answer here.",
    type: "text"
  },
  {
    id: "q5",
    title: "How long has this been going on?",
    type: "choice",
    options: ["Just noticed it (less than a week)", "A few weeks", "A month or two", "Several months or longer", "Not sure"]
  },
  {
    id: "q6",
    title: "Has your child's behavior changed recently?",
    type: "multi",
    options: [
      "Withdrawing from family activities they used to enjoy",
      "More irritable, tearful, or anxious than usual",
      "Reluctant to go to school or ride the bus",
      "Avoiding certain places, people, or activities they used to like",
      "No noticeable changes"
    ]
  },
  {
    id: "q7",
    title: "Where is this happening?",
    sub: "Check all that apply.",
    type: "multi",
    options: [
      "At school (classroom, playground, lunchroom, hallways)",
      "On the school bus",
      "In after-school activities or sports",
      "On social media (Instagram, TikTok, Snapchat, etc.)",
      "In text messages or group chats",
      "In a gaming platform (Roblox, Fortnite, Discord, etc.)",
      "In our neighborhood or local park",
      "I'm not sure where it's happening"
    ]
  },
  {
    id: "q8",
    title: "Has your child said anything directly about what's happening?",
    type: "choice",
    options: [
      "Yes — they've told me clearly what's going on",
      "Yes — but only hints or pieces (not the full story)",
      "No — but their behavior tells me something's wrong",
      "No — and I don't have any behavioral signals either"
    ]
  },
  {
    id: "q9",
    title: "What kind of treatment did they describe?",
    sub: "Check all that apply.",
    type: "multi",
    condition: (a) => typeof a.q8 === "string" && !a.q8.startsWith("No"),
    options: [
      "Being left out, ignored, or excluded by other kids",
      "Being called names, teased, or put down repeatedly",
      "Being hit, pushed, tripped, or physically hurt",
      "Having things taken from them or broken on purpose",
      "Threats made against them — face-to-face OR online",
      "Someone pressuring them sexually OR making them touch someone / show their body / send images they didn't want to send",
      "Someone using power over them in a way that feels wrong (an older kid controlling them; an adult behaving inappropriately; someone they depend on hurting them)",
      "Not sure how to describe it"
    ],
    safetyTriggers: {
      sexualOrPower: [
        "Someone pressuring them sexually OR making them touch someone / show their body / send images they didn't want to send",
        "Someone using power over them in a way that feels wrong (an older kid controlling them; an adult behaving inappropriately; someone they depend on hurting them)"
      ]
    }
  },
  {
    id: "q10",
    title: "Have you talked to anyone at school about this yet?",
    sub: "Teachers, counselors, principal — anyone in a school role.",
    type: "choice",
    options: [
      "Yes — and they took it seriously and are helping",
      "Yes — but nothing has changed yet",
      "Yes — and they said it isn't bullying / told us to handle it at home",
      "No — I haven't reached out yet because I don't know how to start",
      "No — my child doesn't want me to contact the school"
    ]
  },
  {
    id: "q11",
    title: "Is this happening online or through screens at all?",
    sub: "Even if it's also happening in person.",
    type: "choice",
    options: [
      "Yes — primarily online",
      "Yes — both online and in person",
      "No — this isn't happening online or through screens"
    ]
  },
  {
    id: "q12",
    title: "What do you most want help with right now?",
    sub: "What's the one thing that would make you feel less alone in this?",
    type: "text"
  }
];

// ---- Safety escalation resources — per Kris's doc, same 3 resources for every trigger ----
const SAFETY_VARIANTS = {
  physicalSigns: {
    label: "Physical Signs / Possible Self-Harm",
    resources: [
      { name: "988 Suicide & Crisis Lifeline", detail: "Call or text 988 — available 24/7" },
      { name: "Childhelp National Child Abuse Hotline", detail: "1-800-422-4453" },
      { name: "Crisis Text Line", detail: "Text HOME to 741741" }
    ]
  },
  sexualOrPower: {
    label: "Sexual Pressure / Power Abuse",
    resources: [
      { name: "988 Suicide & Crisis Lifeline", detail: "Call or text 988 — available 24/7" },
      { name: "Childhelp National Child Abuse Hotline", detail: "1-800-422-4453" },
      { name: "Crisis Text Line", detail: "Text HOME to 741741" }
    ]
  }
};

const GENERIC_RESOURCES = [
  { name: "988 Suicide & Crisis Lifeline", detail: "Call or text 988" },
  { name: "Crisis Text Line", detail: "Text HOME to 741741" },
  { name: "Childhelp National Child Abuse Hotline", detail: "1-800-422-4453" }
];
