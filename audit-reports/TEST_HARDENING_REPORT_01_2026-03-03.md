# Test Hardening Report

**Date:** 2026-03-03
**Branch:** `test-hardening-2026-03-03`
**Run Number:** 01

---

## 1. Summary

| Metric | Count |
|---|---|
| Flaky tests found and fixed (latent) | 5 patterns across 7 files |
| Flaky tests found but couldn't fix | 0 |
| Previously disabled tests re-enabled | 0 (none were disabled) |
| API endpoints found | 18 |
| Contract tests written | 45 |
| Documentation discrepancies found | 2 |
| Total tests before | 318 |
| Total tests after | 363 |

---

## 2. Flaky Tests Fixed

No tests were *actively* flaky (5 runs x 318 tests = 1,590 executions, 0 failures). However, 5 latent flaky patterns were identified and fixed:

| # | Pattern | File(s) | Root Cause | Fix Applied |
|---|---|---|---|---|
| 1 | Hardcoded `currentMonth: '2024-01'` | screenshot.test.mjs, tweet.test.mjs, smoke.test.mjs | Usage seeded with stale month causes billing guard to always test month-rollover path instead of same-month path. Would fail if billing guard ever rejected on rollover. | Replaced with `currentMonth()` from shared test-fixtures.mjs |
| 2 | `Date.now()` in subscription timestamps | stripe.test.mjs (10 occurrences) | Wall-clock dependent timestamps. While mock Firestore doesn't validate timestamps, this pattern would cause non-deterministic behavior if Stripe service ever compared timestamps. | Replaced with fixed epoch `1700000000` |
| 3 | `new Date().toISOString()` in firestore mock | firestore-mock.mjs (3 locations) | Server timestamps use real wall clock. Tests spanning second/minute boundaries get different timestamps across assertions. | Replaced with deterministic counter `deterministicTimestamp()` |
| 4 | Shallow copy in `MockDocSnapshot.data()` | firestore-mock.mjs | `{ ...this._data }` returns shallow copy. Mutations to nested objects (e.g., `data.user.name = x`) leak between tests. | Changed to `structuredClone(this._data)` |
| 5 | `TEST_CONFIG.GCS_BUCKET` mutation without cleanup | screenshot.test.mjs | Config set to `undefined` for one test, restored *after* assertions. If any assertion fails, restoration is skipped, breaking all subsequent tests. | Wrapped in `try/finally` for guaranteed restoration |

---

## 3. Flaky Tests Unresolved

None. All identified patterns were fixed.

---

## 4. API Endpoint Map

| # | Method | Path | Auth | Rate Limited | Contract Tested |
|---|---|---|---|---|---|
| 1 | GET | `/` | None | No | Yes |
| 2 | GET | `/health` | None | No | Yes |
| 3 | GET | `/pricing` | None | No | Yes |
| 4 | GET | `/docs` | None | No | Yes |
| 5 | GET | `/screenshot/:tweetIdOrUrl` | API Key | Per-tier | Yes |
| 6 | POST | `/screenshot` | API Key | Per-tier | Yes |
| 7 | GET | `/tweet/:tweetIdOrUrl` | API Key | Per-tier | Yes |
| 8 | POST | `/billing/signup` | None | IP-based (5/15min) | Yes |
| 9 | POST | `/billing/checkout` | None | No | Yes (503 path) |
| 10 | POST | `/billing/portal` | None | No | Yes (503 path) |
| 11 | GET | `/billing/usage` | API Key | No | Yes |
| 12 | POST | `/webhook/stripe` | Signature | No | Yes (400 path) |
| 13 | GET | `/billing/success` | None | No | Yes |
| 14 | GET | `/billing/cancel` | None | No | Yes |
| 15 | POST | `/admin/keys` | Admin Key | No | Yes |
| 16 | GET | `/admin/keys` | Admin Key | No | Yes |
| 17 | DELETE | `/admin/keys/:key` | Admin Key | No | Yes |
| 18 | GET | `/admin/usage` | Admin Key | No | Yes |

**Coverage:** 18/18 endpoints have contract tests (100%).

---

## 5. Documentation Discrepancies

### 5.1 CLAUDE.md says admin usage returns `keyString` — code returns `key` (masked)

**CLAUDE.md states:**
> `GET /admin/usage` response includes `keyString: "ts_free_<uuid>"`

