# Cross-Cutting Concerns Consistency Audit

**Date:** 2026-03-03
**Branch:** `cross-cutting-consistency-2026-03-03`
**Status:** Read-only audit (no code changes)
**Tests:** All 390 passing (verified pre-audit)

---

## Phase 1: Pagination Consistency

### Summary

The codebase has **2 list/collection endpoints** and **4 Firestore collection queries**. **None implement pagination.**

### Endpoint Inventory

| Location | Type | Strategy | Params | Defaults | Max Size | Metadata | Canonical? |
|---|---|---|---|---|---|---|---|
| `GET /admin/keys` (admin.mjs:51) | REST list | **Unbounded** | None | None | **None** | `{ keys: [...] }` | N/A |
| `GET /admin/usage` (admin.mjs:78) | REST list | **Unbounded** | None | None | **None** | `{ stats: [...] }` | N/A |

### Firestore Query Inventory

| Location | Query | Strategy | Limit | Notes |
|---|---|---|---|---|
| `listApiKeys()` (api-keys.mjs:86) | `apiKeysCollection().get()` | **Full collection scan** | **None** | Returns all docs |
| `findKeyByEmail()` (api-keys.mjs:102) | `.where('email','==',email).limit(1)` | Single-doc lookup | 1 | Correct |
| `stripe.mjs:109` | `.where('stripeCustomerId','==',id).limit(1)` | Single-doc lookup | 1 | Correct |
| `stripe.mjs:157` | `.where('stripeCustomerId','==',id).limit(1)` | Single-doc lookup | 1 | Correct |
| `stripe.customers.list()` (stripe.mjs:35) | Stripe API | **Bounded** | `limit: 1` | Correct |

### Assessment

**Consistent** (90%+) — All list endpoints are admin-only and unbounded. This is acceptable given:
- Admin endpoints are behind `X-Admin-Key` auth
- Expected data volume is low (tens to hundreds of keys, not thousands)
- Firestore `.get()` on small collections is O(n) but fast for n < 1000

**Potential future risk:** If the service scales to 10,000+ API keys, `listApiKeys()` will become slow. No action needed now.

---

## Phase 2: Sorting & Filtering Consistency

### Summary

**No sorting or filtering is implemented anywhere.** The codebase has zero sortable/filterable endpoints or dynamic queries.

### Inventory

| Location | Sort | Filter | Search | Notes |
|---|---|---|---|---|
| `GET /admin/keys` | None (Firestore insertion order) | None | None | Returns all keys |
| `GET /admin/usage` | None (maps over keys) | None | None | Returns all stats |
| `findKeyByEmail()` | N/A | `.where('email','==',email)` | N/A | Equality filter only |
| Stripe customer lookups | N/A | `.where('stripeCustomerId','==',id)` | N/A | Equality filter only |

### Assessment

**Consistent** (100%) — No sorting or filtering exists, so there is no drift to find. This is appropriate for the current scope: admin endpoints return small datasets; public endpoints return single resources.

**No SQL injection risk** — Firestore queries are parameterized by design. Field names are hardcoded, not user-supplied.

---

## Phase 3: Soft Delete & Data Lifecycle Consistency

### Summary

The codebase uses a **mixed strategy**: soft delete for API keys, no delete for other entities.

### Entity Lifecycle Inventory

| Entity | Strategy | Field | All Reads Filter? | Cascade | Unique Constraint | Restore? | Purge? |
|---|---|---|---|---|---|---|---|
| **apiKeys** | Soft delete | `active: false` | **Partial** | None | N/A | No API | No process |
| **usage** | No delete | N/A | N/A | N/A | N/A | N/A | N/A |
| **customers** | No delete | N/A | N/A | N/A | Email=docID | N/A | N/A |
| **subscriptions** | Status-based | `status: 'cancelled'` | No filtering needed | N/A | Sub ID=docID | Via Stripe | N/A |

### Detailed Analysis — apiKeys Soft Delete

**Delete operation:** `revokeApiKey()` at api-keys.mjs:77 sets `active: false`

**Read queries that filter `active`:**

| Query | File:Line | Filters `active`? | Risk |
|---|---|---|---|
| `validateApiKey()` | api-keys.mjs:64 | **Yes** — `if (!data.active) return null` | Safe |
| `findKeyByEmail()` | api-keys.mjs:112 | **Yes** — `if (!data.active) return null` | Safe |
| `listApiKeys()` | api-keys.mjs:86 | **No** — returns ALL keys including revoked | **Admin-only, intentional** |

