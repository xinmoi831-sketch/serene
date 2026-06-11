// lib/crisisFramework.js  v1
// Crisis Response Framework — 5-stage structured conversation guide.
//
// Sits between detection and response generation.
// Determines HOW SERENE responds at each stage of a crisis conversation.
//
// Stages:
//   0 — Not in crisis (no directive)
//   1 — Recognition         : Make the user feel seen and heard immediately
//   2 — Reduce Isolation    : Help them feel less alone
//   3 — Situation Understanding : Understand context before helping
//   4 — Severity Assessment : Clarify actual risk level (passive ideation only)
//   5 — Support and Guidance : Provide support based on detected risk
//
// Integration points:
//   emotionalEngine.updateEmotionalState() → calls advanceCrisisStage() per turn
//   routes/chat.js → calls getCrisisDirective() and injects into system prompt

"use strict";

// ── SAFETY LEVEL ORDER ────────────────────────────────────────────────────
const LEVEL_ORDER = { green: 0, yellow: 1, orange: 2, red: 3, critical: 4 };

// ── CATEGORY RESOLUTION ───────────────────────────────────────────────────
// Determines the dominant P1 sub-category from signal scores.
// Used to choose category-specific directive wording.
function resolvePrimaryCategory(signals) {
  const {
    ideationScore    = 0,
    isolationScore   = 0,
    burdenScore      = 0,
    hopeScore        = 0.5,
    arousal          = 0.45,
    worthlessnessScore = 0,
  } = signals;

  if (ideationScore >= 2) return "active_ideation";          // 1A / 1B explicit
  if (ideationScore >= 1 && hopeScore < 0.2)  return "hopelessness";    // 1C passive + hopeless
  if (ideationScore >= 1 && burdenScore >= 0.6) return "burdensomeness"; // 1D passive + burden
  if (ideationScore >= 1)  return "passive_ideation";        // general passive
  if (isolationScore >= 0.55) return "isolation";            // 1E severe isolation
  if (burdenScore >= 0.6 || worthlessnessScore >= 0.6) return "burdensomeness"; // 1D
  if (hopeScore < 0.2)    return "hopelessness";             // 1C without ideation
  if (arousal > 0.60)     return "overwhelm";                // 1F
  return "general_distress";
}

// ── STAGE ADVANCEMENT ─────────────────────────────────────────────────────
// Called in emotionalEngine once per message.
// Returns the stage number that the CURRENT response should be at.
//
// @param {number} priorStage         — stage of the last response (0 = not in crisis)
// @param {string} priorSafetyLevel   — safety level of the last turn
// @param {object} signals            — extracted signals for current message
// @param {string} safetyLevel        — current safety level
// @returns {number} 0–5
function advanceCrisisStage(priorStage, priorSafetyLevel, signals, safetyLevel) {
  const { ideationScore = 0 } = signals;
  const inCrisis = (LEVEL_ORDER[safetyLevel] || 0) >= 2; // orange or above

  // Exiting crisis — reset
  if (!inCrisis) return 0;

  // First crisis message — start at Recognition
  if (!priorStage || priorStage === 0) return 1;

  // Safety level escalated mid-conversation (e.g., orange → red):
  // Re-enter at Recognition for the new severity level
  if ((LEVEL_ORDER[safetyLevel] || 0) > (LEVEL_ORDER[priorSafetyLevel] || 0)) return 1;

  // Already at Stage 5 — hold at Support and Guidance indefinitely
  if (priorStage >= 5) return 5;

  // RED / CRITICAL — compressed stages
  // The deterministic section2 (safety check) and section3 (support) already
  // cover Isolation and part of Support, so the LLM stages collapse.
  if (safetyLevel === "red" || safetyLevel === "critical") {
    if (priorStage === 1) return 3;  // Recognition done → jump to Situation Understanding
    if (priorStage >= 3)  return 5;  // Understanding done → jump to Support
    return 5;
  }

  // ORANGE — normal linear progression
  if (priorStage === 3) {
    // Stage 4 (Severity Assessment) only for passive/ambiguous ideation
    if (ideationScore >= 2) return 5; // already confirmed active → skip assessment
    return 4;
  }

  return priorStage + 1;
}

// ── STAGE DIRECTIVES ──────────────────────────────────────────────────────
// Each stage has a base directive + optional category-specific addendum.
// Injected into the system prompt as a structured instruction block.

