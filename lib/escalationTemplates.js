// lib/escalationTemplates.js
// Escalation response guidance by level.
// These are NOT canned responses — they are structural guides injected into
// the LLM prompt to shape the response while keeping it human and warm.

"use strict";

// Crisis resources — centralised for easy update
const CRISIS_RESOURCES = {
  primary:   { name: "988 Suicide & Crisis Lifeline", contact: "Call or text 988", available: "24/7, free and confidential" },
  secondary: { name: "Crisis Text Line",              contact: "Text HOME to 741741" },
  emergency: { name: "Emergency services",            contact: "Call 911 (or your local emergency number)" },
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
NEVER open with a crisis line. Never sound like a script.

After validating (1-2 sentences), gently but clearly introduce real support:
- Acknowledge that what they are experiencing is too much to carry alone
- Offer the crisis line as a caring suggestion, not a redirect
- Keep emotional connection alive — do not abandon them while escalating

Example structure:
"[Validation of their specific pain]. You do not have to carry this alone right now.
The 988 line has someone available right now — call or text, free and confidential.
I am still here with you too."

CRISIS RESOURCE TO INCLUDE: Call or text 988 — 24/7, free and confidential.`,
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
2. THE CRISIS LINE in the first three lines — not buried: "Please call or text 988 right now — someone is there this second."
3. A safety check: "Can you tell me — are you safe right now? Can you put [the means] somewhere else while we talk?"
4. Maintain connection: Do not end the message abruptly. Stay with them.

Keep it SHORT. 4-6 lines. Every word matters.
CRISIS RESOURCE: Call or text 988. Emergency services: 911 if immediate physical danger.`,
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
