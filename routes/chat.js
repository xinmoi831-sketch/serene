// routes/chat.js
// SERENE Emotional Chat Pipeline v5
//
// Architecture: Validate first. Stabilize second. Guide third.
//
// Flow per message:
//   1. Extract linguistic signals from message
//   2. Update emotional state (blend with session history)
//   3. Classify safety level (5-tier: green/yellow/orange/red/critical)
//   4. Route behavioral mode (VALIDATION / STABILIZATION / GUIDED_ESCALATION / CRITICAL_ESCALATION)
//   5. Build mode-aware system prompt
//   6. Apply pacing constraints (token limit, temperature, tone, grounding)
//   7. Inject grounding hint if pacing enables it
//   8. Inject escalation guidance if applicable
//   9. Call Groq LLM
//  10. Save message + updated emotional state
//  11. Return response + state metadata

"use strict";

const express    = require("express");
const { v4: uuidv4 } = require("uuid");

const { collections, find, insert, remove, findOne, update } = require("../lib/db");
const { authenticate, checkDailyLimit } = require("../middleware/auth");

const { updateEmotionalState, createDefaultState } = require("../lib/emotionalEngine");
const { buildSystemPrompt }                         = require("../lib/promptConstructor");
const { getPacingParams }                           = require("../lib/pacingEngine");
const { getGroundingHint }                          = require("../lib/deescalation");
const { getEscalationGuide, getEscalationInject }   = require("../lib/escalationTemplates");

const router = express.Router();

// ── CASUAL / GREETING SHORTCUTS ──────────────────────────────────────────
// Only used when the FULL message matches and the emotional state is green.
const CASUAL_RESPONSES = {
  "hi":              ["Hey — really glad you stopped by. How are you doing today?", "Hi there. How are you feeling right now?"],
  "hey":             ["Hey! Good to see you. What is on your mind?"],
  "hello":           ["Hello. I am glad you are here. How are you feeling today?"],
  "how are you":     ["I am doing well, thank you. More importantly — how are you doing?"],
  "thank you":       ["You are so welcome. Is there anything else on your mind?"],
  "thanks":          ["Of course. Anything else you want to talk through?"],
  "ok":              ["Good to hear. Is there something on your mind today?"],
  "okay":            ["Okay — how has your day been?"],
  "good morning":    ["Good morning. Hope the start of your day has been gentle. How are you feeling?"],
  "good afternoon":  ["Good afternoon. How has your day been so far?"],
  "good evening":    ["Good evening. How are you feeling tonight?"],
  "good night":      ["Good night. Take care of yourself. I am here whenever you need to talk."],
  "bye":             ["Take care of yourself. Come back anytime."],
  "goodbye":         ["Take care. I am always here when you need someone to talk to."],
  "great":           ["That is really good to hear. What has been making things feel good?"],
  "fine":            ["Glad to hear it. How has your day been overall?"],
  "not bad":         ["Good. Is there anything on your mind you would like to talk about?"],
  "i'm good":        ["Glad to hear it. Anything on your mind today?"],
  "im good":         ["Glad to hear it. Anything on your mind today?"],
  "i am good":       ["Glad to hear it. Anything on your mind today?"],
  "lol":             ["Always good to have a moment of lightness. How are you really doing though?"],
};

