# API Design & Consistency Audit Report

**Run:** 01
**Date:** 2026-03-03
**Branch:** `api-consistency-2026-03-03`
**Auditor:** Automated (Claude)

---

## 1. Executive Summary

| Metric | Value |
|--------|-------|
| **Consistency Score** | **Good** |
| Total Endpoints | 18 |
| Endpoints with Issues | 5 |
| Issues Fixed | 2 |
| Issues Documented for Review | 11 |

The tweet-shots API demonstrates strong design consistency across its 18 endpoints. URL naming, field casing, error response format, and middleware patterns are uniform with only minor deviations. The most significant findings are: (1) resource-creating POSTs returning 200 instead of 201, (2) catch-all 400 status for internal errors in handler try/catch blocks, and (3) non-idempotent signup without Stripe configured. No critical security or correctness bugs were found.

---

## 2. API Surface Map

### 2.1 Endpoint Inventory

| # | Method | Path | Auth | Rate Limited | Validated | Paginated | Tested | Handler |
|---|--------|------|------|:----------:|:---------:|:---------:|:------:|---------|
| 1 | GET | `/` | None | No | No | N/A | Yes | landing.mjs |
| 2 | GET | `/health` | None | No | No | N/A | Yes | health.mjs |
| 3 | GET | `/pricing` | None | No | No | N/A | Yes | health.mjs |
| 4 | GET | `/docs` | None | No | No | N/A | Yes | health.mjs |
| 5 | GET | `/screenshot/:tweetIdOrUrl` | API key | Per-tier | Query schema | N/A | Yes | screenshot.mjs |
| 6 | POST | `/screenshot` | API key | Per-tier | Body schema | N/A | Yes | screenshot.mjs |
| 7 | GET | `/tweet/:tweetIdOrUrl` | API key | Per-tier | No | N/A | Yes | tweet.mjs |
| 8 | POST | `/billing/signup` | None | IP (5/15min) | Body schema | N/A | Yes | billing.mjs |
| 9 | POST | `/billing/checkout` | None | **No** | Body schema | N/A | Yes | billing.mjs |
| 10 | POST | `/billing/portal` | None | **No** | Body schema | N/A | Yes | billing.mjs |
| 11 | GET | `/billing/usage` | API key | **No** | No | N/A | Yes | billing.mjs |
| 12 | POST | `/webhook/stripe` | Stripe sig | No | No | N/A | Yes | billing.mjs |
| 13 | GET | `/billing/success` | None | No | No | N/A | Yes | billing.mjs |
| 14 | GET | `/billing/cancel` | None | No | No | N/A | Yes | billing.mjs |
| 15 | POST | `/admin/keys` | Admin key | **No** | Body schema | N/A | Yes | admin.mjs |
| 16 | GET | `/admin/keys` | Admin key | **No** | No | **No** | Yes | admin.mjs |
| 17 | DELETE | `/admin/keys/:key` | Admin key | **No** | No | N/A | Yes | admin.mjs |
| 18 | GET | `/admin/usage` | Admin key | **No** | No | **No** | Yes | admin.mjs |

**Bold** = potential issue (documented below).

### 2.2 Endpoint Groupings

| Group | Prefix | File | Count | Assessment |
|-------|--------|------|:-----:|------------|
| Public info | `/`, `/health`, `/pricing`, `/docs` | landing.mjs, health.mjs | 4 | Clean separation |
| Core product | `/screenshot/*`, `/tweet/*` | screenshot.mjs, tweet.mjs | 3 | Logical grouping |
| Billing | `/billing/*` | billing.mjs | 6 | Cohesive |
| Webhook | `/webhook/stripe` | billing.mjs | 1 | See note below |
| Admin | `/admin/*` | admin.mjs | 4 | Clean separation |

**Note:** The Stripe webhook (`/webhook/stripe`) is logically part of billing but uses a different URL prefix. All other billing endpoints use `/billing/*`. This is a minor namespace inconsistency. **Cannot change** — the webhook URL is configured in the Stripe dashboard and changing it is a breaking external dependency.

**Versioning:** No versioning applied. All endpoints are unversioned. This is consistent and appropriate for a single-version API.

### 2.3 Test Coverage

Every endpoint has at least one integration test and one API contract test. Test coverage is **complete** across all 18 endpoints.

---

## 3. Naming Conventions

### 3.1 Dominant Conventions

