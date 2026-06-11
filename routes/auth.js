const express  = require("express");
const bcrypt   = require("bcryptjs");
const jwt      = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { collections, findOne, insert, remove, update } = require("../lib/db");
const { authenticate, PLANS } = require("../middleware/auth");

const router = express.Router();

// ── REGISTER ─────────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required." });
    if (!email.includes("@")) return res.status(400).json({ error: "Please enter a valid email." });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });

    const existing = await findOne(collections.users, { email: email.toLowerCase().trim() });
    if (existing) return res.status(409).json({ error: "An account with this email already exists." });

    const id     = uuidv4();
    const hashed = await bcrypt.hash(password, 12);
    const now    = new Date().toISOString();

    // Clean phone if provided
    let cleanPhone = null;
    if (phone) {
      cleanPhone = phone.replace(/\s+/g, "").trim();
      if (!cleanPhone.startsWith("+")) cleanPhone = "+260" + cleanPhone.replace(/^0/, "");
    }

    await insert(collections.users, {
      id, email: email.toLowerCase().trim(),
      password: hashed, name: name ? name.trim() : null,
      phone: cleanPhone, phoneVerified: false,
      plan: "free", stripeCustomerId: null,
      stripeSubscriptionId: null, subscriptionStatus: "inactive",
      subscriptionEnd: null, createdAt: now,
      onboardingCompleted: false, mainConcern: null, wellnessGoal: null,
    });

    const token = jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
    res.status(201).json({
      message: "Account created successfully.",
      token,
      user: {
        id, email: email.toLowerCase().trim(), name: name || null,
        plan: "free", phone: cleanPhone, phoneVerified: false,
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

// ── LOGIN ─────────────────────────────────────────────────────────
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
        phone: user.phone || null,
        phoneVerified: user.phoneVerified || false,
        twoFactorEnabled: user.twoFactorEnabled || false,
        onboardingCompleted: user.onboardingCompleted !== false,
        mainConcern: user.mainConcern || null,
        wellnessGoal: user.wellnessGoal || null,
      },
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// ── ME ────────────────────────────────────────────────────────────
router.get("/me", authenticate, (req, res) => {
  const u = req.user;
  res.json({
    user: {
      id: u.id, email: u.email, name: u.name, plan: u.plan,
      subscriptionStatus: u.subscriptionStatus,
      subscriptionEnd: u.subscriptionEnd,
      limits: PLANS[u.plan] || PLANS.free,
      phone: u.phone || null,
      phoneVerified: u.phoneVerified || false,
      onboardingCompleted: u.onboardingCompleted !== false,
      mainConcern: u.mainConcern || null,
      wellnessGoal: u.wellnessGoal || null,
    },
  });
});

// ── DELETE ACCOUNT ────────────────────────────────────────────────
router.delete("/account", authenticate, async (req, res) => {
  await remove(collections.users,    { id: req.user.id }, { multi: true });
  await remove(collections.messages, { userId: req.user.id }, { multi: true });
  await remove(collections.moods,    { userId: req.user.id }, { multi: true });
  await remove(collections.journal,  { userId: req.user.id }, { multi: true });
  await remove(collections.usage,    { userId: req.user.id }, { multi: true });
  res.json({ message: "Account and all data permanently deleted." });
});

// ── FORGOT PASSWORD ───────────────────────────────────────────────
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });

    const user = await findOne(collections.users, { email: email.toLowerCase().trim() });
    if (!user) return res.status(404).json({ error: "No account found with that email." });
    if (!user.password) return res.status(400).json({ error: "This account uses Google Sign-In.", googleOnly: true });

    const code   = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = Date.now() + 10 * 60 * 1000;

    const { codes, sendEmail } = require("./verification");
    codes.set("forgot_" + user.id, { code, expiry });

    await sendEmail(
      user.email,
      "Reset your Serene password",
      "Your password reset code is: " + code + ". This code expires in 10 minutes."
    );

    res.json({
      message: "Reset code sent to your email.",
      userId: user.id,
      hasPhone: !!(user.phone && user.phoneVerified),
      ...(process.env.NODE_ENV !== "production" && { devCode: code }),
    });
  } catch (err) {
    console.error("Forgot password error:", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ── FORGOT PASSWORD VIA SMS ───────────────────────────────────────
router.post("/forgot-password-sms", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });

    const user = await findOne(collections.users, { email: email.toLowerCase().trim() });
    if (!user) return res.status(404).json({ error: "No account found with that email." });
    if (!user.phone || !user.phoneVerified) {
      return res.status(400).json({ error: "No verified phone number on this account." });
    }

    const code   = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = Date.now() + 10 * 60 * 1000;

    const { codes } = require("./verification");
    codes.set("forgot_" + user.id, { code, expiry });

    const { sendSMS } = require("../lib/sms");
    await sendSMS(user.phone, "Your Serene password reset code is: " + code + ". Valid for 10 minutes.");

    res.json({
      message: "Reset code sent to your phone.",
      userId: user.id,
      phone: user.phone.replace(/(\+\d{3})\d+(\d{3})/, "$1****$2"), // mask phone
    });
  } catch (err) {
    console.error("Forgot password SMS error:", err.message);
    res.status(500).json({ error: "Could not send SMS. Please try email instead." });
  }
});