**Assessment:** The `listApiKeys()` function intentionally returns revoked keys — admins need to see them. The `active` field check is correctly applied in all authentication paths, meaning revoked keys cannot be used for API access.

**Gap: No cascade on revoke.** When an API key is revoked:
- Usage records for that key remain (correct — historical data)
- Customer record still references the revoked key via `apiKeyId`
- If the customer's key is revoked, they have no way to get a new one without admin intervention

**Gap: No restoration API.** A revoked key can only be restored by direct Firestore edit.

**Gap: No permanent purge.** Soft-deleted keys accumulate indefinitely. Low risk at current scale.

### Assessment

**Minor drift** (70-90%) — Soft delete is consistently applied in authentication paths. The only "drift" is the intentional omission in admin listing. No data integrity bugs found.

---

## Phase 4: Audit Logging & Activity Tracking Consistency

### Summary

Logging uses **pino** consistently. Every route handler has structured logging via `req.log` (child logger with reqId). However, audit trail coverage is **uneven**.

### Logging Inventory

| Operation | Logged? | Level | Actor Captured? | Before/After? | File:Line |
|---|---|---|---|---|---|
| **API key creation** | Yes | info | No (admin implied) | No | admin.mjs:42 |
| **API key revocation** | Yes | info | No (admin implied) | No | admin.mjs:69 |
| **API key validation** | No | — | — | — | authenticate.mjs |
| **Auth failure (missing key)** | No | — | — | — | authenticate.mjs:14 |
| **Auth failure (invalid key)** | No | — | — | — | authenticate.mjs:20 |
| **Auth failure (Firestore err)** | Yes | error | Key prefix | No | authenticate.mjs:27 |
| **Tier change (Stripe)** | Yes | info | Email | tier captured | stripe.mjs:147 |
| **Subscription cancelled** | Yes | info | Email | No | stripe.mjs:184 |
| **Checkout completed** | Yes | info | Email | No | stripe.mjs:204 |
| **Payment succeeded** | Yes | info | Email | No | stripe.mjs:208 |
| **Payment failed** | Yes | warn | Email | No | stripe.mjs:212 |
| **Webhook received** | Yes | info | Event type | No | stripe.mjs:191 |
| **Signup (new key)** | No | — | — | — | billing.mjs:65 |
| **Signup (existing key)** | No | — | — | — | billing.mjs:55 |
| **Usage tracking** | No | — | — | — | usage.mjs |
| **Rate limit hit** | No | — | — | — | rate-limit.mjs |
| **Monthly limit hit** | No | — | — | — | billing-guard.mjs |
| **Request received** | Yes | info | reqId | method, path | server.mjs:68 |
| **Unhandled error** | Yes | error | reqId | method, path | error-handler.mjs:8 |
| **Billing guard error** | Yes | error | Key prefix | No | billing-guard.mjs:35 |
| **Screenshot failure** | Yes | error | tweetId | No | screenshot.mjs:79,140 |
| **Tweet fetch failure** | Yes | error | tweetId | No | tweet.mjs:27 |

### Gaps Flagged

| Gap | Severity | Impact |
|---|---|---|
| **Auth failures not logged** (missing/invalid key) | Medium | Cannot detect brute-force API key scanning |
| **Signups not logged** | Medium | No audit trail for key creation via self-service |
| **Rate limit hits not logged** | Low | Cannot detect abuse patterns (express-rate-limit has no hook) |
| **Monthly limit rejections not logged** | Low | No visibility into credit exhaustion |
| **No `updated_at` on apiKeys or customers** | Low | Cannot track when records were last modified |

### Timestamp Fields Inventory

| Entity | `created` | `updated` | `lastUsed` |
|---|---|---|---|
| apiKeys | `FieldValue.serverTimestamp()` | **Missing** | N/A |
| usage | N/A (no explicit created) | N/A | `FieldValue.serverTimestamp()` |
| customers | `FieldValue.serverTimestamp()` | **Missing** | N/A |
| subscriptions | N/A | `FieldValue.serverTimestamp()` | N/A |

### Assessment

**Minor drift** (70-90%) — Logging is consistently structured (pino, child loggers, `{ key: value }` format). The drift is in **coverage**: some operations are logged and others aren't. The most impactful gap is auth failure logging.

---

## Phase 5: Timezone & Date/Time Handling Consistency

### Summary

Date handling uses **3 distinct patterns** across the codebase, which is appropriate given different contexts.

### Date/Time Operation Inventory

