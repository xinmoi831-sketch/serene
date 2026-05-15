// Serene — Text to Speech & Read Along
const TTS = (() => {
  const synth = window.speechSynthesis;
  let currentUtterance = null;
  let currentMsgId = null;
  let isPlaying = false;

  const LANG_MAP = {
    en: 'en-US', fr: 'fr-FR', es: 'es-ES', pt: 'pt-BR',
  };

  function getLang() {
    return LANG_MAP[window.APP_LANG || 'en'] || 'en-US';
  }

  function getBestVoice() {
    const voices = synth.getVoices();
    const lang   = getLang();
    return voices.find(v => v.lang === lang)
      || voices.find(v => v.lang.startsWith(lang.split('-')[0]))
      || null;
  }

  // Clean text for speech
  function cleanText(text) {
    return text
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
      .replace(/[#*_`~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Split text into words for highlighting
  function wrapWords(element) {
    const text = element.innerText || element.textContent;
    const words = text.split(/(\s+)/);
    element.innerHTML = words.map((w, i) =>
      /\S/.test(w)
        ? `<span class="tts-word" data-idx="${i}">${escHtmlTTS(w)}</span>`
        : w
    ).join('');
    return element.querySelectorAll('.tts-word');
  }

  function escHtmlTTS(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function clearHighlights(msgId) {
    const bubble = document.querySelector(`[data-msg-id="${msgId}"] .bubble`);
    if (!bubble) return;
    // Restore original text
    bubble.querySelectorAll('.tts-word').forEach(w => {
      w.classList.remove('tts-active');
    });
  }

  function resetBubble(msgId) {
    const bubble = document.querySelector(`[data-msg-id="${msgId}"] .bubble`);
    if (!bubble) return;
    const text = Array.from(bubble.querySelectorAll('.tts-word'))
      .map(w => w.textContent).join(' ');
    // Only restore if wrapped
    if (bubble.querySelector('.tts-word')) {
      bubble.innerHTML = bubble.innerText;
    }
  }

  function updatePlayBtn(msgId, state) {
    const btn = document.querySelector(`[data-msg-id="${msgId}"] .tts-play-btn`);
    if (!btn) return;
    if (state === 'playing') {
      btn.innerHTML = '<i class="ti ti-player-pause"></i>';
      btn.classList.add('playing');
      btn.title = 'Pause';
    } else if (state === 'loading') {
      btn.innerHTML = '<span class="tts-loader"></span>';
      btn.classList.remove('playing');
    } else {
      btn.innerHTML = '<i class="ti ti-volume"></i>';
      btn.classList.remove('playing');
      btn.title = 'Play audio';
    }
  }

  function play(msgId) {
    // If same message — toggle pause/resume
    if (currentMsgId === msgId && isPlaying) {
      synth.pause();
      isPlaying = false;
      updatePlayBtn(msgId, 'idle');
      return;
    }

    // Stop anything playing
    stop();

    const bubble = document.querySelector(`[data-msg-id="${msgId}"] .bubble`);
    if (!bubble) return;

    const rawText = cleanText(bubble.innerHTML);
    if (!rawText) return;

    updatePlayBtn(msgId, 'loading');

    // Wrap words for read-along
    const wordSpans = wrapWords(bubble);
    const words = Array.from(wordSpans);
    const wordTexts = words.map(w => w.textContent);

    currentMsgId = msgId;

    const utterance = new SpeechSynthesisUtterance(rawText);
    utterance.lang    = getLang();
    utterance.rate    = 0.92;
    utterance.pitch   = 1.0;
    utterance.volume  = 1.0;

    const voice = getBestVoice();
    if (voice) utterance.voice = voice;

    // Word boundary highlighting
    let wordIndex = 0;
    utterance.onboundary = (e) => {
      if (e.name !== 'word') return;
      // Clear previous
      words.forEach(w => w.classList.remove('tts-active'));
      // Find matching word
      const charIndex = e.charIndex;
      let charCount = 0;
      for (let i = 0; i < wordTexts.length; i++) {
        charCount += wordTexts[i].length + 1;
        if (charCount > charIndex) {
          words[i]?.classList.add('tts-active');
          // Scroll word into view smoothly
          words[i]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          wordIndex = i;
          break;
        }
      }
    };

    utterance.onstart = () => {
      isPlaying = true;
      updatePlayBtn(msgId, 'playing');
    };

    utterance.onend = () => {
      isPlaying = false;
      currentMsgId = null;
      words.forEach(w => w.classList.remove('tts-active'));
      // Restore bubble to plain text
      setTimeout(() => {
        if (bubble.querySelector('.tts-word')) {
          bubble.innerHTML = rawText.replace(/\n/g,'<br>');
        }
      }, 400);
      updatePlayBtn(msgId, 'idle');
    };

    utterance.onerror = () => {
      isPlaying = false;
      currentMsgId = null;
      updatePlayBtn(msgId, 'idle');
    };

    utterance.onpause = () => {
      isPlaying = false;
    };

    utterance.onresume = () => {
      isPlaying = true;
    };

    currentUtterance = utterance;
    synth.speak(utterance);
  }

  function stop() {
    if (synth) synth.cancel();
    isPlaying = false;
    if (currentMsgId) {
      updatePlayBtn(currentMsgId, 'idle');
      const bubble = document.querySelector(`[data-msg-id="${currentMsgId}"] .bubble`);
      if (bubble && bubble.querySelector('.tts-word')) {
        const text = cleanText(bubble.innerHTML);
        bubble.innerHTML = text.replace(/\n/g,'<br>');
      }
      currentMsgId = null;
    }
    currentUtterance = null;
  }

  function isSupported() {
    return 'speechSynthesis' in window;
  }

  return { play, stop, isSupported };
})();
