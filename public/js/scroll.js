// Serene — Chat Scroll Engine v4
// Production-grade auto-scroll system
// Architecture: Anchor + Double rAF + Smart pause + MutationObserver

const ScrollEngine = (() => {
  let anchor        = null;
  let container     = null;
  let observer      = null;
  let userScrolled  = false;   // true when user manually scrolled up
  let scrollTimeout = null;
  const BOTTOM_THRESHOLD = 120; // px from bottom = "near bottom"

  // ── CORE SCROLL ──────────────────────────────────────────────────
  // Double rAF guarantees: rAF1 queues after current JS, rAF2 fires
  // after browser has fully painted the new layout.
  function scrollNow(smooth) {
    if (!anchor) return;
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        anchor.scrollIntoView({
          behavior: smooth ? 'smooth' : 'auto',
          block:    'end',
        });
      });
    });
  }

  // ── SMART SCROLL ─────────────────────────────────────────────────
  // Only auto-scroll if user hasn't scrolled up to read history
  function smartScroll(smooth) {
    if (!userScrolled) scrollNow(smooth);
  }

  // ── USER SCROLL DETECTION ─────────────────────────────────────────
  function isNearBottom() {
    if (!container) return true;
    return container.scrollHeight - container.scrollTop - container.clientHeight < BOTTOM_THRESHOLD;
  }

  function onScroll() {
    if (isNearBottom()) {
      // User returned to bottom — resume auto-scroll
      userScrolled = false;
    } else {
      // User scrolled up — pause auto-scroll
      userScrolled = true;
    }
  }

  // ── MUTATION OBSERVER ─────────────────────────────────────────────
  // Watches for any DOM change in chat container — new messages,
  // streaming tokens, image loads — and triggers smart scroll
  function startObserver() {
    if (observer) observer.disconnect();
    if (!container) return;

    observer = new MutationObserver(function(mutations) {
      var hasNewContent = mutations.some(function(m) {
        return m.addedNodes.length > 0 || m.type === 'characterData';
      });
      if (hasNewContent) smartScroll(true);
    });

    observer.observe(container, {
      childList:    true,
      subtree:      true,
      characterData:true,
    });
  }

  // ── MOBILE KEYBOARD HANDLER ───────────────────────────────────────
  // When virtual keyboard opens on mobile, viewport shrinks.
  // We need to re-scroll after the resize settles.
  function onResize() {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(function() {
      if (!userScrolled) scrollNow(false);
    }, 100);
  }

  // ── INIT ──────────────────────────────────────────────────────────
  function init() {
    container = document.getElementById('chatMessages');
    anchor    = document.getElementById('scrollAnchor');

    if (!container || !anchor) return;

    // Listen for manual scroll
    container.addEventListener('scroll', onScroll, { passive: true });

    // Listen for mobile keyboard / viewport resize
    window.addEventListener('resize', onResize, { passive: true });

    // Start watching for DOM changes
    startObserver();
  }

  // ── PUBLIC API ────────────────────────────────────────────────────
  // Called after appending a user message — snap instantly
  function onUserMessage() {
    userScrolled = false; // always scroll to user's own message
    scrollNow(false);
  }

  // Called after appending AI message — smooth scroll
  function onAIMessage() {
    userScrolled = false;
    scrollNow(true);
  }

  // Called on initial load
  function onLoad() {
    scrollNow(false);
  }

  // Force scroll regardless of userScrolled state
  function forceScroll(smooth) {
    userScrolled = false;
    scrollNow(smooth);
  }

  function destroy() {
    if (observer) observer.disconnect();
    if (container) container.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
  }

  return { init, onUserMessage, onAIMessage, onLoad, forceScroll, destroy };
})();