**Actual behavior (admin.mjs:75):**
The admin usage endpoint strips `_id` from key data using `({ _id, ...keyData }) => { ... }` and returns whatever fields remain from `listApiKeys()`. The `listApiKeys()` function returns keys with a `key` field (masked string like `"ts_free_abcd..."`) rather than the full `keyString`.

**Impact:** Low. Consumers building against the documented `keyString` field will find it doesn't exist.

### 5.2 CLAUDE.md says `GET /admin/keys` returns `keyString` — code returns `key` (masked)

**CLAUDE.md states:**
> `GET /admin/keys` response includes `keyString: "ts_free_<uuid>"`

**Actual behavior:**
The `listApiKeys()` function masks the key to first 12 chars + `"..."` and returns it as `key`, not `keyString`.

**Impact:** Low. Same field naming discrepancy as above.

---

## 6. Undocumented Behavior

### 6.1 Billing guard fails open with silent logging
When Firestore is unreachable during `trackAndEnforce()`, the billing guard logs the error and allows the request through. This is intentional (documented) but the response **still** sets `X-Credits-Limit` and `X-Credits-Remaining` headers to `0` and `0` respectively, which could mislead API consumers into thinking they have no credits.

### 6.2 Admin key creation defaults `name` to `"Unnamed"`
Not documented in CLAUDE.md or the request schema docs. The `name` field in `POST /admin/keys` defaults to `"Unnamed"` when omitted.

### 6.3 Signup creates customer + API key atomically
`POST /billing/signup` creates both a customer record in the `customers` collection AND an API key in `apiKeys`. If the API key creation succeeds but the customer write fails, the key exists without a customer record. There's no transaction wrapping this.

### 6.4 Query string boolean coercion
GET `/screenshot` query parameters accept `"true"` and `"false"` strings which are coerced to booleans by the Zod schema. The strings `"0"`, `"1"`, `"yes"`, `"no"` are NOT accepted. This is not documented.

### 6.5 POST body accepts alias fields
The POST `/screenshot` body accepts these undocumented aliases:
- `backgroundGradient` (alias for `gradient`)
- `backgroundColor` (alias for `bgColor`)
- `borderRadius` (alias for `radius`)
- `showMetrics` (inverse of `hideMetrics`)

### 6.6 Health endpoint timestamp uses server wall clock
`GET /health` returns `{ timestamp: new Date().toISOString() }` — this is the server's clock, not Firestore's. In production, this could differ from Firestore timestamps by the NTP drift amount.

---

## 7. Recommendations

### 7.1 Fix documentation field naming
Update CLAUDE.md to replace `keyString` references with `key` (masked) for admin listing endpoints, or update the code to use `keyString` consistently. This prevents consumers from building against wrong field names.

### 7.2 Consider deterministic test conventions
The test suite now uses deterministic timestamps and dynamic months, but some edge cases remain:
- `rate-limit.test.mjs` uses real HTTP servers (necessary for express-rate-limit). If tests ever become slow on CI, consider a mock-based approach.
- `core.test.mjs` `formatDate()` tests use locale-dependent assertions (`/AM|PM/`). These pass universally but could break in non-English locales.

### 7.3 Wrap multi-step Firestore operations in batch writes
`POST /billing/signup` creates a customer record and an API key in separate Firestore writes. If the second write fails, the system enters an inconsistent state. Consider using Firestore batch writes or adding idempotency checks.

---

## 8. Test Results Summary

```
Before: 21 files, 318 tests, all passing
After:  22 files, 363 tests, all passing (+45 contract tests)
Runs:   8 consecutive full-suite runs, 0 failures
```

### Files Changed

| File | Change |
|---|---|
| `tests/helpers/firestore-mock.mjs` | Deep copy in data(), deterministic timestamps |
| `tests/helpers/test-fixtures.mjs` | Added shared `currentMonth()` helper |
| `tests/integration/screenshot.test.mjs` | Dynamic month, try/finally for config mutation |
| `tests/integration/tweet.test.mjs` | Dynamic month |
| `tests/smoke/smoke.test.mjs` | Dynamic month |
| `tests/unit/stripe.test.mjs` | Fixed epoch timestamps |
| `tests/unit/usage.test.mjs` | Shared currentMonth(), deterministic timestamps |
| `tests/integration/api-contracts.test.mjs` | **NEW** — 45 contract tests |
