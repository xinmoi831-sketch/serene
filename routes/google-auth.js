const express = require("express");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const { collections, findOne, insert, update } = require("../lib/db");
const { PLANS } = require("../middleware/auth");

const router = express.Router();

// Verify Google token by calling Google's tokeninfo endpoint
async function verifyGoogleToken(token) {
  const res = await fetch(
    "https://oauth2.googleapis.com/tokeninfo?id_token=" + token
  );
  if (!res.ok) throw new Error("Invalid Google token");
  const data = await res.json();
  // Verify it is for our app
  const expectedClientId = process.env.GOOGLE_CLIENT_ID || "376451848884-hcdi67fcdr3f1of4fefd7gqnvpka9m91.apps.googleusercontent.com";
  if (data.aud !== expectedClientId) {
    throw new Error("Token was not issued for this app");
  }
  if (!data.email_verified || data.email_verified === "false") {
    throw new Error("Google email not verified");
  }
  return {
    googleId: data.sub,
    email: data.email,
    name: data.name || data.email.split("@")[0],
    picture: data.picture || null,
  };
}

// POST /api/auth/google
router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: "Google credential is required." });
    }

    if (!process.env.GOOGLE_CLIENT_ID ||
        process.env.GOOGLE_CLIENT_ID.includes("REPLACE")) {
      return res.status(503).json({
        error: "Google Sign-In is not configured. Add GOOGLE_CLIENT_ID to your .env file.",
        setupRequired: true,
      });
    }

    // Verify the token with Google
    let googleUser;
    try {
      googleUser = await verifyGoogleToken(credential);
    } catch (err) {
      return res.status(401).json({ error: "Could not verify Google account. Please try again." });
    }

    // Check if user already exists by email
    let user = await findOne(collections.users, { email: googleUser.email.toLowerCase() });

    if (user) {
      // Existing user — update their Google ID if not set
      if (!user.googleId) {
        await update(collections.users, { email: user.email }, {
          googleId: googleUser.googleId,
          picture: googleUser.picture,
        });
      }
    } else {
      // New user — create account automatically
      const id = uuidv4();
      await insert(collections.users, {
        id,
        email: googleUser.email.toLowerCase(),
        password: null, // Google users have no password
        name: googleUser.name,
        googleId: googleUser.googleId,
        picture: googleUser.picture,
        plan: "free",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionStatus: "inactive",
        subscriptionEnd: null,
        createdAt: new Date().toISOString(),
      });
      user = await findOne(collections.users, { id });
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "30d" });

    res.json({
      message: "Google sign-in successful.",
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        plan: user.plan,
        limits: PLANS[user.plan] || PLANS.free,
      },
    });
  } catch (err) {
    console.error("Google auth error:", err.message);
    res.status(500).json({ error: "Google sign-in failed. Please try again." });
  }
});

// GET /api/auth/google-config
// Returns the Google Client ID safely to the frontend
router.get('/google-config', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || "376451848884-hcdi67fcdr3f1of4fefd7gqnvpka9m91.apps.googleusercontent.com";
  res.json({ clientId, configured: true });
});

module.exports = router;
