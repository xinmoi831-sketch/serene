// Serene — Scroll Engine (Final)
// ONE anchor. ONE function. Nothing else.

const ScrollEngine = (() => {
  var anchor    = null;
  var paused    = false;
  var container = null;
  var THRESHOLD = 150;

  function scroll(smooth) {
    if (!anchor) return;
    requestAnimationFrame(function() {
      anchor.scrollIntoView({
        behavior: smooth ? "smooth" : "auto",
        block:    "end"
      });
    });
  }

  function onScroll() {
    if (!container) return;
    var distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    paused = distFromBottom > THRESHOLD;
  }

  function init() {
    anchor    = document.getElementById("scrollAnchor");
    container = document.getElementById("chatMessages");
    if (!container) return;
    container.addEventListener("scroll", onScroll, { passive: true });
    scroll(false);
  }

  function onUserMessage()  { paused = false; scroll(false); }
  function onAIMessage()    { paused = false; scroll(true);  }
  function onLoad()         { scroll(false); }

  return { init, onUserMessage, onAIMessage, onLoad };
})();
