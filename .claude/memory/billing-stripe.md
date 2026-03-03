# Billing & Stripe Integration

## Architecture

Stripe is **optional**. If `STRIPE_SECRET_KEY` is not set, `createStripeClient()` returns `null` and billing routes return `503 BILLING_NOT_CONFIGURED` for checkout/portal. Signup still works (creates free key directly via Firestore).

## Unified Key Format

All API keys use `ts_<tier>_<uuid-no-dashes>` (random). The old email-derived key format is gone. On tier change (subscription upgrade/downgrade), the **key string stays the same** — only the `tier` field in Firestore is updated.

## Customer Lifecycle

1. `POST /billing/signup` → `createApiKey({ tier: 'free' })` → returns key string
2. `POST /billing/checkout` → `getOrCreateCustomer()` → Stripe Checkout session → redirect
3. Stripe webhook `customer.subscription.created` → `handleSubscriptionUpdate()` → updates tier on existing key
4. Stripe webhook `customer.subscription.deleted` → `handleSubscriptionCancelled()` → downgrades to free

`getOrCreateCustomer()` checks Firestore `customers` collection first, then Stripe customer list, then creates both if neither exists.

## Webhook Events Handled

| Event | Action |
|---|---|
| `customer.subscription.created/updated` | Update customer + API key tier |
| `customer.subscription.deleted` | Downgrade to free |
| `checkout.session.completed` | Log only |
| `invoice.payment_succeeded/failed` | Log only |

Webhook requires `STRIPE_WEBHOOK_SECRET`. Raw body captured before `express.json()` for signature verification (`req.rawBody`).

## Tier Resolution

```js
let tier = 'free';
if (priceId === config.STRIPE_PRICE_PRO) tier = 'pro';
if (priceId === config.STRIPE_PRICE_BUSINESS) tier = 'business';
const activeTier = subscription.status === 'active' ? tier : 'free';
```

## Signup Rate Limiting

`POST /billing/signup` uses IP-based rate limiter: 5 requests per 15 minutes (`signupLimiter()` from rate-limit.mjs).

## Billing Guard (Middleware)

Runs on every authenticated request. Calls `trackAndEnforce()` → sets `X-Credits-Limit` and `X-Credits-Remaining` headers. **Fails open** on Firestore error (request proceeds, usage not tracked).
