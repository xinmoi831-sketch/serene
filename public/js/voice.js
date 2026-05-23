// Serene — Voice System v5 (Production State Machine)
// States: IDLE → LISTENING → PROCESSING → SPEAKING → LISTENING (loop)
// Clean lifecycle: every start has a matching stop
// No stuck states: timeouts on every async operation
// Cancel works instantly, no refresh ever needed

const VoiceSystem = (() => {

  // ── CONSTANTS ─────────────────────────────────────────────────────
  const SILENCE_MS     = 2000;   // silence before sending
  const PROCESS_TIMEOUT = 30000; // max wait for AI response
  const SPEAK_TIMEOUT  = 60000;  // max speaking time before force-stop

  // ── STATE ─────────────────────────────────────────────────────────
  let currentState  = 'IDLE';
  let isActive      = false;   // true when voice mode overlay is open

  // Resources — each tracked so they can be cleaned up
  let recognition   = null;
  let mediaStream   = null;
  let silenceTimer  = null;
  let processTimer  = null;
  let speakTimer    = null;
  let transcript    = '';
  let bestVoice     = null;
  const synth       = window.speechSynthesis;

  // ── STATE MACHINE ─────────────────────────────────────────────────
  // Only ONE state at a time. All transitions go through here.
  function transition(newState) {
    console.log('[Voice STATE] ' + currentState + ' → ' + newState + ' | isActive=' + isActive);
    currentState = newState;
    updateUI(newState);
  }

  // ── UI ────────────────────────────────────────────────────────────
  function updateUI(s) {
    var orb    = document.getElementById('voiceOrb');
    var status = document.getElementById('voiceStatus');
    var live   = document.getElementById('voiceLiveText');
    var map = {
      IDLE:       { cls: '',          label: 'Tap orb to speak' },
      LISTENING:  { cls: 'listening', label: 'Listening…' },
      PROCESSING: { cls: 'thinking',  label: 'Thinking…' },
      SPEAKING:   { cls: 'speaking',  label: 'Speaking…' },
    };
    var ui = map[s] || map.IDLE;
    if (orb)    orb.className      = 'voice-orb ' + ui.cls;
    if (status) status.textContent = ui.label;
    if (live && s !== 'LISTENING') live.textContent = '';
  }

  // ── VOICE SELECTION ───────────────────────────────────────────────
  const PREFERRED = [
    'Google UK English Female', 'Google US English Female',
    'Microsoft Aria Online (Natural)', 'Microsoft Jenny Online (Natural)',
    'Samantha', 'Karen', 'Moira', 'Google US English',
  ];

  function pickVoice() {
    var voices = synth.getVoices();
    for (var i = 0; i < PREFERRED.length; i++) {
      var v = voices.find(function(v) { return v.name === PREFERRED[i]; });
      if (v) return v;
    }
    return voices.find(function(v) { return v.lang && v.lang.startsWith('en'); }) || null;
  }

  if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = function() { bestVoice = pickVoice(); };
  }
  setTimeout(function() { bestVoice = pickVoice(); }, 500);

  // ── ACTIVATION BEEP ───────────────────────────────────────────────
  function playBeep() {
    try {
      var ctx  = new (window.AudioContext || window.webkitAudioContext)();
      var osc  = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } catch(e) {}
  }

  // ── MIC STREAM ────────────────────────────────────────────────────
  async function startMicStream() {
    console.log('[Voice MIC] Requesting microphone...');
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('[Voice MIC] Granted OK');
      return true;
    } catch(e) {
      console.error('[Voice MIC] DENIED:', e.message);
      showError('Microphone permission denied. Please allow microphone access.');
      return false;
    }
  }

  function stopMicStream() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(function(t) { t.stop(); });
      mediaStream = null;
    }
  }

  // ── SPEECH RECOGNITION ────────────────────────────────────────────
  function buildRecognition() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    var r = new SR();
    r.continuous     = true;
    r.interimResults = true;
    r.lang           = 'en-US';

    r.onresult = function(e) {
      console.log('[Voice RESULT] Got result, state=' + currentState);
      if (currentState !== 'LISTENING') return;
      var final = '', interim = '';
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
          if (msg && msg.length > 1) stopListeningAndProcess(msg);
        }, SILENCE_MS);
      }
    };

    r.onerror = function(e) {
      if (e.error === 'no-speech') return;
      if (e.error === 'not-allowed') { showError('Microphone access denied.'); exitVoiceMode(); return; }
      if (e.error === 'aborted') return; // normal on stop
      console.warn('[Voice] Recognition error:', e.error);
    };

    var lastRestart = 0;
    r.onend = function() {
      console.log('[Voice RECO] onend fired. state=' + currentState + ' isActive=' + isActive);
      if (currentState !== 'LISTENING' || !isActive) return;
      var now = Date.now();
      var gap = now - lastRestart;
      if (gap < 1000) {
        console.warn('[Voice RECO] Throttled (' + gap + 'ms) - waiting 1s');
        setTimeout(function() {
          if (currentState === 'LISTENING' && isActive) {
            lastRestart = Date.now();
            try { recognition.start(); } catch(e) {}
          }
        }, 1000);
        return;
      }
      lastRestart = now;
      console.log('[Voice RECO] Restarting recognition');
      try { recognition.start(); } catch(e) { console.error('[Voice RECO] Restart failed:', e.message); }
    };

    return r;
  }

  function startListening() {
    console.log('[Voice LISTEN] startListening called. isActive=' + isActive + ' state=' + currentState);
    if (!isActive) { console.warn('[Voice LISTEN] Aborted - not active'); return; }
    transition('LISTENING');
    transcript = '';
    if (!recognition) {
      console.log('[Voice LISTEN] Building new recognition instance');
      recognition = buildRecognition();
    }
    if (!recognition) { showError('Voice requires Chrome or Edge.'); return; }
    try {
      recognition.start();
      console.log('[Voice LISTEN] recognition.start() called OK');
    } catch(e) {
      console.error('[Voice LISTEN] recognition.start() FAILED:', e.message);
    }
  }

  function stopListening() {
    clearTimeout(silenceTimer);
    if (recognition) {
      try { recognition.stop(); } catch(e) {}
    }
  }

  // ── STOP LISTENING → PROCESS ──────────────────────────────────────
  function stopListeningAndProcess(msg) {
    stopListening();
    processMessage(msg);
  }

  // ── AI PROCESSING ─────────────────────────────────────────────────
  async function processMessage(text) {
    if (!isActive) return;
    transition('PROCESSING');

    // Safety timeout — if AI never responds, go back to listening
    processTimer = setTimeout(function() {
      console.warn('[Voice] Processing timeout — returning to listening');
      if (isActive) startListening();
    }, PROCESS_TIMEOUT);

    // Put text in input and trigger send
    var input = document.getElementById('chatInput');
    if (input) input.value = text;

    var area        = document.getElementById('chatMessages');
    var countBefore = area ? area.querySelectorAll('.msg.ai').length : 0;

    console.log('[Voice PROCESS] Sending message to AI. countBefore=' + countBefore);
    if (typeof sendMessage === 'function') await sendMessage();
    console.log('[Voice PROCESS] sendMessage done, polling for AI reply...');

    // Wait for AI reply in DOM
    var attempts = 0;
    var poll = setInterval(function() {
      if (!isActive) { clearInterval(poll); clearTimeout(processTimer); return; }
      attempts++;
      var aiMsgs = area ? area.querySelectorAll('.msg.ai') : [];
      console.log('[Voice POLL] attempt=' + attempts + ' aiMsgs=' + aiMsgs.length + ' countBefore=' + countBefore);
      if (aiMsgs.length > countBefore) {
        clearInterval(poll);
        clearTimeout(processTimer);
        var latest   = aiMsgs[aiMsgs.length - 1];
        // Try multiple selectors for the bubble text
        var bubble   = latest.querySelector('.bubble') ||
                       latest.querySelector('.msg-bubble') ||
                       latest.querySelector('.msg-content') ||
                       latest;
        var replyTxt = (bubble.innerText || bubble.textContent || '').trim();
        // Remove "Serene" sender label from text
        replyTxt = replyTxt.replace(/^Serene\s*/i, '').trim();
        console.log('[Voice POLL] Got reply, length=' + replyTxt.length + ' text=' + replyTxt.slice(0,50));
        if (replyTxt) speakResponse(replyTxt);
        else { console.warn('[Voice POLL] Empty reply — returning to listening'); startListening(); }
      }
      if (attempts > 100) {
        clearInterval(poll);
        clearTimeout(processTimer);
        console.warn('[Voice POLL] Timeout after 100 attempts');
        if (isActive) startListening();
      }
    }, 150);
  }

  // ── SPEAK RESPONSE ────────────────────────────────────────────────
  function speakResponse(text) {
    console.log('[Voice SPEAK] speakResponse called. isActive=' + isActive + ' text length=' + text.length);
    if (!isActive) { console.warn('[Voice SPEAK] Aborted - not active'); return; }
    transition('SPEAKING');
    synth.cancel();

    var clean = text.replace(/<[^>]+>/g,'').replace(/[*_#`~]/g,'').replace(/\n+/g,'. ').replace(/\s+/g,' ').trim();
    if (!clean) { startListening(); return; }
    if (!bestVoice) bestVoice = pickVoice();

    var sentences = clean.match(/[^.!?]+[.!?]*/g) || [clean];
    var idx = 0;

    // Safety timeout — if speaking gets stuck, force return to listening
    speakTimer = setTimeout(function() {
      console.warn('[Voice] Speaking timeout — forcing return to listening');
      synth.cancel();
      if (isActive) startListening();
    }, SPEAK_TIMEOUT);

    function speakNext() {
      if (!isActive) { synth.cancel(); clearTimeout(speakTimer); return; }
      if (idx >= sentences.length) {
        console.log('[Voice SPEAK] All sentences done — returning to LISTENING');
        clearTimeout(speakTimer);
        startListening();
        return;
      }
      var u = new SpeechSynthesisUtterance(sentences[idx].trim());
      u.voice  = bestVoice;
      u.lang   = 'en-US';
      u.rate   = 0.88;
      u.pitch  = 1.05;
      u.volume = 1.0;
      u.onend  = function() { idx++; speakNext(); };
      u.onerror = function(e) {
        if (e.error !== 'interrupted') { idx++; speakNext(); }
      };
      synth.speak(u);
    }
    speakNext();
  }

  function stopSpeaking() {
    clearTimeout(speakTimer);
    synth.cancel();
  }

  // ── ENTER VOICE MODE ──────────────────────────────────────────────
  async function enterVoiceMode() {
    console.log('[Voice ENTER] enterVoiceMode called. isActive=' + isActive);
    if (isActive) { console.warn('[Voice ENTER] Already active - ignoring'); return; }
    isActive = true;

    var overlay = document.getElementById('voiceOverlay');
    if (overlay) overlay.style.display = 'flex';
    var btn = document.getElementById('voiceModeBtn');
    if (btn) btn.classList.add('active');

    // Request mic permission first
    var granted = await startMicStream();
    if (!granted) { isActive = false; return; }

    playBeep();
    setTimeout(startListening, 200);
  }

  // ── EXIT VOICE MODE ───────────────────────────────────────────────
  // Guaranteed clean exit — no refresh ever needed
  function exitVoiceMode() {
    console.log('[Voice EXIT] exitVoiceMode called. currentState=' + currentState);
    isActive = false;

    // Stop everything immediately
    clearTimeout(silenceTimer);
    clearTimeout(processTimer);
    clearTimeout(speakTimer);
    stopListening();
    stopSpeaking();
    stopMicStream();

    // Destroy recognition so it can be rebuilt cleanly next time
    recognition = null;
    transcript  = '';

    // Reset state
    transition('IDLE');

    // Hide overlay
    var overlay = document.getElementById('voiceOverlay');
    if (overlay) overlay.style.display = 'none';
    var btn = document.getElementById('voiceModeBtn');
    if (btn) btn.classList.remove('active');

    console.log('[Voice EXIT] Exited cleanly. State=' + currentState + '. Ready for next session.');
  }

  // ── PUBLIC ────────────────────────────────────────────────────────
  function toggleVoiceMode() {
    if (isActive) exitVoiceMode();
    else enterVoiceMode();
  }

  // Orb tap behavior
  function orbTapped() {
    if (!isActive) return;
    if (currentState === 'SPEAKING') {
      // Stop speaking, go back to listening
      stopSpeaking();
      startListening();
    } else if (currentState === 'LISTENING') {
      // Force send immediately
      clearTimeout(silenceTimer);
      var msg = transcript.trim();
      transcript = '';
      if (msg) stopListeningAndProcess(msg);
    }
  }

  function showError(msg) {
    var el = document.getElementById('voiceError');
    if (el) {
      el.textContent   = msg;
      el.style.display = 'block';
      setTimeout(function() { el.style.display = 'none'; }, 5000);
    }
    console.error('[Voice]', msg);
  }

  return { toggleVoiceMode, exitVoiceMode, orbTapped };
})();

// Backward compatibility alias — supports old cached HTML calling Voice.xxx
var Voice = VoiceSystem;
