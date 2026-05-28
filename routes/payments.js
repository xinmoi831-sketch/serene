// Serene — Clean Payment System
// Supports: PayPal + Pesapal
// Simple, no complexity, no old code

const express            = require('express');
const { authenticate }   = require('../middleware/auth');
const { collections, findOne, update, insert } = require('../lib/db');
const { v4: uuidv4 }     = require('uuid');

const router = express.Router();

const PLANS = {
  pro_monthly: { name: 'Pro Monthly', amountKES: 250, amountUSD: 9, currency: 'ZMW' },
  live_session: { name: 'Live Session', amountKES: 120, amountUSD: 4.50, currency: 'ZMW' },
};

const BASE_URL = process.env.FRONTEND_URL || 'https://serene-production-9b12.up.railway.app';

// ── PAYPAL ────────────────────────────────────────────────────────
async function getPayPalToken() {
  const id     = (process.env.PAYPAL_CLIENT_ID     || '').trim();
  const secret = (process.env.PAYPAL_CLIENT_SECRET || '').trim();
  if (!id   || id.includes('REPLACE'))     throw new Error('PAYPAL_CLIENT_ID is not set in your .env file.');
  if (!secret || secret.includes('REPLACE')) throw new Error('PAYPAL_CLIENT_SECRET is not set in your .env file.');

  const base = process.env.NODE_ENV === 'production'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  const res  = await fetch(base + '/v1/oauth2/token', {
    method:  'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'),
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new Error('PayPal auth failed: ' + JSON.stringify(data));
  return { token: data.access_token, base };
}

// POST /api/payments/paypal
router.post('/paypal', authenticate, async (req, res) => {
  try {
    const { planId } = req.body;
    const plan = PLANS[planId];
    if (!plan) return res.status(400).json({ error: 'Invalid plan.' });

    const { token, base } = await getPayPalToken();
    const reference = 'SERENE-' + req.user.id + '-' + Date.now();

    const order = await fetch(base + '/v2/checkout/orders', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id:  reference,
          description:   'Serene ' + plan.name,
          custom_id:     req.user.id + '|' + planId,
          amount:        { currency_code: 'USD', value: plan.amountUSD.toFixed(2) },
        }],
        application_context: {
          brand_name:          'Serene Mental Health',
          user_action:         'PAY_NOW',
          shipping_preference: 'NO_SHIPPING',
          return_url:          BASE_URL + '/api/payments/paypal/callback',
          cancel_url:          BASE_URL + '/payment-cancel',
        },
      }),
    });

    const orderData = await order.json();
    if (!order.ok) throw new Error('PayPal order failed: ' + JSON.stringify(orderData));

    const approveUrl = orderData.links.find(l => l.rel === 'approve')?.href;
    if (!approveUrl) throw new Error('No approval URL from PayPal');

    res.json({ paymentUrl: approveUrl, reference });
  } catch (err) {
    console.error('[PayPal] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/payments/paypal/callback
router.get('/paypal/callback', async (req, res) => {
  try {
    const { token: orderId } = req.query;
    if (!orderId) return res.redirect('/payment-cancel?reason=no_order');

    const { token, base } = await getPayPalToken();

    // Capture payment
    const capture = await fetch(base + '/v2/checkout/orders/' + orderId + '/capture', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    });

    const data = await capture.json();
    console.log('[PayPal] Capture status:', data.status);

    if (data.status !== 'COMPLETED') {
      return res.redirect('/payment-cancel?reason=not_completed');
    }

    // Get userId and planId from custom_id
    const customId = data.purchase_units?.[0]?.payments?.captures?.[0]?.custom_id || '';
    const [userId, planId] = customId.split('|');

    if (userId) {
      await activateSubscription(userId, planId || 'pro_monthly', 'paypal', data.id);
    }

    res.redirect('/payment-success?method=paypal');
  } catch (err) {
    console.error('[PayPal] Callback error:', err.message);
    res.redirect('/payment-cancel?reason=error');
  }
});

// ── PESAPAL ───────────────────────────────────────────────────────
async function getPesapalToken() {
  const key    = (process.env.PESAPAL_CONSUMER_KEY    || '').trim();
  const secret = (process.env.PESAPAL_CONSUMER_SECRET || '').trim();
  if (!key   || key.includes('REPLACE'))    throw new Error('PESAPAL_CONSUMER_KEY is not set in your .env file.');
  if (!secret || secret.includes('REPLACE')) throw new Error('PESAPAL_CONSUMER_SECRET is not set in your .env file.');

  const base = process.env.PESAPAL_ENV === 'live'
    ? 'https://pay.pesapal.com/v3'
    : 'https://cybqa.pesapal.com/pesapalv3';

  const res  = await fetch(base + '/api/Auth/RequestToken', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ consumer_key: key, consumer_secret: secret }),
  });
  const data = await res.json();
  if (!res.ok || !data.token) throw new Error('Pesapal auth failed: ' + JSON.stringify(data));
  return { token: data.token, base };
}

