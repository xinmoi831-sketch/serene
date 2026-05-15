// Serene — Full Voice Conversation Mode
const Voice = (() => {
  let recognition = null;
  let synth = window.speechSynthesis;
  let isListening = false;
  let isSpeaking = false;
  let voiceMode = false;
  let silenceTimer = null;
  let transcript = '';

  // ── Language map for speech ───────────────────────────────────
  const LANG_MAP = {
    en: { recognition: 'en-US', synth: 'en-US', name: 'English' },
    fr: { recognition: 'fr-FR', synth: 'fr-FR', name: 'French'  },
    es: { recognition: 'es-ES', synth: 'es-ES', name: 'Spanish' },
    pt: { recognition: 'pt-BR', synth: 'pt-BR', name: 'Portuguese' },
  };

  function getLang() {
    return LANG_MAP[window.APP_LANG || 'en'] || LANG_MAP.en;
  }

  // ── Setup speech recognition ──────────────────────────────────
  function setupRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const r = new SpeechRecognition();
    r.continuous = true;
    r.interimResults = true;
    r.lang = getLang().recognition;

    r.onstart = () => {
      isListening = true;
      updateVoiceUI('listening');
    };

    r.onresult = (e) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }

      // Show live transcript
      const liveEl = document.getElementById('voiceLiveText');
      if (liveEl) liveEl.textContent = final || interim;

      if (final) {
        transcript += final;
        // Reset silence timer — send after 2s of silence
        clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          if (transcript.trim()) {
            const msg = transcript.trim();
            transcript = '';
            if (liveEl) liveEl.textContent = '';
            stopListening();
            sendVoiceMessage(msg);
          }
        }, 2000);
      }
    };

    r.onerror = (e) => {
      if (e.error === 'no-speech') return;
      console.error('Speech recognition error:', e.error);
      if (e.error === 'not-allowed') {
        showVoiceError('Microphone access denied. Please allow microphone in your browser settings.');
        exitVoiceMode();
      }
    };

    r.onend = () => {
      isListening = false;
      // Restart if voice mode is still active and AI is not speaking
      if (voiceMode && !isSpeaking) {
        setTimeout(() => { if (voiceMode && !isSpeaking) startListening(); }, 300);
      } else {
        updateVoiceUI('idle');
      }
    };

    return r;
  }

  // ── Start/stop listening ──────────────────────────────────────
  function startListening() {
    if (!recognition) recognition = setupRecognition();
    if (!recognition) { showVoiceError('Speech recognition not supported in this browser. Use Chrome or Edge.'); return; }
    if (isListening) return;
    try {
      recognition.lang = getLang().recognition;
      recognition.start();
    } catch(e) { console.error('Start error:', e.message); }
  }

  function stopListening() {
    if (recognition && isListening) {
      try { recognition.stop(); } catch(e) {}
    }
    isListening = false;
  }

  // ── Speak AI response ─────────────────────────────────────────
  function speak(text) {
    if (!synth) return;
    synth.cancel();

    // Clean text for speech (remove markdown, emoji)
    const clean = text
      .replace(/[#*_`~]/g, '')
      .replace(/[\u{1F300}-\u{1FFFF}]/gu, '')
      .replace(/\n+/g, '. ')
      .trim();

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = getLang().synth;
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Try to pick a good voice
    const voices = synth.getVoices();
    const langCode = getLang().synth.split('-')[0];
    const preferred = voices.find(v => v.lang.startsWith(getLang().synth))
      || voices.find(v => v.lang.startsWith(langCode))
      || null;
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => {
      isSpeaking = true;
      stopListening();
      updateVoiceUI('speaking');
    };

    utterance.onend = () => {
      isSpeaking = false;
      if (voiceMode) {
        updateVoiceUI('listening');
        setTimeout(() => startListening(), 400);
      }
    };

    utterance.onerror = () => {
      isSpeaking = false;
      if (voiceMode) startListening();
    };

    synth.speak(utterance);
  }

  // ── Send message from voice ───────────────────────────────────
  async function sendVoiceMessage(text) {
    updateVoiceUI('thinking');
    // Put text in chat input and send
    const input = document.getElementById('chatInput');
    if (input) input.value = text;
    // Call the main sendMessage function
    if (typeof sendMessage === 'function') {
      // Intercept the reply to also speak it
      const origAppend = window._voiceOrigAppend;
      await sendMessage();
      // Wait for reply then speak it
      waitForReplyAndSpeak();
    }
  }

  function waitForReplyAndSpeak() {
    // Watch for new assistant message
    const area = document.getElementById('chatMessages');
    if (!area) return;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.classList && node.classList.contains('msg') && node.classList.contains('ai')) {
            const bubble = node.querySelector('.bubble');
            if (bubble && bubble.id !== 'typingIndicator') {
              observer.disconnect();
              setTimeout(() => speak(bubble.innerText), 300);
            }
          }
        }
      }
    });
    observer.observe(area, { childList: true });
    // Auto-disconnect after 30s as safety
    setTimeout(() => observer.disconnect(), 30000);
  }

  // ── Enter / exit voice mode ───────────────────────────────────
  function enterVoiceMode() {
    voiceMode = true;
    transcript = '';
    showVoiceOverlay();
    startListening();
    // Speak greeting
    const greetings = {
      en: "Voice mode activated. I'm listening.",
      fr: "Mode vocal activé. Je vous écoute.",
      es: "Modo de voz activado. Te escucho.",
      pt: "Modo de voz ativado. Estou ouvindo.",
    };
    setTimeout(() => speak(greetings[window.APP_LANG || 'en'] || greetings.en), 300);
  }

  function exitVoiceMode() {
    voiceMode = false;
    stopListening();
    if (synth) synth.cancel();
    clearTimeout(silenceTimer);
    transcript = '';
    isSpeaking = false;
    hideVoiceOverlay();
  }

  function toggleVoiceMode() {
    if (voiceMode) exitVoiceMode();
    else enterVoiceMode();
  }

  // ── UI ────────────────────────────────────────────────────────
  function showVoiceOverlay() {
    document.getElementById('voiceOverlay').style.display = 'flex';
    document.getElementById('voiceModeBtn').classList.add('active');
  }

  function hideVoiceOverlay() {
    document.getElementById('voiceOverlay').style.display = 'none';
    document.getElementById('voiceModeBtn').classList.remove('active');
  }

  function updateVoiceUI(state) {
    const orb     = document.getElementById('voiceOrb');
    const status  = document.getElementById('voiceStatus');
    const states  = {
      listening: { cls: 'listening', text: 'Listening…' },
      speaking:  { cls: 'speaking',  text: 'Serene is speaking…' },
      thinking:  { cls: 'thinking',  text: 'Thinking…' },
      idle:      { cls: '',          text: 'Tap the orb to speak' },
    };
    const s = states[state] || states.idle;
    if (orb) { orb.className = 'voice-orb ' + s.cls; }
    if (status) status.textContent = s.text;
  }

  function showVoiceError(msg) {
    const el = document.getElementById('voiceError');
    if (el) { el.textContent = msg; el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 4000); }
  }

  return { toggleVoiceMode, exitVoiceMode, speak, enterVoiceMode };
})();
