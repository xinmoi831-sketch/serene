// ================================================================
// CHANGE 1: In routes/therapist.js — apply route
// Add dashboardKey to the therapist object when applying
// Find: licenseNumber: licenseNumber || "",
// Add after it:
//   dashboardKey: (req.body.dashboardKey || "").trim(),
// ================================================================

// ================================================================
// CHANGE 2: In routes/therapist.js — add this route before module.exports
// Therapist login using email + their custom dashboard key
// ================================================================

router.post("/dashboard-login", async (req, res) => {
  try {
    const { email, dashboardKey } = req.body;
    if (!email || !dashboardKey) {
      return res.status(400).json({ error: "Email and dashboard key are required." });
    }

    const therapist = await findOne(collections.therapists, {
      email:        email.toLowerCase().trim(),
      dashboardKey: dashboardKey.trim(),
      status:       "approved",
    });

    if (!therapist) {
      return res.status(401).json({ error: "Invalid email or dashboard key. Make sure your application has been approved." });
    }

    res.json({ ok: true, therapist });
  } catch (err) {
    console.error("[Therapist] Dashboard login error:", err.message);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// GET bookings for therapist dashboard
router.get("/bookings/therapist/:therapistId", async (req, res) => {
  try {
    const bookings = await find(
      collections.bookings,
      { therapistId: req.params.therapistId },
      { sort: { scheduledAt: 1 } }
    );
    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ error: "Could not load bookings." });
  }
});
