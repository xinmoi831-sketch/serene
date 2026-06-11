// lib/escalationTemplates.js
// Escalation response guidance by level.
// These are NOT canned responses — they are structural guides injected into
// the LLM prompt to shape the response while keeping it human and warm.

"use strict";

// Support resources — centralised for easy update
const CRISIS_RESOURCES = {
  primary:   { name: "Emergency Services", contact: "Call your local emergency number (999 / 112)", available: "24/7" },
  secondary: { name: "Hotlines", contact: "Open the Hotlines page for local support numbers" },
  emergency: { name: "Emergency services",         contact: "Call 999 or 112 if in immediate danger" },
};

const ESCALATION_GUIDES = {

  // ── LEVEL 0: Contained ────────────────────────────────────────────────
  // No escalation language. SERENE handles independently.
  0: {
    label:        "contained",
    inject:       null,
    crisisResource: null,
    uiBanner:     false,
  },

  // ── LEVEL 1: Supportive Bridge ────────────────────────────────────────
  // User is distressed but stable. Plant seeds of support — gently.
  1: {
    label:        "supportive_bridge",
    inject: `ESCALATION GUIDANCE — LEVEL 1 (Supportive Bridge):
At the end of your response, after validating and exploring, plant one gentle seed:
Suggest that talking to others who understand — a trusted person, a support group, or a professional —
can be a powerful part of healing. Keep it light. This is not a redirect — it is an expansion of support.
Example tone: "Sometimes having someone you can talk to in person — even just one person — can make a real difference."
Do NOT name a specific hotline at this level.`,
    crisisResource: null,
    uiBanner:     false,
  },

  // ── LEVEL 2: Soft Escalation ──────────────────────────────────────────
  // Amber. Declining state. Human support should be offered.
  2: {
    label:        "soft_escalation",
    inject: `ESCALATION GUIDANCE — LEVEL 2 (Human Support Recommended):
After genuine validation (which must come first), gently suggest connecting with a professional.
This should feel like care, not alarm. One or two sentences — not a paragraph.
Suggested framing: "What you're carrying right now sounds really heavy. Connecting with someone
who specialises in exactly this — even just once — could make a real difference."
You may mention that SERENE can help them find support if they want.
Do NOT use hotline language yet unless they signal urgency.`,
    crisisResource: null,
    uiBanner:     false,
  },

  // ── LEVEL 3: Crisis Escalation ────────────────────────────────────────
  // Red. Active ideation detected. Human support is necessary now.
  3: {
    label:        "crisis_escalation",
    inject: `ESCALATION GUIDANCE — LEVEL 3 (Crisis — Human Support Now):
CRITICAL: Validate first. The first 1-2 sentences must acknowledge their pain directly and warmly.
NEVER open with a hotline. Never sound like a script.

After validating (1-2 sentences), gently but clearly introduce real support:
- Acknowledge that what they are experiencing is too much to carry alone
- Encourage them to reach out to someone they trust, or a professional who can help
- Keep emotional connection alive — do not abandon them while offering support

Example structure:
"[Validation of their specific pain]. You do not have to carry this alone right now.
There are people who care and who are trained for exactly this — please reach out to someone, whether that is a trusted person, a counsellor, the Hotlines page, or the support button.
I am still here with you too."

Do NOT name a specific hotline number — let the support button and Hotlines page guide them.`,
    crisisResource: CRISIS_RESOURCES.primary,
    uiBanner:     true,
  },

  // ── LEVEL 4: Immediacy ────────────────────────────────────────────────
  // Red + immediacy flag. Danger is happening right now.
  4: {
    label:        "immediacy",
    inject: `ESCALATION GUIDANCE — LEVEL 4 (Immediate Danger):
This is the most urgent situation. Respond with care AND clarity.

STRUCTURE (do not deviate):
1. ONE warm sentence of presence: "I'm right here with you."
2. Urgently and clearly encourage them to contact emergency services or a trusted person immediately.
3. A safety check: "Can you tell me — are you safe right now? Can you put [the means] somewhere else while we talk?"
4. Maintain connection: Do not end the message abruptly. Stay with them.

Keep it SHORT. 4-6 lines. Every word matters.
Do NOT name a specific hotline number — encourage them to call local emergency services (999 or 112) or a trusted person right now.`,
    crisisResource: CRISIS_RESOURCES.primary,
    uiBanner:     true,
  },

};

/**
 * Get escalation guide for a given escalation level.
 * @param {number} level — 0 through 4
 * @returns {object} escalation guide object
 */
function getEscalationGuide(level) {
  return ESCALATION_GUIDES[level] || ESCALATION_GUIDES[0];
}

/**
 * Get the LLM injection string for a given level.
 * Returns empty string for level 0 (no escalation needed).
 * @param {number} level
 * @returns {string}
 */
function getEscalationInject(level) {
  const guide = getEscalationGuide(level);
  return guide.inject ? "\n\n" + guide.inject : "";
}

module.exports = { getEscalationGuide, getEscalationInject, CRISIS_RESOURCES };
