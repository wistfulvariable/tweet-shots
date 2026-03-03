# Security — Current State

## Auth Boundaries

- **API key auth:** Validates against Firestore on every request (no in-memory cache). Key in `X-API-KEY` header or `?apiKey=` query param.
- **Admin auth:** Direct string comparison with `config.ADMIN_KEY`. Zod-enforced minimum 16 characters, no default value — server fails to start without it.
- **Stripe webhook:** `stripe.webhooks.constructEvent()` with `STRIPE_WEBHOOK_SECRET`. Returns `400 WEBHOOK_NOT_CONFIGURED` if secret not set.

## Security Wins

- `helmet()` applied (CSP disabled for image serving compatibility)
- Rate limiting per API key (not IP) — prevents multi-tenant abuse
- Signup rate limited by IP: 5 req / 15 min
- Non-root Docker user (`app:app`)
- `express.json()` skipped for webhook path (raw body for signature verification)
- API key prefix logged on errors (first 12 chars + `...`), never full key
- Firestore auth via ADC — no embedded credentials
- Zod validates all inputs before reaching handlers
- Config object is `Object.freeze()`d — immutable after load

## Accepted Risks

- **CORS allows all origins** — intentional for public API
- **Billing guard fails open** — Firestore outage allows free rendering without usage tracking
- **API key soft-delete only** — revoked keys stay in Firestore with `active: false`

## Input Validation (Zod)

- Hex colors: `/^#[0-9a-fA-F]{6}$/`
- Scale: integer 1-3
- Tier: enum `free|pro|business`
- Email: Zod `.email()`
- URLs: Zod `.url()` for optional URL fields
- Padding/radius: integer 0-100
- ADMIN_KEY: minimum 16 characters (enforced at startup)

## Previously Resolved

All pre-rewrite security issues are resolved by the Firestore migration:
- No more JSON files on disk (api-keys.json, usage.json, customers.json, subscriptions.json)
- No more default admin key (`'admin-secret-key'` fallback removed)
- No more email-derived API keys (all random UUID now)
- No more in-memory-only key storage (Firestore is source of truth)
