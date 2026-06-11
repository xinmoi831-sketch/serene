const axios = require('axios');

const AT_API_KEY  = process.env.AT_API_KEY;
const AT_USERNAME = process.env.AT_USERNAME;
const AT_URL      = 'https://api.africastalking.com/version1/messaging';

async function sendSMS(to, message) {
  try {
    // Normalize phone number to international format
    let phone = to.toString().trim();
    if (phone.startsWith('0')) {
      phone = '+260' + phone.slice(1);
    }
    if (!phone.startsWith('+')) {
      phone = '+' + phone;
    }

    const params = new URLSearchParams();
    params.append('username', AT_USERNAME);
    params.append('to',       phone);
    params.append('message',  message);
    // No 'from' — uses default shortcode for instant delivery

    const response = await axios.post(AT_URL, params.toString(), {
      headers: {
        'apiKey':       AT_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept':       'application/json'
      }
    });

    const result = response.data;
    console.log('[SMS] Sent to', phone, JSON.stringify(result));

    const recipient = result.SMSMessageData?.Recipients?.[0];
    if (recipient && recipient.status === 'Success') {
      return { success: true, messageId: recipient.messageId };
    } else {
      console.error('[SMS] Failed:', JSON.stringify(result));
      return { success: false, error: JSON.stringify(result) };
    }

  } catch (err) {
    console.error('[SMS] Error:', err.response?.data || err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendSMS };
