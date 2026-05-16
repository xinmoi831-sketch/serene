// Serene — Live Currency Converter
const Currency = (() => {
  // Cached rates — updated daily via free API
  let rates = {};
  let userCurrency = localStorage.getItem('serene_currency') || 'USD';
  let lastFetch = null;

  // Common currencies with symbols
  const CURRENCIES = {
    USD: { symbol: '$',  name: 'US Dollar' },
    ZMW: { symbol: 'K',  name: 'Zambian Kwacha' },
    GBP: { symbol: '£',  name: 'British Pound' },
    EUR: { symbol: '€',  name: 'Euro' },
    NGN: { symbol: '₦',  name: 'Nigerian Naira' },
    KES: { symbol: 'KSh',name: 'Kenyan Shilling' },
    ZAR: { symbol: 'R',  name: 'South African Rand' },
    GHS: { symbol: 'GH₵',name: 'Ghanaian Cedi' },
    UGX: { symbol: 'USh',name: 'Ugandan Shilling' },
    TZS: { symbol: 'TSh',name: 'Tanzanian Shilling' },
    INR: { symbol: '₹',  name: 'Indian Rupee' },
    CAD: { symbol: 'C$', name: 'Canadian Dollar' },
    AUD: { symbol: 'A$', name: 'Australian Dollar' },
  };

  // Fetch live rates from free API (no key required)
  async function fetchRates() {
    const now = Date.now();
    // Cache for 6 hours
    if (lastFetch && (now - lastFetch) < 6 * 60 * 60 * 1000 && Object.keys(rates).length > 0) return;
    try {
      const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      if (!res.ok) throw new Error('Rate fetch failed');
      const data = await res.json();
      rates = data.rates || {};
      lastFetch = now;
      console.log('[Currency] Rates updated');
    } catch (err) {
      console.warn('[Currency] Could not fetch live rates, using fallback');
      // Fallback approximate rates (updated May 2026)
      rates = {
        USD:1, ZMW:27.5, GBP:0.79, EUR:0.92, NGN:1580,
        KES:129, ZAR:18.5, GHS:15.2, UGX:3780, TZS:2680,
        INR:83.5, CAD:1.37, AUD:1.52,
      };
    }
  }

  // Convert USD amount to user currency
  function convert(usdAmount) {
    if (userCurrency === 'USD' || !rates[userCurrency]) return null;
    const converted = usdAmount * rates[userCurrency];
    const info = CURRENCIES[userCurrency];
    const formatted = converted >= 1000
      ? info.symbol + Math.round(converted).toLocaleString()
      : info.symbol + converted.toFixed(2);
    return { converted, formatted, currency: userCurrency, symbol: info.symbol };
  }

  // Format price with local equivalent
  function formatPrice(usdAmount) {
    const local = convert(usdAmount);
    const usdStr = '$' + usdAmount.toFixed(2);
    if (!local) return usdStr;
    return usdStr + ' <span class="currency-local">≈ ' + local.formatted + ' ' + local.currency + '</span>';
  }

  // Set user currency preference
  function setCurrency(code) {
    userCurrency = code;
    localStorage.setItem('serene_currency', code);
    updateAllPrices();
  }

  // Update all price displays on page
  function updateAllPrices() {
    document.querySelectorAll('[data-usd]').forEach(el => {
      const usd = parseFloat(el.getAttribute('data-usd'));
      if (!isNaN(usd)) el.innerHTML = formatPrice(usd);
    });
  }

  // Build currency selector HTML
  function buildSelector() {
    return '<select class="currency-select" onchange="Currency.setCurrency(this.value)">' +
      Object.entries(CURRENCIES).map(([code, info]) =>
        '<option value="' + code + '"' + (code === userCurrency ? ' selected' : '') + '>' +
        info.symbol + ' ' + code + ' — ' + info.name + '</option>'
      ).join('') + '</select>';
  }

  // Init
  async function init() {
    await fetchRates();
    updateAllPrices();
  }

  return { init, convert, formatPrice, setCurrency, buildSelector, CURRENCIES };
})();

// Auto-init when DOM ready
document.addEventListener('DOMContentLoaded', () => Currency.init());
