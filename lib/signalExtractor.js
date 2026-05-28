// lib/signalExtractor.js  v2
// Multi-dimensional linguistic signal extraction.
//
// Returns a signals object used by safetyClassifier and emotionalEngine.
// Each concept is a SEPARATE pattern entry so co-occurring signals accumulate.
//
// Dimensions extracted:
//   ideationScore        0–4  (none → passive → active → planned → imminent)
//   arousal              0–1  (numb/calm → overwhelmed/panicking)
//   stability            0–1  (grounded → fragmented/fragile)
//   isolationScore       0–1  (connected → completely alone)
//   hopeScore            0–1  (hopeless → hopeful)
//   expressionScore      0–1  (closed → fully open)
//   temporalScore        0–4  (historical → right now)
//   protectiveScore      0–1  (no protective factors → strong ones)
//   valence              0–1  (0=very negative, 1=positive)
//   coherence            0–1  (1=coherent, 0=fragmented/dissociated)
//   burdenScore          0–1  (0=none, 1=strong "I am a burden" language)
//   worthlessnessScore   0–1
//   urgencyScore         0–1  (0=no urgency, 1=extreme urgency)
//   escalationReadiness  0–1  (user signals openness to getting help)
//   immediacyFlag        boolean

"use strict";

// ── IDEATION TIERS ────────────────────────────────────────────────────────
// Checked priority-order; first match wins to avoid double-scoring
const IDEATION_TIERS = [
  {
    score: 4,
    label: "imminent",
    patterns: [
      /about to (hurt|kill|end|harm)/i,
      /right now.{0,20}(hurt|die|end it|not here)/i,
      /\b(pills?|knife|gun|rope|blade|razor).{0,18}(in front|ready|here with me|next to me|holding)/i,
      /doing it tonight/i,
      /this is (my last|goodbye)/i,
      /i (won't|will not) (be here|exist|be alive) (tomorrow|tonight|by morning)/i,
      /loading (the gun|a gun|it)/i,
    ],
  },
  {
    score: 3,
    label: "planned",
    patterns: [
      /(have a plan|know how i('ll| will)|already decided)/i,
      /(tonight|today|this week).{0,30}(kill myself|end (it|my life)|not (be )?here)/i,
      /i('ve| have) (decided|made up my mind) (to die|to end it|not to live)/i,
      /(stockpil|collect(ing|ed)?\s+pill|bought a (gun|knife|rope|blade))/i,
      /said (my )?goodbyes/i,
      /written (a |my )?(note|letter|goodbye)/i,
      /give(n|ing)? (away|my) (stuff|things|belongings|possessions)/i,
    ],
  },
  {
    score: 2,
    label: "active",
    patterns: [
      /kill\s+my\s*self/i,
      /end(ing)?\s+(my\s+life|it\s+all|everything)/i,
      /take\s+my\s+(own\s+)?life/i,
      /taking\s+my\s+(own\s+)?life/i,
      /want\s+to\s+(die|be\s+dead|not\s+(be|exist|live))/i,
      /thinking\s+(about\s+)?(ending|taking)\s+(my\s+life|my\s+own\s+life)/i,
      /don'?t\s+want\s+to\s+(be\s+here|exist|live\s+anymore)/i,
      /hurt\s+(my\s*self|myself)/i,
      /self[\s-]?harm/i,
      /cut(ting)?\s+my\s*self/i,
      /no\s+reason\s+to\s+(live|be\s+here)/i,
      /better\s+off\s+dead/i,
      /wish\s+i\s+(was\s+|were\s+)?dead/i,
      /suicid(e|al)/i,
    ],
  },
  {
    score: 1,
    label: "passive",
    patterns: [
      /can'?t\s+(do\s+this|keep\s+going|go\s+on|take\s+it|continue)/i,
      /no\s+(point|reason|purpose)\s+(anymore|left|in\s+(living|trying|going on))/i,
      /what'?s\s+the\s+point/i,
      /just\s+want\s+(it\s+to\s+stop|everything\s+to\s+stop)/i,
      /too\s+tired\s+to\s+(keep|continue|go on)/i,
      /want\s+to\s+(disappear|vanish)\b/i,
      /wish\s+i\s+(could\s+)?(disappear|not\s+(exist|be\s+here))/i,
      /everyone\s+(would\s+be\s+better\s+off|is\s+better\s+without)\s+(without\s+me|me)/i,
      /i('?m|\s+am)\s+a\s+burden/i,
      /nobody\s+would\s+(care|miss|notice)\s+(if\s+i\s+)?(was\s+gone|died|wasn.{0,5}here)/i,
      /disappear\s+(forever|completely)/i,
      /fade\s+(away|out)\s+forever/i,
    ],
  },
];

// ── AROUSAL — each entry is SEPARATE so multiple co-occurring signals stack ──
// +0.15 per hit; max clamped to 1.0
const AROUSAL_HIGH = [
  /panic(king)?/i,
  /terrif(ied|ying)/i,
  /can'?t\s+breathe|cannot\s+breathe/i,
  /heart\s+(is\s+)?racing/i,
  /shaking|trembling/i,
  /hyperventilat/i,
  /losing\s+(my\s+mind|control|it)\b/i,
  /freak(ing)?\s+out/i,
  /screaming\s+inside/i,
  /(extremely|so)\s+(angry|upset|scared|anxious)/i,
  /\boverwhelmed\b/i,
  /falling\s+apart/i,
  /breaking\s+down/i,
  /can'?t\s+(cope|handle|deal)|cannot\s+(cope|handle|deal)/i,
  /hitting\s+(a\s+)?rock\s+bottom/i,
  /mental\s+(breakdown|collapse)/i,
  /!{3,}/,           // !!!
];

const AROUSAL_LOW = [
  /numb(ness)?/i,
  /empty\s+(inside|feeling)?/i,
  /hollow/i,
  /void\b/i,
  /don'?t\s+feel\s+(anything|much)/i,
  /nothing\s+matters/i,
  /flat\b/i,
  /disconnected/i,
  /dissociat/i,
  /going\s+through\s+the\s+motions/i,
  /dead\s+inside/i,
  /shut\s*(ting)?\s*down/i,
];

// ── STABILITY ─────────────────────────────────────────────────────────────
const STABILITY_DESTABILIZING = [
  /falling\s+apart/i,
  /breaking\s+down/i,
  /can'?t\s+(cope|handle|deal)|cannot\s+(cope|handle|deal)/i,
  /\boverwhelmed\b/i,
  /hitting\s+(a\s+)?rock\s+bottom/i,
  /losing\s+hope/i,
  /no\s+way\s+out/i,
  /trapped/i,
  /out\s+of\s+control/i,
  /unraveling/i,
  /spinning\s+out/i,
];

const STABILITY_GROUNDING = [
  /taking\s+it\s+one\s+step/i,
  /slowly\s+getting\s+better/i,
  /i'?m\s+okay\s+right\s+now/i,
  /taking\s+a\s+breath/i,
  /feeling\s+(a\s+bit\s+)?calmer/i,
  /grounded/i,
  /more\s+stable/i,
];

// ── ISOLATION ─────────────────────────────────────────────────────────────
const ISOLATION_PATTERNS = [
  { pattern: /no\s+one\s+(cares|understands|is\s+there|listens)/i,          score: 0.9 },
  { pattern: /completely\s+(alone|isolated|by\s+myself)/i,                   score: 0.88 },
  { pattern: /nobody\s+(cares|gets\s+it|understands|knows)/i,                score: 0.85 },
  { pattern: /all\s+alone/i,                                                 score: 0.82 },
  { pattern: /no\s+(friends?|family|support|one\s+to\s+talk\s+to)/i,        score: 0.78 },
  { pattern: /pushed\s+(everyone\s+)?away/i,                                 score: 0.72 },
  { pattern: /feel\s+(so\s+)?alone/i,                                        score: 0.65 },
  { pattern: /lonely/i,                                                      score: 0.55 },
  { pattern: /isolated/i,                                                    score: 0.6  },
];

// ── BURDEN LANGUAGE ───────────────────────────────────────────────────────
const BURDEN_PATTERNS = [
  { pattern: /i('?m|\s+am)\s+a\s+burden/i,                                  score: 0.9 },
  { pattern: /everyone\s+(would\s+be\s+)?better\s+off\s+without\s+me/i,    score: 0.9 },
  { pattern: /taking\s+up\s+(space|resources|time)/i,                       score: 0.8 },
  { pattern: /just\s+(get|be)\s+in\s+the\s+way/i,                          score: 0.75 },
  { pattern: /nothing\s+but\s+(a\s+)?trouble/i,                             score: 0.8 },
  { pattern: /cause\s+(pain|problems|trouble)\s+(to|for)\s+(everyone|others|them)/i, score: 0.85 },
  { pattern: /make\s+everyone\s+(miserable|sad|suffer)/i,                   score: 0.8 },
  { pattern: /they.{0,10}(be\s+)?(fine|better|happier|okay)(\s+off)?\s+without\s+me/i, score: 0.85 },
];

// ── WORTHLESSNESS ─────────────────────────────────────────────────────────
const WORTHLESSNESS_PATTERNS = [
  { pattern: /i('?m|\s+am)\s+(completely\s+)?worthless/i,                   score: 0.95 },
  { pattern: /i\s+don'?t\s+deserve\s+(to\s+live|anything|anyone|love|help)/i, score: 0.85 },
  { pattern: /i('?m|\s+am)\s+nothing/i,                                     score: 0.9  },
  { pattern: /i\s+hate\s+myself/i,                                          score: 0.8  },
  { pattern: /i('?m|\s+am)\s+(such\s+a\s+)?(failure|loser|waste)/i,        score: 0.75 },
  { pattern: /i\s+(am\s+)?useless/i,                                        score: 0.8  },
  { pattern: /i\s+ruin\s+everything/i,                                      score: 0.75 },
  { pattern: /i('?m|\s+am)\s+(the\s+)?problem/i,                           score: 0.65 },
  { pattern: /nobody\s+would\s+(care|notice|miss)/i,                        score: 0.8  },
];

// ── URGENCY ───────────────────────────────────────────────────────────────
// How time-pressured is the situation?
const URGENCY_PATTERNS = [
  { pattern: /right\s+now|this\s+second|this\s+instant/i,                  score: 1.0 },
  { pattern: /tonight|this\s+evening|before\s+morning/i,                   score: 0.85 },
  { pattern: /i\s+can'?t\s+(wait|do\s+this|hold\s+on)\s+(any\s+)?longer/i, score: 0.8  },
  { pattern: /it'?s\s+now\s+or\s+never/i,                                  score: 0.9  },
  { pattern: /today|this\s+week/i,                                          score: 0.55 },
  { pattern: /soon|shortly|almost/i,                                        score: 0.4  },
];

// ── TEMPORAL CONTEXT (how current is the distress?) ────────────────────────
const TEMPORAL_PATTERNS = [
  { score: 4, patterns: [/right\s+now|at\s+this\s+moment|this\s+second/i] },
  { score: 3, patterns: [/tonight|today|this\s+evening/i] },
  { score: 2, patterns: [/this\s+week|lately|recently|these\s+days/i] },
  { score: 1, patterns: [/sometimes|occasionally|on\s+and\s+off/i] },
  { score: 0, patterns: [/used\s+to|a\s+while\s+back|in\s+the\s+past/i] },
];

// ── HOPE ──────────────────────────────────────────────────────────────────
const HOPE_POSITIVE = [
  /maybe\s+(someday|things\s+will|it\s+will\s+get)/i,
  /might\s+get\s+better/i,
  /trying\s+to/i,
  /(i\s+)?hope\s+(that|for|to)/i,
  /looking\s+forward/i,
  /things\s+(could|might|will)\s+(get|be|improve)/i,
  /i\s+want\s+to\s+(feel|be|get)\s+better/i,
  /working\s+on\s+(it|myself)/i,
  /getting\s+help/i,
];

// ── PROTECTIVE FACTORS ────────────────────────────────────────────────────
const PROTECTIVE_PATTERNS = [
  /my\s+(kids?|children|family|partner|dog|cat|pet)/i,
  /i\s+(have|love)\s+(someone|people)\s+(who\s+care|who\s+need\s+me)/i,
  /reasons?\s+to\s+(live|stay|keep\s+going)/i,
  /(my\s+)?(faith|religion|god|spirituality)/i,
  /i\s+made\s+a\s+promise/i,
  /for\s+(my|the\s+)?(kids?|children|family)/i,
];

// ── ESCALATION READINESS ──────────────────────────────────────────────────
// User signals openness to receiving external support
const ESCALATION_READY_PATTERNS = [
  { pattern: /i\s+(need|want)\s+(help|support|someone\s+to\s+talk)/i,     score: 0.9 },
  { pattern: /should\s+i\s+(call|see|talk\s+to)\s+(a\s+)?((therapist|counselor|doctor|professional|someone))/i, score: 0.8 },
  { pattern: /is\s+there\s+(someone|anyone)\s+(i\s+can|who\s+can)/i,      score: 0.75 },
  { pattern: /how\s+do\s+i\s+(get|find|access)\s+help/i,                  score: 0.85 },
  { pattern: /what\s+(should|can)\s+i\s+do/i,                              score: 0.65 },
  { pattern: /i'?ve\s+(been\s+thinking\s+about|considered)\s+(therapy|counseling)/i, score: 0.75 },
  { pattern: /can\s+you\s+(help|suggest|recommend)/i,                      score: 0.6  },
  { pattern: /please\s+help\s+me/i,                                        score: 0.85 },
];

// ── VALENCE ───────────────────────────────────────────────────────────────
const VALENCE_POSITIVE = [
  /feel(ing)?\s+(good|great|happy|okay|better|calm|peaceful|relieved)/i,
  /(im|i'?m|i\s+am)\s+(doing\s+)?(okay|alright|good|better|fine)/i,
  /grateful|thankful|happy|excited|relieved|proud/i,
];
const VALENCE_NEGATIVE = [
  /feel(ing)?\s+(terrible|awful|horrible|miserable|worthless|hopeless|empty|broken|destroyed)/i,
  /devastated|crushed|shattered|ruined|destroyed/i,
  /nothing\s+(left|matters|is\s+worth\s+it)/i,
  /rock\s+bottom/i,
];

// ── COHERENCE DETRACTORS ──────────────────────────────────────────────────
// Signals that the user's thinking may be fragmented or dissociated
function analyzeCoherence(text, struct) {
  let coherence = 0.85; // baseline — most users are coherent

  // Sentence fragments in a longer message = fragmented thinking
  if (struct.hasFragments && struct.wordCount > 8) coherence -= 0.12;

  // Excessive ellipsis = trailing off, dissociation, shutting down
  const ellipsisCount = (text.match(/\.{2,}/g) || []).length;
  if (ellipsisCount >= 3)      coherence -= 0.15;
  else if (ellipsisCount >= 1) coherence -= 0.07;

  // All lowercase in a long message = low energy / dissociation
  if (struct.allLower && struct.wordCount > 15) coherence -= 0.08;

  // Question flooding = panic spiraling
  const questionCount = (text.match(/\?/g) || []).length;
  if (questionCount >= 4) coherence -= 0.15;
  else if (questionCount >= 2) coherence -= 0.05;

  // "I don't know" repeated = confusion / overwhelm
  const idk = (text.match(/i\s+don'?t\s+know/gi) || []).length;
  if (idk >= 2) coherence -= 0.12;

  // Abrupt topic switches or mid-sentence breaks (approximated by — or ...)
  const dashBreaks = (text.match(/—|--|\.{3}/g) || []).length;
  if (dashBreaks >= 3) coherence -= 0.08;

  // Repetition of crisis keywords in one message (spiral thinking)
  const crisisRepeat = (text.match(/(die|hurt|kill|end|disappear|alone|worthless)/gi) || []).length;
  if (crisisRepeat >= 4) coherence -= 0.15;
  else if (crisisRepeat >= 2) coherence -= 0.07;

  // Very short message in distress context = shutting down
  if (struct.wordCount <= 4) coherence -= 0.1;

  return Math.max(0.05, Math.min(1, coherence));
}

// ── MESSAGE STRUCTURE ─────────────────────────────────────────────────────
function analyzeStructure(text) {
  const wordCount     = text.trim().split(/\s+/).length;
  const sentenceCount = (text.match(/[.!?]+/g) || []).length || 1;
  const avgSentLen    = wordCount / sentenceCount;
  const hasEllipsis   = /\.{2,}/.test(text);
  const hasFragments  = avgSentLen < 4;
  const allLower      = text === text.toLowerCase();
  const manyPunct     = (text.match(/[!?]{2,}/g) || []).length > 0;

  return { wordCount, avgSentLen, hasEllipsis, hasFragments, allLower, manyPunct };
}

// ── HELPERS ───────────────────────────────────────────────────────────────
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function maxMatch(patterns, text) {
  let max = 0;
  for (const { pattern, score } of patterns) {
    if (pattern.test(text)) max = Math.max(max, score);
  }
  return max;
}

// ── MAIN EXTRACTOR ────────────────────────────────────────────────────────
/**
 * Extract all emotional signals from a user message.
 *
 * @param {string} message
 * @param {Array}  history  — recent [{role, content}]
 * @returns {object}        — signals object
 */
function extractSignals(message, history = []) {
  if (!message || typeof message !== "string") return defaultSignals();

  const text   = message.trim();
  const lower  = text.toLowerCase();
  const struct = analyzeStructure(text);

  // ── 1. Ideation score ─────────────────────────────────────────────────
  let ideationScore = 0;
  let ideationLabel = "none";
  for (const tier of IDEATION_TIERS) {
    if (tier.patterns.some(p => p.test(text))) {
      ideationScore = tier.score;
      ideationLabel = tier.label;
      break;
    }
  }

  // ── 2. Arousal (0–1) ─────────────────────────────────────────────────
  let arousal = 0.42;
  const highHits = AROUSAL_HIGH.filter(p => p.test(text)).length;
  const lowHits  = AROUSAL_LOW.filter(p => p.test(text)).length;
  arousal += highHits * 0.14;
  arousal -= lowHits  * 0.11;
  if (struct.manyPunct)    arousal += 0.08;
  if (struct.hasFragments && struct.wordCount > 6) arousal += 0.05;
  if (struct.hasEllipsis)  arousal -= 0.04;
  arousal = clamp(arousal, 0, 1);

  // ── 3. Stability (0–1) ───────────────────────────────────────────────
  let stability = 0.68;
  const destHits = STABILITY_DESTABILIZING.filter(p => p.test(text)).length;
  const gndHits  = STABILITY_GROUNDING.filter(p => p.test(text)).length;
  stability -= destHits * 0.11;
  stability += gndHits  * 0.07;
  if (lowHits > 0)         stability -= 0.09; // numb/dissociated
  if (ideationScore >= 2)  stability -= 0.18;
  if (ideationScore >= 3)  stability -= 0.12; // stack
  stability = clamp(stability, 0, 1);

  // ── 4. Isolation (0–1) ───────────────────────────────────────────────
  const isolationScore = maxMatch(ISOLATION_PATTERNS, text);

  // ── 5. Burden (0–1) ──────────────────────────────────────────────────
  const burdenScore = maxMatch(BURDEN_PATTERNS, text);

  // ── 6. Worthlessness (0–1) ───────────────────────────────────────────
  const worthlessnessScore = maxMatch(WORTHLESSNESS_PATTERNS, text);

  // ── 7. Urgency (0–1) ─────────────────────────────────────────────────
  const urgencyScore = maxMatch(URGENCY_PATTERNS, text);

  // ── 8. Temporal score (0–4) ──────────────────────────────────────────
  let temporalScore = 0;
  for (const { score, patterns } of TEMPORAL_PATTERNS) {
    if (patterns.some(p => p.test(text))) {
      temporalScore = Math.max(temporalScore, score);
    }
  }

  // ── 9. Protective factors (0–1) ──────────────────────────────────────
  const protHits = PROTECTIVE_PATTERNS.filter(p => p.test(text)).length;
  const protectiveScore = clamp(protHits * 0.35, 0, 1);

  // ── 10. Hope (0–1) ───────────────────────────────────────────────────
  const hopeHits = HOPE_POSITIVE.filter(p => p.test(text)).length;
  let hopeScore  = clamp(0.35 + hopeHits * 0.14, 0, 1);
  if (ideationScore >= 2) hopeScore = Math.min(hopeScore, 0.2);
  if (ideationScore >= 3) hopeScore = Math.min(hopeScore, 0.1);

  // ── 11. Openness / expression readiness (0–1) ────────────────────────
  const escalReadHits = ESCALATION_READY_PATTERNS.filter(({ pattern }) => pattern.test(text));
  const escalationReadiness = escalReadHits.length > 0
    ? clamp(escalReadHits.reduce((max, { score }) => Math.max(max, score), 0), 0, 1)
    : 0;
  // General openness (just talking = some expression)
  const expressionScore = clamp(0.4 + escalationReadiness * 0.4, 0, 1);

  // ── 12. Valence (0–1) ────────────────────────────────────────────────
  let valence = 0.45;
  const posHits = VALENCE_POSITIVE.filter(p => p.test(text)).length;
  const negHits = VALENCE_NEGATIVE.filter(p => p.test(text)).length;
  valence += posHits * 0.11;
  valence -= negHits * 0.11;
  if (ideationScore >= 1)    valence -= 0.14;
  if (burdenScore > 0.7)     valence -= 0.10;
  if (worthlessnessScore > 0.7) valence -= 0.08;
  if (struct.allLower && struct.wordCount > 10) valence -= 0.04;
  valence = clamp(valence, 0, 1);

  // ── 13. Coherence (0–1) ──────────────────────────────────────────────
  const coherence = analyzeCoherence(text, struct);

  // ── 14. Immediacy flag ────────────────────────────────────────────────
  const immediacyFlag =
    ideationScore >= 4 ||
    (ideationScore >= 2 && temporalScore >= 3) ||
    (ideationScore >= 3 && urgencyScore >= 0.5);

  // ── 15. History modifier ──────────────────────────────────────────────
  let histMod = 0;
  if (history.length >= 3) {
    const recent = history.slice(-3).map(m => m.content || "").join(" ");
    const recentNeg = VALENCE_NEGATIVE.some(p => p.test(recent)) ||
                      ISOLATION_PATTERNS.some(({ pattern }) => pattern.test(recent));
    if (recentNeg) histMod = -0.04;
  }
  valence   = clamp(valence + histMod, 0, 1);
  stability = clamp(stability + histMod, 0, 1);

  return {
    // Core dimensions
    ideationScore,
    ideationLabel,
    arousal,
    stability,

    // Social / psychological
    isolationScore,
    burdenScore,
    worthlessnessScore,

    // Forward-looking
    hopeScore,
    protectiveScore,
    expressionScore,
    escalationReadiness,

    // Temporal / urgency
    temporalScore,
    urgencyScore,

    // Affect
    valence,

    // Cognitive
    coherence,

    // Meta
    immediacyFlag,
    wordCount: struct.wordCount,
  };
}

function defaultSignals() {
  return {
    ideationScore:        0,
    ideationLabel:        "none",
    arousal:              0.42,
    stability:            0.68,
    isolationScore:       0,
    burdenScore:          0,
    worthlessnessScore:   0,
    hopeScore:            0.5,
    protectiveScore:      0,
    expressionScore:      0.4,
    escalationReadiness:  0,
    temporalScore:        0,
    urgencyScore:         0,
    valence:              0.5,
    coherence:            0.85,
    immediacyFlag:        false,
    wordCount:            0,
  };
}

module.exports = { extractSignals, defaultSignals };
