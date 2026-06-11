// lib/safetyClassifier.js  v2
// 5-level safety classifier with 7-dimension evaluation.
//
// Safety Levels:
//   green    — distressed but stable; no ideation; coping capacity present
//   yellow   — elevated distress; mild signals; monitoring warranted
//   orange   — severe destabilization or passive ideation; needs active support
//   red      — active ideation, self-harm indicators, or high-risk cluster
//   critical — imminent danger; immediacy flag; requires crisis-level response
//
// Escalation Levels (0–4):
//   0 — Contained:         SERENE handles independently
//   1 — Supportive bridge: community/peer support suggested
//   2 — Soft escalation:   in-platform therapist offered
//   3 — Crisis escalation: support button + therapist offered
//   4 — Immediacy:         local emergency services first sentence + safety check
//
// Output: { safetyLevel, escalationLevel, immediacyFlag, escalationReadiness, coherence, showSupportButton }

"use strict";

// ────────────────────────────────────────────────────────────────────────────
// SAFETY LEVEL THRESHOLDS
//
//  GREEN    amberScore < 2, no ideation, no panic → baseline well-being
//  YELLOW   mild multi-signal pattern (2+ low-weight signals) → monitor
//  ORANGE   severe distress cluster, passive ideation, or extreme isolation
//  RED      active ideation (score 2+), no immediacy
//  CRITICAL immediacy flag or tier-4 ideation
// ────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} signals    — output of signalExtractor.extractSignals()
 * @param {object} priorState — previous EmotionalState for this session
 * @returns {{ safetyLevel, escalationLevel, immediacyFlag, escalationReadiness, coherence }}
 */