| Location | Operation | Method | TZ | Format | Risk |
|---|---|---|---|---|---|
| **usage.mjs:25,95** | Month boundary | `new Date()` → `getFullYear()`/`getMonth()` | Server TZ | `YYYY-MM` | **Medium** (see below) |
| **health.mjs:13** | Health check timestamp | `new Date().toISOString()` | UTC | ISO 8601 | None |
| **stripe.mjs:63** | Customer created (return) | `new Date().toISOString()` | UTC | ISO 8601 | None |
| **stripe.mjs:143** | Subscription period end | `new Date(unix * 1000).toISOString()` | UTC | ISO 8601 | None |
| **core.mjs:323-338** | Tweet date display | `toLocaleTimeString()`/`toLocaleDateString()` | Server TZ | Locale-dependent | **Medium** (see below) |
| **screenshot.mjs:122** | GCS filename timestamp | `Date.now()` | UTC (milliseconds) | Unix ms | None |
| **Firestore writes** | Created/updated/lastUsed | `FieldValue.serverTimestamp()` | UTC (Firestore) | Firestore Timestamp | None |
| **test-fixtures.mjs:5** | Test month helper | `new Date()` → `getUTCFullYear()`/`getUTCMonth()` | **UTC** | `YYYY-MM` | None |

### Critical Finding: Month Boundary Mismatch

**usage.mjs** uses `new Date().getMonth()` (server-local time) while **test-fixtures.mjs** uses `new Date().getUTCMonth()` (UTC). This was addressed by adding `ENV TZ=UTC` in the Dockerfile (Dockerfile:39), which forces `getMonth()` === `getUTCMonth()` in production.

**However:** In local development without `TZ=UTC`, month boundaries could differ from production near midnight UTC. Tests use `getUTCMonth()` which is always correct, but the production code relies on the container's TZ setting.

**Mitigation already in place:** Dockerfile `ENV TZ=UTC` ensures consistent behavior in production.

### Tweet Date Rendering

`formatDate()` in core.mjs uses `toLocaleTimeString('en-US')` / `toLocaleDateString('en-US')`. These are locale-dependent and TZ-dependent:
- In production (Docker, TZ=UTC): dates display in UTC
- In CLI usage: dates display in user's local timezone
- This is **intentional** — tweet screenshots should show dates in the rendering environment's timezone

### API Response Date Formats

| Endpoint | Format | Example | Consistent? |
|---|---|---|---|
| `GET /health` | ISO 8601 | `2026-03-03T20:55:00.000Z` | Yes |
| `GET /billing/usage` → `lastUsed` | Firestore Timestamp | Auto-serialized | Yes |
| Stripe `currentPeriodEnd` | ISO 8601 | `2026-04-03T00:00:00.000Z` | Yes |
| Customer `created` (return value) | ISO 8601 | `2026-03-03T20:55:00.000Z` | Yes |

### Assessment

**Minor drift** (70-90%) — API response dates are consistently ISO 8601. The only drift is the `new Date().getMonth()` vs `getUTCMonth()` in usage tracking, which is mitigated by the Docker TZ setting but technically fragile.

---

## Phase 6: Currency & Numeric Precision Consistency

**SKIPPED.** The app handles money only through Stripe (integer cents, server-side). No client-side currency arithmetic, no stored monetary values, no display formatting. Tier prices are hardcoded integer constants in `config.mjs` (`price: 0`, `price: 9`, `price: 49`). Stripe handles all rounding, currency conversion, and precision.

---

## Phase 7: Multi-Tenancy & Data Isolation Consistency

**SKIPPED.** This is a single-tenant application with no org/workspace/team concept. All API keys belong to individual users. Data isolation is enforced through API key authentication — each request is scoped to a single key's identity. There are no multi-tenant queries or shared data surfaces.

---

## Phase 8: Error Response & Status Code Consistency

### Summary

**24 error response points** across the codebase. **21 of 24 follow the canonical pattern.** 3 deviations found.

### Canonical Pattern

```json
{ "error": "Human-readable message", "code": "SCREAMING_SNAKE_CASE" }
```

Status 400 validation errors add `details: [{ field, message }]`.
Status 429 monthly limit adds `limit`, `remaining`, `tier`.

### Error Response Inventory

#### 401 — Authentication (2 instances, 100% consistent)

| Location | Code | Message | Shape |
|---|---|---|---|
| authenticate.mjs:14 | `MISSING_API_KEY` | 'API key required' | `{ error, code }` |
| authenticate.mjs:20 | `INVALID_API_KEY` | 'Invalid or revoked API key' | `{ error, code }` |

#### 403 — Forbidden (2 instances, 100% consistent)

| Location | Code | Message | Shape |
|---|---|---|---|
| admin.mjs:26 | `ADMIN_DENIED` | 'Admin access denied' | `{ error, code }` |
| admin.mjs:31 | `ADMIN_DENIED` | 'Admin access denied' | `{ error, code }` |

