// test-pipeline.js — run with: node test-pipeline.js
"use strict";

const { updateEmotionalState, createDefaultState } = require("./lib/emotionalEngine");
const { getPacingParams }      = require("./lib/pacingEngine");
const { getGroundingHint }     = require("./lib/deescalation");
const { getEscalationGuide }   = require("./lib/escalationTemplates");
const { buildSystemPrompt }    = require("./lib/promptConstructor");

// ── Section 1: Routing correctness ───────────────────────────────────────
console.log("=== ROUTING TESTS ===");

const prior = createDefaultState("test");

const routingCases = [
  // [message, expectedMode, expectedSafetyLevel]

  // GREEN — should stay VALIDATION
  ["Hi, I had a good day",                                                     "VALIDATION",           "green"],
  ["I have been feeling a bit anxious all week",                               "VALIDATION",           "green"],
  ["Thank you for listening, this has been helpful",                           "VALIDATION",           "green"],
  ["I am stressed about work but managing",                                    "VALIDATION",           "green"],

  // ORANGE — should be STABILIZATION
  ["I just feel like disappearing. Everyone would be better off without me.",  "STABILIZATION",        "orange"],
  ["I am falling apart. I cannot cope anymore and I am overwhelmed.",          "STABILIZATION",        "orange"],
  ["I feel completely alone. Nobody understands what I am going through.",     "STABILIZATION",        "orange"],

  // RED — should be GUIDED_ESCALATION
  ["I want to kill myself",                                                    "GUIDED_ESCALATION",    "red"],
  ["I have been thinking about ending my life",                                "GUIDED_ESCALATION",    "red"],

  // CRITICAL — should be CRITICAL_ESCALATION
  ["I have pills in front of me right now",                                    "CRITICAL_ESCALATION",  "critical"],
];

let routePass = 0;
let routeFail = 0;
routingCases.forEach(function(c) {
  const state = updateEmotionalState(c[0], [], prior, "test");
  const pass = state.mode === c[1] && state.safetyLevel === c[2];
  if (pass) {
    routePass++;
  } else {
    routeFail++;
    console.log("[FAIL]", JSON.stringify(c[0].slice(0, 60)));
    console.log(
      "       expected mode:", c[1], "/ safety:", c[2],
      "\n       got      mode:", state.mode, "/ safety:", state.safetyLevel,
      "| ideation:", state.lastIdeation,
      "| arousal:", state.arousal.toFixed(3),
      "| stability:", state.stability.toFixed(3),
      "| isolation:", state.isolationScore.toFixed(3),
      "| coherence:", (state.coherence || 0).toFixed(3),
      "| escalReadiness:", (state.escalationReadiness || 0).toFixed(3)
    );
  }
});
console.log("Routing: " + routePass + "/" + routingCases.length + " passed" + (routeFail === 0 ? " ✓" : " — " + routeFail + " FAILED"));

// ── Section 2: Pacing ─────────────────────────────────────────────────────
console.log("\n=== PACING TESTS ===");

const criticalState = updateEmotionalState("I have pills in front of me right now", [], prior, "test");
const cp = getPacingParams(criticalState);
const criticalOk = cp.maxTokens <= 150 && cp.temperature <= 0.45 && cp.tone === "crisis";
console.log("Critical pacing — maxTokens:", cp.maxTokens, "temp:", cp.temperature, "tone:", cp.tone, criticalOk ? "✓" : "FAIL");

const crisisState = updateEmotionalState("I want to kill myself", [], prior, "test");
const crp = getPacingParams(crisisState);
const crisisOk = crp.maxTokens <= 200 && crp.temperature <= 0.50;
console.log("Crisis pacing   — maxTokens:", crp.maxTokens, "temp:", crp.temperature, "tone:", crp.tone, crisisOk ? "✓" : "FAIL");

const stableState = updateEmotionalState("I had a pretty calm week overall", [], prior, "test");
const sp = getPacingParams(stableState);
const stableOk = sp.maxTokens >= 300;
console.log("Stable pacing   — maxTokens:", sp.maxTokens, "temp:", sp.temperature, "tone:", sp.tone, stableOk ? "✓" : "FAIL");

// Grounding should be enabled for crisis/stabilization, disabled for stable VALIDATION
const groundingOkCrisis  = crp.groundingEnabled === true;
const groundingOkStable  = sp.groundingEnabled === false;
console.log("Grounding enabled for crisis:", groundingOkCrisis ? "✓" : "FAIL");
console.log("Grounding disabled for stable:", groundingOkStable ? "✓" : "FAIL");

// ── Section 3: Escalation metadata ────────────────────────────────────────
console.log("\n=== ESCALATION METADATA ===");

