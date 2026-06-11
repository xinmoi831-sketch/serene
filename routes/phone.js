// routes/phone.js — Phone verification routes
const express = require("express");
const router  = express.Router();
const { collections, findOne, update } = require("../lib/db");
const { authenticate } = require("../middleware/auth");
const { sendSMS } = require("../lib/sms");

// In-memory store for phone codes
const phoneCodes = new Map();

// POST /api/phone/send-code  (requires auth — for new users verifying after signup)
router.post("/send-code", authenticate, async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone number is required." });

    phone = phone.replace(/\s+/g, "").trim();
    if (!phone.startsWith("+")) phone = "+260" + phone.replace(/^0/, "");

    const code   = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = Date.now() + 10 * 60 * 1000;
    phoneCodes.set(req.user.id, { code, phone, expiry });

    const result = await sendSMS(phone, "Your Serene verification code is: " + code + ". Valid for 10 minutes.");
    console.log("[Phone] Sent code to", phone, result);

    res.json({ ok: true, message: "Verification code sent to " + phone });
  } catch (err) {
    console.error("[Phone] Send code error:", err.message);
    res.status(500).json({ error: "Could not send verification code." });
  }
});

// POST /api/phone/verify  (requires auth)
router.post("/verify", authenticate, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "Verification code is required." });

    const stored = phoneCodes.get(req.user.id);
    if (!stored) return res.status(400).json({ error: "No verification code found. Please request a new one." });
    if (Date.now() > stored.expiry) {
      phoneCodes.delete(req.user.id);
      return res.status(400).json({ error: "Code expired. Please request a new one." });
    }
    if (stored.code !== code.trim()) {
      return res.status(400).json({ error: "Incorrect code. Please try again." });
    }

    phoneCodes.delete(req.user.id);

    await update(collections.users, { id: req.user.id }, {
      phone:         stored.phone,
      phoneVerified: true,
    });

    console.log("[Phone] Verified:", req.user.email, stored.phone);
    res.json({ ok: true, message: "Phone number verified successfully!" });
  } catch (err) {
    console.error("[Phone] Verify error:", err.message);
    res.status(500).json({ error: "Could not verify code." });
  }
});

// POST /api/phone/resend  (requires auth)
router.post("/resend", authenticate, async (req, res) => {
  try {
    const stored = phoneCodes.get(req.user.id);
    if (!stored) return res.status(400).json({ error: "Please enter your phone number first." });

    const code   = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = Date.now() + 10 * 60 * 1000;
    phoneCodes.set(req.user.id, { code, phone: stored.phone, expiry });

    await sendSMS(stored.phone, "Your Serene verification code is: " + code + ". Valid for 10 minutes.");
    res.json({ ok: true, message: "New code sent to " + stored.phone });
  } catch (err) {
    res.status(500).json({ error: "Could not resend code." });
  }
});

module.exports = router;
