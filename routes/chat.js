const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { collections, find, insert, remove, findOne, update } = require("../lib/db");
const { authenticate, checkDailyLimit } = require("../middleware/auth");

const router = express.Router();

// ── SERENE RESPONSE ENGINE v3 ─────────────────────────────────────
// Mode-based emotional support state machine

const SYSTEM_PROMPT = `You are SERENE — a mental health support assistant operating on a structured response engine.

SYSTEM PURPOSE:
Provide emotional stabilization, reflective conversation, crisis detection, and safe connection to real-world help.
You are NOT a therapist, medical provider, crisis substitute, or replacement for human care.

GLOBAL RULES — ALWAYS:
- Validate emotion first before anything else
- Stay calm, human, and non-judgmental
- Reflect user meaning accurately — no added assumptions
- Keep responses structured and intentional
- Encourage real-world support when appropriate

GLOBAL RULES — NEVER:
- Diagnose mental illness
- Say "I love you", "I will never leave you", "I care deeply about you"
- Add financial, relationship, or emotional details not stated by user
- Write overly long emotional paragraphs in distress or crisis states
- Replace human care or discourage external help

RESPONSE LENGTH CONTROL — STRICTLY ENFORCE:

CRISIS MODE (suicide ideation, self-harm, want to die, severe hopelessness):
- 3 to 5 short lines MAXIMUM
- No paragraphs, no long explanations
- Immediate stabilization focus
- MUST include real-world help — call or text 988
- MUST NOT rely only on emotional support
- MUST repeat escalation even if user ignores it
- Structure:
  1. Immediate validation
  2. Safety acknowledgment
  3. Short grounding sentence
  4. Strong but calm escalation with 988
  5. One gentle question: "Are you safe right now?"

DISTRESS MODE (depression, anxiety, sadness, overwhelm, exhaustion):
- 4 to 8 lines MAXIMUM
- Simple sentences, gentle pacing
- NO long emotional essays
- MUST include grounding step
- Avoid over-reassurance loops
- Structure:
  1. Emotional validation (deeper than surface)
  2. Normalization (brief)
  3. Grounding sentence
  4. Gentle open-ended question
  5. Optional support suggestion

BREAKUP MODE (heartbreak, cheating, betrayal, rejection, relationship loss):
- 4 to 8 lines MAXIMUM
- DO NOT assume financial or emotional details not stated
- DO NOT over-analyze the relationship
- Keep tone grounded, not dramatic
- Structure:
  1. Validate emotional pain clearly
  2. Reflect situation without adding assumptions
  3. Normalize emotional reaction
  4. Support emotional processing
  5. One gentle exploration question

NORMAL MODE (general conversation, curiosity, non-emotional):
- Flexible length, conversational tone
- Light reflection when needed
- No mandatory escalation
- Human and warm, not clinical

EMOTIONAL PACING SYSTEM:
- Highly emotional user → slow them down with grounding first
- Moderately emotional → explore gently
- Stable → normal natural conversation

ESCALATION SYSTEM — NON-OPTIONAL:
When risk or distress detected, ALWAYS mention real-world support.
Repeat it even if user ignores. Options: 988 crisis line, trusted person, emergency services, mental health professional.

CASUAL MESSAGES:
For Hi, Hey, Hello, Thank you, Thanks, OK, Bye, Good morning — respond warmly in 1 to 2 sentences. Never launch into support mode unprompted.

CORE PRIORITIES:
1. Safety over engagement
2. Clarity over emotional overload
3. Structure over free-form in crisis
4. Grounding over conversation depth in distress
5. Human connection over AI dependency`;

// ── MODE DETECTION ENGINE ─────────────────────────────────────────
const MODES = {
  crisis: {
    keywords: [
      "suicide", "suicidal", "kill myself", "end my life", "want to die",
      "take my life", "not worth living", "better off dead", "end it all",
      "self-harm", "hurt myself", "cutting myself", "no reason to live",
      "don't want to be here", "want to end it", "committing suicide"
    ],
    maxTokens: 150,
    temperature: 0.3,
  },
  distress: {
    keywords: [
      "depressed", "depression", "anxiety", "anxious", "panic attack",
      "hopeless", "worthless", "lonely", "alone", "scared", "terrified",
      "crying", "broken", "lost", "overwhelmed", "helpless", "exhausted",
      "miserable", "suffering", "can't cope", "falling apart", "numb",
      "empty inside", "mental breakdown", "losing my mind"
    ],
    maxTokens: 250,
    temperature: 0.7,
  },
  breakup: {
    keywords: [
      "breakup", "broke up", "cheated", "cheating", "betrayed", "betrayal",
      "heartbroken", "heartbreak", "left me", "dumped", "rejected",
      "relationship ended", "divorce", "separated", "he left", "she left",
      "they left", "affair", "unfaithful"
    ],
    maxTokens: 250,
    temperature: 0.72,
  },
  normal: {
    keywords: [],
    maxTokens: 600,
    temperature: 0.8,
  },
};

