// Serene — Dynamic Emotion Tracker
const EmotionTracker = (() => {
  // Emotion states from worst to best
  const STATES = [
    { id: 'crisis',    emoji: '🆘', label: 'In crisis',    color: '#f43f5e', score: 0  },
    { id: 'devastated',emoji: '😭', label: 'Devastated',   color: '#f43f5e', score: 1  },
    { id: 'very_low',  emoji: '😞', label: 'Very low',     color: '#f97316', score: 2  },
    { id: 'low',       emoji: '😔', label: 'Low',          color: '#f59e0b', score: 3  },
    { id: 'anxious',   emoji: '😰', label: 'Anxious',      color: '#eab308', score: 4  },
    { id: 'worried',   emoji: '😟', label: 'Worried',      color: '#84cc16', score: 5  },
    { id: 'neutral',   emoji: '😐', label: 'Neutral',      color: '#8b9dc3', score: 6  },
    { id: 'okay',      emoji: '🙂', label: 'Okay',         color: '#22d3ee', score: 7  },
    { id: 'calm',      emoji: '😌', label: 'Calm',         color: '#34d399', score: 8  },
    { id: 'good',      emoji: '😊', label: 'Good',         color: '#10b981', score: 9  },
    { id: 'great',     emoji: '😄', label: 'Great',        color: '#6366f1', score: 10 },
  ];

  // Keyword analysis for tone detection
  const NEGATIVE_STRONG = [
    'suicide','kill myself','end my life','want to die','no reason to live',
    'self-harm','hurt myself','cant go on','can\'t go on','give up'
  ];
  const NEGATIVE_MED = [
    'depressed','hopeless','worthless','exhausted','broken','devastated',
    'terrible','awful','horrible','miserable','crying','despair','trapped',
    'alone','empty','numb','scared','terrified','panic'
  ];
  const NEGATIVE_MILD = [
    'sad','unhappy','tired','stress','anxious','worried','nervous','frustrated',
    'upset','confused','lost','overwhelmed','difficult','hard','struggle','bad',
    'cant sleep','can\'t sleep','insomnia','headache','pain'
  ];
  const POSITIVE_MILD = [
    'okay','fine','better','trying','hope','maybe','alright','managing','coping'
  ];
  const POSITIVE_MED = [
    'good','happy','grateful','thankful','calm','relaxed','improving','progress',
    'feeling better','helped','thank you','thanks','appreciate','relief'
  ];
  const POSITIVE_STRONG = [
    'great','amazing','wonderful','fantastic','excellent','joy','excited',
    'love','blessed','healed','recovered','thriving','proud','accomplished'
  ];

  let currentScore = 6; // Start neutral
  let scoreHistory = [];
  let emotionEl = null;

  function analyzeText(text) {
    const lower = text.toLowerCase();
    let delta = 0;

    if (NEGATIVE_STRONG.some(w => lower.includes(w))) delta = -4;
    else if (NEGATIVE_MED.some(w => lower.includes(w)))   delta = -2;
    else if (NEGATIVE_MILD.some(w => lower.includes(w)))  delta = -1;
    else if (POSITIVE_STRONG.some(w => lower.includes(w))) delta = +3;
    else if (POSITIVE_MED.some(w => lower.includes(w)))    delta = +2;
    else if (POSITIVE_MILD.some(w => lower.includes(w)))   delta = +1;

    // Gradual recovery — score never drops below 0 or above 10
    const newScore = Math.max(0, Math.min(10, currentScore + delta));
    // Smooth recovery: nudge toward 6 (neutral) if no strong signal
    if (delta === 0 && currentScore < 6) currentScore = Math.min(6, currentScore + 0.3);

    return newScore;
  }

  function getState(score) {
    return STATES.reduce((prev, curr) =>
      Math.abs(curr.score - score) < Math.abs(prev.score - score) ? curr : prev
    );
  }

  function updateUI(score, animated = true) {
    if (!emotionEl) return;
    const state = getState(score);

    emotionEl.textContent = state.emoji;
    emotionEl.title = state.label;
    emotionEl.setAttribute('data-label', state.label);

    if (animated) {
      emotionEl.style.transform = 'scale(1.4)';
      emotionEl.style.filter = `drop-shadow(0 0 8px ${state.color})`;
      setTimeout(() => {
        emotionEl.style.transform = 'scale(1)';
        emotionEl.style.filter = `drop-shadow(0 0 4px ${state.color})`;
      }, 400);
    }

    // Update tooltip label
    const labelEl = document.getElementById('emotionLabel');
    if (labelEl) {
      labelEl.textContent = state.label;
      labelEl.style.color = state.color;
    }
  }

  function track(userMessage, aiResponse) {
    // Analyze both user message (weighted more) and AI response
    const userScore = analyzeText(userMessage);
    const aiScore   = analyzeText(aiResponse || '');

    // User message has 70% weight, AI response 30%
    const blended = userScore * 0.7 + aiScore * 0.3;
    currentScore = blended;

    scoreHistory.push({ score: blended, time: Date.now() });
    if (scoreHistory.length > 20) scoreHistory.shift();

    updateUI(blended, true);
    return getState(blended);
  }

  function init() {
    emotionEl = document.getElementById('emotionTracker');
    if (!emotionEl) return;
    updateUI(currentScore, false);
  }

  function reset() {
    currentScore = 6;
    scoreHistory = [];
    updateUI(6, false);
  }

  // Get trend for insights
  function getTrend() {
    if (scoreHistory.length < 3) return 'neutral';
    const recent = scoreHistory.slice(-3).map(s => s.score);
    const avg = recent.reduce((a,b) => a+b, 0) / recent.length;
    if (avg > 7) return 'improving';
    if (avg < 4) return 'declining';
    return 'stable';
  }

  // ── Server-sync: called when server returns emotional state data ──────
  // valence: 0.0–1.0 (server scale) → mapped to STATES 0–10 scale
  // mode: 'VALIDATION' | 'STABILIZATION' | 'ESCALATION_READY'
  // trend: 'improving' | 'stable' | 'declining' | 'rapidly_declining'
  function syncFromServer(valence, mode, trend) {
    // Map 0.0–1.0 valence to 0–10 score, with mode adjustments
    var baseScore = valence * 10;

    // Mode overrides — ensure the visual indicator matches the emotional mode
    if (mode === 'ESCALATION_READY') {
      baseScore = Math.min(baseScore, 2);   // Always show crisis state
    } else if (mode === 'STABILIZATION') {
      baseScore = Math.min(baseScore, 4);   // Cap at low/worried
    }

    // Trend modifier
    if (trend === 'rapidly_declining') baseScore = Math.max(0, baseScore - 1.5);
    if (trend === 'improving')         baseScore = Math.min(10, baseScore + 0.5);

    currentScore = Math.max(0, Math.min(10, baseScore));
    scoreHistory.push({ score: currentScore, time: Date.now() });
    if (scoreHistory.length > 20) scoreHistory.shift();
    updateUI(currentScore, true);
  }

  return { init, track, reset, getTrend, getState, syncFromServer };
})();
