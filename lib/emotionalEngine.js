// lib/emotionalEngine.js  v2
// Emotional state calculator — the persistent session-level emotional model.
//
// Each user message produces an updated EmotionalState object.
// State is stored in the session record and loaded at the start of each message.

"use strict";

const { extractSignals, defaultSignals }                = require("./signalExtractor");
const { classifySafety }                               = require("./safetyClassifier");
const { resolvePrimaryCategory, advanceCrisisStage }   = require("./crisisFramework");

// ── DEFAULT EMOTIONAL STATE ───────────────────────────────────────────────
function createDefaultState(sessionId) {
  return {
    // Primary dimensions
    valence:              0.5,   // 0=very negative, 1=very positive
    arousal:              0.45,  // 0=very calm/numb, 1=highly activated/distressed
    stability:            0.65,  // 0=fragile, 1=grounded

    // Secondary markers
    isolationScore:       0,     // 0=connected, 1=completely alone
    hopeScore:            0.5,   // 0=hopeless, 1=hopeful
    expressionScore:      0.4,   // 0=closed off, 1=fully open
    burdenScore:          0,     // 0=no burden language, 1=strong burden language
    worthlessnessScore:   0,     // 0=none, 1=strong self-devaluation

    // Ideation — highest observed in this session
    lastIdeation:         0,     // 0–4

    // Cognitive coherence of current message
    coherence:            0.85,  // 1=coherent, 0=fragmented/dissociated

    // User's openness to receiving external help
    escalationReadiness:  0,     // 0–1

    // Trajectory — how emotional state moves across the session
    trend:               "stable",  // improving | stable | declining | rapidly_declining

    // Safety classification (5-tier)
    safetyLevel:          "green",  // green | yellow | orange | red | critical
    escalationLevel:      0,        // 0–4
    immediacyFlag:        false,

    // Behavioral mode (drives LLM prompt personality)
    mode: "VALIDATION",  // VALIDATION | STABILIZATION | GUIDED_ESCALATION | CRITICAL_ESCALATION

    // Crisis Response Framework tracking
    crisisStage:          0,    // 0=not in crisis, 1-5=current framework stage
    crisisMessageCount:   0,    // messages exchanged since crisis was entered
    crisisCategory:       null, // dominant P1 category while in crisis

    // Session metadata
    messageCount:         0,
    sessionId:            sessionId || null,
    lastUpdated:          Date.now(),
  };
}

// ── WEIGHTED BLEND ────────────────────────────────────────────────────────
// new = prior*(1-weight) + signal*weight
// weight controls how fast the state responds to new signals
function blend(prior, signal, weight) {
  return Math.max(0, Math.min(1, prior * (1 - weight) + signal * weight));
}

// ── TREND CALCULATOR ─────────────────────────────────────────────────────
// Compares current stability + valence to prior to determine trajectory
function calculateTrend(prior, signals) {
  const stabilityDelta = signals.stability - prior.stability;
  const valenceDelta   = signals.valence   - prior.valence;
  const combined       = (stabilityDelta + valenceDelta) / 2;

  if (combined >=  0.08)  return "improving";
  if (combined <= -0.15)  return "rapidly_declining";
  if (combined <= -0.06)  return "declining";
  return "stable";
}

// ── MODE RESOLVER ─────────────────────────────────────────────────────────
// Maps 5-tier safety level → 4 behavioral modes.
// Modes control the LLM's tone, response length, and escalation behavior.
function resolveMode(safetyLevel, trend, messageCount) {
  // CRITICAL: immediacy / imminent signals
  if (safetyLevel === "critical") return "CRITICAL_ESCALATION";

  // RED: active ideation — guide warmly toward help, validate first
  if (safetyLevel === "red") return "GUIDED_ESCALATION";

  // ORANGE: severe destabilization or passive ideation — ground first
  if (safetyLevel === "orange") return "STABILIZATION";

  // YELLOW with rapid decline — shift to stabilization
  if (safetyLevel === "yellow" && trend === "rapidly_declining" && messageCount >= 3) {
    return "STABILIZATION";
  }

  // GREEN or YELLOW (stable) — warm validation and exploration
  return "VALIDATION";
}

// ── MAIN UPDATE FUNCTION ─────────────────────────────────────────────────
/**
 * Calculate updated EmotionalState from a new user message.
 *
 * @param {string} message       — raw user message text
 * @param {Array}  history       — recent message history [{role, content}]
 * @param {object} priorState    — previous EmotionalState (or null for first message)
 * @param {string} sessionId     — session identifier
 * @returns {object}             — updated EmotionalState
 */