#### 400 — Validation (1 instance)

| Location | Code | Message | Shape |
|---|---|---|---|
| validate.mjs:18 | `VALIDATION_ERROR` | 'Validation failed' | `{ error, code, details }` |

#### 404 — Not Found (1 instance)

| Location | Code | Message | Shape |
|---|---|---|---|
| admin.mjs:66 | `KEY_NOT_FOUND` | 'Key not found' | `{ error, code }` |

#### 429 — Rate Limited (4 instances, 100% consistent)

| Location | Code | Message | Shape |
|---|---|---|---|
| rate-limit.mjs:17 | `RATE_LIMITED` | 'Rate limit exceeded' | `{ error, code }` |
| rate-limit.mjs:43 | `RATE_LIMITED` | 'Too many signups...' | `{ error, code }` |
| rate-limit.mjs:55 | `RATE_LIMITED` | 'Too many billing...' | `{ error, code }` |
| billing-guard.mjs:24 | `MONTHLY_LIMIT_EXCEEDED` | Dynamic from usage.mjs | `{ error, code, limit, remaining, tier }` |

#### 500 — Internal Errors (8 instances, 100% consistent)

| Location | Code | Message | Leaks Details? |
|---|---|---|---|
| error-handler.mjs:9 | `INTERNAL_ERROR` | 'Internal server error' | No |
| authenticate.mjs:28 | `AUTH_ERROR` | 'Authentication service unavailable' | No |
| admin.mjs:46 | `KEY_CREATE_FAILED` | 'Failed to create key' | No |
| admin.mjs:57 | `KEY_LIST_FAILED` | 'Failed to list keys' | No |
| admin.mjs:73 | `KEY_REVOKE_FAILED` | 'Failed to revoke key' | No |
| admin.mjs:90 | `USAGE_STATS_FAILED` | 'Failed to get usage stats' | No |
| billing.mjs:74 | `SIGNUP_FAILED` | 'Signup failed' | No |
| billing.mjs:145 | `USAGE_STATS_FAILED` | 'Failed to get usage stats' | No |

#### 503 — Service Unavailable (2 instances, 100% consistent)

| Location | Code | Message | Shape |
|---|---|---|---|
| billing.mjs:86 | `BILLING_NOT_CONFIGURED` | 'Stripe billing is not configured' | `{ error, code }` |
| billing.mjs:117 | `BILLING_NOT_CONFIGURED` | 'Stripe billing is not configured' | `{ error, code }` |

#### Rendering Errors — AppError Pattern (3 route handlers)

| Location | Status Logic | 4xx Message | 5xx Message | Code |
|---|---|---|---|---|
| screenshot.mjs:80-84 | `err instanceof AppError ? err.statusCode : 500` | `err.message` | 'Internal server error' | `SCREENSHOT_FAILED` |
| screenshot.mjs:141-145 | Same | `err.message` | 'Internal server error' | `SCREENSHOT_FAILED` |
| tweet.mjs:28-32 | Same | `err.message` | 'Internal server error' | `FETCH_FAILED` |

### Deviations Found

#### DEVIATION 1: Stripe Error Message Leakage (3 instances)

| Location | Status | Code | Issue |
|---|---|---|---|
| billing.mjs:105 | 400 | `CHECKOUT_FAILED` | `error: err.message` — leaks raw Stripe error |
| billing.mjs:133 | 400 | `PORTAL_FAILED` | `error: err.message` — leaks raw Stripe error |
| billing.mjs:166 | 400 | `WEBHOOK_FAILED` | `error: err.message` — leaks signature verification details |

**Risk:** Medium. Stripe errors may include internal customer IDs, payment method details, or signature validation internals. The webhook endpoint is less exposed (Stripe-to-server only), but checkout/portal are user-facing.

#### DEVIATION 2: AppError Missing statusCode (2 throws in core.mjs)

| Location | Thrown As | Effective Status | Should Be |
|---|---|---|---|
| core.mjs:105 | `new AppError('Failed to fetch tweet: 404 ...')` | 400 (default) | 404 |
| core.mjs:111 | `new AppError('Tweet not found or unavailable')` | 400 (default) | 404 |
| core.mjs:95 | `new AppError('Could not extract tweet ID ...')` | 400 (default) | 400 (correct) |

**Impact:** Users receive HTTP 400 for "tweet not found" scenarios instead of the semantically correct 404. This affects API consumers who rely on status codes for control flow.

#### DEVIATION 3: Missing 405 Method Not Allowed

