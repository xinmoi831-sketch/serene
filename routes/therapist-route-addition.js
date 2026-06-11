// ADD THIS ROUTE to routes/therapist.js before module.exports = router;

// GET /api/therapist/bookings/therapist/:therapistId — for therapist dashboard
router.get("/bookings/therapist/:therapistId", async (req, res) => {
  if (req.headers["x-admin-key"] !== process.env.ADMIN_KEY) return res.status(403).json({ error: "Unauthorized." });
  try {
    const bookings = await find(collections.bookings, { therapistId: req.params.therapistId }, { sort: { scheduledAt: 1 } });
    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ error: "Could not load bookings." });
  }
});