function classifySafety(signals, priorState = {}) {
  const {
    ideationScore        = 0,
    arousal              = 0.45,
    stability            = 0.65,
    isolationScore       = 0,
    hopeScore            = 0.5,
    temporalScore        = 0,
    protectiveScore      = 0,
    burdenScore          = 0,
    worthlessnessScore   = 0,
    urgencyScore         = 0,
    escalationReadiness  = 0,
    coherence            = 0.85,
    immediacyFlag        = false,
    safetyFloor          = false,
    methodFlag           = false,
    recoverySignal       = false,
  } = signals;

  const priorSafety        = priorState.safetyLevel        || "green";
  const priorTrend         = priorState.trend               || "stable";
  const messageCount       = priorState.messageCount        || 0;
  const crisisMessageCount = priorState.crisisMessageCount  || 0;

  // ── COMPUTED ESCALATION READINESS ────────────────────────────────────────
  // Blend raw signal readiness with session-context factors.
  // Longer declining sessions → user is more likely to accept a referral.
  let computedReadiness = escalationReadiness;
  if (messageCount >= 6)                    computedReadiness = Math.min(1, computedReadiness + 0.10);
  if (priorTrend === "declining")           computedReadiness = Math.min(1, computedReadiness + 0.10);
  if (priorTrend === "rapidly_declining")   computedReadiness = Math.min(1, computedReadiness + 0.20);
  if (hopeScore < 0.2)                      computedReadiness = Math.min(1, computedReadiness + 0.05);
  computedReadiness = Math.max(0, Math.min(1, computedReadiness));

  // ═══════════════════════════════════════════════════════════════════════
  // TIER 5 — CRITICAL  (imminent danger; immediacy flag)
  // ═══════════════════════════════════════════════════════════════════════
  if (immediacyFlag)
    return mk("critical", 4, true,  computedReadiness, coherence);
  if (ideationScore >= 4)
    return mk("critical", 4, true,  computedReadiness, coherence);
  // Planned ideation (score 3) + expressed urgency (tonight / right now)
  if (ideationScore === 3 && urgencyScore >= 0.8)
    return mk("critical", 4, true,  computedReadiness, coherence);

  // ═══════════════════════════════════════════════════════════════════════
  // TIER 4 — RED  (active / planned ideation without immediacy)
  // ═══════════════════════════════════════════════════════════════════════

  // Planned ideation without urgency
  if (ideationScore === 3)
    return mk("red", 3, false, computedReadiness, coherence);

  // Active ideation (score 2) — RED regardless of mitigating factors
  if (ideationScore === 2)
    return mk("red", 3, false, computedReadiness, coherence);

  // Method reference (Category 3) — specific suicide method mentioned → RED minimum.
  // Even without explicit ideation phrasing, naming a method is high-risk.
  if (methodFlag)
    return mk("red", 3, false, computedReadiness, coherence);

  // Escalating-pattern safety: was RED/CRITICAL, still shows any ideation → stay RED
  if ((priorSafety === "red" || priorSafety === "critical") && ideationScore >= 1)
    return mk("red", 3, false, computedReadiness, coherence);

  // ═══════════════════════════════════════════════════════════════════════
  // TIER 3 — ORANGE  (severe destabilization or passive ideation)
  // Points accumulate; any single serious signal is enough (threshold = 3).
  // ═══════════════════════════════════════════════════════════════════════
  let orangeScore = 0;

  // Passive ideation (score 1) is always at least ORANGE — core safety principle.
  // "I just want to disappear" / "everyone would be better off without me"
  // must NEVER remain green/yellow. That is non-negotiable.
  if (ideationScore >= 1)                          orangeScore += 3;

  // Distress cluster: co-occurring high-arousal + reduced-stability
  // ("falling apart", "cannot cope", "overwhelmed" together)
  if (arousal > 0.55 && stability < 0.60)          orangeScore += 3;

  // Pure panic threshold (even without stability drop)
  if (arousal > 0.58)                              orangeScore += 3;

  // Extra weight for extreme activation (multiple panic signals stacked)
  if (arousal > 0.75)                              orangeScore += 1;

  // Fragile stability alone
  if (stability < 0.35)                            orangeScore += 1;

  // Severe isolation → orange immediately
  // Note: maxMatch from signalExtractor returns the highest-scoring match,
  // so 0.55 threshold catches "completely alone / nobody understands" language.
  if (isolationScore >= 0.55)                      orangeScore += 3;
  else if (isolationScore >= 0.3)                  orangeScore += 1;

  // Burden + worthlessness cluster (even without ideation, this is serious)
  if (burdenScore >= 0.7 && worthlessnessScore >= 0.6) orangeScore += 3;
  else if (burdenScore >= 0.5 || worthlessnessScore >= 0.5) orangeScore += 1;

  // Hopelessness (1C) — stronger weight now that explicit hopelessness phrases
  // can reliably push hopeScore below 0.20 via HOPELESSNESS_PATTERNS deduction
  if (hopeScore < 0.2)                             orangeScore += 1;
  if (hopeScore < 0.12)                            orangeScore += 2; // severe / explicit hopelessness cluster

  // Distress is happening right now / recently
  if (temporalScore >= 2)                          orangeScore += 1;

  // Trend-based escalation
  if (priorTrend === "rapidly_declining")           orangeScore += 2;
  if (priorTrend === "declining")                   orangeScore += 1;

  // Sustained distress across multiple messages
  if (messageCount >= 4 && stability < 0.45)       orangeScore += 1;
  if (messageCount >= 6 && hopeScore < 0.3)        orangeScore += 1;

  // Low coherence under distress = dissociation / fragmented thinking
  if (coherence < 0.5)                             orangeScore += 1;

  // Prior orange (or old "amber") + any new concerning signal → stay orange
  if ((priorSafety === "orange" || priorSafety === "amber") &&
      (ideationScore >= 1 || stability < 0.4 || isolationScore >= 0.6)) {
    orangeScore = Math.max(orangeScore, 3);
  }

  // Category 12 — Context escalation: combinations of lower-severity categories
  // elevate risk beyond what any single signal would suggest.
  //   Hopelessness + isolation + passive death wish → force ORANGE
  const hasHopelessness   = hopeScore < 0.25;
  const hasIsolation      = isolationScore >= 0.4;
  const hasPassiveIdeation = ideationScore >= 1;
  const hasBurden         = burdenScore >= 0.5 || worthlessnessScore >= 0.5;
  const activeCategories  = [hasHopelessness, hasIsolation, hasPassiveIdeation, hasBurden]
    .filter(Boolean).length;
  if (activeCategories >= 3) orangeScore = Math.max(orangeScore, 3);
  // Two categories still earn extra weight toward ORANGE
  else if (activeCategories === 2) orangeScore += 1;

  // Crisis persistence: once in a crisis conversation, require explicit recovery
  // language to de-escalate — not just the absence of crisis signals.
  // A person who said "I want to die" and then says "I've felt this way for weeks"
  // is still in crisis. Only genuine grounding/improvement language allows exit.
  // Covers prior orange/amber/red/critical — any crisis-level prior state.
  const priorWasCrisis = priorSafety === "orange" || priorSafety === "amber" ||
                         priorSafety === "red"    || priorSafety === "critical";
  if (priorWasCrisis && crisisMessageCount > 0 && !recoverySignal) {
    orangeScore = Math.max(orangeScore, 3);
  }

  if (orangeScore >= 3) {
    // Within ORANGE: single-signal orange (escalation 1) vs multi-signal (escalation 2)
    const escalation = orangeScore >= 5 ? 2 : 1;
    return mk("orange", escalation, false, computedReadiness, coherence);
  }

  // Safety floor: explicit crisis keywords (suicide, self-harm, kill myself…) must
  // never resolve below ORANGE, regardless of surrounding signal scores.
  if (safetyFloor)
    return mk("orange", 1, false, computedReadiness, coherence);

  // ═══════════════════════════════════════════════════════════════════════
  // TIER 2 — YELLOW  (elevated distress; monitoring warranted)
  // Two or more mild signals without reaching ORANGE thresholds.
  // ═══════════════════════════════════════════════════════════════════════
  let yellowScore = 0;

  if (arousal > 0.50)                                      yellowScore += 1;
  if (stability < 0.55)                                    yellowScore += 1;
  if (isolationScore >= 0.3)                               yellowScore += 1;
  if (hopeScore < 0.3)                                     yellowScore += 1;
  if (burdenScore >= 0.4 || worthlessnessScore >= 0.4)     yellowScore += 1;
  // Strong self-devaluation language alone is a second yellow signal
  // ("I am worthless / I hate myself / I don't deserve anything")
  if (worthlessnessScore >= 0.55 || burdenScore >= 0.55)   yellowScore += 1;
  if (temporalScore >= 2)                                  yellowScore += 1;
  if (priorTrend === "declining")                          yellowScore += 1;
  if (priorTrend === "rapidly_declining")                  yellowScore += 2;

  if (yellowScore >= 2) {
    return mk("yellow", 1, false, computedReadiness, coherence);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TIER 1 — GREEN  (distressed but stable; baseline monitoring)
  // ═══════════════════════════════════════════════════════════════════════
  return mk("green", 0, false, computedReadiness, coherence);
}

// ── RESULT FACTORY ────────────────────────────────────────────────────────
// showSupportButton is mandatory for categories 1–5, 9, 10 (any orange/red/critical
// safety level) and for any method reference — per the Mandatory Support Button Rule.
function mk(safetyLevel, escalationLevel, immediacyFlag, escalationReadiness, coherence) {
  const showSupportButton =
    safetyLevel === "orange" ||
    safetyLevel === "red" ||
    safetyLevel === "critical";
  return { safetyLevel, escalationLevel, immediacyFlag, escalationReadiness, coherence, showSupportButton };
}

module.exports = { classifySafety };
