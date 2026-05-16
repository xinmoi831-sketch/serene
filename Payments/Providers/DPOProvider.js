// payments/providers/DPOProvider.js
// DPO Group — works across Africa including Zambia

class DPOProvider {
  constructor() {
    this.companyToken = process.env.DPO_COMPANY_TOKEN || '';
    this.apiUrl       = process.env.DPO_API_URL || 'https://secure.3gdirectpay.com/API/v6/';
    this.payUrl       = 'https://secure.3gdirectpay.com/payv2.php';
    this.serviceType  = process.env.DPO_SERVICE_TYPE || '3854'; // Digital services
  }

  isConfigured() {
    return !!(this.companyToken && !this.companyToken.includes('REPLACE'));
  }

  // Convert USD to local currency using stored rates
  getLocalAmount(priceUSD, currency) {
    const rates = {
      USD:1, ZMW:27.5, KES:129, TZS:2680, UGX:3780,
      ZAR:18.5, MWK:1700, NGN:1580, GHS:15.2,
    };
    const rate   = rates[currency] || 1;
    const amount = priceUSD * rate;
    return currency === 'ZMW' || currency === 'KES' || currency === 'UGX' || currency === 'TZS'
      ? Math.round(amount)
      : parseFloat(amount.toFixed(2));
  }

  async createPayment({ plan, userId, userEmail, userName, currency, countryCode }) {
    if (!this.isConfigured()) throw new Error('DPO not configured');

    const amount      = this.getLocalAmount(plan.priceUSD, currency);
    const reference   = 'SERENE-' + userId + '-' + Date.now();
    const baseUrl     = process.env.FRONTEND_URL || 'http://localhost:3000';
    const description = 'Serene ' + plan.name + ' Plan';

    // DPO uses XML API
    const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<API3G>
  <CompanyToken>${this.companyToken}</CompanyToken>
  <Request>createToken</Request>
  <Transaction>
    <PaymentAmount>${amount}</PaymentAmount>
    <PaymentCurrency>${currency}</PaymentCurrency>
    <CompanyRef>${reference}</CompanyRef>
    <RedirectURL>${baseUrl}/payment-success?ref=${reference}</RedirectURL>
    <BackURL>${baseUrl}/payment-cancel</BackURL>
    <CompanyRefUnique>0</CompanyRefUnique>
    <PTL>5</PTL>
  </Transaction>
  <Services>
    <Service>
      <ServiceType>${this.serviceType}</ServiceType>
      <ServiceDescription>${description}</ServiceDescription>
      <ServiceDate>${new Date().toISOString().slice(0,10).replace(/-/g,' ')}</ServiceDate>
    </Service>
  </Services>
</API3G>`;

    const res = await fetch(this.apiUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'text/xml' },
      body:    xmlBody,
    });

    const text = await res.text();

    // Parse TransToken from XML response
    const tokenMatch = text.match(/<TransToken>([^<]+)<\/TransToken>/);
    const resultMatch = text.match(/<Result>([^<]+)<\/Result>/);
    const resultExplainMatch = text.match(/<ResultExplanation>([^<]+)<\/ResultExplanation>/);

    if (!tokenMatch || resultMatch?.[1] !== '000') {
      throw new Error('DPO token error: ' + (resultExplainMatch?.[1] || 'Unknown error'));
    }

    const token      = tokenMatch[1];
    const paymentUrl = this.payUrl + '?ID=' + token;

    return {
      paymentUrl,
      reference,
      token,
      amount,
      currency,
      provider: 'dpo',
    };
  }

  async verifyPayment({ payload }) {
    // DPO sends GET callback with TransactionToken
    const { TransactionToken, CompanyRef } = payload;
    if (!TransactionToken) throw new Error('Missing TransactionToken');

    const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<API3G>
  <CompanyToken>${this.companyToken}</CompanyToken>
  <Request>verifyToken</Request>
  <TransactionToken>${TransactionToken}</TransactionToken>
</API3G>`;

    const res  = await fetch(this.apiUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'text/xml' },
      body:    xmlBody,
    });

    const text = await res.text();
    const result = text.match(/<Result>([^<]+)<\/Result>/)?.[1];
    const status = text.match(/<TransactionApproval>([^<]+)<\/TransactionApproval>/)?.[1];

    // Result 000 = success
    const success = result === '000' && status === 'YES';

    return {
      success,
      reference:   CompanyRef,
      token:       TransactionToken,
      rawResponse: text,
    };
  }
}

module.exports = DPOProvider;
