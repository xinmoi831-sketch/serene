// public/js/onboarding.js
// SERENE Onboarding Flow — 3-step emotional personalization
//
// Keeps: one question per screen, skip at every step,
//        back navigation, chip + free-text input, no pressure.

"use strict";

var OnboardingFlow = (function() {

  var CONCERNS = [
    "Stress", "Anxiety", "Loneliness",
    "Relationship issues", "Overthinking", "Sadness", "General support"
  ];

  var GOALS = [
    "Feel calmer", "Sleep better", "Reduce anxiety",
    "Understand my emotions", "Feel less alone", "Get through difficult days"
  ];

  var _step = 1;         // 1 | 2 | 3 | 4 (4 = complete)
  var _transitioning = false;
  var _data = { name: null, mainConcern: null, wellnessGoal: null };
  var _sel  = { concern: null, goal: null };

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    _step = 1;
    _transitioning = false;
    _data = { name: null, mainConcern: null, wellnessGoal: null };
    _sel  = { concern: null, goal: null };

    _renderChips("obConcernChips", CONCERNS, "concern");
    _renderChips("obGoalChips",    GOALS,    "goal");

    var nameEl = document.getElementById("obNameInput");
    if (nameEl) nameEl.value = "";
    var cfEl   = document.getElementById("obConcernFree");
    if (cfEl)  cfEl.value   = "";
    var gfEl   = document.getElementById("obGoalFree");
    if (gfEl)  gfEl.value   = "";

    _showStep(1, "none");
  }

  // ── Chip rendering ────────────────────────────────────────────────────────
  function _renderChips(containerId, items, type) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    items.forEach(function(item) {
      var btn = document.createElement("button");
      btn.className = "ob-chip";
      btn.textContent = item;
      btn.addEventListener("click", function() { _selectChip(btn, item, type); });
      container.appendChild(btn);
    });
  }

  function _selectChip(btn, value, type) {
    var container = btn.parentElement;
    container.querySelectorAll(".ob-chip").forEach(function(c) {
      c.classList.remove("selected");
    });
    btn.classList.add("selected");
    _sel[type] = value;
    // Clear free-text when chip selected
    var freeId = type === "concern" ? "obConcernFree" : "obGoalFree";
    var freeEl = document.getElementById(freeId);
    if (freeEl) freeEl.value = "";
  }

  function _clearChips(type) {
    var id = type === "concern" ? "obConcernChips" : "obGoalChips";
    document.querySelectorAll("#" + id + " .ob-chip").forEach(function(c) {
      c.classList.remove("selected");
    });
    _sel[type] = null;
  }

  // ── Step transitions ──────────────────────────────────────────────────────
  function _showStep(newStep, dir) {
    if (_transitioning) return;
    _transitioning = true;

    var oldEl  = document.getElementById("ob-step-" + (_step === 4 ? "complete" : _step));
    var newId  = newStep === 4 ? "complete" : newStep;
    var newEl  = document.getElementById("ob-step-" + newId);

    if (!newEl) { _transitioning = false; return; }

    // Animate current step out
    if (oldEl && oldEl.style.display !== "none" && dir !== "none") {
      var exitX = dir === "forward" ? "-24px" : "24px";
      oldEl.style.transition = "opacity 0.18s ease, transform 0.18s ease";
      oldEl.style.opacity    = "0";
      oldEl.style.transform  = "translateX(" + exitX + ")";
    }

    setTimeout(function() {
      // Hide all steps
      [1, 2, 3, "complete"].forEach(function(s) {
        var el = document.getElementById("ob-step-" + s);
        if (el) el.style.display = "none";
      });

      // Show new step
      var enterX = dir === "back" ? "-24px" : "24px";
      newEl.style.display   = "block";
      newEl.style.opacity   = "0";
      newEl.style.transform = dir === "none" ? "translateX(0)" : "translateX(" + enterX + ")";
      newEl.style.transition = "none";

      // Trigger animation
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          newEl.style.transition = "opacity 0.25s ease, transform 0.25s ease";
          newEl.style.opacity    = "1";
          newEl.style.transform  = "translateX(0)";
          setTimeout(function() { _transitioning = false; }, 280);
        });
      });

      _step = newStep;
      _updateDots(newStep);
      _personalizeHeadings();
      _focusStep(newStep);
    }, dir === "none" ? 0 : 200);
  }

  function _updateDots(step) {
    var dots = document.querySelectorAll(".ob-dot");
    dots.forEach(function(d, i) {
      var n = i + 1; // dot 1, 2, 3
      d.classList.toggle("active", n === Math.min(step, 3));
      d.classList.toggle("done",   n <  Math.min(step, 3));
    });
  }

  function _personalizeHeadings() {
    if (_step === 2 && _data.name) {
      var h = document.getElementById("obStep2Heading");
      if (h) h.textContent = "What brings you here, " + _data.name + "?";
    }
    if (_step === 4) {
      var msg = document.getElementById("obCompleteMsg");
      if (!msg) return;
      if (_data.wellnessGoal) {
        msg.textContent = "I’m here to help you " + _data.wellnessGoal.toLowerCase() + ".";
      } else if (_data.name) {
        msg.textContent = _data.name + ", I’m here whenever you’re ready to talk.";
      } else {
        msg.textContent = "I’m here whenever you’re ready.";
      }
    }
  }

  function _focusStep(step) {
    setTimeout(function() {
      var map = { 1: "obNameInput", 2: "obConcernFree", 3: "obGoalFree" };
      var id = map[step];
      if (id) {
        var el = document.getElementById(id);
        if (el) el.focus();
      }
    }, 300);
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  function next() {
    if (_transitioning) return;

    if (_step === 1) {
      var nameEl = document.getElementById("obNameInput");
      _data.name = (nameEl && nameEl.value.trim()) ? nameEl.value.trim() : null;
      _showStep(2, "forward");

    } else if (_step === 2) {
      var freeEl = document.getElementById("obConcernFree");
      var freeVal = freeEl ? freeEl.value.trim() : "";
      _data.mainConcern = _sel.concern || freeVal || null;
      _showStep(3, "forward");

    } else if (_step === 3) {
      var freeEl3 = document.getElementById("obGoalFree");
      var freeVal3 = freeEl3 ? freeEl3.value.trim() : "";
      _data.wellnessGoal = _sel.goal || freeVal3 || null;
      _finish();
    }
  }

  function skip() {
    if (_transitioning) return;
    if (_step === 1) { _data.name = null;         _showStep(2, "forward"); }
    else if (_step === 2) { _data.mainConcern = null;  _sel.concern = null; _showStep(3, "forward"); }
    else if (_step === 3) { _data.wellnessGoal = null; _sel.goal    = null; _finish(); }
  }

  function back() {
    if (_transitioning || _step <= 1) return;
    _showStep(_step - 1, "back");
  }

  // ── Completion ────────────────────────────────────────────────────────────
  function _finish() {
    _saveOnboarding().then(function() {
      _showStep(4, "forward");
    });
  }

  async function _saveOnboarding() {
    try {
      var res = await api.saveOnboarding({
        name:         _data.name,
        mainConcern:  _data.mainConcern,
        wellnessGoal: _data.wellnessGoal,
      });
      if (res.ok && state.user) {
        if (_data.name)         state.user.name         = _data.name;
        state.user.mainConcern        = _data.mainConcern;
        state.user.wellnessGoal       = _data.wellnessGoal;
        state.user.onboardingCompleted = true;
      }
    } catch (err) {
      console.warn("[SERENE] Onboarding save error:", err);
      // Non-fatal — mark complete locally and proceed
      if (state.user) state.user.onboardingCompleted = true;
    }
  }

  function launch() {
    launchApp();
  }

  // ── Free-text chip clearing (called from oninput) ─────────────────────────
  function clearChipsOnType(type) {
    _clearChips(type);
  }

  return {
    init,
    next,
    skip,
    back,
    launch,
    clearChipsOnType,
  };
})();

// ── Global onclick hooks (used in index.html) ─────────────────────────────
function obNext()   { OnboardingFlow.next(); }
function obSkip()   { OnboardingFlow.skip(); }
function obBack()   { OnboardingFlow.back(); }
function obLaunch() { OnboardingFlow.launch(); }
function obClearChips(type) { OnboardingFlow.clearChipsOnType(type); }
