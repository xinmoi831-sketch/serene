// Serene — Voice Interaction System (Final Rebuild)
// Flow: Listen → Transcribe → Send to AI → Speak once → Stop
// NEVER talks to itself. NEVER loops. ONLY responds to user input.

const VoiceSystem = (() => {

  // ── STATE MACHINE ─────────────────────────────────────────────────
  // Four states: idle | listening | processing | speaking
  let state        = 'idle';
  let recognition  = null;
  let synth        = window.speechSynthesis;
  let bestVoice    = null;
  let transcript   = '';
  let silenceTimer = null;
  const SILENCE_MS = 2000; // 2s silence = user done speaking

  // ── VOICE SELECTION ───────────────────────────────────────────────
  const PREFERRED_VOICES = [
    'Google UK English Female',
    'Google US English Female',
    'Microsoft Aria Online (Natural)',
    'Microsoft Jenny Online (Natural)',
    'Samantha', 'Karen', 'Moira',
    'Google US English',
  ];

  function pickVoice() {
    const voices = synth.getVoices();
    for (const name of PREFERRED_VOICES) {
      const v = voices.find(v => v.name === name);
      if (v) return v;
    }
    return voices.find(v => v.lang && v.lang.startsWith('en')) || null;
  }

  if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = () => { bestVoice = pickVoice(); };
  }
  setTimeout(() => { bestVoice = pickVoice(); }, 600);

  // ── STATE MANAGER ─────────────────────────────────────────────────
  function setState(newState) {
    state = newState;
    var orb    = document.getElementById('voiceOrb');
    var status = document.getElementById('voiceStatus');
    var live   = document.getElementById('voiceLiveText');
    var labels = {
      idle:       { cls: '',          text: 'Tap the orb to speak' },
      listening:  { cls: 'listening', text: 'Listening… speak now' },
      processing: { cls: 'thinking',  text: 'Serene is thinking…' },
      speaking:   { cls: 'speaking',  text: 'Serene is speaking…' },
    };
    var s = labels[newState] || labels.idle;
    if (orb)    orb.className      = 'voice-orb ' + s.cls;
    if (status) status.textContent = s.text;
    if (live && newState !== 'listening') live.textContent = '';
  }

  // ── SPEAK ─────────────────────────────────────────────────────────
  // Speaks text ONCE. When done, goes to IDLE.
  // NEVER restarts listening automatically.
  // NEVER generates new content.
  function speak(text, onDone) {
    if (!synth) { if (onDone) onDone(); return; }
    synth.cancel();

    var clean = text
      .replace(/<[^>]+>/g, '')
      .replace(/[*_#`~]/g, '')
      .replace(/\n+/g, '. ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!clean) { setState('idle'); if (onDone) onDone(); return; }
    if (!bestVoice) bestVoice = pickVoice();

    // Split into sentences to prevent Chrome 15s cutoff bug
    var sentences = clean.match(/[^.!?]+[.!?]*/g) || [clean];
    var idx = 0;

    setState('speaking');

    function next() {
      if (idx >= sentences.length) {
        // Finished all sentences — go IDLE, wait for user
        setState('idle');
        if (onDone) onDone();
        return;
      }
      var u    = new SpeechSynthesisUtterance(sentences[idx].trim());
      u.voice  = bestVoice;
      u.lang   = 'en-US';
      u.rate   = 0.88;
      u.pitch  = 1.05;
      u.volume = 1.0;
      u.onend  = function() { idx++; next(); };
      u.onerror = function(e) {
        if (e.error !== 'interrupted') { idx++; next(); }
      };
      synth.speak(u);
    }

    next();
  }

  function stopSpeaking() {
    synth.cancel();
    setState('idle');
  }

  // ── SPEECH RECOGNITION ────────────────────────────────────────────
  function buildRecognition() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;

    var r           = new SR();
    r.continuous    = true;
    r.interimResults = true;
    r.lang          = 'en-US';

    r.onstart = function() { setState('listening'); };

    r.onresult = function(e) {
      var final   = '';
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }

      var live = document.getElementById('voiceLiveText');
      if (live) live.textContent = final || interim;

      if (final) {
        transcript += ' ' + final;
        clearTimeout(silenceTimer);
        silenceTimer = setTimeout(function() {
          var msg = transcript.trim();
          transcript = '';
          if (msg && msg.length > 1) {
            stopListening();
            sendVoiceMessage(msg);
          }
        }, SILENCE_MS);
      }
    };

    r.onerror = function(e) {
      if (e.error === 'no-speech') return;
      if (e.error === 'not-allowed') {
        showError('Microphone access denied. Please allow it in browser settings.');
        exitVoiceMode();
        return;
      }
    };

    r.onend = function() {
      // Only auto-restart if still in listening state
      // Do NOT restart if processing or speaking
      if (state === 'listening') {
        try { r.start(); } catch(e) {}
      }
    };

    return r;
  }

  function startListening() {
    if (state === 'processing' || state === 'speaking') return;
    if (!recognition) recognition = buildRecognition();
    if (!recognition) { showError('Voice requires Chrome or Edge.'); return; }
    transcript = '';
    try { recognition.start(); } catch(e) {}
  }

  function stopListening() {
    clearTimeout(silenceTimer);
    if (recognition) {
      try { recognition.stop(); } catch(e) {}
    }
  }

  // ── SEND TO AI ────────────────────────────────────────────────────
  // ONLY called after user finishes speaking.
  // NEVER called automatically.
  async function sendVoiceMessage(text) {
    setState('processing');

    var input = document.getElementById('chatInput');
    if (input) input.value = text;

    var area        = document.getElementById('chatMessages');
    var countBefore = area ? area.querySelectorAll('.msg.ai').length : 0;

    // Use existing sendMessage from app.js
    if (typeof sendMessage === 'function') {
      await sendMessage();
    }

    // Wait for AI response in DOM then speak it ONCE
    var attempts = 0;
    var check = setInterval(function() {
      attempts++;
      var aiMsgs = area ? area.querySelectorAll('.msg.ai') : [];
      if (aiMsgs.length > countBefore) {
        clearInterval(check);
        var latest  = aiMsgs[aiMsgs.length - 1];
        var bubble  = latest.querySelector('.bubble');
        var replyText = bubble ? (bubble.innerText || bubble.textContent || '').trim() : '';
        if (replyText) {
          speak(replyText, function() {
            // After speaking — go IDLE
            // User must tap orb again to continue
            setState('idle');
          });
        } else {
          setState('idle');
        }
      }
      if (attempts > 80) { clearInterval(check); setState('idle'); }
    }, 100);
  }

  // ── ENTER / EXIT ──────────────────────────────────────────────────
  function enterVoiceMode() {
    var overlay = document.getElementById('voiceOverlay');
    if (overlay) overlay.style.display = 'flex';
    var btn = document.getElementById('voiceModeBtn');
    if (btn) btn.classList.add('active');

    // Say greeting ONCE then start listening — wait for user
    speak("I am listening. Take your time.", function() {
      startListening();
    });
  }

  function exitVoiceMode() {
    stopListening();
    stopSpeaking();
    clearTimeout(silenceTimer);
    transcript = '';
    var overlay = document.getElementById('voiceOverlay');
    if (overlay) overlay.style.display = 'none';
    var btn = document.getElementById('voiceModeBtn');
    if (btn) btn.classList.remove('active');
    setState('idle');
  }

  function toggleVoiceMode() {
    var overlay = document.getElementById('voiceOverlay');
    var isOpen  = overlay && overlay.style.display === 'flex';
    if (isOpen) exitVoiceMode();
    else enterVoiceMode();
  }

  // Tapping the orb:
  // idle      → start listening
  // listening → force send what was captured
  // speaking  → stop speaking
  function orbTapped() {
    if (state === 'speaking') {
      stopSpeaking();
    } else if (state === 'listening') {
      clearTimeout(silenceTimer);
      var msg = transcript.trim();
      transcript = '';
      if (msg) { stopListening(); sendVoiceMessage(msg); }
    } else if (state === 'idle') {
      startListening();
    }
  }

  function showError(msg) {
    var el = document.getElementById('voiceError');
    if (el) {
      el.textContent   = msg;
      el.style.display = 'block';
      setTimeout(function() { el.style.display = 'none'; }, 5000);
    }
  }

  return { toggleVoiceMode, exitVoiceMode, orbTapped, speak };
})();
