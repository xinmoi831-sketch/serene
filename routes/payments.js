// routes/payments.js
// Clean payment API using the modular payment architecture

const express            = require('express');
const { authenticate }   = require('../middleware/auth');
const { PaymentRouter }  = require('../payments/PaymentRouter');
const SubscriptionEngine = require('../payments/engine/SubscriptionEngine');

const router = express.Router();

// GET /api/payments/plans
// Returns plans with localized pricing for user's country
router.get('/plans', async (req, res) => {
  try {
    const countryCode = req.headers['x-country'] || req.query.country || 'US';
    const plans       = PaymentRouter.getPlans(countryCode);
    const methods     = PaymentRouter.getMethodsForCountry(countryCode);
    const currency    = PaymentRouter.getCurrencyForCountry(countryCode);
    res.json({ plans, methods, currency, country: countryCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/initiate
// Start a payment — returns URL to redirect user to
router.post('/initiate', authenticate, async (req, res) => {
  try {
    const { planId, method } = req.body;
    const countryCode = req.headers['x-country'] || req.body.country || 'US';

    if (!planId) return res.status(400).json({ error: 'planId is required.' });

    const result = await PaymentRouter.initiatePayment({
      planId,
      userId:       req.user.id,
      userEmail:    req.user.email,
      userName:     req.user.name || req.user.email,
      countryCode,
      methodOverride: method || null,
    });

    res.json({
      ok:          true,
      paymentUrl:  result.paymentUrl,
      provider:    result.provider,
      reference:   result.reference,
      amount:      result.amount,
      currency:    result.currency,
      planId,
    });
  } catch (err) {
    console.error('[Payments] Initiate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/payments/status
// Check user's current subscription
router.get('/status', authenticate, async (req, res) => {
  try {
    const status = await SubscriptionEngine.checkSubscription(req.user.id);
    const limit  = await SubscriptionEngine.checkDailyLimit(req.user.id);
    res.json({ ...status, ...limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/callback/dpo
// DPO Group payment verification callback
router.get('/callback/dpo', async (req, res) => {
  try {
    const { TransactionToken, CompanyRef, CCDapproval } = req.query;
    if (!TransactionToken) return res.redirect('/payment-cancel');

    const verified = await PaymentRouter.verifyPayment({
      method:  'dpo',
      payload: req.query,
      headers: req.headers,
    });

    if (verified.success) {
      // Parse userId and planId from reference: SERENE-{userId}-{timestamp}
      const parts  = (CompanyRef || '').split('-');
      const userId = parts[1];
      const planId = req.query.planId || 'premium';

      if (userId) {
        await SubscriptionEngine.handlePaymentCallback({
          provider:  'dpo',
          reference: CompanyRef,
          planId,
          userId,
          amount:    req.query.TransactionAmount,
          currency:  req.query.TransactionCurrency,
        });
      }
      res.redirect('/payment-success?method=dpo&ref=' + CompanyRef);
    } else {
      res.redirect('/payment-cancel?reason=verification_failed');
    }
  } catch (err) {
    console.error('[Payments] DPO callback error:', err.message);
    res.redirect('/payment-cancel?reason=error');
  }
});

// GET /api/payments/callback/paypal
// PayPal payment capture after approval
router.get('/callback/paypal', async (req, res) => {
  try {
    const { token, PayerID, ref } = req.query;
    if (!token) return res.redirect('/payment-cancel');

    const verified = await PaymentRouter.verifyPayment({
      method:  'paypal',
      payload: { orderId: token, payerId: PayerID },
      headers: req.headers,
    });

    if (verified.success) {
      const parts  = (ref || verified.reference || '').split('-');
      const userId = parts[1];
      const planId = req.query.planId || 'premium';

      if (userId) {
        await SubscriptionEngine.handlePaymentCallback({
          provider:  'paypal',
          reference: ref || verified.reference,
          planId,
          userId,
          amount:    verified.amount,
          currency:  'USD',
        });
      }
      res.redirect('/payment-success?method=paypal&ref=' + (ref || token));
    } else {
      res.redirect('/payment-cancel?reason=capture_failed');
    }
  } catch (err) {
    console.error('[Payments] PayPal callback error:', err.message);
    res.redirect('/payment-cancel?reason=error');
  }
});

// POST /api/payments/cancel
// Cancel subscription
router.post('/cancel', authenticate, async (req, res) => {
  try {
    const result = await SubscriptionEngine.cancelSubscription(req.user.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