| Dimension | Convention | Consistency |
|-----------|-----------|:-----------:|
| URL path segments | lowercase-hyphenated | 100% |
| URL path params | camelCase (`:tweetIdOrUrl`, `:key`) | 100% |
| Request field names | camelCase | 100% |
| Response field names | camelCase | 100% |
| Error codes | SCREAMING_SNAKE_CASE | 100% |
| Boolean fields (rendering) | `hide*` prefix pattern | 100% |
| Boolean fields (state) | No prefix (`active`) | 100% |
| Collection field names | Resource-specific (`keys`, `stats`, `tiers`) | 100% |
| Success indicators | `success: true` on mutations, absent on reads | 100% |

### 3.2 URL Naming Assessment

All URL paths use lowercase-hyphenated segments. Path parameters use camelCase, which is the Express convention. No deviations found.

Pluralization is consistent: `/admin/keys` (plural collection), `/:key` (singular item). No singular-plural mismatches.

### 3.3 Field Naming Assessment

All request and response fields use camelCase. No snake_case or mixed-case fields found anywhere in the API surface.

### 3.4 Backward-Compatibility Aliases

The POST `/screenshot` body schema accepts both short and long field names for backward compatibility:

| Short (GET) | Long (POST) | Notes |
|-------------|-------------|-------|
| `gradient` | `backgroundGradient` | Both accepted |
| `bgColor` | `backgroundColor` | Both accepted |
| `radius` | `borderRadius` | Both accepted |
| — | `showMetrics` | POST-only (overrides `hideMetrics`) |

This aliasing is intentional and well-handled by `buildRenderOptions()`. The normalization is clean and doesn't leak into response fields.

### 3.5 Feature Parity Gap: `hideQuoteTweet`

The POST body schema includes `hideQuoteTweet: z.boolean().default(false)`, but the GET query schema does **not** include a `hideQuoteTweet` parameter. This means the feature is only available via POST, not GET.

All other `hide*` toggles (`hideMetrics`, `hideMedia`, `hideDate`, `hideVerified`, `hideShadow`) are available on both GET and POST. This is a parity gap.

**Fix applied:** Added `hideQuoteTweet` as a boolean string query parameter to the GET schema for consistency.

---

## 4. HTTP Method & Status Code Correctness

### 4.1 Method Audit

All HTTP methods are semantically correct:
- **GET** endpoints are read-only with no side effects ✓
- **POST** endpoints create resources or trigger actions ✓
- **DELETE** `/admin/keys/:key` performs a soft-delete (sets `active: false`) ✓
- No PUT or PATCH endpoints (none needed) ✓

### 4.2 Status Code Audit

| Issue | Endpoint | Current | Expected | Safe to Fix? |
|-------|----------|:-------:|:--------:|:------------:|
| Resource creation returns 200 | POST `/admin/keys` | 200 | 201 | Yes (internal) |
| Resource creation returns 200 | POST `/billing/signup` | 200 | 201 | Risky (external) |
| Internal errors return 400 | GET/POST `/screenshot/*` | 400 | 500 | Risky |
| Internal errors return 400 | GET `/tweet/:tweetIdOrUrl` | 400 | 500 | Risky |

**Status code correctness (no issues):**
- 401 for missing/invalid API key (authentication) ✓
- 403 for invalid admin key (authorization) ✓
- 429 for rate limiting (per-minute and monthly) ✓
- 503 for unconfigured Stripe ✓
- 500 for unhandled errors (global error handler) ✓
- Empty list results return 200 with empty array ✓ (`GET /admin/keys` returns `{ keys: [] }`)

**Fix applied:** Changed `POST /admin/keys` to return 201. This is an internal admin-only endpoint with no external consumers.

### 4.3 Catch-All 400 Problem (Documented)

The screenshot and tweet handlers use a catch-all try/catch that returns 400 for ALL errors:

```javascript
catch (err) {
  res.status(400).json({ error: err.message, code: 'SCREENSHOT_FAILED' });
}
```

This means internal errors (Satori crash, memory issues) are misclassified as client errors (400). The correct behavior would be to distinguish known client errors (invalid tweet ID, tweet not found) from unexpected internal errors (rendering crash → 500).

**Recommendation:** Introduce an `AppError` class with a `statusCode` property. Throw specific errors from `extractTweetId`/`fetchTweet`/`render` and use `err.statusCode || 500` in catch blocks. See Recommendations section.

---

## 5. Error Response Consistency

### 5.1 Dominant Error Format

```json
{
  "error": "Human-readable error message",
  "code": "SCREAMING_SNAKE_ERROR_CODE"
}
```

### 5.2 Extended Formats (Context-Dependent)

