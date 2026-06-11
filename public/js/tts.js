// Serene — TTS via Qwen3 backend
const TTS = (() => {
  let currentAudio  = null;
  let currentMsgId  = null;
  let isPlaying     = false;
  let currentObjUrl = null;

  function cleanText(text) {
    return text
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/[#*_`~]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function updatePlayBtn(msgId, state) {
    const btn = document.querySelector('[data-msg-id="' + msgId + '"] .tts-play-btn');
    if (!btn) return;
    if (state === "playing") {
      btn.innerHTML = '<i class="ti ti-player-pause"></i>';
      btn.classList.add("playing");
      btn.title = "Pause";
    } else if (state === "loading") {
      btn.innerHTML = '<span class="tts-loader"></span>';
      btn.classList.remove("playing");
      btn.title = "Loading…";
    } else {
      btn.innerHTML = '<i class="ti ti-volume"></i>';
      btn.classList.remove("playing");
      btn.title = "Play audio";
    }
  }

  function revokeUrl() {
    if (currentObjUrl) { URL.revokeObjectURL(currentObjUrl); currentObjUrl = null; }
  }

  async function play(msgId) {
    // Toggle pause/resume on same message
    if (currentMsgId === msgId && currentAudio) {
      if (isPlaying) {
        currentAudio.pause();
        isPlaying = false;
        updatePlayBtn(msgId, "idle");
      } else {
        currentAudio.play().catch(() => {});
        isPlaying = true;
        updatePlayBtn(msgId, "playing");
      }
      return;
    }

    stop();

    const bubble = document.querySelector('[data-msg-id="' + msgId + '"] .bubble');
    if (!bubble) return;
    const text = cleanText(bubble.innerHTML);
    if (!text) return;

    updatePlayBtn(msgId, "loading");
    currentMsgId = msgId;

    try {
      const token = window.api && window.api.getToken ? window.api.getToken() : null;
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = "Bearer " + token;

      const res = await fetch("/api/tts/speak", {
        method: "POST",
        headers,
        body: JSON.stringify({ text }),
      });

      if (!res.ok) throw new Error("TTS HTTP " + res.status);

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      currentObjUrl = url;

      const audio = new Audio(url);
      currentAudio = audio;

      audio.onplay  = () => { isPlaying = true;  updatePlayBtn(msgId, "playing"); };
      audio.onpause = () => { isPlaying = false; updatePlayBtn(msgId, "idle"); };
      audio.onended = () => {
        isPlaying = false;
        currentMsgId = null;
        revokeUrl();
        updatePlayBtn(msgId, "idle");
      };
      audio.onerror = () => {
        console.error("[TTS] Audio playback error");
        isPlaying = false;
        currentMsgId = null;
        revokeUrl();
        updatePlayBtn(msgId, "idle");
      };

      await audio.play();
    } catch (err) {
      console.error("[TTS] Error:", err.message);
      currentMsgId = null;
      revokeUrl();
      updatePlayBtn(msgId, "idle");
    }
  }

  function stop() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    isPlaying = false;
    if (currentMsgId) {
      updatePlayBtn(currentMsgId, "idle");
      currentMsgId = null;
    }
    revokeUrl();
  }

  return { play, stop, isSupported: function() { return true; } };
})();
