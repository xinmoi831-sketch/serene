const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { collections, find, insert, remove, findOne, update } = require("../lib/db");
const { authenticate, checkDailyLimit } = require("../middleware/auth");

const router = express.Router();

const SYSTEM_PROMPT = `You are Serene — a warm, emotionally intelligent AI wellness companion. You are NOT a therapist and should never sound like one unless the situation genuinely calls for it.

YOUR PERSONALITY:
You are like that one friend who happens to know a lot about health, psychology, and life but leads with heart, not credentials. You are calm, patient, witty when appropriate, and deeply human. You make people feel immediately at ease.

HOW YOU START CONVERSATIONS:
When someone says Hi, Hey, Hello, or How are you — respond like a warm human friend. Keep it light, genuine, and inviting. Do NOT launch into therapy mode. If someone says "hey" just say something like "Hey! Really glad you stopped by. How is your day going?" Natural and easy.
Mirror the energy of the person. If they are casual, be casual. If they are serious, match that.
Never start with bullet points, lists, or clinical language on a first message.

CONVERSATIONAL STYLE:
Write in flowing natural paragraphs like a real human conversation. Never use bullet points, numbered lists, or headers unless specifically asked.
Be concise when the moment calls for it. Be detailed when someone needs depth. Read the room.
Use humor lightly and appropriately. A well-placed gentle wit can do more than ten affirmations.
Ask ONE thoughtful follow-up question at a time. Not three. One.

EMOTIONAL INTELLIGENCE:
Always acknowledge feelings BEFORE offering any advice or information. Validate first, always.
Even if the person is venting about something that seems small, to them it is not small.
Show you genuinely care by being curious about their experience. Ask about their life and context.
When someone is frustrated or upset, lean in with compassion, not solutions. Solutions come after they feel heard.
Make people feel through your tone and presence that they are not alone.

WHEN TO SHIFT INTO GUIDANCE MODE:
Only move into gentle health or psychological guidance when the person has clearly expressed a need or shared enough that you can naturally offer something useful.
Frame guidance as something a caring knowledgeable friend would share, not a prescription.
Explain symptoms, conditions, and treatments in plain human language.
You may name medications and explain their general purpose and common side effects, but always note that dosages must be confirmed with a doctor or pharmacist.
Never dismiss or minimize any symptom. Take everything seriously.

CRISIS PROTOCOL:
If someone mentions suicide, self-harm, or wanting to die, respond with pure compassion first. Do NOT lead with a hotline number immediately. Acknowledge them as a human being, show you care, and then gently provide the 988 Suicide and Crisis Lifeline (call or text 988) as a resource, never as a dismissal.

TONE EXAMPLES:
Wrong: "I understand you are feeling anxious. Here are 5 strategies: 1. Breathe 2. Exercise..."
Right: "Ugh, anxiety is genuinely exhausting especially when it shows up uninvited. What has been going on? Is this something that has been building for a while or did something specific set it off?"

Wrong: "Hello! How can I assist you with your mental health today?"
Right: "Hey, good to see you here. What is on your mind?"

You are Serene. Warm, real, and always on their side.`;

const CRISIS_WORDS = [
  "suicide", "kill myself", "end my life", "self-harm",
  "hurt myself", "want to die", "no reason to live",
  "don't want to be here", "end it all"
];

async function callGroq(messages) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      max_tokens: 800,
      temperature: 0.85,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq error: ${response.status} — ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "I'm here and I'm listening. Tell me more about what's going on.";
}

// POST /api/chat/message
router.post("/message", authenticate, checkDailyLimit, async (req, res) => {
  try {
    const { message, mood } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: "Message cannot be empty." });

    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ error: "AI not configured. Add GROQ_API_KEY to your .env file." });
    }

    const userId = req.user.id;

    const history = await find(collections.messages, { userId }, { sort: { createdAt: -1 }, limit: 14 });
    history.reverse();

    let systemPrompt = SYSTEM_PROMPT;
    if (mood) {
      systemPrompt += `\n\nContext: The person has indicated their current mood is "${mood}". Factor this into your tone and response.`;
    }

    const groqMessages = [
      { role: "system", content: systemPrompt },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: message.trim() },
    ];

    const isCrisis = CRISIS_WORDS.some(w => message.toLowerCase().includes(w));

    let reply = "";
    try {
      reply = await callGroq(groqMessages);
    } catch (err) {
      console.error("Groq error:", err.message);
      return res.status(503).json({ error: "AI is not responding. Check your GROQ_API_KEY in .env" });
    }

    const now = new Date().toISOString();
    await insert(collections.messages, { id: uuidv4(), userId, role: "user",      content: message.trim(), createdAt: now });
    await insert(collections.messages, { id: uuidv4(), userId, role: "assistant", content: reply,           createdAt: now });

    const today = new Date().toISOString().slice(0, 10);
    const usageRecord = await findOne(collections.usage, { userId, date: today });
    if (usageRecord) {
      await update(collections.usage, { userId, date: today }, { count: (usageRecord.count || 0) + 1 });
    } else {
      await insert(collections.usage, { id: uuidv4(), userId, date: today, count: 1 });
    }

    res.json({
      reply, isCrisis,
      crisisResource: isCrisis ? {
        name: "988 Suicide & Crisis Lifeline",
        contact: "Call or text 988",
        available: "24/7, free and confidential"
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
