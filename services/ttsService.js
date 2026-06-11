"use strict";

async function generateSpeech(text) {
  const apiKey = (process.env.HF_API_KEY || "").trim();
  if (!apiKey) throw new Error("HF_API_KEY not configured");

  const clean = text
    .replace(/<[^>]+>/g, "")
    .replace(/[*_#`~]/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);

  if (!clean) throw new Error("Empty text after cleaning");

  console.log("[TTS] Qwen3-TTS request, chars:", clean.length);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(
      "https://api-inference.huggingface.co/models/Qwen/Qwen3-TTS",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: clean }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.text();
      throw new Error("HF API " + response.status + ": " + err.slice(0, 200));
    }

    const contentType = response.headers.get("content-type") || "audio/flac";
    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length === 0) throw new Error("Empty audio buffer from HF");

    console.log("[TTS] Audio received, bytes:", buffer.length, "type:", contentType);
    return { buffer, contentType };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") throw new Error("TTS request timed out after 30s");
    throw err;
  }
}

module.exports = { generateSpeech };
