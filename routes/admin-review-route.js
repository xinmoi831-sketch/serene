// REPLACE the entire router.post("/admin/review") in routes/therapist.js with this:

router.post("/admin/review", async (req, res) => {
  if (req.headers["x-admin-key"] !== process.env.ADMIN_KEY) return res.status(403).json({ error: "Unauthorized." });
  try {
    const { therapistId, action, reason } = req.body;
    if (!["approve","reject","suspend"].includes(action)) return res.status(400).json({ error: "Invalid action." });

    // Get therapist first so we have their email
    const therapist = await findOne(collections.therapists, { id: therapistId });
    if (!therapist) return res.status(404).json({ error: "Therapist not found." });

    const statusMap = { approve: "approved", reject: "rejected", suspend: "suspended" };

    // Update therapist status
    await update(collections.therapists, { id: therapistId }, {
      status:       statusMap[action],
      verified:     action === "approve",
      reviewedAt:   new Date().toISOString(),
      reviewReason: reason || "",
    });

    // Update user role based on action
    if (action === "approve") {
      await update(collections.users, { email: therapist.email }, { role: "therapist" });
      console.log("[Admin] Therapist approved, role updated:", therapist.email);
    } else if (action === "reject" || action === "suspend") {
      await update(collections.users, { email: therapist.email }, { role: "client" });
      console.log("[Admin] Therapist " + action + "d, role reverted:", therapist.email);
    }

    // Send email notification
    try {
      const { sendTherapistNotification } = require("../lib/therapistNotify");
      sendTherapistNotification(therapist, action, reason).catch(function(e){ console.error("[Notify]", e.message); });
    } catch(e) { /* notification optional */ }

    res.json({ ok: true, message: "Therapist " + action + "d." });
  } catch (err) {
    console.error("[Admin] Review error:", err.message);
    res.status(500).json({ error: "Could not update therapist." });
  }
});