| Variant | Shape | Used By |
|---------|-------|---------|
| Standard | `{ error, code }` | All error responses |
| Validation | `{ error, code: "VALIDATION_ERROR", details: [{ field, message }] }` | validate.mjs |
| Monthly limit | `{ error, code: "MONTHLY_LIMIT_EXCEEDED", limit, remaining, tier }` | billing-guard.mjs |
| Rate limit | `{ error: "Rate limit exceeded", code: "RATE_LIMITED" }` | rate-limit.mjs |

### 5.3 Consistency Assessment

| Check | Result |
|-------|--------|
| All errors have `error` string field | ✓ 100% (18/18 endpoints) |
| All errors have `code` string field | ✓ 100% |
| Machine-readable error codes | ✓ Every error path has a unique code |
| Validation returns all errors at once | ✓ Zod `.issues` mapped to full array |
| No stack traces or internal paths leaked | ✓ Global error handler returns generic 500 |
| Consistent 400 for validation | ✓ All validation uses same middleware |

### 5.4 Error Codes Catalog

| Code | Status | Source |
|------|:------:|--------|
| `MISSING_API_KEY` | 401 | authenticate.mjs |
| `INVALID_API_KEY` | 401 | authenticate.mjs |
| `AUTH_ERROR` | 500 | authenticate.mjs |
| `ADMIN_DENIED` | 403 | admin.mjs |
| `VALIDATION_ERROR` | 400 | validate.mjs |
| `RATE_LIMITED` | 429 | rate-limit.mjs |
| `MONTHLY_LIMIT_EXCEEDED` | 429 | billing-guard.mjs |
| `SCREENSHOT_FAILED` | 400 | screenshot.mjs |
| `URL_NOT_CONFIGURED` | 400 | screenshot.mjs |
| `FETCH_FAILED` | 400 | tweet.mjs |
| `SIGNUP_FAILED` | 500 | billing.mjs |
| `BILLING_NOT_CONFIGURED` | 503 | billing.mjs |
| `CHECKOUT_FAILED` | 400 | billing.mjs |
| `PORTAL_FAILED` | 400 | billing.mjs |
| `USAGE_STATS_FAILED` | 500 | billing.mjs |
| `WEBHOOK_NOT_CONFIGURED` | 400 | billing.mjs |
| `WEBHOOK_FAILED` | 400 | billing.mjs |
| `MISSING_SIGNATURE` | 400 | billing.mjs |
| `KEY_CREATE_FAILED` | 500 | admin.mjs |
| `KEY_LIST_FAILED` | 500 | admin.mjs |
| `KEY_REVOKE_FAILED` | 500 | admin.mjs |
| `KEY_NOT_FOUND` | 404 | admin.mjs |
| `USAGE_STATS_FAILED` | 500 | admin.mjs |
| `INTERNAL_ERROR` | 500 | error-handler.mjs |

**Note:** `USAGE_STATS_FAILED` is used in both billing.mjs and admin.mjs. Both return 500. This is acceptable since the error is semantically the same.

### 5.5 Minor Risk: `err.message` Exposure

The `SCREENSHOT_FAILED`, `FETCH_FAILED`, `CHECKOUT_FAILED`, `PORTAL_FAILED`, and `WEBHOOK_FAILED` errors pass `err.message` directly to the response. For expected errors (tweet not found, invalid input), these messages are helpful and user-facing. For unexpected errors (Satori crash, network timeout), they may leak internal details.

**Risk level:** Low. The error messages from the rendering pipeline and Twitter API are user-facing by design. Network errors ("ECONNREFUSED") are the main concern, but these are not exploitable.

---

## 6. Pagination

### 6.1 List Endpoints

| Endpoint | Auth | Returns | Paginated | Max Size | Risk |
|----------|------|---------|:---------:|----------|:----:|
| GET `/admin/keys` | Admin | All API keys | No | Unbounded | Low |
| GET `/admin/usage` | Admin | All keys + usage | No | Unbounded | Low |
| GET `/pricing` | None | 3 tiers (fixed) | N/A | 3 | None |

### 6.2 Assessment

The two unbounded list endpoints (`/admin/keys`, `/admin/usage`) are admin-only and serve internal operations. Expected key counts are in the low hundreds for a typical deployment. Neither endpoint is exposed to regular API consumers.

Adding pagination would introduce complexity (cursor or offset management, metadata format) for a scenario that may never materialize. This is a **YAGNI** case.

**Recommendation:** Add pagination when key count exceeds ~500, or if admin endpoints are exposed to dashboards that query frequently. Not needed now.

---

## 7. Request Validation

### 7.1 Validation Coverage

| Endpoint | Input Source | Has Validation | Schema | Assessment |
|----------|-------------|:--------------:|--------|------------|
| GET `/screenshot/:tweetIdOrUrl` | query | ✓ | `screenshotQuerySchema` | Complete |
| POST `/screenshot` | body | ✓ | `screenshotBodySchema` | Complete |
| GET `/tweet/:tweetIdOrUrl` | params only | — | `extractTweetId` validates | Adequate |
| POST `/billing/signup` | body | ✓ | `signupSchema` | Complete |
| POST `/billing/checkout` | body | ✓ | `checkoutSchema` | Complete |
| POST `/billing/portal` | body | ✓ | `portalSchema` | Complete |
| POST `/admin/keys` | body | ✓ | `createKeySchema` | Complete |
| DELETE `/admin/keys/:key` | params only | — | Firestore lookup validates | Adequate |
| POST `/webhook/stripe` | raw body | — | Stripe signature validates | Adequate |

### 7.2 Validation Behavior Consistency

| Check | Result |
|-------|--------|
| Single library (Zod) | ✓ 100% |
| Single middleware (`validate.mjs`) | ✓ 100% |
| Consistent failure status (400) | ✓ 100% |
| Consistent error format (`VALIDATION_ERROR` + details) | ✓ 100% |
| All errors returned at once | ✓ 100% |
| Same fields validated same way | ✓ (email always `z.string().email()`, hex always same regex) |

### 7.3 Unprotected Endpoints (Sorted by Risk)

| Endpoint | Risk | Mitigated By |
|----------|:----:|--------------|
| GET `/tweet/:tweetIdOrUrl` | Low | `extractTweetId()` throws on invalid input, caught in handler |
| DELETE `/admin/keys/:key` | Low | Admin auth + Firestore lookup returns 404 for invalid keys |

No high-risk unprotected endpoints found. The two endpoints without formal Zod validation have runtime validation in their handlers.

---

## 8. Miscellaneous API Quality

### 8.1 Rate Limiting

| Category | Endpoints | Has Rate Limit | Headers |
|----------|-----------|:--------------:|:-------:|
| Core product | `/screenshot/*`, `/tweet/*` | ✓ Per-tier | ✓ RFC draft |
| Signup | `/billing/signup` | ✓ IP-based (5/15min) | ✓ |
| Billing actions | `/billing/checkout`, `/billing/portal` | **No** | — |
| Usage check | `/billing/usage` | **No** | — |
| Admin | All `/admin/*` | **No** | — |
| Public info | `/`, `/health`, `/pricing`, `/docs` | **No** | — |

**Rate limit headers:** `standardHeaders: true` is set on all limiters, which sends `RateLimit-*` headers per IETF draft. `legacyHeaders: false` is set to suppress `X-RateLimit-*` headers. This is correct and modern.

**Missing rate limits:**
- `POST /billing/checkout` and `POST /billing/portal` — These trigger Stripe API calls (external cost) with no rate limiting. Stripe has its own rate limits, but a local rate limit would prevent abuse. **Medium priority.**
- `GET /billing/usage` — Authenticated endpoint that queries Firestore on every call. No rate limit. **Low priority** (auth restricts access).
- Admin endpoints — Protected by admin key. No rate limit needed for admin operations.
- Public info endpoints — Static/computed data, low cost. No rate limit needed unless DDoS is a concern.

### 8.2 Versioning

No versioning applied. All endpoints are unversioned. This is appropriate for the current API maturity level. When breaking changes are needed, a `/v2/` prefix strategy is recommended.

### 8.3 Content Types

| Response Type | Content-Type Header | Assessment |
|---------------|-------------------|------------|
| JSON | `application/json` (via `res.json()`) | ✓ Automatic |
| PNG image | `image/png` (explicit) | ✓ Correct |
| SVG image | `image/svg+xml` (explicit) | ✓ Correct |
| HTML pages | `text/html` (via `res.send()`/`res.sendFile()`) | ✓ Automatic |
| Stripe webhook | Raw body parsed manually | ✓ Correct for signature verification |

Request `Content-Type` header is not explicitly verified for JSON endpoints. Express's `express.json()` middleware handles this by only parsing requests with `application/json` content type. Requests without proper content type will have `undefined` body, caught by Zod validation. This is adequate.

### 8.4 Idempotency

