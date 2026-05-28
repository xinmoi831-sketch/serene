// Serene — Scroll Engine
const ScrollEngine = (() => {
  var container = null;
  var userScrolledUp = false;
  var listenerAttached = false;
  var rafOuter = null;
  var rafInner = null;
  var THRESHOLD = 120;

  function getContainer() {
    if (!container) container = document.getElementById("chatMessages");
    return container;
  }

  function isNearBottom() {
    var c = getContainer();
    if (!c) return true;
    return (c.scrollHeight - c.scrollTop - c.clientHeight) <= THRESHOLD;
  }

  function scrollToBottom() {
    // Cancel any previously queued scroll — always use the freshest scrollHeight
    if (rafInner !== null) { cancelAnimationFrame(rafInner); rafInner = null; }
    if (rafOuter !== null) { cancelAnimationFrame(rafOuter); rafOuter = null; }

    // Double rAF: first queues layout flush, second fires after layout is committed
    rafOuter = requestAnimationFrame(function() {
      rafOuter = null;
      rafInner = requestAnimationFrame(function() {
        rafInner = null;
        var c = getContainer();
        if (!c) return;
        // scrollTop assignment is synchronous and reliable — avoids Chrome smooth-scroll interruption bugs
        c.scrollTop = c.scrollHeight;
      });
    });
  }

  function onScroll() {
    userScrolledUp = !isNearBottom();
  }

  function init() {
    var c = getContainer();
    if (!c || listenerAttached) return;
    listenerAttached = true;
    c.addEventListener("scroll", onScroll, { passive: true });
    scrollToBottom();
  }

  function onUserMessage() {
    userScrolledUp = false;
    scrollToBottom();
  }

  function onAIMessage() {
    if (!userScrolledUp) scrollToBottom();
  }

  function onLoad() {
    userScrolledUp = false;
    scrollToBottom();
  }

  return { init, onUserMessage, onAIMessage, onLoad };
})();
