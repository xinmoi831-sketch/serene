// payments/providers/PayPalProvider.js

class PayPalProvider {
  constructor() {
    this.clientId     = process.env.PAYPAL_CLIENT_ID     || '';
    this.clientSecret = process.env.PAYPAL_CLIENT_SECRET || '';
    this.mode         = process.env.NODE_ENV === 'production' ? 'live' : 'sandbox';
    this.baseUrl      = this.mode === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  isConfigured() {
    return !!(
      this.clientId && !this.clientId.includes('REPLACE') &&
      this.clientSecret && !this.clientSecret.includes('REPLACE')
    );
  }

  async getAccessToken() {
    const creds  = Buffer.from(this.clientId + ':' + this.clientSecret).toString('base64');
    const res    = await fetch(this.baseUrl + '/v1/oauth2/token', {
      method:  'POST',
      headers: {
        'Authorization': 'Basic ' + creds,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const data = await res.json();
    if (!res.ok) throw new Error('PayPal auth failed: ' + data.error_description);
    return data.access_token;
  }

  async createPayment({ plan, userId, userEmail, currency }) {
    if (!this.isConfigured()) throw new Error('PayPal not configured');

    const token     = await this.getAccessToken();
    const baseUrl   = process.env.FRONTEND_URL || 'http://localhost:3000';
    const reference = 'SERENE-' + userId + '-' + Date.now();

    // Use USD for PayPal — they handle currency conversion
    const amount = plan.priceUSD.toFixed(2);

    const res = await fetch(this.baseUrl + '/v2/checkout/orders', {
      method:  'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: reference,
          description:  'Serene ' + plan.name + ' Plan',
          amount: {
            currency_code: 'USD',
            value:          amount,
          },
          custom_id: userId,
        }],
        application_context: {
          brand_name:          'Serene Mental Health',
          landing_page:        'NO_PREFERENCE',
          user_action:         'PAY_NOW',
          return_url:          baseUrl + '/api/payments/callback/paypal?ref=' + reference,
          cancel_url:          baseUrl + '/payment-cancel',
          shipping_preference: 'NO_SHIPPING',
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error('PayPal order failed: ' + JSON.stringify(data));

    const approveUrl = data.links?.find(l => l.rel === 'approve')?.href;
    if (!approveUrl) throw new Error('PayPal approval URL not found');

    return {
      paymentUrl: approveUrl,
      orderId:    data.id,
      reference,
      amount,
      currency:   'USD',
      provider:   'paypal',
    };
  }

  async verifyPayment({ payload }) {
    const { orderId, token } = payload;
    const id = orderId || token;
    if (!id) throw new Error('Missing PayPal order ID');

    const accessToken = await this.getAccessToken();

    // Capture the order
    const res = await fetch(this.baseUrl + '/v2/checkout/orders/' + id + '/capture', {
      method:  'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type':  'application/json',
      },
    });

    const data = await res.json();
    const success = data.status === 'COMPLETED';

    return {
      success,
      reference: data.purchase_units?.[0]?.reference_id,
      orderId:   id,
      amount:    data.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value,
    };
  }
}

module.exports = PayPalProvider;
