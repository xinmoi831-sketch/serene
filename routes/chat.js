// routes/chat.js
// SERENE Emotional Chat Pipeline v6
// v6: Memory system + emoji engine integrated
"use strict";

const express    = require("express");
const { v4: uuidv4 } = require("uuid");

const { collections, find, insert, remove, findOne, update } = require("../lib/db");
const { authenticate, checkDailyLimit } = require("../middleware/auth");
const { encrypt, decrypt } = require("../lib/encryption");
const {
  loadLongTermMemory,
  loadDailySession,
  updateSessionSummary,
  extractMemorySignals,
  applyMemorySignals,
  FREE_CONTEXT_LIMIT,
  PAID_CONTEXT_LIMIT,
} = require("../lib/memory");

const { updateEmotionalState, createDefaultState } = require("../lib/emotionalEngine");
const { buildSystemPrompt, buildCrisisSystemPrompt, CRISIS_PREFIXES } = require("../lib/promptConstructor");
const { getCrisisDirective }                        = require("../lib/crisisFramework");
const { getPacingParams }                           = require("../lib/pacingEngine");
const { getGroundingHint }                          = require("../lib/deescalation");
const { getEscalationGuide, getEscalationInject }   = require("../lib/escalationTemplates");
const { detectTopic }                               = require("../lib/therapyPrompts");

const router = express.Router();

// ── CASUAL / GREETING SHORTCUTS ──────────────────────────────────────────
const CASUAL_RESPONSES = {
  "hi":              ["Hey love, really glad you stopped by. How is your heart feeling today?", "Hey! Good to see you here. How have you been holding up?"],
  "hey":             ["Hey! How are you doing today — honestly?", "Hey love. How has your day been treating you?"],
  "hello":           ["Hello, dear. Really glad you are here. How are you feeling right now?", "Hello! How has today been for you?"],
  "how are you":     ["Honestly, doing well — thank you for asking. More importantly, how are YOU doing today?"],
  "thank you":       ["Of course, always. You do not have to carry things alone. I will be right here whenever you need me."],
  "thanks":          ["Anytime, love. Take good care of yourself — I am here whenever you want to talk."],
  "ok":              ["Good to hear. How has the rest of your day been going?"],
  "okay":            ["Okay is okay. How has everything been feeling lately?"],
  "good morning":    ["Good morning! Hope you got some rest. How are you feeling as the day starts?"],
  "good afternoon":  ["Good afternoon, love. How has your day been treating you so far?"],
  "good evening":    ["Good evening. How are you feeling as the day winds down?"],
  "good night":      ["Good night. Rest well — I will be here whenever you need to talk."],
  "bye":             ["Take care of yourself, love. Come back anytime — I mean that."],
  "goodbye":         ["Take care. You know where to find me whenever you need someone to talk to."],
  "great":           ["Really glad to hear that. What has been making things feel good?"],
  "fine":            ["Fine can mean a lot of things. How are you really doing?"],
  "not bad":         ["Not bad is something! Is there anything on your mind you want to talk about?"],
  "i'm good":        ["Good to hear. Anything on your heart today?"],
  "im good":         ["Good to hear. Anything on your heart today?"],
  "i am good":       ["Really glad to hear that. Anything on your mind today?"],
  "lol":             ["Ha — always good to have a moment of lightness. How are you really doing though?"],
};