// -- Stage 1: Recognition --------------------------------------------------
const STAGE_1_BASE = `
CRISIS FRAMEWORK STAGE: RECOGNITION
Purpose: Make this person feel genuinely seen and heard before anything else.

Your task this response:
- Open by directly acknowledging what they just said — in your own vivid, human words
- Express that you are glad they told you, or that this clearly matters
- DO NOT ask any questions
- DO NOT offer advice, solutions, or coping suggestions
- DO NOT say what might help or what they could do
- Keep this brief: 2–3 sentences maximum
- Just receive what they said with full warmth and presence`;

const STAGE_1_CATEGORY = {
  active_ideation:
    "They have shared thoughts of suicide or self-harm. Acknowledge how heavy and real that is. Do not minimize it, explain it, or rush to reassure.",
  passive_ideation:
    "They have expressed wanting to disappear, not be here, or that others would be better without them. Take this seriously — acknowledge the depth of pain those words carry.",
  hopelessness:
    "They are describing a world with no future, no hope. Acknowledge how suffocating and exhausting that feels — without rushing to say things will get better.",
  isolation:
    "They are expressing profound loneliness. Acknowledge how painful it is to feel completely alone — without immediately refuting it or listing people who care.",
  burdensomeness:
    "They believe they are a burden to others. Acknowledge how painful that belief is — resist the urge to immediately say 'you are not a burden' (that feels dismissive before they feel heard).",
  overwhelm:
    "They are describing being completely overwhelmed, at a breaking point. Acknowledge how utterly exhausting it feels when everything is too much — without immediately offering solutions.",
  general_distress:
    "They are in significant distress. Acknowledge the weight of what they have shared before anything else.",
};

// -- Stage 2: Reduce Isolation ---------------------------------------------
const STAGE_2_BASE = `
CRISIS FRAMEWORK STAGE: REDUCE ISOLATION
Purpose: Help them feel less alone right now.

Your task this response:
- Express that you are here with them — genuinely, not as a script
- Convey that they do not have to carry this alone in this moment
- You can briefly acknowledge their pain again, but the focus is: they are not alone
- Tone: warm, calm, steady — like a hand on the shoulder
- 2–3 sentences
- One gentle question at the very end is optional, not required
- DO NOT launch into solutions or resources yet`;

const STAGE_2_CATEGORY = {
  active_ideation:
    "Stay very close emotionally. Express that you are right here, not going anywhere. Do not move to resources yet.",
  passive_ideation:
    "Express genuine presence. Something like: 'You don't have to carry this alone right now — I'm right here with you.'",
  hopelessness:
    "Express that you are here with them even when everything feels hopeless. Do not say 'it will get better' — just be present.",
  isolation:
    "Lean into this stage — this is the most important one for isolation. Express that they are not invisible, not forgotten. YOU see them right now.",
  burdensomeness:
    "Express that you want them here in this conversation. Their being here matters.",
  overwhelm:
    "Express that they do not have to figure everything out right now — just be here for a moment.",
  general_distress:
    "Express genuine presence and care. They are not alone in this.",
};

// -- Stage 3: Situation Understanding --------------------------------------
const STAGE_3_BASE = `
CRISIS FRAMEWORK STAGE: SITUATION UNDERSTANDING
Purpose: Understand what has been happening before trying to help.

Your task this response:
- Ask ONE open, natural question about their situation
- Sound genuinely curious — like a caring friend asking, not a clinician
- Do NOT ask two questions
- Do NOT offer solutions or advice yet
- Do NOT ask yes/no questions — invite the story
- The question should feel easy to answer — low pressure, open-ended`;

const STAGE_3_CATEGORY = {
  active_ideation:
    "Ask what has been weighing on them most heavily — what built up to this point. Example: 'What has been the hardest part lately?' or 'Has something happened that brought this on?' Do NOT ask 'how long have you felt suicidal' — that is clinical.",
  passive_ideation:
    "Ask gently what has been happening that brought them to this feeling. Something like: 'What has been building up that makes things feel this heavy?' or 'Has something happened recently?'",
  hopelessness:
    "Ask what has made things feel so completely hopeless. Example: 'What has been happening that has made everything feel this dark?' or 'Has something been piling up?'",
  isolation:
    "Ask what has been making them feel so disconnected. Example: 'How long have you been feeling this alone?' or 'Has something happened that pulled you away from people?'",
  burdensomeness:
    "Ask what has been happening that has made them feel like a burden. Example: 'What has been making you feel this way lately?' or 'Has something specific been building up?'",
  overwhelm:
    "Ask what has been piling up most. Example: 'What has been feeling the most impossible lately?' or 'Is something specific adding to everything right now?'",
  general_distress:
    "Ask what has been weighing on them most. Invite the story behind what they shared.",
};

