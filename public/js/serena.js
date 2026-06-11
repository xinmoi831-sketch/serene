// public/js/serena.js — Serena Emotion-Switching Character System

const Serena = (() => {

  // ── IMAGE MAPPING ─────────────────────────────────────────────────
  var IMAGES = {
    idle:      "/images/serena/serena-idle.png.jpg",
    happy:     "/images/serena/serena-happy.png.jpg",
    sad:       "/images/serena/serena-sad.png.jpg",
    concerned: "/images/serena/serena-concerned.png.jpg",
    waving:    "/images/serena/serena-waving.png.jpg",
    crisis:    "/images/serena/serena-crisis.png.jpg",
    listening: "/images/serena/serena-concerned.png.jpg",
    excited:   "/images/serena/serena-happy.png.jpg",
  };

  var currentEmotion = "idle";
  var isMinimized    = false;
  var containerId    = null;
  var speechTimeout  = null;

  // ── INIT ──────────────────────────────────────────────────────────
  function init(id, options) {
    containerId = id;
    options = options || {};

    var container = document.getElementById(id);
    if (!container) return;

    var size = options.size || 200;
    isMinimized = size < 120;

    container.style.position   = "relative";
    container.style.display    = "flex";
    container.style.flexDirection = "column";
    container.style.alignItems = "center";

    container.innerHTML =
      '<div style="position:relative;display:inline-block">' +
        '<img id="serenaImg" src="' + IMAGES.idle + '" ' +
          'style="width:' + size + 'px;height:' + size + 'px;object-fit:contain;' +
          'border-radius:' + (isMinimized ? "50%" : "20px") + ';' +
          'transition:all 0.4s ease;' +
          'filter:drop-shadow(0 4px 20px rgba(99,102,241,0.4));' +
          'cursor:pointer;" ' +
          'onclick="Serena.speak(\'Hi! I\'m here for you.\')" />' +
        '<div id="serenaGlow" style="position:absolute;inset:-4px;border-radius:' +
          (isMinimized ? "50%" : "24px") + ';' +
          'background:radial-gradient(circle,rgba(99,102,241,0.15),transparent 70%);' +
          'pointer-events:none;animation:serenaPulse 2s ease-in-out infinite"></div>' +
      '</div>' +
      '<div id="serenaBubble" style="display:none;position:absolute;' +
        (isMinimized ? "bottom:75px;right:0;" : "bottom:-60px;left:50%;transform:translateX(-50%);") +
        'background:#0d1428;border:0.5px solid rgba(99,102,241,0.4);' +
        'border-radius:12px;padding:8px 12px;font-size:12px;color:#f0f4ff;' +
        'max-width:180px;text-align:center;line-height:1.5;' +
        'box-shadow:0 4px 20px rgba(0,0,0,0.5);white-space:nowrap;z-index:200"></div>';

    // Add pulse animation if not already added
    if (!document.getElementById("serenaStyles")) {
      var style = document.createElement("style");
      style.id  = "serenaStyles";
      style.textContent =
        "@keyframes serenaPulse{0%,100%{opacity:0.6;transform:scale(1)}50%{opacity:1;transform:scale(1.05)}}" +
        "@keyframes serenaEntrance{from{opacity:0;transform:scale(0.8) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}" +
        "#serenaImg{animation:serenaEntrance 0.5s ease}";
      document.head.appendChild(style);
    }

    setEmotion(options.emotion || "idle", true);
  }

  // ── SET EMOTION ───────────────────────────────────────────────────
  function setEmotion(emotion, instant) {
    if (!IMAGES[emotion]) emotion = "idle";
    if (emotion === currentEmotion && !instant) return;
    currentEmotion = emotion;

    var img = document.getElementById("serenaImg");
    if (!img) return;

    if (instant) {
      img.src = IMAGES[emotion];
    } else {
      // Smooth fade transition
      img.style.opacity = "0";
      img.style.transform = "scale(0.95)";
      setTimeout(function() {
        img.src = IMAGES[emotion];
        img.style.opacity = "1";
        img.style.transform = "scale(1)";
      }, 200);
    }

    // Update glow color based on emotion
    var glow = document.getElementById("serenaGlow");
    if (glow) {
      var glowColors = {
        idle:      "rgba(99,102,241,0.15)",
        happy:     "rgba(74,222,128,0.2)",
        excited:   "rgba(74,222,128,0.25)",
        sad:       "rgba(148,163,184,0.15)",
        concerned: "rgba(245,158,11,0.2)",
        listening: "rgba(99,102,241,0.15)",
        crisis:    "rgba(244,63,94,0.2)",
        waving:    "rgba(74,222,128,0.2)",
      };
      var color = glowColors[emotion] || glowColors.idle;
      glow.style.background = "radial-gradient(circle," + color + ",transparent 70%)";
    }
  }

  // ── SPEAK ─────────────────────────────────────────────────────────
  function speak(text, duration) {
    duration = duration || 3000;
    var bubble = document.getElementById("serenaBubble");
    if (!bubble) return;

    if (speechTimeout) clearTimeout(speechTimeout);
    bubble.textContent   = text;
    bubble.style.display = "block";
    bubble.style.opacity = "1";
    bubble.style.whiteSpace = text.length > 30 ? "normal" : "nowrap";

    speechTimeout = setTimeout(function() {
      bubble.style.transition = "opacity 0.4s";
      bubble.style.opacity    = "0";
      setTimeout(function(){ bubble.style.display = "none"; }, 400);
    }, duration);
  }

  // ── DETECT EMOTION FROM TEXT ──────────────────────────────────────
  function detectEmotionFromText(text) {
    text = (text || "").toLowerCase();

    if (/suicid|kill myself|end it|want to die|can't go on|no point|give up|hopeless|worthless|hurt myself|self.harm/i.test(text)) {
      return "crisis";
    }
    if (/sad|cry|depress|lonely|alone|hurt|pain|miserable|unhappy|empty|numb|broken|lost/i.test(text)) {
      return "sad";
    }
    if (/happy|great|amazing|wonderful|excited|love it|fantastic|joyful|better|good news|grateful|thankful/i.test(text)) {
      return "happy";
    }
    if (/wow|yes|celebrate|achieved|success|proud|incredible|awesome|unbelievable/i.test(text)) {
      return "excited";
    }
    if (/worried|anxious|scared|nervous|afraid|stress|overwhelm|panic|fear|uneasy/i.test(text)) {
      return "concerned";
    }
    if (text.length > 10) {
      return "listening";
    }
    return "idle";
  }

  // ── REACT TO USER MESSAGE ─────────────────────────────────────────
  function reactToMessage(text) {
    var emotion = detectEmotionFromText(text);
    setEmotion(emotion);

    var responses = {
      crisis:    "I'm right here. You're not alone. 💙",
      sad:       "I hear you. It's okay to feel this way.",
      happy:     "That's wonderful! I'm so glad! 😊",
      excited:   "Amazing! You should be so proud!",
      concerned: "Let's work through this together.",
      listening: "I'm listening. Go on...",
      idle:      "",
    };

    var msg = responses[emotion];
    if (msg) speak(msg, 3000);

    // Return to idle after 4 seconds
    setTimeout(function() {
      if (currentEmotion !== "crisis") setEmotion("idle");
    }, 4000);
  }

  // ── MINIMIZE / EXPAND ─────────────────────────────────────────────
  function minimize() {
    isMinimized = true;
    var img = document.getElementById("serenaImg");
    if (img) {
      img.style.width        = "65px";
      img.style.height       = "65px";
      img.style.borderRadius = "50%";
    }
  }

  function expand() {
    isMinimized = false;
    var img = document.getElementById("serenaImg");
    if (img) {
      img.style.width        = "200px";
      img.style.height       = "200px";
      img.style.borderRadius = "20px";
    }
  }

  // ── PLAY WAVE ─────────────────────────────────────────────────────
  function playWave() {
    setEmotion("waving");
    speak("Hi there! I'm Serena 👋", 3000);
    setTimeout(function(){ setEmotion("idle"); }, 3500);
  }

  // ── PUBLIC API ────────────────────────────────────────────────────
  return { init, setEmotion, detectEmotionFromText, reactToMessage, minimize, expand, speak, playWave };

})();
