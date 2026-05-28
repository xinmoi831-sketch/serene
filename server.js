require("dotenv").config();

const required = ["JWT_SECRET", "ENCRYPTION_MASTER_KEY"];
const missing = required.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error("ERROR: Missing required environment variables:", missing.join(", "));
  process.exit(1);
}

const express = require("express");
const cors    = require("cors");
const path    = require("path");
const fs      = require("fs");
const rateLimit = require("express-rate-limit");

// Create data directory for NeDB
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const app  = express();
const PORT = process.env.PORT || 3000;

// Trust Railway's proxy — required for rate limiting to work correctly
app.set("trust proxy", 1);

// Stripe webhook must come before express.json()
app.use("/api/subscription/webhook", express.raw({ type: "application/json" }));

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

app.use("/api/", rateLimit({
  windowMs: 60 * 1000, max: 100,
  standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many requests." },
  skip: req => req.path.includes("/webhook"),
}));

// Groq test endpoint
app.get("/api/test-groq", async (req, res) => {
  const rawKey = process.env.GROQ_API_KEY || "";
  const apiKey = rawKey.trim();
  if (!apiKey) return res.json({ ok: false, error: "GROQ_API_KEY is not set", raw_length: rawKey.length });
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: "Say hello in one word" }],
        max_tokens: 10,
      }),
    });
    const data = await response.json();
    if (!response.ok) return res.json({ ok: false, status: response.status, error: data, keyPrefix: apiKey.substring(0, 10), keyLength: apiKey.length });
    res.json({ ok: true, reply: data.choices?.[0]?.message?.content, keyPrefix: apiKey.substring(0, 10), keyLength: apiKey.length });
  } catch (err) {
    res.json({ ok: false, error: err.message, keyPrefix: apiKey.substring(0, 10) });
  }
});

// Load routes safely
try {
  const authRoutes         = require("./routes/auth");
  const googleAuthRoutes   = require("./routes/google-auth");
  const verificationModule = require("./routes/verification");
  const verificationRoutes = verificationModule.router || verificationModule;
  const chatRoutes         = require("./routes/chat");
  const journalRoutes      = require("./routes/journal");
  const subscriptionRoutes = require("./routes/subscription");
  const ttsRoutes          = require("./routes/tts");
  const paymentRoutes      = require("./routes/payments");
  const therapistRoutes    = require("./routes/therapists");

  app.use("/api/auth",         authRoutes);
  app.use("/api/auth",         googleAuthRoutes);
  app.use("/api/auth",         verificationRoutes);
  app.use("/api/chat",         chatRoutes);
  app.use("/api/journal",      journalRoutes);
  app.use("/api/subscription", subscriptionRoutes);
  app.use("/api/tts",          ttsRoutes);
  app.use("/api/payments",     paymentRoutes);
  app.use("/api/therapists",   therapistRoutes);

  console.log("All routes loaded successfully");
} catch (err) {
  console.error("Route loading error:", err.message);
  process.exit(1);
}

app.get("/payment-success", (req, res) => res.sendFile(path.join(__dirname, "public", "payment-success.html")));
app.get("/payment-cancel",  (req, res) => res.sendFile(path.join(__dirname, "public", "payment-cancel.html")));

app.get("*", (req, res) => {
  const indexPath = path.join(__dirname, "public", "index.html");
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ status: "running", app: "Serene Mental Health API v3" });
});

app.use((err, req, res, next) => {
  console.error("Error:", err.message);
  res.status(500).json({ error: "Something went wrong." });
});

app.listen(PORT, () => {
  console.log("================================================");
  console.log("   Serene Mental Health API v3");
  console.log("================================================");
  console.log("   PORT: " + PORT);
  console.log("   AI:   Groq / llama-3.3-70b-versatile");
  console.log("================================================");
});
