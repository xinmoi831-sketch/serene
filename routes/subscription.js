const express = require("express");
const { collections, findOne, update } = require("../lib/db");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.includes("REPLACE")) return null;
  return require("stripe")(process.env.STRIPE_SECRET_KEY);
}

// GET /api/subscription/plans
router.get("/plans", (req, res) => {
  res.json({
    plans: [
      {
        id: "free",
        name: "Free",
        price: "$0",
        interval: "forever",
        features: [
          "200 AI messages per day",
          "5 journal entries",
          "Mood tracking",
          "End-to-end encryption",
          "Basic chat history",
        ],
      },
      {
        id: "pro_monthly",
        name: "Pro Monthly",
        price: "$19",
        interval: "per month",
        stripePriceId: process.env.STRIPE_PRICE_MONTHLY,
        trial: "7-day free trial",
        popular: true,
        features: [
          "Unlimited AI messages per day",
          "Unlimited journal entries",
          "AI journal reflections",
          "Mood analytics and insights",
          "Export all your data",
          "Priority support",
          "End-to-end encryption",
        ],
      },
      {
        id: "live_session",
        name: "Live Session",
        price: "$25",
        interval: "per session",
        stripePriceId: process.env.STRIPE_PRICE_LIVE_SESSION,
        features: [
          "1-on-1 live AI wellness session",
          "60 minutes dedicated support",
          "Session summary and action plan",
          "Follow-up resources",
          "Priority response time",
        ],
      },
    ],
    paymentMethods: [
      { name: "Mastercard", icon: "credit-card" },
      { name: "PayPal",     icon: "brand-paypal" },
      { name: "Stripe",     icon: "credit-card" },
    ],
  });
});

// POST /api/subscription/checkout
router.post("/checkout", authenticate, async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({
        error: "Payment system not configured yet. Add your Stripe key to the Railway variables.",
        setupRequired: true,
      });
    }

    const { priceId, mode } = req.body;
    if (!priceId) return res.status(400).json({ error: "Price ID is required." });

    let customerId = req.user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: req.user.name || undefined,
        metadata: { userId: req.user.id },
      });
      customerId = customer.id;
      await update(collections.users, { id: req.user.id }, { stripeCustomerId: customerId });
    }

    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    // Live sessions are one-time payments, subscriptions are recurring
    const checkoutMode = mode === "payment" ? "payment" : "subscription";

    const sessionConfig = {
      customer: customerId,
      mode: checkoutMode,
      payment_method_types: ["card", "paypal"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: baseUrl + "/payment-success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: baseUrl + "/payment-cancel",
      metadata: { userId: req.user.id },
      allow_promotion_codes: true,
    };

    // Only add trial for subscriptions
    if (checkoutMode === "subscription") {
      sessionConfig.subscription_data = {
        trial_period_days: 7,
        metadata: { userId: req.user.id },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (err) {
    console.error("Checkout error:", err.message);
    res.status(500).json({ error: "Could not start checkout. Please try again." });
  }
});

// POST /api/subscription/portal
router.post("/portal", authenticate, async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: "Payment system not configured.", setupRequired: true });
    if (!req.user.stripeCustomerId) return res.status(400).json({ error: "No subscription found." });
    const session = await stripe.billingPortal.sessions.create({
      customer: req.user.stripeCustomerId,
      return_url: (process.env.FRONTEND_URL || "http://localhost:3000") + "/settings",
    });
    res.json({ portalUrl: session.url });
  } catch (err) {
    res.status(500).json({ error: "Could not open billing portal." });
  }
});

// GET /api/subscription/status
router.get("/status", authenticate, (req, res) => {
  res.json({
    plan: req.user.plan,
    status: req.user.subscriptionStatus,
    subscriptionEnd: req.user.subscriptionEnd,
    hasPaymentMethod: !!req.user.stripeCustomerId,
  });
});

// POST /api/subscription/webhook
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.json({ received: true });
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: "Webhook signature invalid." });
  }
  const obj = event.data.object;
  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const userId = obj.metadata?.userId;
        if (!userId) break;
        const newPlan = (obj.status === "active" || obj.status === "trialing") ? "pro" : "free";
        await update(collections.users, { id: userId }, {
          plan: newPlan,
          stripeSubscriptionId: obj.id,
          subscriptionStatus: obj.status,
          subscriptionEnd: new Date(obj.current_period_end * 1000).toISOString(),
        });
        break;
      }
      case "customer.subscription.deleted": {
        const userId = obj.metadata?.userId;
        if (userId) await update(collections.users, { id: userId }, { plan: "free", subscriptionStatus: "canceled", stripeSubscriptionId: null });
        break;
      }
      case "invoice.payment_failed": {
        const user = await findOne(collections.users, { stripeCustomerId: obj.customer });
        if (user) await update(collections.users, { id: user.id }, { subscriptionStatus: "past_due" });
        break;
      }
      case "invoice.payment_succeeded": {
        const user = await findOne(collections.users, { stripeCustomerId: obj.customer });
        if (user) await update(collections.users, { id: user.id }, { subscriptionStatus: "active" });
        break;
      }
    }
  } catch (err) {
    console.error("Webhook error:", err.message);
  }
  res.json({ received: true });
});

module.exports = router;
