const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { collections, findOne, insert, remove } = require("../lib/db");
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
      // Onboarding — new users start here
      onboardingCompleted: false, mainConcern: null, wellnessGoal: null,
    });

    const token = jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
    res.status(201).json({
      message: "Account created successfully.",
      token,
      user: {
        id, email: email.toLowerCase().trim(), name: name || null, plan: "free",
        onboardingCompleted: false, mainConcern: null, wellnessGoal: null,
      },
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
        // Onboarding: undefined field (old user) → treat as completed
        onboardingCompleted: user.onboardingCompleted !== false,
        mainConcern:  user.mainConcern  || null,
        wellnessGoal: user.wellnessGoal || null,
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
      // Onboarding: undefined (old user) → treat as completed
      onboardingCompleted: u.onboardingCompleted !== false,
      mainConcern:  u.mainConcern  || null,
      wellnessGoal: u.wellnessGoal || null,
    },
  });
});

// DELETE /api/auth/account
router.delete("/account", authenticate, async (req, res) => {
  await remove(collections.users,    { id: req.user.id }, { multi: true });
  await remove(collections.messages, { userId: req.user.id }, { multi: true });
  await remove(collections.moods,    { userId: req.user.id }, { multi: true });
  await remove(collections.journal,  { userId: req.user.id }, { multi: true });
  await remove(collections.usage,    { userId: req.user.id }, { multi: true });
  res.json({ message: "Account and all data permanently deleted." });
});

// POST /api/auth/send-login-code
// Called after password verification — sends OTP to email
router.post("/send-login-code", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required." });

    const user = await findOne(collections.users, { email: email.toLowerCase().trim() });
    if (!user) return res.status(401).json({ error: "Incorrect email or password." });
    if (!user.password) return res.status(401).json({ error: "This account uses Google Sign-In.", googleOnly: true });

    const valid  = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Incorrect email or password." });

    // Generate 6-digit login code
    const code   = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store code in memory (reuse verification codes map)
    const { codes, sendEmail } = require("./verification");
    codes.set("login_" + user.id, { code, expiry });

    await sendEmail(
      user.email,
      "Your Serene login code",
      "Your login verification code is: " + code + ". This code expires in 10 minutes."
    );

    res.json({
      message: "Verification code sent to your email.",
      userId: user.id,
      ...((!process.env.BREVO_API_KEY || process.env.BREVO_API_KEY.includes("REPLACE")) && { devCode: code }),
    });
  } catch (err) {
    console.error("Send login code error:", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// POST /api/auth/verify-login-code
// Verifies the login OTP and returns JWT token
router.post("/verify-login-code", async (req, res) => {
  try {
    const { userId, code } = req.body;
    if (!userId || !code) return res.status(400).json({ error: "userId and code required." });

    const { codes } = require("./verification");
    const stored    = codes.get("login_" + userId);

    if (!stored) return res.status(400).json({ error: "No login code found. Please log in again." });
    if (Date.now() > stored.expiry) {
      codes.delete("login_" + userId);
      return res.status(400).json({ error: "Code expired. Please log in again." });
    }
    if (stored.code !== code.trim()) return res.status(400).json({ error: "Incorrect code. Please try again." });

    codes.delete("login_" + userId);

    const user = await findOne(collections.users, { id: userId });
    if (!user) return res.status(404).json({ error: "User not found." });

    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, plan: user.plan || "free" },
    });
  } catch (err) {
    console.error("Verify login code error:", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

module.exports = router;
