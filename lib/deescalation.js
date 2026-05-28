// lib/deescalation.js
// Grounding techniques registry.
// Selects a single appropriate grounding technique based on emotional state.
// Techniques are designed to be injected as a HINT to the LLM, not forced output.

"use strict";

const TECHNIQUES = [
  // ── Immediacy / Physical Safety Check ───────────────────────────────────
  {
    id:      "safety_check",
    name:    "Physical Safety Check",
    trigger: (s) => s.immediacyFlag || s.safetyLevel === "red" || s.safetyLevel === "critical",
    hint:    "Before anything else, gently check if they are physically safe right now. One question: 'Are you somewhere safe at this moment?'",
    priority: 10,
  },

  // ── Severe Panic (high arousal + low stability) ──────────────────────
  {
    id:      "breathing_478",
    name:    "4-7-8 Breathing",
    trigger: (s) => s.arousal > 0.8 && s.stability < 0.4,
    hint:    "Offer the 4-7-8 breathing technique very gently. Breathe in for 4, hold for 7, out for 8. Phrase it as an invitation, not instruction: 'Would it be okay to try something together?'",
    priority: 8,
  },

  // ── Overwhelm (high arousal, moderate stability) ─────────────────────
  {
    id:      "sensory_anchor",
    name:    "5-4-3-2-1 Grounding",
    trigger: (s) => s.arousal > 0.72 && s.stability < 0.5,
    hint:    "Gently offer the 5-4-3-2-1 grounding technique — but only as one soft question: 'Can you tell me 5 things you can see right where you are?' Let them respond before going further.",
    priority: 7,
  },

  // ── Isolation + moderate distress ────────────────────────────────────
  {
    id:      "connection_anchor",
    name:    "Connection Anchor",
    trigger: (s) => s.isolationScore > 0.7 && s.safetyLevel !== "red" && s.safetyLevel !== "critical",
    hint:    "Acknowledge the loneliness directly. Then gently remind them that being here, talking, is itself a form of connection. Do not rush past this — stay in it with them.",
    priority: 6,
  },

  // ── Hopelessness + passive ideation ──────────────────────────────────
  {
    id:      "hope_anchor",
    name:    "Hope Anchoring",
    trigger: (s) => s.hopeScore < 0.25 && s.lastIdeation >= 1,
    hint:    "Help them find one small reason, one person, one thing — anything — that still matters to them. Be patient and gentle. Do not push.",
    priority: 5,
  },

  // ── General overwhelm (orange/amber, no specific trigger above) ────────
  {
    id:      "slow_down",
    name:    "Slow Down",
    trigger: (s) => (s.safetyLevel === "orange" || s.safetyLevel === "amber") && s.arousal > 0.6,
    hint:    "Slow the conversation down. Shorter sentences. Let them know there is no rush. One gentle question — nothing more.",
    priority: 4,
  },
];

/**
 * Select the most appropriate grounding technique for the current state.
 * Returns null if no technique is warranted (green, stable).
 *
 * @param {object} emotionalState
 * @returns {object|null} technique object or null
 */
function selectTechnique(emotionalState) {
  if (!emotionalState) return null;

  const applicable = TECHNIQUES
    .filter(t => t.trigger(emotionalState))
    .sort((a, b) => b.priority - a.priority);

  return applicable.length > 0 ? applicable[0] : null;
}

/**
 * Get the grounding hint string to inject into the LLM prompt.
 * Returns empty string if no technique applies.
 *
 * @param {object} emotionalState
 * @returns {string}
 */
function getGroundingHint(emotionalState) {
  const technique = selectTechnique(emotionalState);
  if (!technique) return "";
  return "\n\nGROUNDING TECHNIQUE HINT:\n" + technique.hint;
}

module.exports = { selectTechnique, getGroundingHint };
