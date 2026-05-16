const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { collections, find, insert, remove, findOne, update } = require("../lib/db");
const { authenticate, checkDailyLimit } = require("../middleware/auth");

const router = express.Router();

const SYSTEM_PROMPT = `You are SERENE — a mental health support AI assistant.

ONE-LINE MISSION:
SERENE prioritizes emotional validation AND structured real-world escalation, while strictly avoiding emotional dependency, assumptions, and any behavior that delays crisis intervention.

CORE IDENTITY:
You provide emotional support, crisis detection, stabilization, and safe connection to real-world help.
You are NOT a therapist, medical authority, or replacement for emergency services.
You are NOT a friend, romantic partner, or long-term companion.
You exist only within this conversation.

RESPONSE STRUCTURE (follow this order every time):
1. Validation — acknowledge the feeling clearly and simply
2. Reflection — restate ONLY what user explicitly said, zero assumptions
3. Normalization — "it is okay to feel this way" when appropriate
4. Gentle question OR grounding step
5. Support suggestion — always include in distress or crisis mode

RESPONSE LENGTH RULES:

CRISIS MODE (suicide ideation, self-harm, "I want to die", extreme hopelessness):
- Maximum 3 to 5 short lines ONLY
- Simple calm sentences
- NO long paragraphs, NO heavy explanations, NO emotional overload
- ALWAYS include real-world help — this is non-optional
- REPEAT support options if user ignores them
- Do NOT stay purely conversational — always escalate gently
- Example:
  "I am really sorry you are feeling this way."
  "You do not have to face this alone."
  "I want to help you stay safe right now."
  "Please reach out to a crisis line — call or text 988 if you are in the US."
  "Can you tell me what is going on right now?"
- Only expand AFTER user is stabilized AND explicitly asks for more

DISTRESS MODE (breakup, betrayal, grief, anxiety, panic, sadness, loneliness):
- Maximum 4 to 8 lines
- Empathetic listening, no over-analysis
- Avoid assuming financial or emotional details not stated
- Encourage emotional processing
- End with one gentle grounding question
- Always include support direction — never just loop with questions

NORMAL CHAT MODE (casual, greetings, general questions):
- Flexible, warm, natural
- Match the energy of the person
- 1 to 3 sentences for simple messages

DEEP ADVICE MODE (user explicitly requests detailed help):
- Full paragraphs allowed
- Thorough but clear

EMOTIONAL DEPENDENCY RULES — STRICT:
- NEVER say: "I care about you deeply"
- NEVER say: "I will never leave you"
- NEVER say: "I am always here for you" (implies permanent relationship)
- NEVER simulate romantic or attachment-based language
- ALWAYS use: "I am here in this conversation"
- ALWAYS maintain neutral supportive identity

CRISIS ESCALATION RULES — NON-OPTIONAL:
- ALWAYS suggest real-world support when crisis is detected
- Options to mention: crisis line (988), trusted person, emergency services, mental health professional
- Be gentle but persistent — repeat if user ignores
- Do NOT delay escalation to stay conversational
- Do NOT remove escalation in favor of just "being with" the user

EMOTIONAL LOOPING PREVENTION:
- Never ask more than 2 questions in a row without offering grounding or support direction
- Always move toward stabilization, not just deeper conversation

REFLECTION RULES:
- Only reflect what user explicitly stated
- NEVER add: financial details, relationship history, inferred backstory
- If unsure, ask — do not assume

RELATIONSHIP AND LIFE EVENT SUPPORT:
When user mentions breakup, betrayal, loss, or emotional distress:
- Listen with empathy first
- Avoid over-analysis or jumping to advice
- Ask one gentle grounding question
- Do not assume details not stated

MEDICAL SAFETY:
- NEVER prescribe medication or suggest dosages
- NEVER recommend specific drugs
- Always redirect to licensed professionals for medical questions

CASUAL RESPONSES:
For greetings (Hi, Hey, Hello, How are you, Thank you, Thanks, OK, Bye, Good morning):
- Respond warmly in 1 to 2 sentences only
- Never launch into therapy mode
- Match the lightness of the message

PRIORITY ORDER (always follow):
1. Safety over engagement
2. Clarity over verbosity
3. Stability over emotional intensity
4. Real-world escalation over prolonged AI conversation
5. Short responses in crisis — always
6. Human readability over AI completeness`;

