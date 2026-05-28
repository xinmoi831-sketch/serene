// Serene — Breathing Exercise Widget
const BreathingWidget = (() => {

  const EXERCISES = {
    box: {
      name: "Box Breathing",
      description: "Calms the nervous system. Used by Navy SEALs.",
      color: "#6366f1",
      steps: [
        { label: "Inhale",  duration: 4, scale: 1.4 },
        { label: "Hold",    duration: 4, scale: 1.4 },
        { label: "Exhale",  duration: 4, scale: 1.0 },
        { label: "Hold",    duration: 4, scale: 1.0 },
      ],
      cycles: 4,
    },
    four78: {
      name: "4-7-8 Breathing",
      description: "Reduces anxiety and helps sleep.",
      color: "#0d9488",
      steps: [
        { label: "Inhale",  duration: 4, scale: 1.4 },
        { label: "Hold",    duration: 7, scale: 1.4 },
        { label: "Exhale",  duration: 8, scale: 1.0 },
      ],
      cycles: 4,
    },
    calm: {
      name: "Calm Breathing",
      description: "Simple slow breathing for instant calm.",
      color: "#ec4899",
      steps: [
        { label: "Inhale",  duration: 5, scale: 1.4 },
        { label: "Exhale",  duration: 5, scale: 1.0 },
      ],
      cycles: 5,
    },
  };

  let active     = false;
  let exercise   = null;
  let stepIndex  = 0;
  let cycle      = 0;
  let timer      = null;
  let countdown  = 0;
  let countTimer = null;

  function open(type) {
    exercise = EXERCISES[type] || EXERCISES.box;
    var overlay = document.getElementById("breathingOverlay");
    if (!overlay) return;

    // Set color theme
    document.documentElement.style.setProperty("--breath-color", exercise.color);

    document.getElementById("breathTitle").textContent       = exercise.name;
    document.getElementById("breathDescription").textContent = exercise.description;
    document.getElementById("breathCycleInfo").textContent   = exercise.cycles + " cycles";
    overlay.style.display = "flex";
    resetState();
    showReady();
  }

  function close() {
    stopExercise();
    var overlay = document.getElementById("breathingOverlay");
    if (overlay) overlay.style.display = "none";
  }

  function resetState() {
    stepIndex = 0;
    cycle     = 0;
    active    = false;
    clearTimeout(timer);
    clearInterval(countTimer);
  }

  function showReady() {
    setOrb("ready");
    document.getElementById("breathLabel").textContent    = "Ready";
    document.getElementById("breathCount").textContent    = "";
    document.getElementById("breathCycles").textContent   = "Cycle 0 / " + exercise.cycles;
    document.getElementById("breathStartBtn").style.display = "block";
    document.getElementById("breathStopBtn").style.display  = "none";
  }

  function startExercise() {
    active    = true;
    stepIndex = 0;
    cycle     = 0;
    document.getElementById("breathStartBtn").style.display = "none";
    document.getElementById("breathStopBtn").style.display  = "block";
    runStep();
  }

  function stopExercise() {
    active = false;
    clearTimeout(timer);
    clearInterval(countTimer);
    showReady();
  }

  function runStep() {
    if (!active) return;

    var step = exercise.steps[stepIndex];
    countdown = step.duration;

    // Update UI
    document.getElementById("breathLabel").textContent  = step.label;
    document.getElementById("breathCycles").textContent = "Cycle " + (cycle + 1) + " / " + exercise.cycles;
    setOrb(step.label.toLowerCase(), step.scale, step.duration);

    // Countdown
    document.getElementById("breathCount").textContent = countdown;
    clearInterval(countTimer);
    countTimer = setInterval(function() {
      countdown--;
      document.getElementById("breathCount").textContent = countdown > 0 ? countdown : "";
    }, 1000);

    // Next step
    timer = setTimeout(function() {
      clearInterval(countTimer);
      stepIndex++;

      if (stepIndex >= exercise.steps.length) {
        stepIndex = 0;
        cycle++;

        if (cycle >= exercise.cycles) {
          // Done!
          active = false;
          document.getElementById("breathLabel").textContent  = "Complete 🎉";
          document.getElementById("breathCount").textContent  = "";
          document.getElementById("breathCycles").textContent = "Well done!";
          setOrb("done");
          document.getElementById("breathStartBtn").style.display = "block";
          document.getElementById("breathStartBtn").textContent   = "Go again";
          document.getElementById("breathStopBtn").style.display  = "none";
          return;
        }
      }

      runStep();
    }, step.duration * 1000);
  }

  function setOrb(state, scale, duration) {
    var orb = document.getElementById("breathOrb");
    if (!orb) return;
    var dur = duration ? duration + "s" : "0.5s";

    orb.style.transition = "transform " + dur + " ease-in-out, box-shadow 0.5s ease";

    if (state === "inhale" || state === "hold") {
      orb.style.transform  = "scale(" + (scale || 1.4) + ")";
      orb.style.boxShadow  = "0 0 60px rgba(var(--breath-rgb), 0.5)";
    } else if (state === "exhale") {
      orb.style.transform  = "scale(1.0)";
      orb.style.boxShadow  = "0 0 30px rgba(var(--breath-rgb), 0.2)";
    } else if (state === "ready") {
      orb.style.transform  = "scale(1.0)";
      orb.style.boxShadow  = "0 0 30px rgba(99,102,241,0.2)";
    } else if (state === "done") {
      orb.style.transform  = "scale(1.1)";
      orb.style.boxShadow  = "0 0 60px rgba(16,185,129,0.5)";
    }
  }

  return { open, close, startExercise, stopExercise };
})();
