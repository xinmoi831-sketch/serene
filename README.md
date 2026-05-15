# Serene v3 — Mental Health AI App

Full backend with AI chat, journal, mood tracking, and payments (Visa, Mastercard, PayPal).

---

## First time setup (Windows 10)

### Step 1 — Install Node.js
Download from https://nodejs.org (choose the LTS version)
After installing, restart VS Code.

### Step 2 — Install Ollama (free AI)
Download from https://ollama.com/download
After installing, open a terminal and run:
```
ollama pull llama3.2
```

### Step 3 — Open the project in VS Code
Unzip serene-v3, then open VS Code and drag the folder in.

### Step 4 — Open the terminal in VS Code
Press Ctrl + backtick  (the key above Tab)

### Step 5 — Run the setup script (creates .env automatically)
```
node setup.js
```
This creates your .env file with all secrets auto-generated.

### Step 6 — Install packages
```
npm install
```

### Step 7 — Start Ollama (open a SECOND terminal tab)
Click the + icon in the terminal panel to open a new tab, then:
```
ollama serve
```
Leave this running.

### Step 8 — Start Serene (in the first terminal tab)
```
npm run dev
```

Open your browser and go to: http://localhost:3000
You should see the API running.

---

## Setting up payments (optional — app works without this)

1. Create a free account at https://stripe.com
2. Go to Developers > API keys
3. Copy your "Secret key" (starts with sk_test_)
4. Open .env in VS Code and replace:
   STRIPE_SECRET_KEY=sk_test_REPLACE...
   with your actual key
5. In Stripe dashboard, go to Products > Add product
   - Create "Serene Pro Monthly" at $9.99/month
   - Create "Serene Pro Annual" at $79/year
   - Copy the Price IDs and paste into .env
6. Restart the server: press Ctrl+C then run npm run dev again

PayPal is enabled automatically through Stripe.
To enable it: Stripe dashboard > Settings > Payment methods > Enable PayPal

---

## API Reference

### Auth
- POST /api/auth/register     { "email": "", "password": "", "name": "" }
- POST /api/auth/login        { "email": "", "password": "" }
- GET  /api/auth/me           (needs token)
- DELETE /api/auth/account    (deletes everything — GDPR)

### Chat (needs token in header: Authorization: Bearer YOUR_TOKEN)
- POST /api/chat/message      { "message": "", "mood": "okay" }
- GET  /api/chat/history
- DELETE /api/chat/history

### Journal (needs token)
- POST /api/journal/entry          { "content": "", "generateReflection": false }
- GET  /api/journal/entries
- DELETE /api/journal/entry/:id
- GET  /api/journal/export         (Pro only)
- POST /api/journal/mood           { "mood": "good", "note": "" }
- GET  /api/journal/mood/history

### Subscriptions
- GET  /api/subscription/plans
- POST /api/subscription/checkout  { "priceId": "price_xxx" }  (needs token)
- POST /api/subscription/portal    (needs token)
- GET  /api/subscription/status    (needs token)

---

## Plan limits

| Feature          | Free  | Pro     |
|------------------|-------|---------|
| Messages/day     | 10    | 500     |
| Journal entries  | 5     | Unlimited|
| AI reflections   | No    | Yes     |
| Data export      | No    | Yes     |
| Price            | Free  | $9.99/mo|

---

## Project files

```
serene-v3/
  server.js          - Main server (start here)
  setup.js           - Run once to create .env
  lib/
    db.js            - Database (SQLite)
    encryption.js    - AES-256 encryption
  middleware/
    auth.js          - Login checks + plan limits
  routes/
    auth.js          - Register / login
    chat.js          - AI conversation
    journal.js       - Journal + mood
    subscription.js  - Stripe payments
  public/
    payment-success.html
    payment-cancel.html
```