function updateEmotionalState(message, history, priorState, sessionId) {
  const prior   = priorState || createDefaultState(sessionId);
  const signals = extractSignals(message, history);

  // ── Blend continuous dimensions ───────────────────────────────────────
  // Blend weights: how quickly the new signal moves the state.
  // Safety signals move fast (0.55–0.65), stability is slower (0.35)
  // to avoid over-reaction to a single message.
  const newValence           = blend(prior.valence,           signals.valence,           0.45);
  const newArousal           = blend(prior.arousal,           signals.arousal,           0.55);
  const newStability         = blend(prior.stability,         signals.stability,         0.35);
  const newHope              = blend(prior.hopeScore,         signals.hopeScore,         0.40);
  const newExpression        = blend(prior.expressionScore,   signals.expressionScore,   0.30);
  // Burden and worthlessness use higher initial weight (0.70) so that
  // first-message self-devaluation language registers at full signal strength.
  const newBurden            = blend(prior.burdenScore,        signals.burdenScore,        0.70);
  const newWorthlessness     = blend(prior.worthlessnessScore, signals.worthlessnessScore, 0.70);

  // Isolation uses max-preserving formula — once isolation is detected
  // it should persist unless the user explicitly signals connection
  const newIsolation = Math.max(
    prior.isolationScore,
    signals.isolationScore * 0.7 + prior.isolationScore * 0.3
  );

  // ── Computed signals object (blended) for safety classifier ──────────
  const blendedSignals = {
    ...signals,
    valence:            newValence,
    arousal:            newArousal,
    stability:          newStability,
    hopeScore:          newHope,
    isolationScore:     newIsolation,
    burdenScore:        newBurden,
    worthlessnessScore: newWorthlessness,
  };

  // ── Safety classification ─────────────────────────────────────────────
  const {
    safetyLevel,
    escalationLevel,
    immediacyFlag,
    escalationReadiness,
    coherence,
  } = classifySafety(blendedSignals, {
    ...prior,
    messageCount: prior.messageCount + 1,
  });

  // ── Trend ─────────────────────────────────────────────────────────────
  const trend = calculateTrend(prior, { stability: newStability, valence: newValence });

  // ── Mode ──────────────────────────────────────────────────────────────
  const mode = resolveMode(safetyLevel, trend, prior.messageCount + 1);

  // ── Crisis Framework stage tracking ───────────────────────────────────
  const inCrisis = safetyLevel === "orange" || safetyLevel === "red" || safetyLevel === "critical";
  const newCrisisCategory = inCrisis ? resolvePrimaryCategory(blendedSignals) : null;
  const newCrisisStage    = advanceCrisisStage(
    prior.crisisStage    || 0,
    prior.safetyLevel    || "green",
    blendedSignals,
    safetyLevel
  );
  const newCrisisMessageCount = inCrisis ? (prior.crisisMessageCount || 0) + 1 : 0;

  return {
    // Continuous dimensions
    valence:              newValence,
    arousal:              newArousal,
    stability:            newStability,
    isolationScore:       newIsolation,
    hopeScore:            newHope,
    expressionScore:      newExpression,
    burdenScore:          newBurden,
    worthlessnessScore:   newWorthlessness,

    // Ideation — preserve highest observed this session
    lastIdeation:         Math.max(prior.lastIdeation || 0, signals.ideationScore),

    // Cognitive state (per-message, not blended)
    coherence,

    // Escalation readiness (context-adjusted from classifier)
    escalationReadiness,

    // Trajectory
    trend,

    // Safety
    safetyLevel,
    escalationLevel,
    immediacyFlag,

    // Behavioral mode
    mode,

    // Crisis framework
    crisisStage:          newCrisisStage,
    crisisMessageCount:   newCrisisMessageCount,
    crisisCategory:       newCrisisCategory,

    // Session metadata
    messageCount:         prior.messageCount + 1,
    sessionId:            sessionId || prior.sessionId,
    lastUpdated:          Date.now(),
  };
}

/**
 * Build a short text summary of the emotional state for injection into LLM prompts.
 * Keeps it concrete but brief so it doesn't dominate the system prompt.
 */
function summarizeEmotionalState(state) {
  if (!state) return "User emotional state: unknown.";

  const parts = [];

  // Valence
  if (state.valence < 0.3)        parts.push("strongly negative affect");
  else if (state.valence < 0.45)  parts.push("mild-to-moderate negative affect");
  else if (state.valence > 0.65)  parts.push("positive affect");
  else                             parts.push("neutral/mixed affect");

  // Arousal
  if (state.arousal > 0.75)       parts.push("highly activated/distressed");
  else if (state.arousal < 0.30)  parts.push("low activation/numb");
  else                             parts.push("moderate activation");

  // Stability
  if (state.stability < 0.35)     parts.push("emotionally fragile");
  else if (state.stability > 0.65) parts.push("emotionally grounded");
  else                             parts.push("moderately stable");

  // Isolation
  if (state.isolationScore > 0.7)   parts.push("strong feelings of isolation");
  else if (state.isolationScore > 0.4) parts.push("some sense of being alone");

  // Burden / worthlessness
  if (state.burdenScore > 0.6)      parts.push("burden language present");
  if (state.worthlessnessScore > 0.6) parts.push("self-devaluation language present");

  // Hope
  if (state.hopeScore < 0.2)       parts.push("low hope / hopeless");
  else if (state.hopeScore > 0.6)  parts.push("some forward-looking hope");

  // Coherence
  if (state.coherence < 0.45)      parts.push("fragmented / dissociated thinking");
  else if (state.coherence < 0.65) parts.push("mildly fragmented");

  // Trend
  if (state.trend === "rapidly_declining") parts.push("state declining rapidly this session");
  else if (state.trend === "declining")    parts.push("state gradually declining");
  else if (state.trend === "improving")    parts.push("state improving");

  // Ideation
  if (state.lastIdeation >= 3)     parts.push("active/planned suicidal ideation present");
  else if (state.lastIdeation >= 2) parts.push("explicit self-harm language used");
  else if (state.lastIdeation >= 1) parts.push("passive life-exhaustion language used");

  return "User emotional context: " + parts.join(", ") + ".";
}

module.exports = { createDefaultState, updateEmotionalState, summarizeEmotionalState };