// -- Stage 4: Severity Assessment ------------------------------------------
const STAGE_4_BASE = `
CRISIS FRAMEWORK STAGE: SEVERITY ASSESSMENT
Purpose: Gently clarify the actual risk level.

Your task this response:
- Ask ONE direct but kind question to understand if they are having thoughts of hurting themselves
- Use clear language — do not be so vague that the person does not understand what you are asking
- Be compassionate, not alarming — frame it as genuinely wanting to understand
- If they have already confirmed active thoughts, skip the question and simply be present with them
- 2–3 sentences total`;

const STAGE_4_CATEGORY = {
  passive_ideation:
    "They expressed wanting to disappear or not be here. Use their words: 'When you said [reference what they said], can I check in — are you thinking about hurting yourself, or does it feel more like wanting to escape from the pain?'",
  hopelessness:
    "Ask carefully: 'When everything feels this hopeless, do you ever have thoughts of not wanting to be here anymore, or thoughts of hurting yourself?'",
  burdensomeness:
    "This belief can co-occur with suicidal thinking. Ask: 'When you feel like you're a burden, do those thoughts ever go further — like wishing you weren't around?'",
  overwhelm:
    "Check carefully but gently: 'When everything feels this heavy, do you ever have darker thoughts — like not wanting to go on?'",
  general_distress:
    "Check in carefully: 'I want to make sure I understand how you are doing — are you having any thoughts of hurting yourself right now?'",
};

// -- Stage 5: Support and Guidance -----------------------------------------
const STAGE_5_BASE = `
CRISIS FRAMEWORK STAGE: SUPPORT AND GUIDANCE
Purpose: Provide warm, specific support based on what you now understand about their situation.

Your task this response:
- Acknowledge what they have shared — they should feel truly understood, not processed
- Mention that support is available: the support button is right here in this conversation
- Encourage staying connected — with you, and with at least one person in their life if possible
- Continue being present — this is not goodbye; you are staying with them
- DO NOT use generic crisis scripts or pamphlet language
- If you suggest any action, make it ONE small, concrete thing — not a list`;

const STAGE_5_CATEGORY = {
  active_ideation:
    "Express that their life matters to you. Ask if there is someone who can be with them right now. Mention the support button warmly — not clinically.",
  passive_ideation:
    "Express care for what happens to them. Ask if there is one person they could reach out to today. Mention the support button is here.",
  hopelessness:
    "Acknowledge how exhausting it is to see no way forward. Express that you are here with them in this. Mention support is available when they feel ready.",
  isolation:
    "YOU are here right now — say so with specificity. Encourage one small act of connection today. Support is available.",
  burdensomeness:
    "Express that their presence here matters. Mention support is available. Be specific and warm, not generic.",
  overwhelm:
    "Acknowledge how tired they must be. Suggest one tiny thing to reduce the load — or just staying in this conversation. Mention support is available if things get darker.",
  general_distress:
    "Provide warm presence and let them know support is available through the button in this app.",
};

// ── DIRECTIVE BUILDER ─────────────────────────────────────────────────────
// Assembles base + category-specific addendum for the given stage.
function buildDirectiveText(stageBase, categoryMap, category) {
  const categoryAddendum = categoryMap[category] || categoryMap.general_distress || "";
  const addendum = categoryAddendum
    ? `\nCATEGORY GUIDANCE (${category}): ${categoryAddendum}`
    : "";
  return stageBase + addendum;
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────
/**
 * Returns the system prompt directive for the current crisis stage.
 *
 * @param {number} crisisStage    — current stage (0–5)
 * @param {string} crisisCategory — dominant P1 category
 * @param {string} safetyLevel    — current safety level
 * @returns {string|null}         — directive to inject, or null if not in crisis
 */
function getCrisisDirective(crisisStage, crisisCategory, safetyLevel) {
  if (!crisisStage || crisisStage === 0) return null;
  const cat = crisisCategory || "general_distress";

  switch (crisisStage) {
    case 1: return buildDirectiveText(STAGE_1_BASE, STAGE_1_CATEGORY, cat);
    case 2: return buildDirectiveText(STAGE_2_BASE, STAGE_2_CATEGORY, cat);
    case 3: return buildDirectiveText(STAGE_3_BASE, STAGE_3_CATEGORY, cat);
    case 4: return buildDirectiveText(STAGE_4_BASE, STAGE_4_CATEGORY, cat);
    case 5: return buildDirectiveText(STAGE_5_BASE, STAGE_5_CATEGORY, cat);
    default: return buildDirectiveText(STAGE_5_BASE, STAGE_5_CATEGORY, cat);
  }
}

module.exports = { resolvePrimaryCategory, advanceCrisisStage, getCrisisDirective };
