const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { collections, findOne, insert } = require("../lib/db");
const { authenticate, PLANS } = require("../middleware/auth");

const router = express.Router();

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required." });
    if (!email.includes("@")) return res.status(400).json({ error: "Please enter a valid email." });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });

    const existing = await findOne(collections.users, { email: email.toLowerCase().trim() });
    if (existing) return res.status(409).json({ error: "An account with this email already exists." });

    const id = uuidv4();
    const hashed = await bcrypt.hash(password, 12);
    const now = new Date().toISOString();

    await insert(collections.users, {
      id, email: email.toLowerCase().trim(),
      password: hashed, name: name ? name.trim() : null,
      plan: "free", stripeCustomerId: null,
      stripeSubscriptionId: null, subscriptionStatus: "inactive",
      subscriptionEnd: null, createdAt: now,
    });

    const token = jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
    res.status(201).json({
      message: "Account created successfully.",
      token,
      user: { id, email: email.toLowerCase().trim(), name: name || null, plan: "free" },
    });
  } catch (err) {
    console.error("Register error:", err.message);
    if (err.message && err.message.includes("uniqueViolated")) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    res.status(500).json({ error: "Could not create account. Please try again." });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

    const user = await findOne(collections.users, { email: email.toLowerCase().trim() });
    if (!user) return res.status(401).json({ error: "Incorrect email or password." });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Incorrect email or password." });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "30d" });
    res.json({
      message: "Login successful.", token,
      user: {
        id: user.id, email: user.email, name: user.name,
        plan: user.plan, subscriptionStatus: user.subscriptionStatus,
        limits: PLANS[user.plan] || PLANS.free,
      },
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// GET /api/auth/me
router.get("/me", authenticate, (req, res) => {
  const u = req.user;
  res.json({
    user: {
      id: u.id, email: u.email, name: u.name, plan: u.plan,
      subscriptionStatus: u.subscriptionStatus,
      subscriptionEnd: u.subscriptionEnd,
      limits: PLANS[u.plan] || PLANS.free,
    },
  });
});

// DELETE /api/auth/account
router.delete("/account", authenticate, async (req, res) => {
  const { collections: c, remove } = require("../lib/db");
  await remove(c.users,    { id: req.user.id }, { multi: true });
  await remove(c.messages, { userId: req.user.id }, { multi: true });
  await remove(c.moods,    { userId: req.user.id }, { multi: true });
  await remove(c.journal,  { userId: req.user.id }, { multi: true });
  await remove(c.usage,    { userId: req.user.id }, { multi: true });
  res.json({ message: "Account and all data permanently deleted." });
});

module.exports = router;