function getCasualResponse(message) {
  const key = message.toLowerCase().trim().replace(/[!?.,']+$/, "").trim();
  const responses = CASUAL_RESPONSES[key];
  if (!responses) return null;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ── OFF-TOPIC FILTER ─────────────────────────────────────────────────────
// Catches non-emotional requests — but only if there is no emotional context
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

// ── LOAD / SAVE SESSION EMOTIONAL STATE ─────────────────────────────────
// We store the emotional state in the sessions collection.
// One session = one login. State persists across the session.

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
      await update(collections.sessions, { userId, date: today }, { emotionalState: state, updatedAt: new Date().toISOString() });
    } else {
      await insert(collections.sessions, {
        id: uuidv4(), userId, date: today,
        emotionalState: state,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error("[SERENE] Could not save emotional state:", err.message);
  }
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
      headers: {
        "Content-Type":  "application/json",
        "Authorization": "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model:       "llama-3.3-70b-versatile",
        messages,
        max_tokens:  maxTokens,
        temperature: temperature,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.text();
      console.error("[SERENE] Groq error:", res.status, err);
      throw new Error("Groq API error: " + res.status);
    }

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
  if (!emotionalState) {
    return "I am here and I am listening. Could you try sending that again? I genuinely want to hear what you have to say.";
  }

  switch (emotionalState.mode) {
    case "CRITICAL_ESCALATION":
      return "I hear you, and I am right here with you. Please reach out to 988 right now — call or text, free and available 24/7. Are you safe right now?";
    case "GUIDED_ESCALATION":
    case "ESCALATION_READY": // backward compat
      return "I hear you, and I am right here with you. What you are going through sounds incredibly difficult. Please know you do not have to carry this alone — the 988 line has real people available right now if you need more support. I am still here with you.";
    case "STABILIZATION":
      return "I am here with you. It sounds like you are going through something really difficult. Can you tell me a little more about what is happening?";
    default:
      return "I am here and I am listening. Could you try sending that again? I genuinely want to hear what you have to say.";
  }
}

// ── INCREMENT USAGE ───────────────────────────────────────────────────────
async function incrementUsage(userId, date) {
  try {
    const usage = await findOne(collections.usage, { userId, date });
    if (usage) await update(collections.usage, { userId, date }, { count: (usage.count || 0) + 1 });
    else await insert(collections.usage, { id: uuidv4(), userId, date, count: 1 });
  } catch (err) {
    console.error("[SERENE] Usage increment failed:", err.message);
  }
}

// ── POST /api/chat/message ────────────────────────────────────────────────
router.post("/message", authenticate, checkDailyLimit, async (req, res) => {
  try {
    const { message, mood } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message cannot be empty." });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ error: "AI service not configured. Add GROQ_API_KEY to environment variables." });
    }

    const userId  = req.user.id;
    const msgText = message.trim();
    const now     = new Date().toISOString();
    const today   = now.slice(0, 10);

    // ── 1. Off-topic guard ──────────────────────────────────────────────
    if (isOffTopic(msgText)) {
      await insert(collections.messages, { id: uuidv4(), userId, role: "user",      content: msgText,      createdAt: now });
      await insert(collections.messages, { id: uuidv4(), userId, role: "assistant", content: OFF_TOPIC_REPLY, createdAt: now });
      await incrementUsage(userId, today);
      return res.json({ reply: OFF_TOPIC_REPLY, mode: "off_topic", safetyLevel: "green", escalationLevel: 0, isCrisis: false, crisisResource: null, dailyUsed: req.dailyUsed + 1, dailyLimit: req.plan.messagesPerDay });
    }

    // ── 2. Load prior emotional state for this session ──────────────────
    const priorState = await loadEmotionalState(userId);

    // ── 3. Casual shortcut — only when state is green and message is a greeting ──
    const casualReply = getCasualResponse(msgText);
    if (casualReply && priorState.safetyLevel === "green" && priorState.mode === "VALIDATION") {
      await insert(collections.messages, { id: uuidv4(), userId, role: "user",      content: msgText,    createdAt: now });
      await insert(collections.messages, { id: uuidv4(), userId, role: "assistant", content: casualReply, createdAt: now });
      await incrementUsage(userId, today);
      return res.json({ reply: casualReply, mode: "casual", safetyLevel: "green", escalationLevel: 0, isCrisis: false, crisisResource: null, dailyUsed: req.dailyUsed + 1, dailyLimit: req.plan.messagesPerDay });
    }

    // ── 4. Load conversation history ────────────────────────────────────
    const history = await find(
      collections.messages,
      { userId },
      { sort: { createdAt: -1 }, limit: 12 }
    );
    history.reverse();

    // ── 5. Update emotional state ────────────────────────────────────────
    const emotionalState = updateEmotionalState(msgText, history, priorState, priorState.sessionId);

    console.log(`[SERENE] user:${userId} mode:${emotionalState.mode} safety:${emotionalState.safetyLevel} escalation:${emotionalState.escalationLevel} ideation:${emotionalState.lastIdeation} trend:${emotionalState.trend}`);

    // ── 6. Build system prompt ───────────────────────────────────────────
    // Pass onboarding profile for personalized tone (name, concern, goal)
    const userProfile = {
      name:         req.user.name         || null,
      mainConcern:  req.user.mainConcern  || null,
      wellnessGoal: req.user.wellnessGoal || null,
    };
    let systemPrompt = buildSystemPrompt(emotionalState.mode, emotionalState, mood, userProfile);

    // ── 7. Inject grounding hint ─────────────────────────────────────────
    const groundingHint = getGroundingHint(emotionalState);
    if (groundingHint) systemPrompt += groundingHint;

    // ── 8. Inject escalation guidance ────────────────────────────────────
    const escalationInject = getEscalationInject(emotionalState.escalationLevel);
    if (escalationInject) systemPrompt += escalationInject;

    // ── 9. Get pacing parameters ─────────────────────────────────────────
    const pacing = getPacingParams(emotionalState);
    const { maxTokens, temperature, groundingEnabled } = pacing;

    // Suppress grounding hint if pacing says it's not appropriate for this state
    if (!groundingEnabled) systemPrompt = systemPrompt.replace(/\n\n\[GROUNDING TECHNIQUE[^\]]*\][^\n]*/g, "");

    // ── 10. Build Groq message array ─────────────────────────────────────
    const groqMessages = [
      { role: "system", content: systemPrompt },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: msgText },
    ];

    // ── 11. Call Groq ─────────────────────────────────────────────────────
    let reply;
    try {
      reply = await callGroq(groqMessages, maxTokens, temperature);
    } catch (err) {
      console.error("[SERENE] Groq failed:", err.message);
      reply = getFallback(emotionalState);
    }

    // ── 12. Persist messages ──────────────────────────────────────────────
    await insert(collections.messages, {
      id: uuidv4(), userId, role: "user", content: msgText,
      emotionalMode: emotionalState.mode,
      safetyLevel: emotionalState.safetyLevel,
      createdAt: now,
    });
    await insert(collections.messages, {
      id: uuidv4(), userId, role: "assistant", content: reply,
      emotionalMode: emotionalState.mode,
      safetyLevel: emotionalState.safetyLevel,
      createdAt: now,
    });

    // ── 13. Save updated emotional state ─────────────────────────────────
    await saveEmotionalState(userId, emotionalState);

    // ── 14. Increment usage ───────────────────────────────────────────────
    await incrementUsage(userId, today);

    // ── 15. Build response ────────────────────────────────────────────────
    const guide    = getEscalationGuide(emotionalState.escalationLevel);
    const isCrisis = emotionalState.safetyLevel === "red" ||
                     emotionalState.safetyLevel === "critical";

    res.json({
      reply,
      mode:                 emotionalState.mode,
      safetyLevel:          emotionalState.safetyLevel,
      escalationLevel:      emotionalState.escalationLevel,
      isCrisis,
      showCrisisBanner:     guide.uiBanner,
      crisisResource:       guide.crisisResource || null,
      emotionalTrend:       emotionalState.trend,
      // Full emotional state data for client-side indicators
      valence:              emotionalState.valence,
      arousal:              emotionalState.arousal,
      coherence:            emotionalState.coherence,
      escalationReadiness:  emotionalState.escalationReadiness,
      dailyUsed:            req.dailyUsed + 1,
      dailyLimit:           req.plan.messagesPerDay,
    });

  } catch (err) {
    console.error("[SERENE CHAT ERROR]", err.message, err.stack);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ── GET /api/chat/history ─────────────────────────────────────────────────
router.get("/history", authenticate, async (req, res) => {
  try {
    const limit    = Math.min(parseInt(req.query.limit) || 50, 200);
    const messages = await find(
      collections.messages,
      { userId: req.user.id },
      { sort: { createdAt: 1 }, limit }
    );
    res.json({ messages, total: messages.length });
  } catch (err) {
    res.status(500).json({ error: "Could not load chat history." });
  }
});

// ── DELETE /api/chat/history ──────────────────────────────────────────────
router.delete("/history", authenticate, async (req, res) => {
  try {
    await remove(collections.messages, { userId: req.user.id }, { multi: true });
    // Also clear the session emotional state so the next conversation starts fresh
    const today = new Date().toISOString().slice(0, 10);
    await remove(collections.sessions, { userId: req.user.id, date: today }, { multi: false });
    res.json({ message: "Chat history cleared." });
  } catch (err) {
    res.status(500).json({ error: "Could not clear chat history." });
  }
});

// ── GET /api/chat/emotional-state ────────────────────────────────────────
// Returns current session emotional state (for UI indicators)
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
