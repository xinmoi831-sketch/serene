// routes/user.js
// User profile management — onboarding data and preferences.

"use strict";

const express = require("express");
const { collections, findOne, update } = require("../lib/db");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// ── POST /api/user/onboarding ─────────────────────────────────────────────
// Save the 3-step onboarding profile data.
// All fields are optional — user may have skipped any step.
router.post("/onboarding", authenticate, async (req, res) => {
  try {
    const { name, mainConcern, wellnessGoal } = req.body;
    const userId = req.user.id;

    const patch = {
      onboardingCompleted: true,
      onboardingAt:        new Date().toISOString(),
    };

    // Only update name if explicitly provided (preserve existing name if field absent)
    if (name !== undefined) {
      patch.name = name ? String(name).trim().slice(0, 60) : (req.user.name || null);
    }
    if (mainConcern !== undefined) {
      patch.mainConcern = mainConcern ? String(mainConcern).trim().slice(0, 120) : null;
    }
    if (wellnessGoal !== undefined) {
      patch.wellnessGoal = wellnessGoal ? String(wellnessGoal).trim().slice(0, 120) : null;
    }

    await update(collections.users, { id: userId }, patch);

    res.json({
      success: true,
      profile: {
        name:                patch.name  !== undefined ? patch.name  : (req.user.name  || null),
        mainConcern:         patch.mainConcern  !== undefined ? patch.mainConcern  : null,
        wellnessGoal:        patch.wellnessGoal !== undefined ? patch.wellnessGoal : null,
        onboardingCompleted: true,
      },
    });
  } catch (err) {
    console.error("[User] Onboarding save failed:", err.message);
    res.status(500).json({ error: "Could not save preferences. Please try again." });
  }
});

// ── GET /api/user/profile ──────────────────────────────────────────────────
// Returns public profile fields including onboarding data.
router.get("/profile", authenticate, async (req, res) => {
  try {
    const u = await findOne(collections.users, { id: req.user.id });
    if (!u) return res.status(404).json({ error: "User not found." });

    res.json({
      profile: {
        name:                u.name         || null,
        mainConcern:         u.mainConcern  || null,
        wellnessGoal:        u.wellnessGoal || null,
        onboardingCompleted: u.onboardingCompleted !== false,
      },
    });
  } catch (err) {
    console.error("[User] Profile fetch failed:", err.message);
    res.status(500).json({ error: "Could not load profile." });
  }
});

module.exports = router;
