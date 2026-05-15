require("dotenv").config();

// Check required env vars on startup
const required = ["JWT_SECRET", "ENCRYPTION_MASTER_KEY"];
const missing = required.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error("\nERROR: Missing required environment variables:", missing.join(", "));
  console.error("Run 'node setup.js' to create your .env file automatically.\n");
  process.exit(1);
}

const express = require("express");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/auth");
const chatRoutes = require("./routes/chat");
const journalRoutes = require("./routes/journal");
const subscriptionRoutes = require("./routes/subscription");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Stripe webhook needs raw body — must be BEFORE express.json() ─
app.use("/api/subscription/webhook", express.raw({ type: "application/json" }));

// ── Core middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// Serve the payment success/cancel pages
app.use(express.static(path.join(__dirname, "public")));

// Security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

// ── Rate limiting ─────────────────────────────────────────────────
// Global: 100 requests per minute
app.use("/api/", rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a moment." },
  skip: req => req.path.includes("/webhook"),
}));

// Auth endpoints: stricter (10 attempts per 15 min — prevents brute force)
app.use("/api/auth/login", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts. Please wait 15 minutes." },
}));
app.use("/api/auth/register", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many registration attempts. Please wait 15 minutes." },
}));

// ── Routes ────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/journal", journalRoutes);
app.use("/api/subscription", subscriptionRoutes);

// ── Payment pages ─────────────────────────────────────────────────
app.get("/payment-success", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "payment-success.html"));
});
app.get("/payment-cancel", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "payment-cancel.html"));
});

// ── Health check ──────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status: "running",
    app: "Serene Mental Health API",
    version: "3.0.0",
    ai: `Ollama (${process.env.OLLAMA_MODEL || "llama3.2"})`,
    payments: process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes("REPLACE")
      ? "Stripe active (Visa, Mastercard, PayPal)"
      : "Stripe not configured (add key to .env)",
    endpoints: {
      "POST /api/auth/register":          "Create account",
      "POST /api/auth/login":             "Login",
      "GET  /api/auth/me":                "Get current user",
      "POST /api/chat/message":           "Send a message to AI",
      "GET  /api/chat/history":           "Get chat history",
      "POST /api/journal/entry":          "Save journal entry",
      "GET  /api/journal/entries":        "Get journal entries",
      "POST /api/journal/mood":           "Log mood",
      "GET  /api/journal/mood/history":   "Get mood history",
      "GET  /api/subscription/plans":     "View pricing plans",
      "POST /api/subscription/checkout":  "Start payment checkout",
      "POST /api/subscription/portal":    "Manage subscription",
    },
  });
});

// ── 404 handler ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ── Global error handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unexpected error:", err.message);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

// ── Start server ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("\n================================================");
  console.log("   Serene Mental Health API v3");
  console.log("================================================");
  console.log(`   URL:      http://localhost:${PORT}`);
  console.log(`   AI:       Ollama / ${process.env.OLLAMA_MODEL || "llama3.2"}`);
  console.log(`   Database: serene.db (SQLite)`);

  const stripeReady = process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes("REPLACE");
  console.log(`   Payments: ${stripeReady ? "Stripe active (Visa, MC, PayPal)" : "Not configured (optional)"}`);
  console.log("================================================\n");

  if (!stripeReady) {
    console.log("   To enable payments:");
    console.log("   1. Get free Stripe keys at dashboard.stripe.com");
    console.log("   2. Add STRIPE_SECRET_KEY to your .env file\n");
  }

  console.log("   Make sure Ollama is running:");
  console.log("   Open a NEW terminal and type: ollama serve\n");
});
