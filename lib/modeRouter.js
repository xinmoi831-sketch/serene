// lib/modeRouter.js  v2
// Determines the behavioral mode from the emotional state.
// Thin delegation layer kept separate for clarity and independent testability.

"use strict";

// ── MODE DEFINITIONS ─────────────────────────────────────────────────────
//
//  VALIDATION          — green / yellow (stable distress)
//    Warm, exploratory, open-ended questions. Reflect feelings first.
//    No unsolicited advice. No hotlines unless asked.
//
//  STABILIZATION       — orange (severe destabilization / passive ideation)
//    Very short sentences. Grounding-first. One thing at a time.
//    Soft introduction of coping techniques. No hotlines yet.
//
//  GUIDED_ESCALATION   — red (active / planned ideation)
//    Validate feelings unconditionally first (never skip).
//    Then gently introduce professional support as a natural next step.
//    Provide crisis resource at natural moment — never as a cold redirect.
//    Never end on the hotline alone — stay emotionally present.
//
//  CRITICAL_ESCALATION — critical (immediacy / imminent danger)
//    Crisis resource in first sentence (mandatory).
//    Maximum brevity. Single safety-check question.
//    No counseling language. No exploration. Stabilize and connect.
// ────────────────────────────────────────────────────────────────────────

/**
 * Resolve the behavioral mode from an EmotionalState.
 *
 * @param {object} state — EmotionalState
 * @returns {string}     — 'VALIDATION' | 'STABILIZATION' | 'GUIDED_ESCALATION' | 'CRITICAL_ESCALATION'
 */
function resolveMode(state) {
  if (!state) return "VALIDATION";

  // CRITICAL: imminent danger — crisis resource leads the response
  if (state.safetyLevel === "critical") return "CRITICAL_ESCALATION";

  // RED: active ideation — warm guidance toward professional help
  if (state.safetyLevel === "red") return "GUIDED_ESCALATION";

  // ORANGE: severe destabilization / passive ideation — grounding first
  if (state.safetyLevel === "orange") return "STABILIZATION";

  // Backward compat: old "amber" level (sessions persisted before v2 upgrade)
  if (state.safetyLevel === "amber") return "STABILIZATION";

  // YELLOW + rapidly declining trend across multiple messages → stabilize
  if (state.safetyLevel === "yellow" &&
      state.trend === "rapidly_declining" &&
      state.messageCount >= 3) {
    return "STABILIZATION";
  }

  // GREEN / YELLOW (stable) → warm validation and exploration
  return "VALIDATION";
}

module.exports = { resolveMode };