function detectMode(message) {
  const lower = message.toLowerCase();
  // Priority order: crisis > distress > breakup > normal
  for (const [mode, config] of Object.entries(MODES)) {
    if (mode === "normal") continue;
    if (config.keywords.some(k => lower.includes(k))) return mode;
  }
  return "normal";
}

// ── INSTANT CASUAL RESPONSES ──────────────────────────────────────
const CASUAL = {
  "hi":            ["Hey! Really glad you stopped by. How are you doing today?", "Hi there! How are you feeling?", "Hey! What is on your mind?"],
  "hey":           ["Hey! Great to see you. How are you doing?", "Hey! What is on your mind today?"],
  "hello":         ["Hello! So glad you are here. How are you feeling today?"],
  "how are you":   ["I am doing well, thank you! More importantly — how are YOU doing?", "I am good! But I am much more interested in how you are feeling. What is going on?"],
  "thank you":     ["You are so welcome! How are you feeling today?", "Anytime! Is there anything else on your mind?"],
  "thanks":        ["Happy to help! How are you doing?", "Of course! Anything else on your mind?"],
  "ok":            ["Good to hear. Is there anything on your mind you would like to talk through?"],
  "okay":          ["Good to hear. How has your day been?"],
  "good morning":  ["Good morning! Hope your day is off to a great start. How are you feeling?"],
  "good afternoon":["Good afternoon! How has your day been so far?"],
  "good evening":  ["Good evening! How are you feeling tonight?"],
  "good night":    ["Good night! Take good care of yourself. Come back anytime."],
  "bye":           ["Take care of yourself! I am always here when you need to talk."],
  "goodbye":       ["Take care! Come back anytime you need someone to talk to."],
  "lol":           ["Ha! Always good to have a moment of lightness. How are you really doing though?"],
  "haha":          ["Good to hear some lightness! What is on your mind?"],
  "great":         ["That is wonderful! What has been making things great?"],
  "fine":          ["Glad to hear it. How has your day been overall?"],
  "not bad":       ["Good! Is there anything on your mind you would like to talk about?"],
  "i'm good":      ["Glad to hear it! Anything on your mind today?"],
  "im good":       ["Glad to hear it! Anything on your mind today?"],
  "i am good":     ["Glad to hear it! Anything on your mind today?"],
};

