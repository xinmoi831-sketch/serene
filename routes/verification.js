const express = require("express");
const bcrypt = require("bcryptjs");
const { collections, findOne, update } = require("../lib/db");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// In-memory store for codes (use Redis in production)
const codes = new Map();

// Generate a 6-digit code
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send code via email using a free email service
// We use Brevo (free 300 emails/day) or fallback to console log for testing
async function sendEmail(to, subject, body) {
  const apiKey   = (process.env.BREVO_API_KEY || "").trim();
  const fromEmail = (process.env.EMAIL_FROM || "").trim();

  console.log("[EMAIL] Attempting to send to:", to);
  console.log("[EMAIL] BREVO_API_KEY set:", !!apiKey && !apiKey.includes("REPLACE"));
  console.log("[EMAIL] EMAIL_FROM:", fromEmail || "NOT SET");

  if (!apiKey || apiKey.includes("REPLACE")) {
    console.log("[EMAIL] No Brevo key — logging to console only");
    console.log("CODE WOULD BE SENT TO:", to, "| BODY:", body);
    return true;
  }

  try {
    const payload = {
      sender:      { name: "Serene", email: fromEmail || "noreply@serene.app" },
      to:          [{ email: to }],
      subject:     subject,
      textContent: body,
      htmlContent: "<div style='font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;background:#0a0f1e;color:#f0f4ff;padding:32px;border-radius:16px'><div style='text-align:center;margin-bottom:24px'><span style='font-size:40px'>🌿</span><h1 style='font-size:24px;color:#a5b4fc;margin:8px 0'>Serene</h1></div><p style='font-size:15px;color:#8b9dc3;line-height:1.6'>" + body + "</p><div style='text-align:center;margin:28px 0'><span style='font-size:36px;font-weight:700;letter-spacing:8px;color:#818cf8;background:rgba(99,102,241,0.15);padding:16px 28px;border-radius:12px'>" + (body.match(/\d{6}/) ? body.match(/\d{6}/)[0] : "") + "</span></div><p style='font-size:12px;color:#4a5568;text-align:center'>This code expires in 10 minutes.</p></div>",
    };

    console.log("[EMAIL] Sending via Brevo...");
    const res  = await fetch("https://api.brevo.com/v3/smtp/email", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body:    JSON.stringify(payload),
    });

    const responseText = await res.text();
    console.log("[EMAIL] Brevo response status:", res.status);
    console.log("[EMAIL] Brevo response:", responseText);

    if (!res.ok) {
      console.error("[EMAIL] Brevo failed:", res.status, responseText);
      return false;
    }

    console.log("[EMAIL] Sent successfully to:", to);
    return true;
  } catch (err) {
    console.error("[EMAIL] Error:", err.message);
    return false;
  }
}

// ── POST /api/auth/send-verification ─────────────────────────────
// Sends email verification code after registration
router.post("/send-verification", authenticate, async (req, res) => {
  const user = req.user;
  if (user.emailVerified) {
    return res.json({ message: "Email already verified." });
  }

  const code = generateCode();
  const expiry = Date.now() + 10 * 60 * 1000; // 10 min

  codes.set(`verify_${user.id}`, { code, expiry });

  const sent = await sendEmail(
    user.email,
    "Verify your Serene account",
    `Welcome to Serene!\n\nYour verification code is:\n\n${code}\n\nThis code expires in 10 minutes.`
  );

  res.json({
    message: "Verification code sent.",
    email: user.email,
    // In dev mode, return code so you can test without email setup
    ...((!process.env.BREVO_API_KEY || process.env.BREVO_API_KEY.includes("REPLACE")) && { devCode: code }),
  });
});

// ── POST /api/auth/verify-email ───────────────────────────────────
router.post("/verify-email", authenticate, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "Code is required." });

  const stored = codes.get(`verify_${req.user.id}`);
  if (!stored) return res.status(400).json({ error: "No verification code found. Please request a new one." });
  if (Date.now() > stored.expiry) {
    codes.delete(`verify_${req.user.id}`);
    return res.status(400).json({ error: "Code expired. Please request a new one." });
  }
  if (stored.code !== code.trim()) {
    return res.status(400).json({ error: "Incorrect code. Please try again." });
  }

  codes.delete(`verify_${req.user.id}`);
  await update(collections.users, { id: req.user.id }, { emailVerified: true });

  res.json({ message: "Email verified successfully.", verified: true });
});

