# Billing & Stripe Integration

## Status: stripe-billing.mjs IS integrated into api-server.mjs

`addBillingRoutes(app, callbacks)` is called at the bottom of `api-server.mjs` after all routes are registered. Stripe billing is active when `STRIPE_SECRET_KEY` is set.

```js
// api-server.mjs (end of file)
addBillingRoutes(app, {
  onKeySync: (apiKey, keyData) => {
    apiKeys[apiKey] = keyData;
    saveJSON(CONFIG.apiKeysFile, apiKeys);
  },
  onKeyRevoke: (apiKey) => {
    if (apiKeys[apiKey]) {
      apiKeys[apiKey].active = false;
      saveJSON(CONFIG.apiKeysFile, apiKeys);
    }
  },
});
```

The callbacks close the auth gap: when Stripe upgrades/cancels a subscription, the new key is written to both `customers.json` AND `api-keys.json` so the `authenticate` middleware recognizes it immediately.

## stripe-billing.mjs Architecture

### Data Files (created at runtime)
- `customers.json` → `{ email: { stripeCustomerId, apiKey, tier, usageThisMonth, usageResetDate } }`
- `subscriptions.json` → `{ subscriptionId: { email, tier, status, currentPeriodEnd } }`

### API Key Generation in stripe-billing
```js
// Free tier (email-derived — predictable):
`ts_free_${Buffer.from(email).toString('base64').replace(/[+/=]/g, '').slice(0, 24)}`

// Paid tier (on subscription.created/updated — email-derived):
`ts_${tier}_${Buffer.from(email).toString('base64').replace(/[+/=]/g, '').slice(0, 20)}`
```
Admin API in `api-server.mjs` uses `ts_${tier}_${uuidv4()}` (random, preferred). Do not mix the two approaches.

### Tier Limits (stripe-billing.mjs)
```js
{ free: 50, pro: 1000, business: 10000 }  // per month
```
Monthly credit limits — separate from the per-minute rate limits in `api-server.mjs`.

### Price IDs
```js
PRICE_IDS = {
  free: null,
  pro: process.env.STRIPE_PRICE_PRO || 'price_pro_placeholder',
  business: process.env.STRIPE_PRICE_BUSINESS || 'price_business_placeholder',
}
```
Must create products in Stripe Dashboard and set env vars before checkout works.

### Webhook Handler
```js
POST /webhook/stripe
```
`STRIPE_WEBHOOK_SECRET` is **required**. If not set, the endpoint returns `400 WEBHOOK_NOT_CONFIGURED` — unsigned events are rejected.

Handled events:
- `checkout.session.completed` → logs only
- `customer.subscription.created/updated` → `handleSubscriptionUpdate()` → syncs key to apiKeys
- `customer.subscription.deleted` → `handleSubscriptionCancelled()` → revokes old key, creates free key
- `invoice.payment_succeeded/failed` → logs only

### Subscription Tier Resolution
```js
let tier = 'free';
if (priceId === PRICE_IDS.pro) tier = 'pro';
if (priceId === PRICE_IDS.business) tier = 'business';
customer.tier = subscription.status === 'active' ? tier : 'free';
```

## Two Usage Tracking Systems (still separate)

1. `api-server.mjs` → `usage.json` by API key: total count + monthly breakdown (raw tracking only, no limit enforcement)
2. `stripe-billing.mjs` → `customers.json` by email: monthly credits with limit enforcement (50/1000/10000)

The two systems coexist independently. Monthly credit enforcement activates only if `stripe-billing.mjs`'s `trackUsage` is called — it is not currently called from the screenshot routes (api-server uses its own `trackUsage`).

## Active Billing Routes (added by addBillingRoutes)

| Method | Path | Description |
|---|---|---|
| GET | `/pricing` | Plan listing |
| POST | `/billing/checkout` | Create Stripe checkout session |
| POST | `/billing/portal` | Create Stripe customer portal session |
| GET | `/billing/usage` | Usage stats by API key (stripe-billing version) |
| POST | `/webhook/stripe` | Stripe webhook (requires STRIPE_WEBHOOK_SECRET) |
| GET | `/billing/success` | Post-checkout success page |
| GET | `/billing/cancel` | Post-checkout cancel page |
| POST | `/billing/signup` | Free-tier key creation (defined in api-server, not stripe-billing) |

Note: `/billing/signup` in `api-server.mjs` is rate-limited at 5 req/15 min by IP.
