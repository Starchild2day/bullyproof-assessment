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

// Simple line-icon paths (Feather-style, 24x24 viewBox). Rendered inside a
// soft blue circle badge above each card — kept abstract and calm on
// purpose, given the subject matter. No literal depictions of kids,
// bullying, or injury anywhere in the tool.
const LANDING_ICON = `<path d="M12 2v4"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m16 6-4 4-4-4"/><path d="M16 18a4 4 0 0 0-8 0"/>`;
const RESULTS_ICON = `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>`;

const ICONS = {
  q1: `<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>`,
  q2: `<circle cx="12" cy="12" r="10"/><text x="12" y="4.4" font-size="3.6" font-weight="800" fill="#EFDFB8" stroke="none" text-anchor="middle">N</text><text x="12" y="21.6" font-size="3.6" font-weight="800" fill="#EFDFB8" stroke="none" text-anchor="middle">S</text><text x="2.8" y="13.3" font-size="3.6" font-weight="800" fill="#EFDFB8" stroke="none" text-anchor="middle">W</text><text x="21.2" y="13.3" font-size="3.6" font-weight="800" fill="#EFDFB8" stroke="none" text-anchor="middle">E</text><polygon points="17,7 13.4,13.4 12,12 10.6,10.6" fill="#EFDFB8" stroke="none"/><polygon points="7,17 13.4,13.4 12,12 10.6,10.6" fill="#EFDFB8" stroke="none" opacity="0.4"/><circle cx="12" cy="12" r="1" fill="#131E42" stroke="none"/>`,
  q3: `<path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0L12 5.35l-.77-.77a5.4 5.4 0 0 0-7.65 7.65l.77.77L12 21l7.65-7.65.77-.77a5.4 5.4 0 0 0 0-7.65z"/><path d="M8 12h2l1-2 2 4 1-2h2"/>`,
  q4: `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>`,
  q5: `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`,
  q6: `<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>`,
  q7: `<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>`,
  q8: `<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>`,
  q9: `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>`,
  q10: `<path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12.5V17c0 1.5 2.5 3 6 3s6-1.5 6-3v-4.5"/><line x1="22" y1="10" x2="22" y2="16"/>`,
  q11: `<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>`,
  q12: `<circle cx="10" cy="9" r="7"/><circle cx="10" cy="9" r="3"/><line x1="10" y1="2" x2="10" y2="4.5"/><line x1="17" y1="9" x2="14.5" y2="9"/><line x1="10" y1="16" x2="10" y2="13.5"/><line x1="3" y1="9" x2="5.5" y2="9"/><path d="M10 16c0 1.8 3 1.5 3 3.3s-2.2 1.5-2.2 3.4"/>`
};

const QUESTIONS = [
  {
    id: "q1",
    title: "How old is your child?",
    type: "choice",
    icon: ICONS.q1,
    options: ["Under 5", "5–7", "8–10", "11–14", "15–18"]
  },
  {
    id: "q2",
    title: "What's bringing you here today?",
    type: "choice",
    icon: ICONS.q2,
    options: [
      "I'm not sure yet — I just have a feeling something's off",
      "I've noticed something concerning at school",
      "Something happened online or on social media",
      "My child told me they're being treated badly by other kids",
      "I'm trying to prevent problems before they start"
    ]
  },
  {
    id: "q3",
    title: "Have you noticed any physical signs that something might be wrong?",
    sub: "Check all that apply.",
    type: "multi",
    icon: ICONS.q3,
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
    icon: ICONS.q4,
    title: "In your own words, what's going on with your child right now?",
    sub: "Write whatever feels true to you — there's no wrong answer here.",
    type: "text"
  },
  {
    id: "q5",
    icon: ICONS.q5,
    title: "How long has this been going on?",
    type: "choice",
    options: ["Just noticed it (less than a week)", "A few weeks", "A month or two", "Several months or longer", "Not sure"]
  },
  {
    id: "q6",
    icon: ICONS.q6,
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
    icon: ICONS.q7,
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
    icon: ICONS.q8,
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
    icon: ICONS.q9,
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
    icon: ICONS.q10,
    title: "Have you talked to anyone at school about this yet?",
    sub: "Teachers, counselors, principal — anyone in a school role.",
    type: "choice",
    options: [
      "Yes — and they took it seriously and are helping",
      "Yes — but nothing has changed yet",
      "Yes — and they said it isn't bullying / told us to handle it at home",
      "No — my child doesn't want me to contact the school",
      "No — I haven't reached out yet because I don't know how to start"
    ]
  },
  {
    id: "q11",
    icon: ICONS.q11,
    title: "Is this happening online or through screens at all?",
    sub: "Even if it's also happening in person.",
    type: "choice",
    options: [
      "Yes — primarily online",
      "Yes — both online and in person",
      "No — this is only happening in person",
      "I'm not sure"
    ]
  },
  {
    id: "q12",
    icon: ICONS.q12,
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
