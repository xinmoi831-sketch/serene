"use strict";
const express = require("express");
const router  = express.Router();
const { generateSpeech } = require("../services/ttsService");
const { authenticate }   = require("../middleware/auth");

// POST /api/tts/speak
router.post("/speak", authenticate, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "Text required." });

    const { buffer, contentType } = await generateSpeech(text.trim());

    res.setHeader("Content-Type",   contentType);
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control",  "no-cache");
    res.send(buffer);
  } catch (err) {
    console.error("[TTS]", err.message);
    res.status(503).json({ error: "TTS unavailable." });
  }
});

// GET /api/tts/status — health check
router.get("/status", (req, res) => {
  const configured = !!(process.env.HF_API_KEY || "").trim();
  res.json({ configured, model: "Qwen/Qwen3-TTS" });
});

module.exports = router;