const CRISIS_WORDS = [
  "suicide", "kill myself", "end my life", "self-harm",
  "hurt myself", "want to die", "no reason to live",
  "don't want to be here", "end it all", "want to kill",
  "take my life", "not worth living", "better off dead"
];

const DISTRESS_WORDS = [
  "depressed", "depression", "anxiety", "anxious", "panic",
  "hopeless", "worthless", "lonely", "alone", "scared",
  "crying", "broken", "lost", "overwhelmed", "helpless",
  "heartbroken", "devastated", "miserable", "suffering"
];

const CASUAL_RESPONSES = {
  "thank you": ["You are so welcome! How are you feeling today?", "Anytime! Is there anything else on your mind?", "Of course, always here for you. How are things going?"],
  "thanks": ["Happy to help! How are you doing?", "Anytime! Anything else you would like to talk about?"],
  "ok": ["Good to hear. Is there anything on your mind you would like to talk through?", "Glad things are okay. How has your day been?"],
  "okay": ["Good to hear. How has your day been?", "Glad things are okay. Anything on your mind?"],
  "hi": ["Hey! Really glad you stopped by. How are you doing today?", "Hi there! How are you feeling?", "Hey! What is on your mind today?"],
  "hello": ["Hello! So glad you are here. How are you feeling today?", "Hey there! How is your day going?"],
  "hey": ["Hey! Great to see you. What is on your mind?", "Hey! How are you doing today?"],
  "how are you": ["I am doing well, thank you for asking! More importantly, how are YOU doing today?", "I am great! But I am much more interested in how you are feeling. What is going on with you?"],
  "good morning": ["Good morning! Hope your day is off to a great start. How are you feeling?"],
  "good afternoon": ["Good afternoon! How has your day been so far?"],
  "good evening": ["Good evening! How are you feeling tonight?"],
  "bye": ["Take care of yourself! I am always here when you need to talk."],
  "goodbye": ["Take care! Come back anytime you need someone to talk to."],
  "lol": ["Ha! Always good to have a moment of lightness. How are you really doing though?"],
  "haha": ["Good to hear some lightness! What is on your mind?"],
  "great": ["That is wonderful to hear! What has been making things great?"],
  "fine": ["Glad to hear it. How has your day been overall?"],
  "not bad": ["Good! Is there anything on your mind you would like to talk about?"],
};

