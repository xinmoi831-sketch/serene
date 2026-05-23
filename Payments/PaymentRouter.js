// payments/PaymentRouter.js
// Core routing layer — decides which payment provider to use based on country

const DPOProvider       = require('./providers/DPOProvider');
const PayPalProvider    = require('./providers/PayPalProvider');
const MobileMoneyProvider = require('./providers/MobileMoneyProvider');

// Country → preferred payment methods (in priority order)
const COUNTRY_ROUTES = {
  // Zambia
  ZM: ['mobilemoney', 'dpo', 'paypal'],
  // East Africa
  KE: ['mobilemoney', 'dpo', 'paypal'],
  TZ: ['mobilemoney', 'dpo', 'paypal'],
  UG: ['mobilemoney', 'dpo', 'paypal'],
  // Southern Africa
  ZA: ['dpo', 'paypal'],
  MW: ['mobilemoney', 'dpo'],
  MZ: ['mobilemoney', 'dpo'],
  // West Africa
  NG: ['dpo', 'paypal'],
  GH: ['mobilemoney', 'dpo'],
  // Rest of world — default
  DEFAULT: ['paypal', 'dpo'],
};

// Currency map
const COUNTRY_CURRENCY = {
  ZM:'ZMW', KE:'KES', TZ:'TZS', UG:'UGX', ZA:'ZAR',
  MW:'MWK', NG:'NGN', GH:'GHS', GB:'GBP', US:'USD',
  DEFAULT:'USD',
};

// Plans — independent of payment provider
const PLANS = {
  free: {
    id:            'free',
    name:          'Free',
    messagesPerDay: 200,
    price:          0,
    currency:       'USD',
    features:       ['200 messages/day','Journal entries','Mood tracking','Encrypted storage'],
  },
  premium: {
    id:            'premium',
    name:          'Premium',
    messagesPerDay: 1000,
    priceUSD:       4.50,
    features:       ['1000 messages/day','Unlimited journal','AI reflections','Voice mode unlimited','Priority support'],
  },
  live_session: {
    id:            'live_session',
    name:          'Live Session',
    messagesPerDay: null, // one-time, not recurring
    priceUSD:       4.50,
    features:       ['60 min dedicated AI session','Session summary','Follow-up resources','Priority response'],
  },
};

class PaymentRouter {
  constructor() {
    this.providers = {
      dpo:         new DPOProvider(),
      paypal:      new PayPalProvider(),
      mobilemoney: new MobileMoneyProvider(),
    };
  }

  // Get available payment methods for a country
  getMethodsForCountry(countryCode) {
    const code    = (countryCode || 'DEFAULT').toUpperCase();
    const methods = COUNTRY_ROUTES[code] || COUNTRY_ROUTES.DEFAULT;
    return methods.filter(m => this.providers[m] && this.providers[m].isConfigured());
  }

  // Get currency for country
  getCurrencyForCountry(countryCode) {
    const code = (countryCode || 'DEFAULT').toUpperCase();
    return COUNTRY_CURRENCY[code] || COUNTRY_CURRENCY.DEFAULT;
  }

  // Route a payment to the right provider
  async initiatePayment({ planId, userId, userEmail, userName, countryCode, methodOverride }) {
    const plan = PLANS[planId];
    if (!plan) throw new Error('Invalid plan: ' + planId);
    if (plan.priceUSD === 0) throw new Error('Free plan requires no payment.');

    const currency = this.getCurrencyForCountry(countryCode);
    const methods  = methodOverride
      ? [methodOverride]
      : this.getMethodsForCountry(countryCode);

    if (methods.length === 0) {
      throw new Error('No payment methods available for country: ' + countryCode);
    }

    // Try providers in order until one works
    let lastError;
    for (const method of methods) {
      const provider = this.providers[method];
      if (!provider || !provider.isConfigured()) continue;
      try {
        const result = await provider.createPayment({
          planId,
          plan,
          userId,
          userEmail,
          userName,
          currency,
          countryCode,
        });
        return {
          ok:         true,
          method,
          provider:   method,
          currency,
          planId,
          ...result,
        };
      } catch (err) {
        console.error('[PaymentRouter] Provider ' + method + ' failed:', err.message);
        lastError = err;
      }
    }

    throw lastError || new Error('All payment providers failed.');
  }

  // Verify a payment callback/webhook
  async verifyPayment({ method, payload, headers }) {
    const provider = this.providers[method];
    if (!provider) throw new Error('Unknown payment method: ' + method);
    return provider.verifyPayment({ payload, headers });
  }

  // Get plans with localized pricing
  getPlans(countryCode) {
    const currency = this.getCurrencyForCountry(countryCode);
    const methods  = this.getMethodsForCountry(countryCode);
    return Object.values(PLANS).map(plan => ({
      ...plan,
      currency,
      availableMethods: methods,
    }));
  }
}

module.exports = { PaymentRouter: new PaymentRouter(), PLANS, COUNTRY_CURRENCY };
