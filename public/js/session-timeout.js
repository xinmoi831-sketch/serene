// Session Timeout — auto logout after 30 minutes of inactivity
// Add this to public/js/app.js or include as separate file

const SessionTimeout = (() => {
  const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  const WARNING_MS = 25 * 60 * 1000; // warn at 25 minutes
  var timeoutTimer  = null;
  var warningTimer  = null;
  var warningShown  = false;

  function reset() {
    clearTimeout(timeoutTimer);
    clearTimeout(warningTimer);
    warningShown = false;
    hideWarning();

    warningTimer = setTimeout(function() {
      if (!warningShown) {
        warningShown = true;
        showWarning();
      }
    }, WARNING_MS);

    timeoutTimer = setTimeout(function() {
      hideWarning();
      doLogout();
      showTimeoutNotice();
    }, TIMEOUT_MS);
  }

  function showWarning() {
    var el = document.getElementById("timeoutWarning");
    if (el) el.style.display = "flex";
  }

  function hideWarning() {
    var el = document.getElementById("timeoutWarning");
    if (el) el.style.display = "none";
  }

  function showTimeoutNotice() {
    var el = document.getElementById("timeoutNotice");
    if (el) el.style.display = "flex";
  }

  function stayLoggedIn() {
    reset();
    hideWarning();
  }

  function init() {
    // Reset timer on any user activity
    ["click","keydown","mousemove","touchstart","scroll"].forEach(function(evt) {
      document.addEventListener(evt, reset, { passive: true });
    });
    reset();
    console.log("[SessionTimeout] Initialized — 30 min timeout");
  }

  function stop() {
    clearTimeout(timeoutTimer);
    clearTimeout(warningTimer);
    hideWarning();
  }

  return { init, stop, stayLoggedIn, reset };
})();