// ── POST /api/auth/send-2fa ───────────────────────────────────────
// Send 2FA code before login
router.post("/send-2fa", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required." });

  const user = await findOne(collections.users, { email: email.toLowerCase().trim() });
  if (!user) {
    // Don't reveal if email exists
    return res.json({ message: "If that email exists, a code was sent." });
  }

  const code   = generateCode();
  const expiry = Date.now() + 10 * 60 * 1000;

  codes.set(`2fa_${user.id}`, { code, expiry });

  await sendEmail(
    user.email,
    "Your Serene login code",
    `Your two-factor authentication code is:\n\n${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't try to log in, please ignore this.`
  );

  res.json({
    message: "2FA code sent.",
    userId: user.id,
    ...((!process.env.BREVO_API_KEY || process.env.BREVO_API_KEY.includes("REPLACE")) && { devCode: code }),
  });
});

// ── POST /api/auth/verify-2fa ─────────────────────────────────────
router.post("/verify-2fa", async (req, res) => {
  const { userId, code } = req.body;
  if (!userId || !code) return res.status(400).json({ error: "userId and code are required." });

  const stored = codes.get(`2fa_${userId}`);
  if (!stored) return res.status(400).json({ error: "No 2FA code found. Please request a new one." });
  if (Date.now() > stored.expiry) {
    codes.delete(`2fa_${userId}`);
    return res.status(400).json({ error: "Code expired. Please request a new one." });
  }
  if (stored.code !== code.trim()) {
    return res.status(400).json({ error: "Incorrect code. Please try again." });
  }

  codes.delete(`2fa_${userId}`);
  res.json({ message: "2FA verified.", verified: true });
});

// ── POST /api/auth/toggle-2fa ─────────────────────────────────────
router.post("/toggle-2fa", authenticate, async (req, res) => {
  const newValue = !req.user.twoFactorEnabled;
  await update(collections.users, { id: req.user.id }, { twoFactorEnabled: newValue });
  res.json({
    message: `Two-factor authentication ${newValue ? "enabled" : "disabled"}.`,
    twoFactorEnabled: newValue,
  });
});

// ── POST /api/auth/forgot-password ───────────────────────────────
// Send password reset code to email
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required." });

  const user = await findOne(collections.users, { email: email.toLowerCase().trim() });
  if (!user) {
    // Don't reveal if email exists
    return res.json({ message: "If that email exists, a reset code was sent." });
  }

  if (!user.password) {
    return res.json({ message: "This account uses Google Sign-In. Please log in with Google.", googleOnly: true });
  }

  const code   = generateCode();
  const expiry = Date.now() + 10 * 60 * 1000; // 10 minutes
  codes.set("reset_" + user.id, { code, expiry });

  const resetBody = "You requested a password reset. Your reset code is: " + code + ". This code expires in 10 minutes. If you did not request this, please ignore it.";
  await sendEmail(user.email, "Reset your Serene password", resetBody);

  res.json({
    message: "Reset code sent. Check your email.",
    userId: user.id,
    ...((!process.env.BREVO_API_KEY || process.env.BREVO_API_KEY.includes("REPLACE")) && { devCode: code }),
  });
});

// ── POST /api/auth/reset-password ────────────────────────────────
// Verify code and set new password
router.post("/reset-password", async (req, res) => {
  const { userId, code, newPassword } = req.body;
  if (!userId || !code || !newPassword) {
    return res.status(400).json({ error: "userId, code and newPassword are required." });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const stored = codes.get("reset_" + userId);
  if (!stored) return res.status(400).json({ error: "No reset code found. Please request a new one." });
  if (Date.now() > stored.expiry) {
    codes.delete("reset_" + userId);
    return res.status(400).json({ error: "Code expired. Please request a new one." });
  }
  if (stored.code !== code.trim()) {
    return res.status(400).json({ error: "Incorrect code. Please try again." });
  }

  codes.delete("reset_" + userId);

  // Hash new password
  const hashed = await bcrypt.hash(newPassword, 12);
  await update(collections.users, { id: userId }, { password: hashed });

  res.json({ message: "Password reset successfully. You can now log in.", success: true });
});

module.exports = { router, sendEmail };
