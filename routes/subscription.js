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
        id: "free", name: "Free", price: "$0", interval: "forever",
        features: ["10 AI messages per day","5 journal entries","Mood tracking","End-to-end encryption"],
      },
      {
        id: "pro_monthly", name: "Pro", price: "$9.99", interval: "per month",
        stripePriceId: process.env.STRIPE_PRICE_MONTHLY,
        trial: "7-day free trial", popular: true,
        features: ["500 AI messages per day","Unlimited journal entries","AI journal reflections","Mood analytics","Export your data","Priority support"],
      },
      {
        id: "pro_annual", name: "Pro Annual", price: "$79", interval: "per year",
        stripePriceId: process.env.STRIPE_PRICE_ANNUAL,
        savings: "Save $40 vs monthly", trial: "7-day free trial",
        features: ["Everything in Pro Monthly","2 months free","Annual wellness report"],
      },
    ],
    paymentMethods: ["Visa", "Mastercard", "PayPal"],
  });
});

// POST /api/subscription/checkout
router.post("/checkout", authenticate, async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ error: "Payments not configured yet. Add STRIPE_SECRET_KEY to your .env file.", setupRequired: true });
    }

    const { priceId } = req.body;
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
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card", "paypal"],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: 7, metadata: { userId: req.user.id } },
      success_url: `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/payment-cancel`,
      metadata: { userId: req.user.id },
      allow_promotion_codes: true,
    });

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
    if (!stripe) return res.status(503).json({ error: "Payments not configured.", setupRequired: true });
    if (!req.user.stripeCustomerId) return res.status(400).json({ error: "No subscription found." });

    const session = await stripe.billingPortal.sessions.create({
      customer: req.user.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/settings`,
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
        const isAnnual = obj.items?.data[0]?.price?.id === process.env.STRIPE_PRICE_ANNUAL;
        const newPlan = (obj.status === "active" || obj.status === "trialing") ? (isAnnual ? "annual" : "pro") : "free";
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