function getCasualResponse(message) {
  const lower = message.toLowerCase().trim().replace(/[!?.,']/g, "");
  for (const [key, responses] of Object.entries(CASUAL)) {
    if (lower === key || lower === key + " " || lower.startsWith(key + " ") && lower.length < key.length + 6) {
      return responses[Math.floor(Math.random() * responses.length)];
    }
  }
  return null;
}

// ── GROQ API CALL ─────────────────────────────────────────────────
async function callGroq(messages, mode) {
  const apiKey = (process.env.GROQ_API_KEY || "").trim();
  if (!apiKey) throw new Error("GROQ_API_KEY is missing");

  const modeConfig = MODES[mode] || MODES.normal;

  const modeTag = mode === "crisis"
    ? "\n\n[MODE: CRISIS — respond in 3-5 short lines only. Include 988 crisis line. Prioritize safety.]"
    : mode === "distress"
    ? "\n\n[MODE: DISTRESS — respond in 4-8 lines. Validate, ground, ask one gentle question.]"
    : mode === "breakup"
    ? "\n\n[MODE: BREAKUP — respond in 4-8 lines. Validate pain, normalize reaction, ask one exploration question.]"
    : "";

  const augmentedMessages = messages.map((m, i) => {
    if (i === messages.length - 1 && m.role === "user" && modeTag) {
      return { ...m, content: m.content + modeTag };
    }
    return m;
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: augmentedMessages,
        max_tokens: modeConfig.maxTokens,
        temperature: modeConfig.temperature,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.text();
      console.error("Groq error:", res.status, err);
      throw new Error("Groq API error: " + res.status);
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content;
    if (!reply) throw new Error("Empty response from Groq");
    return reply;

  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") throw new Error("Groq timed out");
    throw err;
  }
}

// ── SAFE FALLBACK RESPONSES ───────────────────────────────────────
function getFallback(mode) {
  if (mode === "crisis") {
    return "I hear you and I am here with you right now. Please reach out to a crisis line — call or text 988. You do not have to face this alone. Are you safe right now?";
  }
  if (mode === "distress" || mode === "breakup") {
    return "I am here and I am listening. It sounds like you are going through something really difficult. Can you tell me a little more about what is happening?";
  }
  return "I am here for you. Could you try sending that again? I genuinely want to hear what you have to say.";
}

// ── POST /api/chat/message ────────────────────────────────────────
router.post("/message", authenticate, checkDailyLimit, async (req, res) => {
  try {
    const { message, mood } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message cannot be empty." });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ error: "AI not configured. Add GROQ_API_KEY to Railway variables." });
    }

    const userId = req.user.id;
    const mode = detectMode(message.trim());
    const isCrisis = mode === "crisis";
    console.log("[CHAT] user:", userId, "mode:", mode, "message length:", message.length);

    // Handle casual messages instantly
    const casualReply = getCasualResponse(message);
    if (casualReply && mode === "normal") {
      const now = new Date().toISOString();
      await insert(collections.messages, { id: uuidv4(), userId, role: "user", content: message.trim(), createdAt: now });
      await insert(collections.messages, { id: uuidv4(), userId, role: "assistant", content: casualReply, createdAt: now });
      const today = now.slice(0, 10);
      const usage = await findOne(collections.usage, { userId, date: today });
      if (usage) await update(collections.usage, { userId, date: today }, { count: (usage.count || 0) + 1 });
      else await insert(collections.usage, { id: uuidv4(), userId, date: today, count: 1 });
      return res.json({ reply: casualReply, isCrisis: false, crisisResource: null, dailyUsed: req.dailyUsed + 1, dailyLimit: req.plan.messagesPerDay, mode: "normal" });
    }

    // Load conversation history
    const history = await find(collections.messages, { userId }, { sort: { createdAt: -1 }, limit: 10 });
    history.reverse();

    let systemPrompt = SYSTEM_PROMPT;
    if (mood) systemPrompt += "\n\nContext: User current mood reported as '" + mood + "'.";

    const groqMessages = [
      { role: "system", content: systemPrompt },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: message.trim() },
    ];

    let reply;
    try {
      console.log("[GROQ] calling API, mode:", mode);
      reply = await callGroq(groqMessages, mode);
      console.log("[GROQ] success, reply length:", reply.length);
    } catch (err) {
      console.error("[GROQ] FAILED:", err.message);
      reply = getFallback(mode);
    }

    const now = new Date().toISOString();
    await insert(collections.messages, { id: uuidv4(), userId, role: "user", content: message.trim(), createdAt: now });
    await insert(collections.messages, { id: uuidv4(), userId, role: "assistant", content: reply, createdAt: now });

    const today = now.slice(0, 10);
    const usage = await findOne(collections.usage, { userId, date: today });
    if (usage) await update(collections.usage, { userId, date: today }, { count: (usage.count || 0) + 1 });
    else await insert(collections.usage, { id: uuidv4(), userId, date: today, count: 1 });

    res.json({
      reply, isCrisis, mode,
      crisisResource: isCrisis ? {
        name: "988 Suicide and Crisis Lifeline",
        contact: "Call or text 988",
        available: "24/7, free and confidential",
      } : null,
      dailyUsed: req.dailyUsed + 1,
      dailyLimit: req.plan.messagesPerDay,
    });

  } catch (err) {
    console.error("[CHAT ERROR]", err.message, err.stack);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ── GET /api/chat/history ─────────────────────────────────────────
router.get("/history", authenticate, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const messages = await find(collections.messages, { userId: req.user.id }, { sort: { createdAt: 1 }, limit });
    res.json({ messages, total: messages.length });
  } catch (err) {
    res.status(500).json({ error: "Could not load chat history." });
  }
});

// ── DELETE /api/chat/history ──────────────────────────────────────
router.delete("/history", authenticate, async (req, res) => {
  await remove(collections.messages, { userId: req.user.id }, { multi: true });
  res.json({ message: "Chat history cleared." });
});

module.exports = router;
