// Serene — Voice Conversation Mode (Improved)
const Voice = (() => {
  const synth = window.speechSynthesis;
  let recognition  = null;
  let isListening  = false;
  let isSpeaking   = false;
  let voiceMode    = false;
  let silenceTimer = null;
  let transcript   = '';
  let bestVoice    = null;
  let voicesLoaded = false;

  // ── VOICE SELECTION ───────────────────────────────────────────────
  // Priority list — these sound most natural in Chrome/Edge
  const PREFERRED_VOICES = [
    'Google UK English Female',
    'Google US English Female',
    'Microsoft Aria Online (Natural)',
    'Microsoft Jenny Online (Natural)',
    'Microsoft Natasha Online (Natural)',
    'Samantha',
    'Karen',
    'Moira',
    'Google UK English Male',
    'Google US English',
  ];

  function pickBestVoice() {
    const voices = synth.getVoices();
    if (!voices || voices.length === 0) return null;

    // Try preferred voices in order
    for (const name of PREFERRED_VOICES) {
      const found = voices.find(v => v.name === name);
      if (found) return found;
    }

    // Fallback — prefer online/natural voices over local ones
    const online = voices.filter(v =>
      v.lang.startsWith('en') &&
      (v.name.toLowerCase().includes('online') ||
       v.name.toLowerCase().includes('natural') ||
       v.name.toLowerCase().includes('google') ||
       v.name.toLowerCase().includes('microsoft'))
    );
    if (online.length > 0) return online[0];

    // Last fallback — any English voice
    return voices.find(v => v.lang.startsWith('en')) || voices[0];
  }

  function loadVoices() {
    if (voicesLoaded) return;
    const voices = synth.getVoices();
    if (voices.length > 0) {
      bestVoice   = pickBestVoice();
      voicesLoaded = true;
    }
  }

  // Voices load asynchronously in some browsers
  if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = () => {
      bestVoice    = pickBestVoice();
      voicesLoaded = true;
    };
  }
  setTimeout(loadVoices, 500);

  // ── SPEECH RECOGNITION ────────────────────────────────────────────
  function setupRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;

    const r        = new SR();
    r.continuous   = true;
    r.interimResults = true;
    r.lang         = 'en-US';
    r.maxAlternatives = 1;

    r.onstart = () => {
      isListening = true;
      updateUI('listening');
    };

    r.onresult = (e) => {
      let final = '';
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += text;
        else interim += text;
      }

      const liveEl = document.getElementById('voiceLiveText');
      if (liveEl) liveEl.textContent = final || interim;

      if (final) {
        transcript += final;
        clearTimeout(silenceTimer);
        // Send after 1.8s of silence — feels natural
        silenceTimer = setTimeout(() => {
          const msg = transcript.trim();
          transcript = '';
          if (liveEl) liveEl.textContent = '';
          if (msg && msg.length > 1) {
            stopListening();
            handleVoiceMessage(msg);
          }
        }, 1800);
      }
    };

    r.onerror = (e) => {
      if (e.error === 'no-speech') return;
      if (e.error === 'not-allowed') {
        showError('Microphone access denied. Please allow microphone in your browser settings.');
        exitVoiceMode();
        return;
      }
      console.warn('Speech recognition error:', e.error);
    };

    r.onend = () => {
      isListening = false;
      // Restart if still in voice mode and not speaking
      if (voiceMode && !isSpeaking) {
        setTimeout(() => {
          if (voiceMode && !isSpeaking) startListening();
        }, 400);
      }
    };

    return r;
  }

  function startListening() {
    if (!recognition) recognition = setupRecognition();
    if (!recognition) {
      showError('Speech recognition requires Chrome or Edge browser.');
      return;
    }
    if (isListening) return;
    try {
      recognition.start();
    } catch(e) {
      console.warn('Recognition start error:', e.message);
    }
  }

  function stopListening() {
    clearTimeout(silenceTimer);
    if (recognition && isListening) {
      try { recognition.stop(); } catch(e) {}
    }
    isListening = false;
  }

  // ── IMPROVED TTS ──────────────────────────────────────────────────
  function speak(text) {
    if (!synth) return;

    // Cancel any current speech
    synth.cancel();

    // Clean text for natural speech
    const clean = text
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
      .replace(/[*_#`~]/g, '')
      .replace(/\n+/g, '. ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!clean) return;

    // Load voices if not yet loaded
    if (!voicesLoaded) bestVoice = pickBestVoice();

    const u       = new SpeechSynthesisUtterance(clean);
    u.voice       = bestVoice;
    u.lang        = 'en-US';
    u.rate        = 0.88;   // Slightly slower = more natural, less robotic
    u.pitch       = 1.05;   // Very slightly higher = warmer tone
    u.volume      = 1.0;

    u.onstart = () => {
      isSpeaking = true;
      stopListening();
      updateUI('speaking');
    };

    u.onend = () => {
      isSpeaking = false;
      if (voiceMode) {
        updateUI('listening');
        setTimeout(startListening, 600);
      } else {
        updateUI('idle');
      }
    };

    u.onerror = (e) => {
      if (e.error === 'interrupted') return;
      isSpeaking = false;
      if (voiceMode) startListening();
    };

    // Chrome bug fix — long utterances get cut off
    // Break into sentences and queue them
    const sentences = splitSentences(clean);
    if (sentences.length <= 1) {
      synth.speak(u);
    } else {
      speakSentences(sentences, 0);
    }
  }

  function splitSentences(text) {
    // Split on sentence boundaries
    return text.match(/[^.!?]+[.!?]+/g) || [text];
  }

  function speakSentences(sentences, index) {
    if (index >= sentences.length || !voiceMode) {
      isSpeaking = false;
      if (voiceMode) { updateUI('listening'); setTimeout(startListening, 600); }
      else updateUI('idle');
      return;
    }

    const u   = new SpeechSynthesisUtterance(sentences[index].trim());
    u.voice   = bestVoice;
    u.lang    = 'en-US';
    u.rate    = 0.88;
    u.pitch   = 1.05;
    u.volume  = 1.0;

    u.onstart = () => {
      if (index === 0) { isSpeaking = true; updateUI('speaking'); }
    };

    u.onend = () => {
      speakSentences(sentences, index + 1);
    };

    u.onerror = (e) => {
      if (e.error !== 'interrupted') speakSentences(sentences, index + 1);
    };

    synth.speak(u);
  }

  // ── MESSAGE HANDLING ──────────────────────────────────────────────
  async function handleVoiceMessage(text) {
    updateUI('thinking');

    // Put text in chat input and trigger send
    const input = document.getElementById('chatInput');
    if (input) input.value = text;

    // Watch for AI response then speak it
    const area = document.getElementById('chatMessages');
    if (!area) return;

    const messageCount = area.querySelectorAll('.msg.ai').length;

    await sendMessage();

    // Wait for new AI message to appear
    let attempts = 0;
    const checkReply = setInterval(() => {
      attempts++;
      const aiMessages = area.querySelectorAll('.msg.ai');
      if (aiMessages.length > messageCount) {
        clearInterval(checkReply);
        const latest = aiMessages[aiMessages.length - 1];
        const bubble = latest.querySelector('.bubble');
        if (bubble) {
          setTimeout(() => speak(bubble.innerText || bubble.textContent), 200);
        }
      }
      if (attempts > 60) clearInterval(checkReply); // 6s timeout
    }, 100);
  }

  // ── ENTER / EXIT ──────────────────────────────────────────────────
  function enterVoiceMode() {
    voiceMode  = true;
    transcript = '';
    document.getElementById('voiceOverlay').style.display = 'flex';
    document.getElementById('voiceModeBtn')?.classList.add('active');
    startListening();
    // Warm greeting
    setTimeout(() => speak("Voice mode activated. I am listening. Go ahead and speak."), 500);
  }

  function exitVoiceMode() {
    voiceMode = false;
    stopListening();
    synth?.cancel();
    clearTimeout(silenceTimer);
    isSpeaking = false;
    transcript = '';
    document.getElementById('voiceOverlay').style.display = 'none';
    document.getElementById('voiceModeBtn')?.classList.remove('active');
    updateUI('idle');
  }

  function toggleVoiceMode() {
    if (voiceMode) exitVoiceMode();
    else enterVoiceMode();
  }

  // ── UI ────────────────────────────────────────────────────────────
  function updateUI(state) {
    const orb    = document.getElementById('voiceOrb');
    const status = document.getElementById('voiceStatus');
    const states = {
      listening: { cls:'listening', text:'Listening…' },
      speaking:  { cls:'speaking',  text:'Serene is speaking…' },
      thinking:  { cls:'thinking',  text:'Thinking…' },
      idle:      { cls:'',          text:'Tap the orb to speak' },
    };
    const s = states[state] || states.idle;
    if (orb)    orb.className    = 'voice-orb ' + s.cls;
    if (status) status.textContent = s.text;
  }

  function showError(msg) {
    const el = document.getElementById('voiceError');
    if (el) {
      el.textContent    = msg;
      el.style.display  = 'block';
      setTimeout(() => el.style.display = 'none', 5000);
    }
  }

  return { toggleVoiceMode, exitVoiceMode, speak, enterVoiceMode };
})();
