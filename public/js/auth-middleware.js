const jwt = require("jsonwebtoken");
const { collections, findOne } = require("../lib/db");

const PLANS = {
  free:   { messagesPerDay: 200, journals: 5,       reflections: false, label: "Free" },
  pro:    { messagesPerDay: 500, journals: Infinity, reflections: true,  label: "Pro Monthly" },
  annual: { messagesPerDay: 500, journals: Infinity, reflections: true,  label: "Pro Annual" },
};

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Login required." });
  }
  try {
    const decoded = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
    const user = await findOne(collections.users, { id: decoded.id });
    if (!user) return res.status(401).json({ error: "User not found." });
    req.user = user;
    req.plan = PLANS[user.plan] || PLANS.free;
    next();
  } catch {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }
}

// Blocks unverified users — server-side enforcement
function requirePhoneVerified(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  if (!req.user.phoneVerified) {
    return res.status(403).json({
      error: "Phone verification required.",
      requiresPhoneVerification: true
    });
  }
  next();
}

async function checkDailyLimit(req, res, next) {
  const today = new Date().toISOString().slice(0, 10);
  const record = await findOne(collections.usage, { userId: req.user.id, date: today });
  const used = record ? record.count : 0;
  const limit = req.plan.messagesPerDay;
  if (used >= limit) {
    return res.status(429).json({
      error: `Daily limit of ${limit} messages reached.`,
      upgradeRequired: req.user.plan === "free",
      used, limit,
    });
  }
  req.dailyUsed = used;
  next();
}

function requirePro(req, res, next) {
  if (req.user.plan === "free") {
    return res.status(403).json({ error: "Pro subscription required.", upgradeRequired: true });
  }
  next();
}

module.exports = { authenticate, requirePhoneVerified, checkDailyLimit, requirePro, PLANS };
