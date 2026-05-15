// Run this once with: node setup.js
// It creates your .env file automatically with generated secrets

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, ".env");

if (fs.existsSync(envPath)) {
  console.log("\n.env file already exists. Delete it first if you want to regenerate.\n");
  process.exit(0);
}

const jwtSecret = crypto.randomBytes(48).toString("hex");
const encryptionKey = crypto.randomBytes(32).toString("hex");

const envContent = `# Serene v3 - Auto-generated on ${new Date().toLocaleDateString()}
# DO NOT share this file or commit it to Git

# Server
PORT=3000
NODE_ENV=development

# Auto-generated secrets (do not change these)
JWT_SECRET=${jwtSecret}
ENCRYPTION_MASTER_KEY=${encryptionKey}

# Stripe - get your keys from https://dashboard.stripe.com/apikeys
# Use TEST keys while developing (they start with sk_test_)
STRIPE_SECRET_KEY=sk_test_REPLACE_WITH_YOUR_STRIPE_KEY
STRIPE_WEBHOOK_SECRET=whsec_REPLACE_WITH_WEBHOOK_SECRET

# Stripe Price IDs - create these in your Stripe dashboard
# Go to: Products > Add product > Add price
STRIPE_PRICE_MONTHLY=price_REPLACE_WITH_MONTHLY_ID
STRIPE_PRICE_ANNUAL=price_REPLACE_WITH_ANNUAL_ID

# Ollama - local AI (free, runs on your PC)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Your app URL (change when you deploy online)
FRONTEND_URL=http://localhost:3000
`;

fs.writeFileSync(envPath, envContent);

console.log("\n========================================");
console.log("  .env file created successfully!");
console.log("========================================");
console.log("\nSecrets have been auto-generated for you.");
console.log("\nNext steps:");
console.log("  1. Open .env in VS Code");
console.log("  2. Replace STRIPE_SECRET_KEY with your key from dashboard.stripe.com");
console.log("  3. Run: npm install");
console.log("  4. Run: npm run dev");
console.log("\nStripe keys are only needed for payments.");
console.log("The app works without them for testing.\n");