// POST /api/payments/pesapal
router.post('/pesapal', authenticate, async (req, res) => {
  try {
    const { planId } = req.body;
    const plan = PLANS[planId];
    if (!plan) return res.status(400).json({ error: 'Invalid plan.' });

    const { token, base } = await getPesapalToken();
    const reference = 'SERENE-' + req.user.id + '-' + Date.now();

    // Register IPN first
    const ipnRes  = await fetch(base + '/api/URLSetup/RegisterIPN', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: BASE_URL + '/api/payments/pesapal/ipn', ipn_notification_type: 'POST' }),
    });
    const ipnData = await ipnRes.json();
    const ipnId   = ipnData.ipn_id || '';

    // Submit order
    const orderRes = await fetch(base + '/api/Transactions/SubmitOrderRequest', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id:              reference,
        currency:        'ZMW',
        amount:          plan.amountKES,
        description:     'Serene ' + plan.name,
        callback_url:    BASE_URL + '/api/payments/pesapal/callback',
        notification_id: ipnId,
        billing_address: {
          email_address: req.user.email,
          first_name:    req.user.name || 'User',
        },
      }),
    });

    const orderData = await orderRes.json();
    if (!orderRes.ok || !orderData.redirect_url) {
      throw new Error('Pesapal order failed: ' + JSON.stringify(orderData));
    }

    // Store reference for callback
    await insert(collections.payments || 'payments', {
      id: uuidv4(), userId: req.user.id, planId,
      reference, provider: 'pesapal', status: 'pending',
      createdAt: new Date().toISOString(),
    });

    res.json({ paymentUrl: orderData.redirect_url, reference });
  } catch (err) {
    console.error('[Pesapal] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/payments/pesapal/callback
router.get('/pesapal/callback', async (req, res) => {
  try {
    const { OrderTrackingId, OrderMerchantReference } = req.query;
    if (!OrderTrackingId) return res.redirect('/payment-cancel?reason=no_tracking');

    const { token, base } = await getPesapalToken();

    const statusRes  = await fetch(
      base + '/api/Transactions/GetTransactionStatus?orderTrackingId=' + OrderTrackingId,
      { headers: { 'Authorization': 'Bearer ' + token } }
    );
    const statusData = await statusRes.json();
    console.log('[Pesapal] Status:', statusData.payment_status_description);

    if (statusData.payment_status_description === 'Completed') {
      // Find userId from reference
      const parts  = (OrderMerchantReference || '').split('-');
      const userId = parts[1];
      if (userId) {
        await activateSubscription(userId, 'pro_monthly', 'pesapal', OrderTrackingId);
      }
      res.redirect('/payment-success?method=pesapal');
    } else {
      res.redirect('/payment-cancel?reason=not_completed');
    }
  } catch (err) {
    console.error('[Pesapal] Callback error:', err.message);
    res.redirect('/payment-cancel?reason=error');
  }
});

// POST /api/payments/pesapal/ipn
router.post('/pesapal/ipn', async (req, res) => {
  res.json({ status: 'received' });
});

// ── ACTIVATE SUBSCRIPTION ─────────────────────────────────────────
async function activateSubscription(userId, planId, provider, transactionId) {
  // Idempotency: skip if this transaction was already processed
  if (transactionId) {
    const existing = await findOne(collections.payments, { reference: transactionId });
    if (existing) {
      console.log('[Payment] Duplicate callback ignored for transaction:', transactionId);
      return;
    }
  }

  const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await update(collections.users, { id: userId }, {
    plan:               'pro',
    subscriptionStatus: 'active',
    subscriptionEnd:    expiry,
    messagesPerDay:     1000,
  });

  // Record payment for audit trail
  await insert(collections.payments, {
    id:        uuidv4(),
    userId,
    planId:    planId || 'pro_monthly',
    reference: transactionId || ('manual-' + Date.now()),
    provider,
    status:    'completed',
    createdAt: new Date().toISOString(),
    expiresAt: expiry,
  });

  console.log('[Payment] Activated pro for user:', userId, 'via', provider, '| tx:', transactionId);
}

// GET /api/payments/config — tells the frontend which providers are ready
router.get('/config', (req, res) => {
  const ppId     = (process.env.PAYPAL_CLIENT_ID     || '').trim();
  const ppSecret = (process.env.PAYPAL_CLIENT_SECRET || '').trim();
  const ppReady  = !!(ppId && !ppId.includes('REPLACE') && ppSecret && !ppSecret.includes('REPLACE'));

  const pesKey    = (process.env.PESAPAL_CONSUMER_KEY    || '').trim();
  const pesSecret = (process.env.PESAPAL_CONSUMER_SECRET || '').trim();
  const pesReady  = !!(pesKey && !pesKey.includes('REPLACE') && pesSecret && !pesSecret.includes('REPLACE'));

  res.json({
    paypal:  ppReady,
    pesapal: pesReady,
    paypalClientId: ppReady ? ppId : null,
    mode: process.env.NODE_ENV === 'production' ? 'live' : 'sandbox',
  });
});

// GET /api/payments/status
router.get('/status', authenticate, async (req, res) => {
  const user = await findOne(collections.users, { id: req.user.id });
  res.json({
    plan:    user?.plan || 'free',
    status:  user?.subscriptionStatus || 'inactive',
    expires: user?.subscriptionEnd || null,
  });
});

// GET /api/payments/plans
router.get('/plans', (req, res) => {
  res.json({ plans: PLANS, currency: 'ZMW' });
});

module.exports = router;
