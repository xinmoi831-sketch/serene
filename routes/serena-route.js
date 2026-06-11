// ADD THIS ROUTE to routes/auth.js before module.exports = router;

// POST /api/auth/update-serena — save Serena gender/age preferences
router.post("/update-serena", authenticate, async (req, res) => {
  try {
    const { serenaGender, serenaAge, serenaSetup } = req.body;
    await update(collections.users, { id: req.user.id }, {
      serenaGender: serenaGender || "female",
      serenaAge:    serenaAge    || "adult",
      serenaSetup:  serenaSetup  || true,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Could not save preferences." });
  }
});
