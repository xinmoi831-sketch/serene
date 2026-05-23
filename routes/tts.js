// Serene — ElevenLabs TTS Route
const express = require("express");
const router  = express.Router();

const VOICES = {
  adam:    "pNInz6obpgDQGcFmaJgB",
  daniel:  "onwK4e9ZLuTAKqWW03F9",
  charlie: "IKne3meq5aSn9XLyUdCD",
};

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || VOICES.adam;

// POST /api/tts/speak
router.post("/speak", async (req, res) => {
  try {
    const apiKey = (process.env.ELEVENLABS_API_KEY || "").trim();
    if (!apiKey) {
      console.error("[TTS] No ELEVENLABS_API_KEY set");
      return res.status(503).json({ error: "ElevenLabs not configured." });
    }

    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "Text required." });

    const clean = text
      .replace(/<[^>]+>/g, "")
      .replace(/[*_#`~]/g, "")
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);

    console.log("[TTS] Calling ElevenLabs, chars:", clean.length, "voice:", VOICE_ID);

    // Use non-streaming endpoint — more reliable on Railway
    const response = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/" + VOICE_ID,
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

    console.log("[TTS] ElevenLabs response status:", response.status);

    if (!response.ok) {
      const errText = await response.text();
      console.error("[TTS] ElevenLabs error:", response.status, errText);
      return res.status(response.status).json({ error: "ElevenLabs failed: " + response.status });
    }

    // Get complete audio buffer — no streaming
    const arrayBuffer = await response.arrayBuffer();
    const buffer      = Buffer.from(arrayBuffer);

    console.log("[TTS] Audio buffer size:", buffer.length, "bytes");

    if (buffer.length === 0) {
      console.error("[TTS] Empty audio buffer received");
      return res.status(500).json({ error: "Empty audio from ElevenLabs" });
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "no-cache");
    res.send(buffer);
    console.log("[TTS] Audio sent successfully");

  } catch (err) {
    console.error("[TTS] Unexpected error:", err.message);
    res.status(500).json({ error: "TTS error: " + err.message });
  }
});

// GET /api/tts/test — test endpoint
router.get("/test", async (req, res) => {
  const apiKey = (process.env.ELEVENLABS_API_KEY || "").trim();
  res.json({
    configured: !!apiKey,
    keyPrefix:  apiKey ? apiKey.substring(0, 8) + "..." : "NOT SET",
    voiceId:    VOICE_ID,
  });
});

module.exports = router;