| Write Endpoint | Idempotent | Notes |
|----------------|:----------:|-------|
| POST `/screenshot` | ✓ | Same input → same output (read-only + render) |
| POST `/billing/signup` (with Stripe) | ✓ | `getOrCreateCustomer` returns existing customer |
| POST `/billing/signup` (without Stripe) | **No** | Creates new API key every call |
| POST `/billing/checkout` | ✓ | Creates new session but Stripe handles dedup |
| POST `/billing/portal` | ✓ | Creates new session URL (stateless) |
| POST `/admin/keys` | **No** | Creates new key every call (correct for admin CRUD) |
| DELETE `/admin/keys/:key` | ✓ | Second call returns 404 |
| POST `/webhook/stripe` | ✓ | Stripe events are idempotent by design |

**Significant finding:** `POST /billing/signup` without Stripe configured is non-idempotent. Calling it twice with the same email creates two separate API keys, orphaning the first. With Stripe configured, `getOrCreateCustomer` prevents this.

**Impact:** In development/testing mode (no Stripe), users who call signup twice get multiple keys. The first key still works but is disconnected from the email lookup. In production (Stripe enabled), this is not an issue.

### 8.5 Discoverability

- Landing page (`GET /`) includes links to `/docs`, `/pricing`, `/health` ✓
- `/docs` endpoint provides structured API documentation ✓
- No HATEOAS/hypermedia links in responses (appropriate for this API's complexity)

### 8.6 Security Notes

- **Email enumeration via portal:** `POST /billing/portal` throws "Customer not found" for unknown emails. An attacker could enumerate valid customer emails. **Low risk** — the endpoint has no rate limiting, but Stripe portal URLs are one-time use.
- **Admin key in headers:** `X-Admin-Key` is transmitted in HTTP headers. In production, this requires HTTPS (enforced by Cloud Run). ✓
- **No CSRF protection on billing endpoints:** POST endpoints accept `application/json` only (Express.json() middleware), which provides implicit CSRF protection since browsers don't send JSON content types from forms.

---

## 9. Fixes Applied

### Fix 1: `POST /admin/keys` returns 201 instead of 200

**Rationale:** Resource-creating POST should return 201 Created per HTTP semantics. This is an internal admin-only endpoint with no known external consumers. Contract test updated.

**Files changed:**
- `src/routes/admin.mjs` (line 36: `res.json()` → `res.status(201).json()`)
- `tests/integration/api-contracts.test.mjs` (updated expected status from 200 to 201)

### Fix 2: `hideQuoteTweet` added to GET screenshot query schema

**Rationale:** All other `hide*` toggles are available on both GET and POST endpoints. `hideQuoteTweet` was only available on POST, creating a parity gap. Added as an optional boolean string parameter matching the existing pattern.

**Files changed:**
- `src/schemas/request-schemas.mjs` (added `hideQuoteTweet: boolString` to `screenshotQuerySchema`)

---

## 10. API Style Guide

A comprehensive API Style Guide has been generated at `docs/API_DESIGN_GUIDE.md`. It codifies the dominant patterns discovered in this audit for reference when building new endpoints.

---

## 11. Recommendations

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| 1 | Fix catch-all 400 in handlers | Internal errors correctly reported as 500 | Medium | Yes | Introduce an `AppError` class with `statusCode`. Handler catch blocks use `err.statusCode \|\| 500`. Prevents misclassifying Satori/system crashes as client errors. |
| 2 | Make signup idempotent without Stripe | Prevents orphaned API keys on duplicate signup | Medium | Yes | Before creating a new key, query `apiKeysCollection` for existing keys with the same email. Return the existing key instead of creating a new one. |
| 3 | Add rate limiting to billing checkout/portal | Prevents Stripe session spam | Low | Probably | Add IP-based rate limiter (e.g., 10/min) to `POST /billing/checkout` and `POST /billing/portal`. These trigger external Stripe API calls. |
| 4 | Return 201 from POST /billing/signup | HTTP semantic correctness | Low | Only if time allows | Changing from 200 to 201 is technically correct but could break external consumers that check `status === 200`. Requires consumer audit first. |
| 5 | Add rate limiting to GET /billing/usage | Prevents Firestore query abuse | Low | Only if time allows | Authenticated endpoint that queries Firestore. Add per-tier rate limiting matching other authenticated endpoints. |
| 6 | Prevent email enumeration on portal | Information disclosure risk | Low | Only if time allows | Return generic "Portal session could not be created" instead of "Customer not found" on `POST /billing/portal` to prevent email enumeration. |