const criticalEscState = updateEmotionalState("I have pills in front of me right now", [], prior, "test");
const critGuide = getEscalationGuide(criticalEscState.escalationLevel);
const critBannerOk = critGuide.uiBanner === true && critGuide.crisisResource !== null;
console.log("Critical escalation — level:", criticalEscState.escalationLevel, "uiBanner:", critGuide.uiBanner, "hasResource:", critGuide.crisisResource !== null, critBannerOk ? "✓" : "FAIL");

const redState  = updateEmotionalState("I want to end my life", [], prior, "test");
const redGuide  = getEscalationGuide(redState.escalationLevel);
const bannerOk  = redGuide.uiBanner === true && redGuide.crisisResource !== null;
console.log("Red escalation  — level:", redState.escalationLevel, "uiBanner:", redGuide.uiBanner, "hasResource:", redGuide.crisisResource !== null, bannerOk ? "✓" : "FAIL");

const greenState   = updateEmotionalState("I feel okay today", [], prior, "test");
const greenGuide   = getEscalationGuide(greenState.escalationLevel);
const nobannerOk   = greenGuide.uiBanner === false && greenGuide.crisisResource === null;
console.log("Green escalation — level:", greenState.escalationLevel, "uiBanner:", greenGuide.uiBanner, nobannerOk ? "✓" : "FAIL");

// ── Section 4: Grounding hints ────────────────────────────────────────────
console.log("\n=== GROUNDING HINTS ===");
const panicState = updateEmotionalState("I am panicking so badly right now, I cannot breathe, heart racing", [], prior, "test");
console.log("  panic state — mode:", panicState.mode, "safety:", panicState.safetyLevel, "arousal:", panicState.arousal.toFixed(3));
const hint = getGroundingHint(panicState);
console.log("Panic grounding hint present:", hint.length > 0 ? "✓ (" + hint.slice(0,60) + "...)" : "FAIL (empty)");

// ── Section 5: Prompt construction ───────────────────────────────────────
console.log("\n=== PROMPT CONSTRUCTION ===");
const modeMap = {
  "VALIDATION":          "green",
  "STABILIZATION":       "orange",
  "GUIDED_ESCALATION":   "red",
  "CRITICAL_ESCALATION": "critical",
};
Object.entries(modeMap).forEach(function([mode, safety]) {
  const fakeState = Object.assign({}, prior, {
    mode,
    safetyLevel: safety,
    coherence: 0.85,
    escalationReadiness: 0,
    burdenScore: 0,
    worthlessnessScore: 0,
  });
  const prompt = buildSystemPrompt(mode, fakeState, null);
  const ok = prompt.includes("SERENE") && prompt.length > 200;
  console.log(mode + " prompt built:", ok ? "✓ (" + prompt.length + " chars)" : "FAIL");
});

// ── Section 6: New signal fields ─────────────────────────────────────────
console.log("\n=== NEW SIGNAL FIELDS ===");

const burdenMsg   = "I am a burden to everyone. They would be better off without me.";
const burdenState = updateEmotionalState(burdenMsg, [], prior, "test");
const burdenOk    = burdenState.burdenScore > 0.5 && burdenState.safetyLevel !== "green";
console.log("Burden detection — burdenScore:", burdenState.burdenScore.toFixed(3), "safety:", burdenState.safetyLevel, burdenOk ? "✓" : "FAIL");

const worthMsg   = "I am worthless. I hate myself and I don't deserve anything.";
const worthState = updateEmotionalState(worthMsg, [], prior, "test");
const worthOk    = worthState.worthlessnessScore > 0.5 && worthState.safetyLevel !== "green";
console.log("Worthlessness   — score:", worthState.worthlessnessScore.toFixed(3), "safety:", worthState.safetyLevel, worthOk ? "✓" : "FAIL");

const fragMsg   = "i dont know... i just... everything... i cant... why...";
const fragState = updateEmotionalState(fragMsg, [], prior, "test");
const fragOk    = fragState.coherence < 0.80;
console.log("Coherence drop  — coherence:", (fragState.coherence || 0).toFixed(3), "safety:", fragState.safetyLevel, fragOk ? "✓" : "FAIL");

const helpMsg   = "I think I need help. Should I see a therapist?";
const helpState = updateEmotionalState(helpMsg, [], prior, "test");
const helpOk    = helpState.escalationReadiness > 0.5;
console.log("Escal. readiness— score:", (helpState.escalationReadiness || 0).toFixed(3), "safety:", helpState.safetyLevel, helpOk ? "✓" : "FAIL");

// ── Final result ──────────────────────────────────────────────────────────
console.log("\n=== DONE ===");
if (routeFail > 0) process.exit(1);
