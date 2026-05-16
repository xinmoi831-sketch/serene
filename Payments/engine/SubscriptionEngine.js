// payments/engine/SubscriptionEngine.js
// Core subscription business logic — completely independent of payment provider

const { v4: uuidv4 } = require('uuid');
const { collections, findOne, insert, update, find } = require('../../lib/db');
const { PLANS } = require('../PaymentRouter');

class SubscriptionEngine {

  // Activate subscription after successful payment
  async activateSubscription({ userId, planId, reference, provider, amount, currency, durationDays }) {
    const plan = PLANS[planId];
    if (!plan) throw new Error('Invalid plan: ' + planId);

    const now    = new Date();
    const expiry = new Date(now.getTime() + (durationDays || 30) * 24 * 60 * 60 * 1000);

    await update(collections.users, { id: userId }, {
      plan:               planId === 'live_session' ? 'pro' : planId,
      subscriptionStatus: 'active',
      subscriptionStart:  now.toISOString(),
      subscriptionEnd:    expiry.toISOString(),
      messagesPerDay:     plan.messagesPerDay || 1000,
    });

    // Log the payment
    await insert(collections.payments || 'payments', {
      id:        uuidv4(),
      userId,
      planId,
      reference,
      provider,
      amount,
      currency,
      status:    'completed',
      createdAt: now.toISOString(),
      expiresAt: expiry.toISOString(),
    });

    console.log('[Subscription] Activated ' + planId + ' for user ' + userId + ' via ' + provider);
    return { planId, expiresAt: expiry.toISOString() };
  }

  // Check if user's subscription is still active
  async checkSubscription(userId) {
    const user = await findOne(collections.users, { id: userId });
    if (!user) return { plan: 'free', active: false };

    if (user.plan === 'free' || !user.subscriptionEnd) {
      return { plan: 'free', active: false, messagesPerDay: 200 };
    }

    const now    = new Date();
    const expiry = new Date(user.subscriptionEnd);
    const active = expiry > now;

    if (!active && user.plan !== 'free') {
      // Subscription expired — downgrade to free
      await update(collections.users, { id: userId }, {
        plan:               'free',
        subscriptionStatus: 'expired',
        messagesPerDay:     200,
      });
      return { plan: 'free', active: false, messagesPerDay: 200, expired: true };
    }

    const plan = PLANS[user.plan] || PLANS.free;
    return {
      plan:          user.plan,
      active,
      messagesPerDay: plan.messagesPerDay || user.messagesPerDay || 200,
      expiresAt:     user.subscriptionEnd,
      daysRemaining: Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)),
    };
  }

  // Check daily message limit
  async checkDailyLimit(userId) {
    const today = new Date().toISOString().slice(0, 10);
    const sub   = await this.checkSubscription(userId);
    const limit = sub.messagesPerDay;

    const usage = await findOne(collections.usage, { userId, date: today });
    const used  = usage ? usage.count : 0;

    return {
      allowed:   used < limit,
      used,
      limit,
      remaining: Math.max(0, limit - used),
      plan:      sub.plan,
    };
  }

  // Handle payment callback from any provider
  async handlePaymentCallback({ provider, reference, planId, userId, amount, currency }) {
    try {
      await this.activateSubscription({
        userId,
        planId:      planId || 'premium',
        reference,
        provider,
        amount,
        currency,
        durationDays: planId === 'live_session' ? 1 : 30,
      });
      return { success: true };
    } catch (err) {
      console.error('[Subscription] Callback error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // Cancel subscription
  async cancelSubscription(userId) {
    await update(collections.users, { id: userId }, {
      subscriptionStatus: 'cancelled',
    });
    // Keep access until end of billing period
    return { cancelled: true, message: 'Access continues until subscription period ends.' };
  }
}

module.exports = new SubscriptionEngine();