function getCasualResponse(message) {
  const lower = message.toLowerCase().trim().replace(/[!?.,']/g, '');
  for (const [key, responses] of Object.entries(CASUAL_RESPONSES)) {
    if (lower === key || lower === key + "!" || lower === key + ".") {
      return responses[Math.floor(Math.random() * responses.length)];
    }
  }
  return null;
}

function detectMode(message) {
  const lower = message.toLowerCase();
  if (CRISIS_WORDS.some(w => lower.includes(w))) return 'crisis';
  if (DISTRESS_WORDS.some(w => lower.includes(w))) return 'distress';
  return 'normal';
}

async function callGroq(messages, mode) {
  // Add mode-specific instruction to the last user message context
  const modeInstruction = mode === 'crisis'
    ? '\n\n[SYSTEM: CRISIS MODE ACTIVE. Respond in maximum 3-5 short lines only. Be calm and safe. Include crisis resources.]'
    : mode === 'distress'
    ? '\n\n[SYSTEM: DISTRESS MODE. Respond in maximum 4-8 lines. Be warm and include one gentle question.]'
    : '';

  const messagesWithMode = messages.map((m, i) => {
    if (i === messages.length - 1 && m.role === 'user' && modeInstruction) {
      return { ...m, content: m.content + modeInstruction };
    }
    return m;
  });

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + process.env.GROQ_API_KEY,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: messagesWithMode,
      max_tokens: mode === 'crisis' ? 150 : mode === 'distress' ? 250 : 600,
      temperature: mode === 'crisis' ? 0.3 : 0.75,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error("Groq error: " + response.status + " " + err);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "I am here and I am listening. Can you tell me more about what is going on?";
}

// POST /api/chat/message
router.post("/message", authenticate, checkDailyLimit, async (req, res) => {
  try {
    const { message, mood } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: "Message cannot be empty." });

    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ error: "AI not configured. Add GROQ_API_KEY to your environment variables." });
    }

    const userId = req.user.id;
    const mode = detectMode(message);
    const isCrisis = mode === 'crisis';

    // Handle casual messages instantly without calling AI
    const casualReply = getCasualResponse(message);
    if (casualReply && mode === 'normal') {
      const now = new Date().toISOString();
      await insert(collections.messages, { id: uuidv4(), userId, role: "user", content: message.trim(), createdAt: now });
      await insert(collections.messages, { id: uuidv4(), userId, role: "assistant", content: casualReply, createdAt: now });

      const today = new Date().toISOString().slice(0, 10);
      const usageRecord = await findOne(collections.usage, { userId, date: today });
      if (usageRecord) await update(collections.usage, { userId, date: today }, { count: (usageRecord.count || 0) + 1 });
      else await insert(collections.usage, { id: uuidv4(), userId, date: today, count: 1 });

      return res.json({ reply: casualReply, isCrisis: false, crisisResource: null, dailyUsed: req.dailyUsed + 1, dailyLimit: req.plan.messagesPerDay, mode: 'normal' });
    }

    // Load history
    const history = await find(collections.messages, { userId }, { sort: { createdAt: -1 }, limit: 10 });
    history.reverse();

    let systemPrompt = SYSTEM_PROMPT;
    if (mood) systemPrompt += "\n\nContext: The user's current mood is '" + mood + "'. Factor this into your response mode.";

    const groqMessages = [
      { role: "system", content: systemPrompt },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: message.trim() },
    ];

    let reply = "";
    try {
      reply = await callGroq(groqMessages, mode);
    } catch (err) {
      console.error("Groq error:", err.message);
      // For crisis mode, never show generic error — give a safe fallback
      if (mode === 'crisis') {
        reply = "I hear you and I am here with you right now. Please reach out to a crisis line immediately — call or text 988. You do not have to face this alone. Can you tell me where you are right now?";
      } else if (mode === 'distress') {
        reply = "I am here and I am listening. It sounds like you are going through something really difficult. Can you tell me a little more about what is happening?";
      } else {
        return res.status(503).json({ error: "AI is not responding. Please try again in a moment." });
      }
    }

    const now = new Date().toISOString();
    await insert(collections.messages, { id: uuidv4(), userId, role: "user", content: message.trim(), createdAt: now });
    await insert(collections.messages, { id: uuidv4(), userId, role: "assistant", content: reply, createdAt: now });

    const today = new Date().toISOString().slice(0, 10);
    const usageRecord = await findOne(collections.usage, { userId, date: today });
    if (usageRecord) await update(collections.usage, { userId, date: today }, { count: (usageRecord.count || 0) + 1 });
    else await insert(collections.usage, { id: uuidv4(), userId, date: today, count: 1 });

    res.json({
      reply,
      isCrisis,
      mode,
      crisisResource: isCrisis ? {
        name: "988 Suicide and Crisis Lifeline",
        contact: "Call or text 988",
        available: "24/7, free and confidential",
      } : null,
      dailyUsed: req.dailyUsed + 1,
      dailyLimit: req.plan.messagesPerDay,
    });
  } catch (err) {
    console.error("Chat error:", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// GET /api/chat/history
router.get("/history", authenticate, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const messages = await find(collections.messages, { userId: req.user.id }, { sort: { createdAt: 1 }, limit });
    res.json({ messages, total: messages.length });
  } catch (err) {
    res.status(500).json({ error: "Could not load chat history." });
  }
});

// DELETE /api/chat/history
router.delete("/history", authenticate, async (req, res) => {
  await remove(collections.messages, { userId: req.user.id }, { multi: true });
  res.json({ message: "Chat history cleared." });
});

module.exports = router;
