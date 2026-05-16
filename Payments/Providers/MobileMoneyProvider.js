// payments/providers/MobileMoneyProvider.js
// Mobile Money — MTN MoMo and Airtel Money (Africa)
// Ready to plug in real credentials when available

class MobileMoneyProvider {
  constructor() {
    this.mtnApiKey      = process.env.MTN_MOMO_API_KEY        || '';
    this.mtnApiSecret   = process.env.MTN_MOMO_API_SECRET     || '';
    this.mtnEnvironment = process.env.MTN_MOMO_ENVIRONMENT    || 'sandbox';
    this.mtnBaseUrl     = this.mtnEnvironment === 'production'
      ? 'https://proxy.momoapi.mtn.com'
      : 'https://sandbox.momoapi.mtn.com';

    this.airtelApiKey   = process.env.AIRTEL_MONEY_API_KEY    || '';
    this.airtelBaseUrl  = 'https://openapi.airtel.africa';

    // Which provider to use — auto-detect by country or config
    this.activeProvider = process.env.MOBILE_MONEY_PROVIDER || 'mtn';
  }

  isConfigured() {
    if (this.activeProvider === 'mtn') {
      return !!(this.mtnApiKey && !this.mtnApiKey.includes('REPLACE'));
    }
    if (this.activeProvider === 'airtel') {
      return !!(this.airtelApiKey && !this.airtelApiKey.includes('REPLACE'));
    }
    // In development, allow sandbox mode without real keys
    return process.env.NODE_ENV !== 'production';
  }

  async createPayment({ plan, userId, userEmail, currency, countryCode }) {
    if (!this.isConfigured()) throw new Error('Mobile Money not configured');

    const reference = 'SERENE-MM-' + userId + '-' + Date.now();
    const amount    = this.getLocalAmount(plan.priceUSD, currency);

    // Development sandbox — return mock payment link
    if (process.env.NODE_ENV !== 'production') {
      return {
        paymentUrl: '#mobile-money-sandbox',
        reference,
        amount,
        currency,
        provider:   'mobilemoney',
        message:    'Mobile Money sandbox mode — add MTN_MOMO_API_KEY or AIRTEL_MONEY_API_KEY to enable live payments',
        phoneRequired: true,
      };
    }

    if (this.activeProvider === 'mtn') {
      return this.createMTNPayment({ plan, userId, reference, amount, currency });
    }
    return this.createAirtelPayment({ plan, userId, reference, amount, currency });
  }

  async createMTNPayment({ plan, userId, reference, amount, currency }) {
    // MTN MoMo Collections API
    const uuid    = reference;
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    const res = await fetch(this.mtnBaseUrl + '/collection/v1_0/requesttopay', {
      method:  'POST',
      headers: {
        'Authorization':      'Bearer ' + this.mtnApiKey,
        'X-Reference-Id':     uuid,
        'X-Target-Environment': this.mtnEnvironment,
        'Content-Type':       'application/json',
        'Ocp-Apim-Subscription-Key': this.mtnApiKey,
      },
      body: JSON.stringify({
        amount:   String(amount),
        currency: currency,
        externalId: userId,
        payer: { partyIdType: 'MSISDN', partyId: '' }, // Phone collected separately
        payerMessage: 'Serene ' + plan.name + ' Plan',
        payeeNote:    'SERENE-' + userId,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error('MTN MoMo error: ' + err);
    }

    return {
      paymentUrl:    baseUrl + '/payment-mobile-money?ref=' + reference,
      reference,
      amount,
      currency,
      provider:      'mobilemoney',
      phoneRequired: true,
    };
  }

  async createAirtelPayment({ plan, userId, reference, amount, currency }) {
    // Airtel Money API
    const res = await fetch(this.airtelBaseUrl + '/merchant/v2/payments/', {
      method:  'POST',
      headers: {
        'Authorization': 'Bearer ' + this.airtelApiKey,
        'Content-Type':  'application/json',
        'X-Country':     'ZM',
        'X-Currency':    currency,
      },
      body: JSON.stringify({
        reference,
        subscriber: { country: 'ZM', currency, msisdn: '' }, // Phone collected separately
        transaction: { amount, country: 'ZM', currency, id: reference },
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error('Airtel Money error: ' + JSON.stringify(data));

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return {
      paymentUrl:    baseUrl + '/payment-mobile-money?ref=' + reference,
      reference,
      amount,
      currency,
      provider:      'mobilemoney',
      phoneRequired: true,
    };
  }

  async verifyPayment({ payload }) {
    const { reference, status } = payload;
    // Verification logic depends on provider webhook format
    // Both MTN and Airtel send status callbacks
    return {
      success:   status === 'SUCCESSFUL' || status === 'SUCCESS',
      reference,
      provider:  'mobilemoney',
    };
  }

  getLocalAmount(priceUSD, currency) {
    const rates = { USD:1, ZMW:27.5, KES:129, UGX:3780, TZS:2680, GHS:15.2, MWK:1700 };
    const rate  = rates[currency] || 1;
    return Math.round(priceUSD * rate);
  }
}

module.exports = MobileMoneyProvider;
