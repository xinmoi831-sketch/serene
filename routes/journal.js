// routes/journal.js — with AES-256-GCM encryption on content, reflection, and mood notes
const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { collections, find, insert, remove, count } = require("../lib/db");
const { authenticate, requirePro } = require("../middleware/auth");
const { encrypt, decrypt } = require("../lib/encryption");

const router = express.Router();
const VALID_MOODS = ["good", "okay", "low", "distressed"];

async function callGroq(messages) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model: "llama3-8b-8192", messages, max_tokens: 150, temperature: 0.7 }),
  });
  if (!response.ok) throw new Error(`Groq error: ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || null;
}

// ── Encrypt / decrypt helpers ─────────────────────────────────────────────
function enc(text, userId) {
  if (!text) return { enc: null, iv: null };
  return encrypt(text, userId);
}

function decEntry(entry, userId) {
  if (!entry) return entry;
  // Decrypt content
  const content = entry.enc_content
    ? (decrypt(entry.enc_content, entry.iv_content, userId) || "[decryption error]")
    : (entry.content || ""); // legacy plaintext fallback
  // Decrypt reflection
  const reflection = entry.enc_reflection
    ? (decrypt(entry.enc_reflection, entry.iv_reflection, userId) || null)
    : (entry.reflection || null);
  return {
    id:         entry.id,
    content,
    reflection,
    createdAt:  entry.createdAt,
  };
}

function decMood(mood, userId) {
  if (!mood) return mood;
  const note = mood.enc_note
    ? (decrypt(mood.enc_note, mood.iv_note, userId) || null)
    : (mood.note || null); // legacy fallback
  return { id: mood.id, mood: mood.mood, note, createdAt: mood.createdAt };
}

// ── POST /api/journal/mood ────────────────────────────────────────────────
router.post("/mood", authenticate, async (req, res) => {
  try {
    const { mood, note } = req.body;
    if (!mood || !VALID_MOODS.includes(mood.toLowerCase())) {
      return res.status(400).json({ error: `Mood must be one of: ${VALID_MOODS.join(", ")}` });
    }
    const id = uuidv4();
    const userId = req.user.id;
    // Encrypt the optional note
    const encNote = enc(note ? note.trim() : null, userId);
    await insert(collections.moods, {
      id, userId,
      mood: mood.toLowerCase(),
      enc_note: encNote.enc,
      iv_note:  encNote.iv,
      createdAt: new Date().toISOString(),
    });
    res.status(201).json({ message: "Mood logged.", id, mood: mood.toLowerCase() });
  } catch (err) {
    res.status(500).json({ error: "Could not save mood." });
  }
});

// ── GET /api/journal/mood/history ─────────────────────────────────────────
router.get("/mood/history", authenticate, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const logs  = await find(collections.moods, { userId: req.user.id }, { sort: { createdAt: -1 }, limit });
    const decrypted = logs.map(l => decMood(l, req.user.id));
    const summary = VALID_MOODS.reduce((acc, m) => { acc[m] = decrypted.filter(l => l.mood === m).length; return acc; }, {});
    res.json({ total: decrypted.length, summary, entries: decrypted });
  } catch (err) {
    res.status(500).json({ error: "Could not load mood history." });
  }
});

// ── POST /api/journal/entry ───────────────────────────────────────────────
router.post("/entry", authenticate, async (req, res) => {
  try {
    const { content, generateReflection = false } = req.body;
    if (!content || content.trim().length < 5) {
      return res.status(400).json({ error: "Journal entry is too short." });
    }
    const userId = req.user.id;

    if (req.user.plan === "free") {
      const total = await count(collections.journal, { userId });
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
    // Encrypt content and reflection
    const encContent    = enc(content.trim(), userId);
    const encReflection = enc(reflection, userId);

    await insert(collections.journal, {
      id, userId,
      enc_content:    encContent.enc,
      iv_content:     encContent.iv,
      enc_reflection: encReflection.enc,
      iv_reflection:  encReflection.iv,
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({
      message: "Journal entry saved.",
      entry: { id, content: content.trim(), reflection, createdAt: new Date().toISOString() },
    });
  } catch (err) {
    console.error("Journal error:", err.message);
    res.status(500).json({ error: "Could not save journal entry." });
  }
});

// ── GET /api/journal/entries ──────────────────────────────────────────────
router.get("/entries", authenticate, async (req, res) => {
  try {
    const limit   = Math.min(parseInt(req.query.limit) || 20, 100);
    const entries = await find(collections.journal, { userId: req.user.id }, { sort: { createdAt: -1 }, limit });
    const decrypted = entries.map(e => decEntry(e, req.user.id));
    res.json({ total: decrypted.length, entries: decrypted });
  } catch (err) {
    res.status(500).json({ error: "Could not load journal entries." });
  }
});

// ── DELETE /api/journal/entry/:id ─────────────────────────────────────────
router.delete("/entry/:id", authenticate, async (req, res) => {
  try {
    const n = await remove(collections.journal, { id: req.params.id, userId: req.user.id });
    if (n === 0) return res.status(404).json({ error: "Entry not found." });
    res.json({ message: "Entry deleted." });
  } catch (err) {
    res.status(500).json({ error: "Could not delete entry." });
  }
});

// ── GET /api/journal/export (Pro only) ───────────────────────────────────
router.get("/export", authenticate, requirePro, async (req, res) => {
  try {
    const entries   = await find(collections.journal, { userId: req.user.id }, { sort: { createdAt: 1 } });
    const decrypted = entries.map(e => decEntry(e, req.user.id));
    res.setHeader("Content-Disposition", "attachment; filename=serene-journal.json");
    res.json({ exportedAt: new Date().toISOString(), totalEntries: decrypted.length, entries: decrypted });
  } catch (err) {
    res.status(500).json({ error: "Could not export data." });
  }
});

module.exports = router;