Express returns 404 for unmatched routes regardless of HTTP method. There is no middleware to return 405 when the path matches but the method doesn't. This is a common Express convention gap, not a drift between implementations.

### Assessment

**Consistent** (90%+) — Error response shape `{ error, code }` is used in 21/24 error responses. The 3 deviations are specific to Stripe error forwarding and AppError defaults, not a pattern drift.

---

## Phase 9: Synthesis & Drift Heat Map

### Drift Heat Map

| Concern | Rating | Score | Notes |
|---|---|---|---|
| Pagination | **Consistent** | 95% | Uniformly unbounded (admin-only, low volume) |
| Sorting & Filtering | **Consistent** | 100% | Not implemented; no drift possible |
| Soft Delete | **Minor drift** | 85% | Consistently applied in auth; admin listing intentionally unfiltered |
| Audit Logging | **Minor drift** | 75% | Format consistent; coverage gaps in auth failures and signups |
| Timezone/Date | **Minor drift** | 80% | API dates ISO 8601; month boundary relies on Docker TZ=UTC |
| Currency | **N/A** | — | Stripe handles all money |
| Multi-Tenancy | **N/A** | — | Single-tenant |
| Error Responses | **Consistent** | 90% | 21/24 canonical; 3 Stripe leakage + 2 wrong status codes |

### Root Cause Analysis

| Area | Root Cause |
|---|---|
| Auth failure not logged | Logging was added at route level but missed in middleware early returns |
| Stripe error leakage | Catch blocks forward `err.message` directly instead of wrapping |
| AppError missing status codes | `AppError` defaults to 400; "not found" throws didn't override |
| Month boundary TZ | `new Date().getMonth()` is TZ-dependent; mitigated by Docker but fragile |

### Prevention Recommendations

| Concern | Prevention |
|---|---|
| Error response consistency | Add a shared `sendError(res, status, code, message)` helper |
| Stripe error leakage | Wrap all Stripe catch blocks with generic user-facing messages |
| AppError status codes | Lint rule or code review checklist: every `new AppError()` must specify statusCode |
| Auth logging | Add `logger.warn()` for 401 responses in authenticate middleware |
| Month boundaries | Use `getUTCMonth()` explicitly instead of relying on container TZ |

---

## Complete Error Code Registry

| Code | HTTP | Source | Meaning |
|---|---|---|---|
| `MISSING_API_KEY` | 401 | authenticate.mjs | No API key in request |
| `INVALID_API_KEY` | 401 | authenticate.mjs | Key not found or revoked |
| `AUTH_ERROR` | 500 | authenticate.mjs | Firestore lookup failed |
| `ADMIN_DENIED` | 403 | admin.mjs | Missing/wrong admin key |
| `RATE_LIMITED` | 429 | rate-limit.mjs | Per-tier or per-IP rate limit |
| `MONTHLY_LIMIT_EXCEEDED` | 429 | billing-guard.mjs | Monthly credits exhausted |
| `VALIDATION_ERROR` | 400 | validate.mjs | Zod schema validation failed |
| `SCREENSHOT_FAILED` | 4xx/5xx | screenshot.mjs | Rendering pipeline error |
| `FETCH_FAILED` | 4xx/5xx | tweet.mjs | Tweet data fetch error |
| `KEY_NOT_FOUND` | 404 | admin.mjs | Key doesn't exist for revocation |
| `KEY_CREATE_FAILED` | 500 | admin.mjs | Firestore write failed |
| `KEY_LIST_FAILED` | 500 | admin.mjs | Firestore query failed |
| `KEY_REVOKE_FAILED` | 500 | admin.mjs | Firestore update failed |
| `USAGE_STATS_FAILED` | 500 | admin.mjs, billing.mjs | Usage query failed |
| `SIGNUP_FAILED` | 500 | billing.mjs | Key creation on signup failed |
| `CHECKOUT_FAILED` | 400 | billing.mjs | Stripe checkout session error |
| `PORTAL_FAILED` | 400 | billing.mjs | Stripe portal session error |
| `BILLING_NOT_CONFIGURED` | 503 | billing.mjs | Stripe keys not set |
| `WEBHOOK_NOT_CONFIGURED` | 400 | billing.mjs | Webhook secret not set |
| `MISSING_SIGNATURE` | 400 | billing.mjs | No stripe-signature header |
| `WEBHOOK_FAILED` | 400 | billing.mjs | Webhook processing error |
| `URL_NOT_CONFIGURED` | 400 | screenshot.mjs | GCS bucket not configured |
| `INTERNAL_ERROR` | 500 | error-handler.mjs | Unhandled exception |
