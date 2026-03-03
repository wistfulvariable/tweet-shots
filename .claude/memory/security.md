# Security — Current State

## Auth Boundaries

- **API key auth:** Validates against Firestore on every request (no in-memory cache). Key in `X-API-KEY` header or `?apiKey=` query param.
- **Admin auth:** `crypto.timingSafeEqual` comparison with `config.ADMIN_KEY`. Zod-enforced minimum 16 characters, no default value — server fails to start without it.
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
- Admin key uses `crypto.timingSafeEqual` — no timing leaks
- `escapeRegExp()` applied to Twitter entity data before `new RegExp()` — no ReDoS
- Stripe/external API error messages never forwarded to clients — generic messages only, real error logged server-side
- Auth failures (missing key, invalid key) logged with `logger.warn` for brute-force detection
- CI pipeline: gitleaks (secret scanning) + npm audit + eslint-plugin-security

## CI Security Pipeline

GitHub Actions (`.github/workflows/ci.yml`) runs on push/PR to master:
- **test:** `npm ci` → `npm audit --audit-level=high` → `npm test`
- **secrets-scan:** gitleaks against full git history
- **lint-security:** eslint with eslint-plugin-security rules

## Accepted Risks

- **CORS allows all origins** — intentional for public API
- **Billing guard fails open** — Firestore outage allows free rendering without usage tracking
- **API key soft-delete only** — revoked keys stay in Firestore with `active: false`
- **CSP disabled** — needed for image serving; landing page has no user input rendering

## Input Validation (Zod)

- Hex colors: `/^#[0-9a-fA-F]{6}$/`
- Scale: integer 1-3
- Tier: enum `free|pro|business`
- Email: Zod `.email()`
- URLs: Zod `.url()` for optional URL fields
- Padding/radius: integer 0-100
- ADMIN_KEY: minimum 16 characters (enforced at startup)

## Security Audit History

- **2026-03-03:** Full security audit → `audit-reports/SECURITY_AUDIT_REPORT_01_2026-03-03.md`
- **2026-03-03:** Cross-cutting consistency audit → `audit-reports/CROSS_CUTTING_CONSISTENCY_REPORT_01_2026-03-03.md` (fixed Stripe error leakage, added auth failure logging, added 404 status codes)

## Previously Resolved

All pre-rewrite security issues are resolved by the Firestore migration:
- No more JSON files on disk (api-keys.json, usage.json, customers.json, subscriptions.json)
- No more default admin key (`'admin-secret-key'` fallback removed)
- No more email-derived API keys (all random UUID now)
- No more in-memory-only key storage (Firestore is source of truth)
