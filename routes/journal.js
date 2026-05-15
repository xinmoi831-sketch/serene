const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { collections, find, insert, remove, count } = require("../lib/db");
const { authenticate, requirePro } = require("../middleware/auth");

const router = express.Router();
const VALID_MOODS = ["good", "okay", "low", "distressed"];

async function callGroq(messages) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({ model: "llama3-8b-8192", messages, max_tokens: 150, temperature: 0.7 }),
  });
  if (!response.ok) throw new Error(`Groq error: ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || null;
}

// POST /api/journal/mood
router.post("/mood", authenticate, async (req, res) => {
  try {
    const { mood, note } = req.body;
    if (!mood || !VALID_MOODS.includes(mood.toLowerCase())) {
      return res.status(400).json({ error: `Mood must be one of: ${VALID_MOODS.join(", ")}` });
    }
    const id = uuidv4();
    await insert(collections.moods, { id, userId: req.user.id, mood: mood.toLowerCase(), note: note ? note.trim() : null, createdAt: new Date().toISOString() });
    res.status(201).json({ message: "Mood logged.", id, mood: mood.toLowerCase() });
  } catch (err) {
    res.status(500).json({ error: "Could not save mood." });
  }
});

// GET /api/journal/mood/history
router.get("/mood/history", authenticate, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const logs = await find(collections.moods, { userId: req.user.id }, { sort: { createdAt: -1 }, limit });
    const summary = VALID_MOODS.reduce((acc, m) => { acc[m] = logs.filter(l => l.mood === m).length; return acc; }, {});
    res.json({ total: logs.length, summary, entries: logs });
  } catch (err) {
    res.status(500).json({ error: "Could not load mood history." });
  }
});

// POST /api/journal/entry
router.post("/entry", authenticate, async (req, res) => {
  try {
    const { content, generateReflection = false } = req.body;
    if (!content || content.trim().length < 5) {
      return res.status(400).json({ error: "Journal entry is too short." });
    }

    if (req.user.plan === "free") {
      const total = await count(collections.journal, { userId: req.user.id });
      if (total >= 5) {
        return res.status(403).json({ error: "Free plan allows 5 journal entries. Upgrade to Pro for unlimited.", upgradeRequired: true });
      }
    }

    let reflection = null;
    if (generateReflection && req.user.plan !== "free" && process.env.GROQ_API_KEY) {
      try {
        reflection = await callGroq([
          { role: "system", content: "You are a compassionate journaling assistant. Write a warm 2-sentence reflection on the journal entry: acknowledge the main emotion and offer one gentle insight." },
          { role: "user", content: content.trim() },
        ]);
      } catch (err) {
        console.error("Reflection error:", err.message);
      }
    }

    const id = uuidv4();
    await insert(collections.journal, { id, userId: req.user.id, content: content.trim(), reflection, createdAt: new Date().toISOString() });
    res.status(201).json({ message: "Journal entry saved.", entry: { id, content: content.trim(), reflection, createdAt: new Date().toISOString() } });
  } catch (err) {
    console.error("Journal error:", err.message);
    res.status(500).json({ error: "Could not save journal entry." });
  }
});

// GET /api/journal/entries
router.get("/entries", authenticate, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const entries = await find(collections.journal, { userId: req.user.id }, { sort: { createdAt: -1 }, limit });
    res.json({ total: entries.length, entries });
  } catch (err) {
    res.status(500).json({ error: "Could not load journal entries." });
  }
});

// DELETE /api/journal/entry/:id
router.delete("/entry/:id", authenticate, async (req, res) => {
  try {
    const n = await remove(collections.journal, { id: req.params.id, userId: req.user.id });
    if (n === 0) return res.status(404).json({ error: "Entry not found." });
    res.json({ message: "Entry deleted." });
  } catch (err) {
    res.status(500).json({ error: "Could not delete entry." });
  }
});

// GET /api/journal/export (Pro only)
router.get("/export", authenticate, requirePro, async (req, res) => {
  try {
    const entries = await find(collections.journal, { userId: req.user.id }, { sort: { createdAt: 1 } });
    res.setHeader("Content-Disposition", "attachment; filename=serene-journal.json");
    res.json({ exportedAt: new Date().toISOString(), totalEntries: entries.length, entries });
  } catch (err) {
    res.status(500).json({ error: "Could not export data." });
  }
});

module.exports = router;