// ── RESET PASSWORD ────────────────────────────────────────────────
router.post("/reset-password", async (req, res) => {
  try {
    const { userId, code, newPassword } = req.body;
    if (!userId || !code || !newPassword) {
      return res.status(400).json({ error: "userId, code and newPassword are required." });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const { codes } = require("./verification");
    const stored    = codes.get("forgot_" + userId);

    if (!stored) return res.status(400).json({ error: "No reset code found. Please start again." });
    if (Date.now() > stored.expiry) {
      codes.delete("forgot_" + userId);
      return res.status(400).json({ error: "Code expired. Please start again." });
    }
    if (stored.code !== code.trim()) return res.status(400).json({ error: "Incorrect code." });

    codes.delete("forgot_" + userId);
    const hashed = await bcrypt.hash(newPassword, 12);
    await update(collections.users, { id: userId }, { password: hashed });

    res.json({ success: true, message: "Password reset successfully." });
  } catch (err) {
    console.error("Reset password error:", err.message);
    res.status(500).json({ error: "Could not reset password." });
  }
});

// ── SEND LOGIN CODE ───────────────────────────────────────────────
router.post("/send-login-code", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required." });

    const user = await findOne(collections.users, { email: email.toLowerCase().trim() });
    if (!user) return res.status(401).json({ error: "Incorrect email or password." });
    if (!user.password) return res.status(401).json({ error: "This account uses Google Sign-In.", googleOnly: true });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Incorrect email or password." });

    const code   = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = Date.now() + 10 * 60 * 1000;

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
      ...(process.env.NODE_ENV !== "production" && { devCode: code }),
    });
  } catch (err) {
    console.error("Send login code error:", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ── VERIFY LOGIN CODE ─────────────────────────────────────────────
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
    if (stored.code !== code.trim()) return res.status(400).json({ error: "Incorrect code." });

    codes.delete("login_" + userId);

    const user = await findOne(collections.users, { id: userId });
    if (!user) return res.status(404).json({ error: "User not found." });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "30d" });
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

// ── SEND 2FA CODE ─────────────────────────────────────────────────
// Called after password verified — sends OTP via email or SMS
router.post("/send-2fa", async (req, res) => {
  try {
    const { email, password, method } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required." });
    if (!method || !["email","sms"].includes(method)) return res.status(400).json({ error: "Method must be 'email' or 'sms'." });

    const user = await findOne(collections.users, { email: email.toLowerCase().trim() });
    if (!user) return res.status(401).json({ error: "Incorrect email or password." });
    if (!user.password) return res.status(401).json({ error: "This account uses Google Sign-In.", googleOnly: true });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Incorrect email or password." });

    // Check SMS method requirements
    if (method === "sms" && (!user.phone || !user.phoneVerified)) {
      return res.status(400).json({ error: "No verified phone number on this account.", noPhone: true });
    }

    const code   = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = Date.now() + 10 * 60 * 1000; // 10 minutes

    const { codes, sendEmail } = require("./verification");
    codes.set("2fa_" + user.id, { code, expiry, method });

    if (method === "email") {
      await sendEmail(user.email, "Your Serene login code", "Your 2FA code is: " + code + ". Valid for 10 minutes.");
      res.json({ ok: true, message: "Code sent to your email.", userId: user.id, delivery: user.email.replace(/(.{2}).*(@.*)/, "$1***$2") });
    } else {
      const { sendSMS } = require("../lib/sms");
      await sendSMS(user.phone, "Your Serene login code: " + code + ". Valid for 10 minutes.");
      res.json({ ok: true, message: "Code sent to your phone.", userId: user.id, delivery: user.phone.replace(/(\+\d{3})\d+(\d{3})/, "$1****$2") });
    }
  } catch (err) {
    console.error("Send 2FA error:", err.message);
    res.status(500).json({ error: "Could not send code. Please try again." });
  }
});

// ── VERIFY 2FA CODE ───────────────────────────────────────────────
router.post("/verify-2fa", async (req, res) => {
  try {
    const { userId, code } = req.body;
    if (!userId || !code) return res.status(400).json({ error: "userId and code required." });

    const { codes } = require("./verification");
    const stored    = codes.get("2fa_" + userId);

    if (!stored) return res.status(400).json({ error: "No code found. Please log in again." });
    if (Date.now() > stored.expiry) {
      codes.delete("2fa_" + userId);
      return res.status(400).json({ error: "Code expired. Please log in again." });
    }
    if (stored.code !== code.trim()) return res.status(400).json({ error: "Incorrect code. Please try again." });

    codes.delete("2fa_" + userId);

    const user = await findOne(collections.users, { id: userId });
    if (!user) return res.status(404).json({ error: "User not found." });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "30d" });
    res.json({
      token,
      user: {
        id: user.id, email: user.email, name: user.name,
        plan: user.plan || "free",
        phone: user.phone || null,
        phoneVerified: user.phoneVerified || false,
        onboardingCompleted: user.onboardingCompleted !== false,
      },
    });
  } catch (err) {
    console.error("Verify 2FA error:", err.message);
    res.status(500).json({ error: "Could not verify code." });
  }
});

// ── TOGGLE 2FA ────────────────────────────────────────────────────
router.post("/toggle-2fa", authenticate, async (req, res) => {
  try {
    const enabled = !req.user.twoFactorEnabled;
    await update(collections.users, { id: req.user.id }, { twoFactorEnabled: enabled });
    res.json({ ok: true, twoFactorEnabled: enabled, message: enabled ? "2FA enabled." : "2FA disabled." });
  } catch (err) {
    res.status(500).json({ error: "Could not update 2FA setting." });
  }
});
