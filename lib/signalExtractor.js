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
      /tonight\s+is\s+the\s+night/i,
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
      /(wrote|written) (a |my )?(note|letter|goodbye)/i,
      /give(n|ing)? (away|my) (stuff|things|belongings|possessions)/i,
      /(bought|got|have)\s+(the\s+)?pills?\b/i,
      /picked\s+a\s+(date|day|time)\b/i,
      /i'?m\s+ready\s+to\s+(do\s+it|die|end\s+(it|my\s+life)|kill\s+myself)\b/i,
      /have\s+everything\s+(i\s+need|ready|set\s+up)\b/i,
    ],
  },
  {
    score: 2,
    label: "active",
    patterns: [
      /kill(ing)?\s+(my\s*self|myself)\b/i,
      /end(ing)?\s+(my\s+life|it\s+all|everything)/i,
      /take\s+my\s+(own\s+)?life/i,
      /taking\s+my\s+(own\s+)?life/i,
      /want\s+to\s+(die|be\s+dead|not\s+(be|exist|live))/i,
      /thinking\s+(about\s+)?(ending|taking)\s+(my\s+life|my\s+own\s+life)/i,
      /don'?t\s+want\s+to\s+(be\s+here|exist|live\s+anymore)/i,
      /hurt(ing)?\s+(my\s*self|myself)\b/i,
      /self[\s-]?harm/i,
      /cut(ting)?\s+my\s*self/i,
      /no\s+reason\s+to\s+(live|be\s+here)/i,
      /better\s+off\s+dead/i,
      /wish\s+i\s+(was\s+|were\s+)?dead/i,
      /suicid(e|al)/i,
      /feel(ing)?\s+like\s+killing\s+(my\s*self|myself)\b/i,
      /commit(ting)?\s+suicid/i,
      /i\s+(should|need\s+to|have\s+to)\s+(just\s+)?die\b/i,
      /i'?m\s+done\s+with\s+(life|this\s+life|living)\b/i,
      /no\s+longer\s+want\s+to\s+(live|exist|be\s+(here|alive))\b/i,
      /maybe\s+i\s+(should|could)\s+(just\s+)?(end\s+it|die|kill\s+myself|disappear)\b/i,
      /burn(ed|ing)?\s+(my\s*self|myself)\b/i,
      /punish(ing)?\s+(my\s*self|myself)\b/i,
      /deserve\s+(to\s+)?(hurt|suffer|die|pain)\b/i,
      /wann?a\s+(die|kill\s+(my\s*self|myself)|end\s+it)\b/i,
      /kll\s+(my\s*self|myself)\b/i,
      /\bsuisid/i,
      /\bsucid[ae]/i,
      /\bsuicde\b/i,
      /\bsuicid\b/i,
      /\bsuicial\b/i,
      /\bsucidal\b/i,
      // Method-specific self-harm — Category 3 (also tracked via methodFlag)
      /slit(ting)?\s+(my\s+)?wrists?\b/i,
      /hang(ing)?\s+(my\s*self|myself)\b/i,
      /overdos(e|ing)\b/i,
      /drown(ing)?\s+(my\s*self|myself)\b/i,
      /jump(ing)?\s+(off|from)\s+(a\s+)?(bridge|building|roof|ledge|cliff)\b/i,
      /shoot(ing)?\s+(my\s*self|myself)\b/i,
      /suffocate\s+(my\s*self|myself)\b/i,
      /poison(ing)?\s+(my\s*self|myself)\b/i,
      /bleed(ing)?\s+(my\s*self|myself|out)\b/i,
      /bleed\s*(my\s*self|myself|out)?\s+to\s+death\b/i,
      /end\s+it\s+with\s+(pills?|medication)\b/i,
      /cut\s+(a|an|my)\s+arteri(es?)\b/i,
      /stop\s+(my\s+)?breathing\s+(on\s+purpose|myself|for\s+good)\b/i,
      // Feel-like patterns — Category 9
      /feel(ing)?\s+like\s+(hurt(ing)?|harm(ing)?)\s+(my\s*self|myself)\b/i,
      /feel(ing)?\s+like\s+ending\s+it(\s+all)?\b/i,
      /feel(ing)?\s+like\s+bleed(ing)?\s+(my\s*self|myself|out)\b/i,
      // Thinking-about patterns — Category 10
      /(i'?ve|i\s+have)\s+been\s+thinking\s+about\s+(suicide|kill(ing)?\s+(my\s*self|myself)|dying|ending\s+(it|my\s+life))\b/i,
      /i\s+(am\s+|'?m\s+)thinking\s+(of|about)\s+(suicide|killing\s+(my\s*self|myself)|ending\s+(it|my\s+life))\b/i,
      /keep\s+(think(ing)?|imagin(ing)?)\s+about\s+(hurt(ing)?|harm(ing)?)\s+(my\s*self|myself)\b/i,
      /keep\s+imagin(ing)?\s+(dying|death|killing\s+(my\s*self|myself)|end(ing)?(\s+it)?)\b/i,
      // Direct expressions — Category 1 gaps
      /want\s+(my\s+)?life\s+to\s+(end|stop|be\s+over)\b/i,
      /want\s+everything\s+to\s+end\b/i,
      /want\s+to\s+bleed\s+out\b/i,
      /don'?t\s+want\s+to\s+(be\s+alive|still\s+be\s+here)\b/i,
      /don'?t\s+want\s+to\s+wake\s+up(\s+(tomorrow|again|in\s+the\s+morning))?\b/i,
      /i\s+am\s+(going\s+to\s+)?(end(ing)?\s+(it|my\s+life)|take\s+my\s+(own\s+)?life)\b/i,
      // Typo tolerance — Category 11 additions
      /\bdieing\b/i,
      /kill\s+my\s+self\b/i,

      // ── 1A: Additional suicide ideation variants ───────────────────────────
      /wish\s+(i\s+)?(could|can)\s+(just\s+)?die\b/i,
      /please\s+(just\s+)?let\s+me\s+(just\s+)?die\b/i,
      /rather\s+(be\s+)?dead\s+than\s+(live|continue|go\s+on|keep\s+going)\b/i,
      /i'?m\s+(so\s+)?tired\s+of\s+(being\s+alive|living|existing)\b/i,
      /tired\s+of\s+living\s+(like\s+this|this\s+way|anymore)\b/i,
      /want\s+to\s+(cease\s+to\s+exist|stop\s+existing)\b/i,
      /why\s+(am\s+i|should\s+i)\s+(?:(?:even|still)\s+)*(be\s+)?(here|alive)\b/i,
      /i\s+don'?t\s+want\s+to\s+(be\s+alive|keep\s+living|keep\s+going\s+on)\b/i,
      /just\s+want\s+(everything|it\s+all)\s+to\s+end\b/i,
      /i\s+(can'?t|cannot)\s+(see\s+a\s+)?(reason|point)\s+(to\s+stay\s+alive|in\s+living|to\s+keep\s+going)\b/i,

      // ── 1B: Self-harm — additional natural language variants ──────────────
      /feel(ing)?\s+like\s+(cutting|scratching|burning|carving|slicing)\s*(my\s*self|myself)?\b/i,
      /i'?ve\s+(been\s+)?(cutting|harming|burning|scratching)\s+(my\s*self|myself)\b/i,
      /\burge\s+(to\s+)?(cut|hurt|harm|burn|scratch|injure)\s+(my\s*self|myself)\b/i,
      /want\s+to\s+(scratch|injure|slice|carve|wound)\s+(my\s*self|myself)\b/i,
      /want\s+to\s+(cause|inflict)\s+(myself\s+)?(pain|injury|harm)\b/i,
      /hit(ting)?\s+(my\s*self|myself)\b/i,
      /bang(ing)?\s+my\s+(head|fists?)\s+(against|on)\s+(the\s+)?(wall|floor|desk|ground)\b/i,
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
      /everyone\s+(would\s+be\s+|is\s+|will\s+be\s+)(better|happier|fine|okay)(\s+off)?\s+without\s+me\b/i,
      /i('?m|\s+am)\s+a\s+burden/i,
      /nobody\s+would\s+(care|miss|notice)\b/i,
      /disappear\s+(forever|completely)/i,
      /fade\s+(away|out)\s+forever/i,
      /feel(ing)?\s+like\s+(dying|death)\b/i,
      /wish\s+i\s+(had\s+)?(never\s+(been\s+born|existed)|never\s+existed)\b/i,
      /wish\s+i\s+could\s+sleep\s+forever\b/i,
      /(don'?t|can'?t)\s+see\s+(a\s+)?(future|way\s+(forward|out))\b/i,
      /life\s+(isn'?t|is\s+not|is\s+no\s+longer)\s+worth\s+(it|living)\b/i,
      /not\s+worth\s+living(\s+anymore)?\b/i,
      /i\s+don'?t\s+belong\s+(here|anywhere|in\s+this\s+world)\b/i,
      /sometimes\s+i\s+(think|thought)\s+about\s+(death|dying|ending\s+it)\b/i,
      /(i'?ve\s+)?(give|given)\s+up\s+on\s+(life|living|everything)\b/i,
      /done\s+fighting(\s+(this|it|life|everything))?\b/i,
      /nothing\s+(will\s+)?(ever\s+)?get\s+better\b/i,
      /things?\s+will\s+(never|not)\s+get\s+better\b/i,
      /there('?s|\s+is)\s+no\s+hope\b/i,
      /no\s+hope\s+(left|for\s+me|anymore)\b/i,
      /beyond\s+(help|saving)\b/i,
      /it'?s\s+too\s+late\s+(for\s+me|now)\b/i,
      /nobody\s+can\s+(help|save)\s+me\b/i,
      // Passive death wishes — Category 4 additions
      /don'?t\s+care\s+if\s+(i\s+)?(die|died|am\s+dead)\b/i,
      /maybe\s+(it|things?)\s+(would\s+be|'d\s+be)\s+(easier|better)\s+if\s+i\s+(was|were)\s+(dead|gone)\b/i,
      /easier\s+if\s+i\s+(just\s+)?(was(n'?t)?|weren'?t)\s+(here|alive)\b/i,
      /wish\s+i\s+(wasn'?t|weren'?t)\s+here\b/i,
      /wish\s+i\s+could\s+disappear\b/i,
      // "Feel like" broader passive — Category 9 passive tier
      /feel(ing)?\s+like\s+giving\s+up(\s+(on\s+(life|everything|it\s+all)))?\b/i,

      // ── 1D: Family-targeted burdensomeness (implies wishing to be gone)
      /my\s+(family|kids?|children|partner|parents?|loved\s+ones?)\s+would\s+(be\s+)?(better|happier)\s+(off\s+)?without\s+me\b/i,

      // ── 1C: Hopelessness — explicit phrases that must register as passive ideation
      /my\s+future\s+(is|feels?|looks?)\s+(ruined|destroyed|gone|hopeless|bleak)\b/i,
      /everything\s+(is|feels?)\s+(hopeless|pointless|useless|meaningless)\b/i,
      /i\s+have\s+nothing\s+to\s+(live\s+for|look\s+forward\s+to)\b/i,
      /life\s+(has\s+)?(no|lost\s+all)\s+(meaning|purpose|value)\b/i,
      /i('?ll|will)\s+never\s+(be\s+okay|get\s+better|be\s+happy|recover|be\s+alright)\b/i,
      /nothing\s+(is\s+going\s+to|will)\s+(ever\s+)?change\b/i,
      /i\s+can'?t\s+keep\s+going\s+on\s+like\s+this\b/i,
      /i\s+(have\s+)?(already\s+)?give(n|s)?\s+up\s+on\s+(life|living|everything|hope)\b/i,
      /there('?s|\s+is)\s+no\s+(hope|future)\s+(left\s+)?(for\s+me)?\b/i,
      /no\s+way\s+(out|forward|back)\s+(from\s+this|anymore|for\s+me)?\b/i,
      /i\s+can'?t\s+(see|imagine)\s+(a\s+)?future(\s+(for\s+)?(me|myself))?\b/i,
    ],
  },
];

// ── METHOD REFERENCES — Category 3 ───────────────────────────────────────
// Any mention of a specific method forces minimum RED in the classifier.
const METHOD_PATTERNS = [
  /\boverdos(e|ing|ed)\b/i,
  /slit(ting)?\s+(my\s+)?wrists?\b/i,
  /hang(ing)?\s+(my\s*self|myself)\b/i,
  /poison(ing)?\s+(my\s*self|myself)\b/i,
  /drown(ing)?\s+(my\s*self|myself)\b/i,
  /jump(ing)?\s+(off|from)\s+(a\s+)?(bridge|building|roof|ledge|cliff)\b/i,
  /shoot(ing)?\s+(my\s*self|myself)\b/i,
  /suffocate\s+(my\s*self|myself)\b/i,
  /bleed\s*(my\s*self|myself|out)?\s+to\s+death\b/i,
  /end\s+it\s+with\s+(pills?|medication)\b/i,
  /cut\s+(a|an|my)\s+arteri(es?)\b/i,
  /(take|taking|swallow(ing)?)\s+(all\s+)?(the\s+)?(pills?|medication|tablets?)\s+(to\s+end|to\s+die|to\s+kill|and\s+die)/i,
  /(pills?|knife|gun|rope|blade|razor)\s+(ready|in\s+hand|in\s+front(\s+of\s+me)?|next\s+to\s+me|here\s+with\s+me)/i,
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
  // ── 1F: Emotional overwhelm — additional phrases ─────────────────────────
  /everything\s+is\s+(too\s+much|overwhelming)\b/i,
  /it'?s\s+(all\s+)?too\s+much\b/i,
  /i'?m\s+at\s+(my\s+)?(breaking\s+point|limit|wit'?s?\s+end)\b/i,
  /barely\s+(holding\s+(on|it\s+together)|surviving|functioning)\b/i,
  /at\s+the\s+end\s+of\s+my\s+(rope|tether)\b/i,
  /running\s+on\s+(empty|fumes)\b/i,
  /can'?t\s+take\s+(any\s+more|this\s+anymore|it\s+anymore)\b/i,
  /about\s+to\s+(break|snap|implode)\b/i,
  /i'?m\s+(drowning|suffocating)\s*(in\s+(it|this|everything))?\b/i,
  /i\s+feel\s+like\s+i'?m\s+(breaking|shattering|crumbling)\b/i,
  /i\s+can'?t\s+(take\s+)?(this|it)\s+(anymore|any\s+more)\b/i,
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
  // ── 1F: Additional destabilization phrases ───────────────────────────────
  /on\s+the\s+edge\b/i,
  /at\s+(my\s+)?(breaking\s+point|limit|wit'?s?\s+end)\b/i,
  /at\s+the\s+end\s+of\s+my\s+(rope|tether)\b/i,
  /barely\s+(holding\s+(on|together)|keeping\s+it\s+together)\b/i,
  /about\s+to\s+(break|snap|collapse|lose\s+it)\b/i,
  /i\s+can'?t\s+(do\s+this|hold\s+(on|it\s+together))\s+(any\s+)?longer\b/i,
  /completely\s+(lost|unraveled|shattered|broken)\b/i,
  /i\s+feel\s+like\s+i'?m\s+(sinking|drowning|collapsing|breaking|crumbling|shattering)\b/i,
];

const STABILITY_GROUNDING = [
  /taking\s+it\s+one\s+step/i,
  /slowly\s+getting\s+better/i,
  /i'?m\s+okay\s+right\s+now/i,
  /taking\s+a\s+breath/i,
  /feel(ing)?(\s+a\s+(bit|little))?\s+calmer\b/i,
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
  { pattern: /nobody\s+to\s+(talk\s+to|turn\s+to|reach\s+out\s+to)\b/i,    score: 0.72 },
  { pattern: /no\s+one\s+to\s+(talk\s+to|turn\s+to|reach\s+out\s+to)\b/i,  score: 0.72 },
  { pattern: /i\s+have\s+no\s+one\b/i,                                      score: 0.72 },
  { pattern: /i\s+(have|got)\s+nobody\b/i,                                   score: 0.72 },
  { pattern: /there('?s|\s+is)\s+nobody\s+(there|for\s+me|who\s+cares)\b/i, score: 0.75 },
  { pattern: /everyone\s+(has\s+)?left(\s+me)?\b/i,                          score: 0.70 },
  { pattern: /abandoned\s+(by|me)\b/i,                                       score: 0.68 },
  // ── 1E: Additional isolation variants ────────────────────────────────────
  { pattern: /i\s+am\s+(truly\s+|so\s+|just\s+)?alone\b/i,                  score: 0.78 },
  { pattern: /i'?m\s+(truly\s+|so\s+|just\s+)?alone\b/i,                    score: 0.78 },
  { pattern: /no\s+one\s+(loves?|cares?\s+about)\s+me\b/i,                   score: 0.85 },
  { pattern: /nobody\s+(loves?|cares?\s+about)\s+me\b/i,                     score: 0.85 },
  { pattern: /i\s+don'?t\s+matter\s+to\s+(anyone|anybody)\b/i,               score: 0.80 },
  { pattern: /i'?m\s+(completely\s+)?invisible(\s+to\s+(everyone|them))?\b/i, score: 0.70 },
  { pattern: /there'?s\s+no\s+one\s+(here\s+for\s+me|who\s+cares\s+about\s+me)\b/i, score: 0.78 },
  { pattern: /no\s+one\s+(is\s+)?there\s+for\s+me\b/i,                       score: 0.78 },
  { pattern: /i\s+have\s+no\s+(friends|family|support\s+system|connections?)\b/i, score: 0.75 },
  { pattern: /nobody\s+(even\s+)?knows?\s+i\s+exist\b/i,                     score: 0.78 },
  { pattern: /i'?m\s+(all\s+)?by\s+myself(\s+in\s+this)?\b/i,               score: 0.65 },
  { pattern: /no\s+one\s+would\s+(notice|miss)\s+(if\s+i\s+(was\s+)?gone)?\b/i, score: 0.80 },
];

// ── BURDEN LANGUAGE ───────────────────────────────────────────────────────
const BURDEN_PATTERNS = [
  { pattern: /i('?m|\s+am)\s+a\s+burden/i,                                  score: 0.9 },
  { pattern: /everyone\s+(would\s+be\s+|is\s+|will\s+be\s+|'s\s+)?(better|happier|fine|okay)(\s+off)?\s+without\s+me/i, score: 0.9 },
  { pattern: /taking\s+up\s+(space|resources|time)/i,                       score: 0.8 },
  { pattern: /just\s+(get|be)\s+in\s+the\s+way/i,                          score: 0.75 },
  { pattern: /nothing\s+but\s+(a\s+)?trouble/i,                             score: 0.8 },
  { pattern: /cause\s+(pain|problems|trouble)\s+(to|for)\s+(everyone|others|them)/i, score: 0.85 },
  { pattern: /make\s+everyone\s+(miserable|sad|suffer)/i,                   score: 0.8 },
  { pattern: /they.{0,10}(be\s+)?(fine|better|happier|okay)(\s+off)?\s+without\s+me/i, score: 0.85 },
  { pattern: /nobody\s+(needs|wants)\s+me\b/i,                                         score: 0.75 },
  { pattern: /i\s+make\s+everyone('?s)?\s+(life|lives)\s+worse\b/i,                   score: 0.8  },
  { pattern: /people\s+would\s+be\s+(happier|better\s+off)\s+(if\s+i\s+(was|were)\s+(gone|dead|not\s+here))/i, score: 0.85 },
  // ── 1D: Additional burdensomeness variants ────────────────────────────────
  { pattern: /i\s+(drag|weigh|pull)\s+(everyone|them|my\s+(family|friends|loved\s+ones?))\s+down\b/i, score: 0.85 },
  { pattern: /i\s+(only|just)\s+make\s+(things|everything|life)\s+(worse|harder)\b/i, score: 0.80 },
  { pattern: /i\s+make\s+(life\s+)?harder\s+(for\s+)?(everyone|people|them|my\s+family)\b/i, score: 0.82 },
  { pattern: /my\s+(family|kids?|children|partner|parents?|loved\s+ones?)\s+would\s+be\s+(better|happier)\s+(off\s+)?without\s+me\b/i, score: 0.90 },
  { pattern: /i\s+am\s+(just\s+)?(holding\s+everyone\s+back|in\s+everyone'?s\s+way)\b/i, score: 0.80 },
  { pattern: /i\s+(ruin|mess\s+up)\s+everything\s+(for|around)\s+(everyone|them|my\s+family)\b/i, score: 0.80 },
  { pattern: /i\s+bring\s+(everyone|them|my\s+family)\s+down\b/i,          score: 0.78 },
  { pattern: /i\s+(am\s+|'?m\s+)(just\s+)?(dead\s+)?weight\s+(to|for|on)\s+(everyone|them|my\s+family)\b/i, score: 0.85 },
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

// ── HOPELESSNESS PATTERNS (1C) — reduce hopeScore on match ────────────────
// Each entry's score is how much to deduct from hopeScore baseline (0.35).
// maxMatch() returns the single highest match — sufficient to drop below 0.25.
const HOPELESSNESS_PATTERNS = [
  { pattern: /everything\s+(is|feels?)\s+(hopeless|pointless|useless|meaningless)\b/i,        score: 0.25 },
  { pattern: /i\s+have\s+nothing\s+to\s+(live\s+for|look\s+forward\s+to)\b/i,                score: 0.25 },
  { pattern: /there('?s|\s+is)\s+no\s+hope\s*(left|for\s+me|anymore)?\b/i,                   score: 0.25 },
  { pattern: /beyond\s+(help|saving|hope)\b/i,                                                score: 0.25 },
  { pattern: /it'?s\s+too\s+late\s+(for\s+me|now)\b/i,                                       score: 0.25 },
  { pattern: /my\s+future\s+(is|feels?|looks?)\s+(ruined|destroyed|gone|hopeless|bleak)\b/i,  score: 0.22 },
  { pattern: /nothing\s+(will\s+)?(ever\s+)?get\s+better\b/i,                                 score: 0.22 },
  { pattern: /things?\s+will\s+(never|not)\s+get\s+better\b/i,                                score: 0.22 },
  { pattern: /i\s+(have|see)\s+no\s+(future|hope)\b/i,                                        score: 0.22 },
  { pattern: /i('?ll|will)\s+never\s+(be\s+okay|get\s+better|be\s+happy|recover|be\s+alright)\b/i, score: 0.20 },
  { pattern: /life\s+(has\s+)?(no|lost\s+all)\s+(meaning|purpose|value)\b/i,                  score: 0.22 },
  { pattern: /nothing\s+(is\s+going\s+to|will)\s+(ever\s+)?change\b/i,                        score: 0.20 },
  { pattern: /i\s+can'?t\s+(see|imagine)\s+(a\s+)?future(\s+(for\s+)?(me|myself))?\b/i,      score: 0.20 },
  { pattern: /no\s+(way\s+out|way\s+forward|escape|exit\s+from\s+this)\b/i,                   score: 0.18 },
  { pattern: /i\s+(have\s+)?(already\s+)?give(n|s)?\s+up\s+on\s+(everything|life|living|hope)\b/i, score: 0.20 },
  { pattern: /never\s+going\s+to\s+(get|be)\s+better\b/i,                                     score: 0.22 },
  { pattern: /what'?s\s+the\s+point\s+of\s+(anything|any\s+of\s+this|it\s+all)\b/i,          score: 0.18 },
  { pattern: /i\s+don'?t\s+(see|find)\s+(a\s+)?(reason|point)\s+(to\s+(keep\s+going|live|stay|try)|anymore|in\s+anything)\b/i, score: 0.20 },
];

// ── RECOVERY SIGNAL ───────────────────────────────────────────────────────
// Detects genuine improvement / stabilization language.
// Used by safetyClassifier crisis persistence rule to allow de-escalation
// from orange/red without requiring the user to explicitly say they're "fine."
const RECOVERY_SIGNAL_PATTERNS = [
  /feel(ing)?(\s+a\s+(bit|little))?\s+(better|calmer|lighter|okay|safer|more\s+(at\s+peace|hopeful|stable|okay|relaxed))\b/i,
  /feel(ing)?\s+(less\s+)?(anxious|worried|scared|heavy|overwhelmed|panicked)\b/i,
  /i'?m\s+(feeling\s+)?(okay|alright|fine|calmer|better|more\s+at\s+ease)\s*(now|again|today)?\b/i,
  /doing\s+(better|okay|alright|a\s+bit\s+better)\b/i,
  /calmed?\s+(down|myself|a\s+bit)\b/i,
  /less\s+(stressed|anxious|overwhelmed|scared|heavy|panicked)\s*(now|today|already)?\b/i,
  /things?\s+(feel|are)\s+(a\s+(little|bit)\s+)?(better|clearer|lighter|easier)\b/i,
  /starting\s+to\s+feel\s+(better|calmer|okay|lighter|a\s+bit\s+better)\b/i,
  /not\s+as\s+(bad|dark|heavy|scared|anxious|overwhelmed)\s*(now|today|anymore)?\b/i,
  /got\s+through\s+(it|the\s+day|today|this)\b/i,
  /i\s+(feel|am)\s+(a\s+(bit|little)\s+)?(better|calmer|okay|safer|alright)\b/i,
  /took\s+a\s+(walk|break|breath|step\s+back)\b/i,
  /went\s+for\s+a\s+(walk|run|drive)\b/i,
  /had\s+a\s+(rest|sleep|nap|shower|bath)\b/i,
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
  // 1C: Explicit hopelessness language reduces hopeScore below detection threshold
  const hopelessnessDeduct = maxMatch(HOPELESSNESS_PATTERNS, text);
  if (hopelessnessDeduct > 0) hopeScore = Math.max(0, hopeScore - hopelessnessDeduct);
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

  // ── 14b. Safety floor ─────────────────────────────────────────────────
  // Belt-and-suspenders: if any explicit crisis keyword appears, the result
  // must never be GREEN — minimum ORANGE. Ideation patterns already catch
  // these, but this flag survives future pattern refactors.
  const SAFETY_FLOOR_RE =
    /suicid|suisid|sucid[ae]|kill(ing)?\s+(my\s*self|myself)|end\s+my\s+life|take\s+my\s+(own\s+)?life|self[\s-]?harm|hurt(ing)?\s+(my\s*self|myself)|wann?a\s+die|commit\s+suicid|overdos|slit(ting)?\s+(my\s+)?wrists?|hang(ing)?\s+(my\s*self|myself)|bleed(ing)?\s+(my\s*self|myself|out|to\s+death)|shoot(ing)?\s+(my\s*self|myself)|drown(ing)?\s+(my\s*self|myself)|jump(ing)?\s+(off|from)\s+(a\s+)?(bridge|building)|suffocate\s+(my\s*self|myself)|poison(ing)?\s+(my\s*self|myself)|want\s+to\s+die|wish\s+i\s+(was|were|could)\s+(dead|die)|don'?t\s+want\s+to\s+(live|exist|be\s+alive|wake\s+up)|dieing\b|kill\s+my\s+self|tired\s+of\s+(being\s+alive|living|existing)|please\s+(just\s+)?let\s+me\s+die|rather\s+(be\s+)?dead|want\s+to\s+(cease\s+to\s+exist|stop\s+existing)|wish\s+(i\s+)?(could|can)\s+(just\s+)?die|urge\s+to\s+(cut|hurt|harm|burn)\s+(my\s*self|myself)|feel(ing)?\s+like\s+(cutting|burning|carving|slicing)\b|i'?ve\s+(been\s+)?(cutting|burning|harming)\s+(my\s*self|myself)|why\s+(am\s+i|should\s+i)\s+(?:(?:even|still)\s+)*(be\s+)?(here|alive)/i;
  const safetyFloor = SAFETY_FLOOR_RE.test(text);

  // ── 14c. Method flag ──────────────────────────────────────────────────────
  // True when any specific method reference is detected (Category 3).
  // Forces minimum RED in safetyClassifier regardless of other scores.
  const methodFlag = METHOD_PATTERNS.some(p => p.test(text));

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
    safetyFloor,
    methodFlag,
    wordCount: struct.wordCount,

    // Recovery signal — true when explicit improvement/grounding language detected.
    // Used by safetyClassifier to allow crisis state de-escalation.
    recoverySignal: hopeHits > 0 || gndHits > 0 || RECOVERY_SIGNAL_PATTERNS.some(p => p.test(text)),
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
    safetyFloor:          false,
    methodFlag:           false,
    recoverySignal:       false,
    wordCount:            0,
  };
}

module.exports = { extractSignals, defaultSignals };
