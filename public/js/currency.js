// Serene — Currency Localization System
// Three layers: Detection → Conversion → Rendering

const CurrencySystem = (() => {

  const COUNTRY_CURRENCY = {
    ZM:'ZMW',US:'USD',GB:'GBP',DE:'EUR',FR:'EUR',ES:'EUR',IT:'EUR',
    NL:'EUR',BE:'EUR',AT:'EUR',PT:'EUR',IE:'EUR',NG:'NGN',KE:'KES',
    ZA:'ZAR',GH:'GHS',UG:'UGX',TZ:'TZS',ET:'ETB',RW:'RWF',IN:'INR',
    CA:'CAD',AU:'AUD',NZ:'NZD',SG:'SGD',MY:'MYR',JP:'JPY',BR:'BRL',MX:'MXN',
  };

  const FORMATS = {
    USD:{ symbol:'$',   name:'US Dollar',         dec:2 },
    ZMW:{ symbol:'K',   name:'Zambian Kwacha',     dec:0 },
    GBP:{ symbol:'£',   name:'British Pound',      dec:2 },
    EUR:{ symbol:'€',   name:'Euro',               dec:2 },
    NGN:{ symbol:'₦',   name:'Nigerian Naira',     dec:0 },
    KES:{ symbol:'KSh', name:'Kenyan Shilling',    dec:0 },
    ZAR:{ symbol:'R',   name:'South African Rand', dec:2 },
    GHS:{ symbol:'GH₵', name:'Ghanaian Cedi',      dec:2 },
    UGX:{ symbol:'USh', name:'Ugandan Shilling',   dec:0 },
    TZS:{ symbol:'TSh', name:'Tanzanian Shilling', dec:0 },
    INR:{ symbol:'₹',   name:'Indian Rupee',       dec:0 },
    CAD:{ symbol:'C$',  name:'Canadian Dollar',    dec:2 },
    AUD:{ symbol:'A$',  name:'Australian Dollar',  dec:2 },
    BRL:{ symbol:'R$',  name:'Brazilian Real',     dec:2 },
    JPY:{ symbol:'¥',   name:'Japanese Yen',       dec:0 },
  };

  const FALLBACK_RATES = {
    USD:1, ZMW:27.5, GBP:0.79, EUR:0.92, NGN:1580,
    KES:129, ZAR:18.5, GHS:15.2, UGX:3780, TZS:2680,
    INR:83.5, CAD:1.37, AUD:1.52, BRL:5.1, JPY:154,
  };

  var currency = localStorage.getItem('serene_currency') || 'ZMW';
  var rates    = JSON.parse(localStorage.getItem('serene_rates') || '{}');
  var ratesTs  = parseInt(localStorage.getItem('serene_rates_ts') || '0');

  // DETECTION — browser locale then IP
  async function detect() {
    if (localStorage.getItem('serene_currency_manual')) return;
    var locale = navigator.language || '';
    var region = locale.split('-')[1];
    if (region && COUNTRY_CURRENCY[region]) {
      currency = COUNTRY_CURRENCY[region];
      localStorage.setItem('serene_currency', currency);
      return;
    }
    try {
      var res = await fetch('https://ipapi.co/json/');
      if (res.ok) {
        var d = await res.json();
        if (d.country_code && COUNTRY_CURRENCY[d.country_code]) {
          currency = COUNTRY_CURRENCY[d.country_code];
          localStorage.setItem('serene_currency', currency);
        }
      }
    } catch(e) {}
  }

  // FETCH RATES — cached 6 hours
  async function fetchRates() {
    var now = Date.now();
    if (Object.keys(rates).length > 0 && (now - ratesTs) < 21600000) return;
    try {
      var res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      if (!res.ok) throw new Error('failed');
      var d = await res.json();
      rates = d.rates || {};
      ratesTs = now;
      localStorage.setItem('serene_rates', JSON.stringify(rates));
      localStorage.setItem('serene_rates_ts', String(now));
    } catch(e) {
      rates = FALLBACK_RATES;
    }
  }

  // CONVERT — USD to local
  function convert(usdAmount) {
    var fmt  = FORMATS[currency] || FORMATS.USD;
    var rate = rates[currency]   || 1;
    var amt  = usdAmount * rate;
    var str  = fmt.symbol + (fmt.dec === 0
      ? Math.round(amt).toLocaleString()
      : amt.toFixed(fmt.dec));
    return { currency:currency, formatted:str, amount:amt };
  }

  // RENDER — local primary, USD secondary hint
  function renderPrice(usdAmount) {
    var local = convert(usdAmount);
    if (currency === 'USD') {
      return '<span class="price-primary">$' + usdAmount.toFixed(2) + '</span>';
    }
    return '<span class="price-primary">' + local.formatted + '</span>' +
           '<span class="price-secondary"> (~$' + usdAmount.toFixed(2) + ')</span>';
  }

  // UPDATE all [data-usd] elements
  function renderAll() {
    document.querySelectorAll('[data-usd]').forEach(function(el) {
      var usd = parseFloat(el.getAttribute('data-usd'));
      if (!isNaN(usd)) el.innerHTML = renderPrice(usd);
    });
  }

  // BUILD selector options
  function buildSelector() {
    return Object.entries(FORMATS).map(function(entry) {
      var code = entry[0], info = entry[1];
      return '<option value="' + code + '"' +
        (code === currency ? ' selected' : '') + '>' +
        info.symbol + ' ' + code + ' — ' + info.name + '</option>';
    }).join('');
  }

  // MANUAL OVERRIDE
  function setManual(code) {
    currency = code;
    localStorage.setItem('serene_currency', code);
    localStorage.setItem('serene_currency_manual', '1');
    renderAll();
  }

  // INIT
  async function init() {
    await detect();
    await fetchRates();
    renderAll();
  }

  return { init, renderPrice, renderAll, buildSelector, setManual,
           getCurrency: function() { return currency; } };
})();

document.addEventListener('DOMContentLoaded', function() { CurrencySystem.init(); });
