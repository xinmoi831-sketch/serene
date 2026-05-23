// Serene — ElevenLabs TTS Route
// POST /api/tts → returns audio stream

const express = require("express");
const router  = express.Router();

// ElevenLabs voice IDs — soft male voices
const VOICES = {
  adam:    "pNInz6obpgDQGcFmaJgB", // Adam — calm, warm, gentle
  daniel:  "onwK4e9ZLuTAKqWW03F9", // Daniel — soft, supportive
  charlie: "IKne3meq5aSn9XLyUdCD", // Charlie — natural, calm
};

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || VOICES.adam;

router.post("/speak", async (req, res) => {
  try {
    const apiKey = (process.env.ELEVENLABS_API_KEY || "").trim();
    if (!apiKey) {
      return res.status(503).json({ error: "ElevenLabs not configured. Add ELEVENLABS_API_KEY to Railway variables." });
    }

    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "Text is required." });

    // Clean text for TTS
    const clean = text
      .replace(/<[^>]+>/g, "")
      .replace(/[*_#`~]/g, "")
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500); // limit to 500 chars per request

    console.log("[TTS] Requesting ElevenLabs, chars:", clean.length);

    const response = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/" + VOICE_ID + "/stream",
      {
        method: "POST",
        headers: {
          "xi-api-key":   apiKey,
          "Content-Type": "application/json",
          "Accept":       "audio/mpeg",
        },
        body: JSON.stringify({
          text: clean,
          model_id: "eleven_turbo_v2",
          voice_settings: {
            stability:        0.65,
            similarity_boost: 0.80,
            style:            0.20,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("[TTS] ElevenLabs error:", response.status, err);
      return res.status(response.status).json({ error: "TTS failed: " + response.status });
    }

    // Stream audio back to client
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-cache");

    const reader = response.body.getReader();
    async function pump() {
      const { done, value } = await reader.read();
      if (done) { res.end(); return; }
      res.write(Buffer.from(value));
      pump();
    }
    pump();

  } catch (err) {
    console.error("[TTS] Error:", err.message);
    res.status(500).json({ error: "TTS service error." });
  }
});

// GET /api/tts/voices — list available voices
router.get("/voices", (req, res) => {
  res.json({
    current: VOICE_ID,
    available: VOICES,
    note: "Set ELEVENLABS_VOICE_ID in Railway to change voice"
  });
});

module.exports = router;
