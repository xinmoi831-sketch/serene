// lib/pacingEngine.js  v2
// Controls LLM response characteristics based on emotional state and mode.
//
// Returns a full pacing object:
//   maxTokens       — Groq API max_tokens parameter
//   temperature     — Groq API temperature parameter
//   responseLength  — 'very_short' | 'short' | 'medium' | 'standard'
//   tone            — 'crisis' | 'grounding' | 'stabilizing' | 'warm' | 'exploratory'
//   groundingEnabled — boolean; whether to inject a grounding technique hint

"use strict";

/**
 * Get full pacing parameters based on the current emotional state and mode.
 *
 * @param {object} emotionalState — current EmotionalState
 * @returns {{ maxTokens, temperature, responseLength, tone, groundingEnabled }}
 */
function getPacingParams(emotionalState) {
  if (!emotionalState) {
    return {
      maxTokens:       400,
      temperature:     0.75,
      responseLength:  "standard",
      tone:            "warm",
      groundingEnabled: false,
    };
  }

  const { mode, arousal, stability, safetyLevel, coherence = 0.85 } = emotionalState;

  // ── CRITICAL_ESCALATION ──────────────────────────────────────────────
  // Maximum brevity. One clear sentence. Local emergency services first.
  if (mode === "CRITICAL_ESCALATION" || safetyLevel === "critical") {
    return {
      maxTokens:       140,
      temperature:     0.40,
      responseLength:  "very_short",
      tone:            "crisis",
      groundingEnabled: false,
    };
  }

  // ── GUIDED_ESCALATION ────────────────────────────────────────────────
  // Short, warm, focused. Validate first, then guide. Never ramble in crisis.
  if (mode === "GUIDED_ESCALATION" || safetyLevel === "red") {
    return {
      maxTokens:       180,
      temperature:     0.45,
      responseLength:  "short",
      tone:            "grounding",
      groundingEnabled: true,
    };
  }

  // ── STABILIZATION ────────────────────────────────────────────────────
  // Very short, calming rhythm. No excess words.
  // Low coherence = even shorter (fragmented user needs simple anchors)
  if (mode === "STABILIZATION" || safetyLevel === "orange" || safetyLevel === "amber") {
    const shortByCoherence = coherence < 0.55;
    return {
      maxTokens:       shortByCoherence ? 130 : 155,
      temperature:     0.52,
      responseLength:  "short",
      tone:            "stabilizing",
      groundingEnabled: true,
    };
  }

  // ── VALIDATION — scale to emotional intensity ─────────────────────────
  // High arousal or low stability = shorter, gentler
  // Low arousal, stable = room for warmer, more exploratory response
  const intensity = (arousal + (1 - stability)) / 2; // 0.0 → 1.0

  // maxTokens: 220 (very distressed) → 450 (calm and stable)
  const maxTokens  = Math.round(180 - intensity * 60);

  // temperature: 0.65 (distressed, focused) → 0.80 (stable, expressive)
  const temperature = parseFloat((0.80 - intensity * 0.15).toFixed(2));

  // responseLength label
  let responseLength;
  if (intensity > 0.70)       responseLength = "short";
  else if (intensity > 0.40)  responseLength = "medium";
  else                        responseLength = "standard";

  // Tone label
  let tone;
  if (intensity > 0.60)       tone = "stabilizing";
  else if (intensity > 0.30)  tone = "warm";
  else                        tone = "exploratory";

  // Only enable grounding if there's significant activation
  const groundingEnabled = arousal > 0.60 || stability < 0.40;

  return { maxTokens, temperature, responseLength, tone, groundingEnabled };
}

module.exports = { getPacingParams };