function getCasualResponse(message) {
  const key = message.toLowerCase().trim().replace(/[!?.,']+$/, "").trim();
  const responses = CASUAL_RESPONSES[key];
  if (!responses) return null;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ── COMPANION MOMENT DETECTION ────────────────────────────────────────────
const COMPANION_MOMENT_PATTERNS = [
  { category: "appreciation", re: /\b(thank\s*you|thanks|thank\s*u|ty\b|thx\b|grateful|appreciate(\s+(it|this|you|that))?|means\s+a\s+lot)\b/i },
  { category: "recovery",     re: /\b(feel(ing)?\s+(better|calmer|lighter|more\s+hopeful|okay\s+now|a\s+bit\s+better)|calmed?\s+down|less\s+anxious|not\s+as\s+scared|more\s+at\s+peace)\b/i },
  { category: "hope",         re: /\b(i('ll|'m\s+going\s+to|will)\s+try|won'?t\s+give\s+up|i\s+want\s+to\s+try|maybe\s+i\s+can|gonna\s+try|going\s+to\s+try|i\s+think\s+i\s+can)\b/i },
  { category: "closure",      re: /\b(bye\b|goodbye|good\s*bye|see\s+you\s+(later|soon|tomorrow)|talk\s+(to\s+you\s+)?(later|soon|tomorrow)|take\s+care\b|good\s*night|gotta\s+go|i\s+(have|need)\s+to\s+go)\b/i },
];

function detectCompanionMoment(message) {
  for (const { category, re } of COMPANION_MOMENT_PATTERNS) {
    if (re.test(message)) return category;
  }
  return null;
}

// ── OFF-TOPIC FILTER ─────────────────────────────────────────────────────
const OFF_TOPIC_PATTERNS = [
  /(algebra|calculus|solve this|integral|derivative|geometry|trigonometry)/i,
  /(crypto|bitcoin|ethereum|trading|forex|stock market|invest)/i,
  /(code|program(ming)?|javascript|python|html|css|sql|algorithm|debug)/i,
  /(recipe|calories|protein|workout|gym|exercise|fitness)/i,
];
const EMOTIONAL_OVERRIDE = /(feel|feeling|stress|stressed|worried|anxious|sad|scared|overwhelmed|struggling|cope|hurt|hard|difficult|depressed|lonely)/i;

function isOffTopic(message) {
  if (EMOTIONAL_OVERRIDE.test(message)) return false;
  return OFF_TOPIC_PATTERNS.some(p => p.test(message));
}

const OFF_TOPIC_REPLY = "I am not really able to help with that — I am only here as an emotional support companion. 💙 But if something about this is stressing or worrying you, I am absolutely here to listen.";

// ── STUCK USER DETECTION ──────────────────────────────────────────────────
// When a user says they don't know, SERENE must stop asking and start guiding.
const STUCK_PATTERNS = /^(i (don'?t|do not) know|not sure|i'?m not sure|no idea|i have no idea|i can'?t think of anything|i don'?t remember|maybe|dunno|idk|not really|i'?m unsure|i'?m lost|no clue|beats me|hard to say|i'?m not sure what)[\.\?!\s]*$/i;

const STUCK_RESPONSES = [
  "That's okay — when you're hurting, it's not always clear what might help. Sometimes the first step isn't solving the whole problem, just giving yourself a little breathing room. That might be a short walk, resting without guilt, or letting yourself feel what you're feeling without trying to fix it right away. Does any of that feel possible today?",
  "That's completely okay. Not knowing is actually a very honest place to be. When things feel heavy, one small thing that often helps is simply slowing down — even for 10 minutes, doing something that gives your mind a small rest. Music, a walk, sitting outside. Nothing big. Is there something small like that you could try?",
  "That's alright — you don't need to have answers right now. Sometimes what helps most is just taking the pressure off yourself to figure everything out at once. One small thing: try to do one thing today just for you, however small. Even resting properly counts. What's one thing you've been neglecting to give yourself lately?",
  "That's okay. When we're in the middle of something painful, it's hard to see clearly. You don't have to know the answer. Sometimes just naming what you're feeling — without trying to fix it — is enough for now. If you had to put one word on what you're carrying today, what would it be?",
  "Not knowing is fine — it means you're being honest rather than forcing an answer. When someone is stuck like this, sometimes what helps is just one tiny action — not a solution, just movement. Something like writing down what's on your mind, or doing something physical for a few minutes. Does anything like that feel manageable right now?",
];

function isStuckResponse(message) {
  return STUCK_PATTERNS.test(message.trim());
}

function getStuckReply() {
  return STUCK_RESPONSES[Math.floor(Math.random() * STUCK_RESPONSES.length)];
}

// ── CONSECUTIVE QUESTION DETECTION ───────────────────────────────────────
// If the last 2 AI messages both ended with a question, force guidance mode.
function hasAskedTooManyQuestions(history) {
  if (!history || history.length < 4) return false;
  const recentAI = history.filter(m => m.role === "assistant").slice(-2);
  if (recentAI.length < 2) return false;
  return recentAI.every(m => m.content && /\?/.test(m.content.trim().slice(-80)));
}

// ── EMOTIONAL STATE PERSISTENCE ──────────────────────────────────────────
async function loadEmotionalState(userId) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const session = await findOne(collections.sessions, { userId, date: today });
    if (session && session.emotionalState) return session.emotionalState;
    return createDefaultState(uuidv4());
  } catch {
    return createDefaultState(uuidv4());
  }
}

async function saveEmotionalState(userId, state) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const session = await findOne(collections.sessions, { userId, date: today });
    if (session) {
      await update(collections.sessions, { userId, date: today }, {
        emotionalState: state,
        updatedAt: new Date().toISOString(),
      });
    } else {
      await insert(collections.sessions, {
        id: uuidv4(), userId, date: today,
        emotionalState: state,
        messageCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error("[SERENE] Could not save emotional state:", err.message);
  }
}

// ── ENCRYPTION HELPERS ────────────────────────────────────────────────────
function encryptContent(text, userId) {
  if (!text) return { enc: null, iv: null };
  return encrypt(text, userId);
}

function decryptMessage(msg, userId) {
  if (!msg) return msg;
  if (msg.enc !== undefined) {
    const plaintext = decrypt(msg.enc, msg.iv, userId);
    return { ...msg, content: plaintext || "[decryption error]", enc: undefined, iv: undefined };
  }
  return msg; // legacy plaintext fallback
}

// ── GROQ API CALL ─────────────────────────────────────────────────────────
async function callGroq(messages, maxTokens, temperature) {
  const apiKey = (process.env.GROQ_API_KEY || "").trim();
  if (!apiKey) throw new Error("GROQ_API_KEY is missing");
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 28000);
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
      body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages, max_tokens: maxTokens, temperature }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) { const err = await res.text(); throw new Error("Groq API error: " + res.status + " " + err); }
    const data  = await res.json();
    const reply = data.choices?.[0]?.message?.content;
    if (!reply) throw new Error("Empty response from Groq");
    return reply;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") throw new Error("Groq timed out");
    throw err;
  }
}

// ── SAFE FALLBACKS ────────────────────────────────────────────────────────
function getFallback(emotionalState) {
  if (!emotionalState) return "I am here and I am listening. Could you try sending that again?";
  switch (emotionalState.mode) {
    case "CRITICAL_ESCALATION":
      return "I hear you, and I am right here with you. Please reach out to emergency services or someone you trust right now — you do not have to face this alone. Are you safe right now?";
    case "GUIDED_ESCALATION":
    case "ESCALATION_READY":
      return "I hear you, and I am right here with you. What you are going through sounds incredibly difficult. Please know you do not have to carry this alone — there are people trained to help with exactly this. Please use the support options in the app or reach out to someone you trust. I am still here with you.";
    default:
      return "I am here and I am listening. Could you try sending that again? I genuinely want to hear what you have to say.";
  }
}

// ── AUTO-TITLE GENERATION (fire and forget) ──────────────────────────────
async function generateConversationTitle(userId, conversationId, firstMessage) {
  try {
    const reply = await callGroq([
      {
        role: "system",
        content: "Generate a short 2-5 word title for a mental health support conversation based on the user's message. Reply with ONLY the title — no quotes, no punctuation, no explanation. Examples: Job Interview Anxiety, Relationship Conflict, Feeling Lost, Family Stress, Work Burnout, Grief And Loss.",
      },
      { role: "user", content: firstMessage.slice(0, 200) },
    ], 15, 0.3);
    const title = reply.trim().replace(/['".,!?]/g, "").slice(0, 80);
    if (title) {
      await update(collections.conversations, { id: conversationId, userId }, {
        title,
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error("[SERENE] Auto-title failed:", err.message);
  }
}

// ── INCREMENT USAGE ───────────────────────────────────────────────────────
async function incrementUsage(userId, today) {
  const record = await findOne(collections.usage, { userId, date: today });
  if (record) {
    await update(collections.usage, { userId, date: today }, { count: (record.count || 0) + 1 });
  } else {
    await insert(collections.usage, { id: uuidv4(), userId, date: today, count: 1 });
  }
}

// ── POST /api/chat/message ────────────────────────────────────────────────
router.post("/message", authenticate, checkDailyLimit, async (req, res) => {
  try {
    const { message, mood = "okay", conversationId: reqConvId } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: "Message is required." });

    const userId  = req.user.id;
    const isPro   = req.user.plan && req.user.plan !== "free";
    const msgText = message.trim();
    const now     = new Date().toISOString();
    const today   = now.slice(0, 10);

    // ── 0. Resolve or create conversation ──────────────────────────
    let conversationId = reqConvId;
    let convTitle      = "New Conversation";

    if (conversationId) {
      const existing = await findOne(collections.conversations, { id: conversationId, userId });
      if (!existing) {
        conversationId = null; // not found or not owned — create fresh
      } else {
        convTitle = existing.title;
      }
    }
    if (!conversationId) {
      const newConv = {
        id: uuidv4(), userId,
        title: "New Conversation",
        createdAt: now, updatedAt: now,
        archived: false,
      };
      await insert(collections.conversations, newConv);
      conversationId = newConv.id;
      convTitle = "New Conversation";
    }

    // ── 1. Off-topic guard ──────────────────────────────────────────
    if (isOffTopic(msgText)) {
      const encUser = encryptContent(msgText, userId);
      const encBot  = encryptContent(OFF_TOPIC_REPLY, userId);
      await insert(collections.messages, { id: uuidv4(), userId, conversationId, role: "user",      enc: encUser.enc, iv: encUser.iv, createdAt: now });
      await insert(collections.messages, { id: uuidv4(), userId, conversationId, role: "assistant", enc: encBot.enc,  iv: encBot.iv,  createdAt: now });
      await update(collections.conversations, { id: conversationId, userId }, { updatedAt: now });
      await incrementUsage(userId, today);
      // Preserve existing crisis level — never force green during an active crisis.
      const offTopicSession  = await loadDailySession(userId);
      const offTopicPrior    = (offTopicSession && offTopicSession.emotionalState) || await loadEmotionalState(userId);
      const preservedLevel   = (offTopicPrior && offTopicPrior.safetyLevel) || "green";
      const offTopicIsCrisis      = preservedLevel === "red" || preservedLevel === "critical";
      const offTopicShowSupport   = preservedLevel === "orange" || offTopicIsCrisis;
      return res.json({ reply: OFF_TOPIC_REPLY, mode: "off_topic", safetyLevel: preservedLevel, escalationLevel: 0, isCrisis: offTopicIsCrisis, showSupportButton: offTopicShowSupport, crisisResource: null, conversationId, dailyUsed: req.dailyUsed + 1, dailyLimit: req.plan.messagesPerDay });
    }

    // ── 2. Load memory context ──────────────────────────────────────
    const [longTermMemory, sessionDoc] = await Promise.all([
      isPro ? loadLongTermMemory(userId) : Promise.resolve(null),
      loadDailySession(userId),
    ]);

    // ── 3. Load prior emotional state ───────────────────────────────
    const priorState = (sessionDoc && sessionDoc.emotionalState) || await loadEmotionalState(userId);

    // ── 4. Casual shortcut ───────────────────────────────────────────
    const casualReply    = getCasualResponse(msgText);
    const companionMoment = detectCompanionMoment(msgText);
    if (casualReply && priorState.safetyLevel === "green" && priorState.mode === "VALIDATION") {
      const encUser = encryptContent(msgText, userId);
      const encBot  = encryptContent(casualReply, userId);
      await insert(collections.messages, { id: uuidv4(), userId, conversationId, role: "user",      enc: encUser.enc, iv: encUser.iv, createdAt: now });
      await insert(collections.messages, { id: uuidv4(), userId, conversationId, role: "assistant", enc: encBot.enc,  iv: encBot.iv,  createdAt: now });
      await update(collections.conversations, { id: conversationId, userId }, { updatedAt: now });
      await incrementUsage(userId, today);
      return res.json({ reply: casualReply, mode: "casual", safetyLevel: "green", escalationLevel: 0, isCrisis: false, crisisResource: null, isCompanionMoment: !!companionMoment, conversationId, dailyUsed: req.dailyUsed + 1, dailyLimit: req.plan.messagesPerDay });
    }

    // ── 4b. Stuck user — bypass LLM, give guidance directly ───────────
    if (isStuckResponse(msgText)) {
      const stuckReply  = getStuckReply();
      const encUser     = encryptContent(msgText, userId);
      const encBot      = encryptContent(stuckReply, userId);
      await insert(collections.messages, { id: uuidv4(), userId, conversationId, role: "user",      enc: encUser.enc, iv: encUser.iv, createdAt: now });
      await insert(collections.messages, { id: uuidv4(), userId, conversationId, role: "assistant", enc: encBot.enc,  iv: encBot.iv,  createdAt: now });
      await update(collections.conversations, { id: conversationId, userId }, { updatedAt: now });
      await saveEmotionalState(userId, priorState);
      await incrementUsage(userId, today);
      const stuckLevel      = priorState.safetyLevel || "green";
      const stuckShowSup    = stuckLevel === "orange" || stuckLevel === "red" || stuckLevel === "critical";
      return res.json({
        reply: stuckReply,
        mode: "VALIDATION", safetyLevel: stuckLevel,
        escalationLevel: 0, isCrisis: stuckLevel === "red" || stuckLevel === "critical",
        showSupportButton: stuckShowSup, crisisResource: null, conversationId,
        dailyUsed: req.dailyUsed + 1, dailyLimit: req.plan.messagesPerDay,
      });
    }

    // ── 5. Load conversation history (decrypt, tier-limited) ─────────
    const contextLimit = isPro ? PAID_CONTEXT_LIMIT : FREE_CONTEXT_LIMIT;
    const rawHistory = await find(collections.messages, { userId, conversationId }, { sort: { createdAt: -1 }, limit: contextLimit });
    rawHistory.reverse();
    const history = rawHistory.map(m => decryptMessage(m, userId));

    // ── 6. Update emotional state ────────────────────────────────────
    const emotionalState = updateEmotionalState(msgText, history, priorState, priorState.sessionId);
    console.log(`[SERENE] user:${userId} mode:${emotionalState.mode} safety:${emotionalState.safetyLevel} escalation:${emotionalState.escalationLevel} trend:${emotionalState.trend}`);

    // ── 7–12. Build prompt and call Groq ────────────────────────────────
    // Two distinct pipelines depending on safety level:
    //
    //  CRISIS (red / critical)
    //    LLM task is narrowed to pure emotional presence only — no mention
    //    of crisis, safety, or resources.  The application owns the crisis
    //    structure and appends it deterministically after the LLM responds.
    //    This prevents Meta's safety training from pattern-matching to
    //    "crisis intervention" and firing a refusal instead of SERENE.
    //
    //  NORMAL (green / yellow / orange)
    //    Full pipeline: memory context, escalation guidance, grounding hints,
    //    pacing params — unchanged from previous architecture.

    let reply;

    if (emotionalState.safetyLevel === "red" || emotionalState.safetyLevel === "critical") {
      // ── CRISIS PIPELINE ──────────────────────────────────────────────

      // Pick a warm opening sentence; the LLM is instructed to start with it.
      // Seeding token-0 as compassionate prevents the safety layer from firing.
      const crisisPrefix    = CRISIS_PREFIXES[Math.floor(Math.random() * CRISIS_PREFIXES.length)];
      const crisisDirective = getCrisisDirective(
        emotionalState.crisisStage,
        emotionalState.crisisCategory,
        emotionalState.safetyLevel
      );
      const crisisSystemPrompt = buildCrisisSystemPrompt(crisisPrefix, crisisDirective);

      // Keep history short — accumulated crisis context raises LLM refusal risk.
      const crisisGroqMessages = [
        { role: "system", content: crisisSystemPrompt },
        ...history.slice(-6).map(m => ({ role: m.role, content: m.content })),
        { role: "user", content: msgText },
      ];

      // Section 1 — LLM generates emotional presence only (≤ 3 sentences)
      let section1;
      try {
        section1 = (await callGroq(crisisGroqMessages, 110, 0.60)).trim();
      } catch (err) {
        console.error("[SERENE] Crisis Groq failed:", err.message);
        section1 = crisisPrefix + " You don't have to carry this alone.";
      }

      // Section 2 — Deterministic safety check; never delegated to LLM
      const section2 = emotionalState.safetyLevel === "critical"
        ? "I need to ask — are you safe right now? If you need immediate help, please call emergency services (999 or 112) or reach out to someone you trust right now."
        : "Can I check in with you — are you physically safe right now?";

      // Section 3 — Deterministic support availability; never delegated to LLM
      const section3 = "Support is here for you — the support button is right here in the app, and hotlines are available whenever you're ready.";

      reply = section1 + "\n\n" + section2 + "\n\n" + section3;

    } else {
      // ── NORMAL PIPELINE ──────────────────────────────────────────────

      const userProfile = {
        name:         req.user.name        || null,
        mainConcern:  req.user.mainConcern  || null,
        wellnessGoal: req.user.wellnessGoal || null,
      };

      const memoryContext = {
        longTermMemory,
        sessionDoc,
        plan: req.user.plan || "free",
      };

      let systemPrompt = buildSystemPrompt(
        emotionalState.mode,
        emotionalState,
        mood,
        userProfile,
        msgText,
        history,
        memoryContext
      );

      // Crisis Response Framework — inject stage directive for orange safety level
      if (emotionalState.safetyLevel === "orange" && emotionalState.crisisStage > 0) {
        const orangeDirective = getCrisisDirective(
          emotionalState.crisisStage,
          emotionalState.crisisCategory,
          emotionalState.safetyLevel
        );
        if (orangeDirective) systemPrompt += "\n\n" + orangeDirective;
      }

      // Companion moment — user is expressing appreciation, recovery, hope, or closure
      if (companionMoment) {
        systemPrompt += "\n\nIMPORTANT: The user is expressing " + companionMoment + ". DO NOT ask a follow-up question. Respond warmly and with genuine care. End the response naturally. Do not introduce a new topic or continue any assessment.";
      }

      // Force guidance if consecutive question limit hit
      if (hasAskedTooManyQuestions(history)) {
        systemPrompt += "\n\nCRITICAL OVERRIDE: You have asked questions in your last 2 responses. You MUST NOT ask a question this turn. Give a practical suggestion, insight, or reflection instead. No question mark at the end of your response.";
      }

      // ── 8. Inject grounding hint ─────────────────────────────────────
      const groundingHint = getGroundingHint(emotionalState);
      if (groundingHint) systemPrompt += groundingHint;

      // ── 9. Inject escalation guidance ────────────────────────────────
      const escalationInject = getEscalationInject(emotionalState.escalationLevel);
      if (escalationInject) systemPrompt += escalationInject;

      // ── 10. Pacing parameters ────────────────────────────────────────
      const pacing = getPacingParams(emotionalState);
      const { maxTokens, temperature, groundingEnabled } = pacing;
      if (!groundingEnabled) systemPrompt = systemPrompt.replace(/\n\n\[GROUNDING TECHNIQUE[^\]]*\][^\n]*/g, "");

      // ── 11. Build Groq message array ──────────────────────────────────
      const groqMessages = [
        { role: "system", content: systemPrompt },
        ...history.slice(-12).map(m => ({ role: m.role, content: m.content })),
        { role: "user", content: msgText },
      ];

      // ── 12. Call Groq ─────────────────────────────────────────────────
      try { reply = await callGroq(groqMessages, maxTokens, temperature); }
      catch (err) { console.error("[SERENE] Groq failed:", err.message); reply = getFallback(emotionalState); }
    }

    // ── 13. Persist messages — encrypted ─────────────────────────────
    const topic   = detectTopic(msgText) || "general";
    const encUser = encryptContent(msgText, userId);
    const encBot  = encryptContent(reply, userId);

    await Promise.all([
      insert(collections.messages, {
        id: uuidv4(), userId, conversationId, role: "user",
        enc: encUser.enc, iv: encUser.iv,
        emotionalMode: emotionalState.mode,
        safetyLevel:   emotionalState.safetyLevel,
        createdAt:     now,
      }),
      insert(collections.messages, {
        id: uuidv4(), userId, conversationId, role: "assistant",
        enc: encBot.enc, iv: encBot.iv,
        emotionalMode: emotionalState.mode,
        safetyLevel:   emotionalState.safetyLevel,
        createdAt:     now,
      }),
    ]);

    // Update conversation timestamp
    await update(collections.conversations, { id: conversationId, userId }, { updatedAt: now });

    // Fire auto-title if conversation still has default title
    if (convTitle === "New Conversation") {
      generateConversationTitle(userId, conversationId, msgText).catch(() => {});
    }

    // ── 14. Save emotional state + session memory ─────────────────────
    await saveEmotionalState(userId, emotionalState);
    await updateSessionSummary(userId, msgText, reply, emotionalState, topic);

    // ── 15. Update long-term memory (paid tier) ───────────────────────
    if (isPro) {
      const signals = extractMemorySignals(msgText, history, emotionalState);
      await applyMemorySignals(userId, signals, isPro);
    }

    // ── 16. Increment usage ───────────────────────────────────────────
    await incrementUsage(userId, today);

    // ── 17. Build response ────────────────────────────────────────────
    const guide             = getEscalationGuide(emotionalState.escalationLevel);
    const isCrisis          = emotionalState.safetyLevel === "red" || emotionalState.safetyLevel === "critical";
    const showSupportButton = emotionalState.safetyLevel === "orange" || isCrisis;

    res.json({
      reply,
      conversationId,
      mode:                emotionalState.mode,
      safetyLevel:         emotionalState.safetyLevel,
      escalationLevel:     emotionalState.escalationLevel,
      isCrisis,
      showSupportButton,
      showCrisisBanner:    guide.uiBanner,
      crisisResource:      guide.crisisResource || null,
      emotionalTrend:      emotionalState.trend,
      valence:             emotionalState.valence,
      arousal:             emotionalState.arousal,
      coherence:           emotionalState.coherence,
      escalationReadiness: emotionalState.escalationReadiness,
      isCompanionMoment:   !!companionMoment,
      dailyUsed:           req.dailyUsed + 1,
      dailyLimit:          req.plan.messagesPerDay,
    });

  } catch (err) {
    console.error("[SERENE CHAT ERROR]", err.message, err.stack);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ── GET /api/chat/history ─────────────────────────────────────────────────
router.get("/history", authenticate, async (req, res) => {
  try {
    const isPro       = req.user.plan && req.user.plan !== "free";
    const limit       = Math.min(parseInt(req.query.limit) || 50, isPro ? 200 : 100);
    const rawMessages = await find(collections.messages, { userId: req.user.id }, { sort: { createdAt: 1 }, limit });
    const messages    = rawMessages.map(m => decryptMessage(m, req.user.id));
    res.json({ messages, total: messages.length });
  } catch (err) {
    res.status(500).json({ error: "Could not load chat history." });
  }
});

// ── DELETE /api/chat/history ──────────────────────────────────────────────
router.delete("/history", authenticate, async (req, res) => {
  try {
    await remove(collections.messages, { userId: req.user.id }, { multi: true });
    const today = new Date().toISOString().slice(0, 10);
    await remove(collections.sessions, { userId: req.user.id, date: today }, { multi: false });
    res.json({ message: "Chat history cleared." });
  } catch (err) {
    res.status(500).json({ error: "Could not clear chat history." });
  }
});

// ── GET /api/chat/emotional-state ─────────────────────────────────────────
router.get("/emotional-state", authenticate, async (req, res) => {
  try {
    const state = await loadEmotionalState(req.user.id);
    res.json({
      mode:            state.mode,
      safetyLevel:     state.safetyLevel,
      trend:           state.trend,
      escalationLevel: state.escalationLevel,
      valence:         state.valence,
      arousal:         state.arousal,
      stability:       state.stability,
    });
  } catch (err) {
    res.status(500).json({ error: "Could not load emotional state." });
  }
});

module.exports = router;
