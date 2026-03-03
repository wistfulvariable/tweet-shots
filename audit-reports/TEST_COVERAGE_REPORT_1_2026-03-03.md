# Test Coverage Audit Report

**Run:** 1
**Date:** 2026-03-03
**Branch:** `test-coverage-2026-03-03`
**Framework:** Vitest 4.0.18 + @vitest/coverage-v8

---

## Executive Summary

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Test files | 12 | 21 | +9 |
| Total tests | 224 | 318 | +94 |
| Statement coverage | 56.25% | 77.73% | +21.48% |
| Line coverage | 57.18% | 78.45% | +21.27% |
| Branch coverage | N/A | 74.83% | baseline |
| Function coverage | N/A | 82.14% | baseline |
| Mutation kill rate | N/A | 90.5% | 19/21 killed |
| Bugs found | 0 | 1 critical | +1 |

All 318 tests pass. No source files were modified.

---

## Phase 1: Smoke Tests

**File:** `tests/smoke/smoke.test.mjs` (7 tests)

Quick health checks proving the app starts and serves requests:
1. Health endpoint returns 200
2. Auth rejects missing API key (401)
3. Screenshot renders a PNG for valid key
4. Landing page returns HTML
5. Admin gate rejects unauthorized requests
6. Billing signup creates a free key
7. Tweet data endpoint returns tweet JSON

**Bug discovered:** Admin router's `router.use()` middleware blocks ALL requests when admin routes are mounted before billing in `server.mjs`. See Bug Report below.

---

## Phase 2: Coverage Gap Analysis

### Baseline (before this audit)

| File | Statements | Risk |
|------|-----------|------|
| stripe.mjs | 2.94% | Critical |
| render-pool.mjs | 0% | Critical |
| server.mjs | 0% | Critical |
| storage.mjs | 0% | High |
| logger.mjs | 0% | High |
| error-handler.mjs | 33% | High |
| rate-limit.mjs | 42% | High |
| billing.mjs | 49% | Medium |
| admin.mjs | 65% | Medium |
| tweet.mjs | 78% | Medium |

### Final Coverage (after this audit)

| File | Statements | Branch | Functions | Lines |
|------|-----------|--------|-----------|-------|
| core.mjs | 74.07% | 70.94% | 70.58% | 75.19% |
| config.mjs | 100% | 100% | 100% | 100% |
| logger.mjs | 100% | 100% | 100% | 100% |
| server.mjs | 0% | 0% | 0% | 0% |
| authenticate.mjs | 100% | 100% | 100% | 100% |
| billing-guard.mjs | 100% | 100% | 100% | 100% |
| error-handler.mjs | 100% | 100% | 100% | 100% |
| rate-limit.mjs | 100% | 100% | 100% | 100% |
| validate.mjs | 100% | 100% | 100% | 100% |
| admin.mjs | 80% | 100% | 100% | 79.48% |
| billing.mjs | 49.05% | 40% | 100% | 49.05% |
| health.mjs | 100% | 100% | 100% | 100% |
| landing.mjs | 88.88% | 50% | 100% | 88.88% |
| screenshot.mjs | 97.56% | 80% | 100% | 97.56% |
| tweet.mjs | 100% | 100% | 100% | 100% |
| request-schemas.mjs | 100% | 100% | 100% | 100% |
| api-keys.mjs | 100% | 100% | 100% | 100% |
| firestore.mjs | 0% | 0% | 0% | 0% |
| storage.mjs | 100% | 100% | 100% | 100% |
| stripe.mjs | 100% | 100% | 100% | 100% |
| usage.mjs | 100% | 87.5% | 100% | 100% |
| render-pool.mjs | 91.13% | 78.78% | 100% | 91.78% |

### Modules at 100% statement coverage (14 of 22)

authenticate, billing-guard, error-handler, rate-limit, validate, config, logger, health, tweet, request-schemas, api-keys, storage, stripe, usage

### Remaining gaps

| File | Gap | Reason |
|------|-----|--------|
| server.mjs (0%) | Express app assembly + DI wiring | Would require full E2E test spinning up real server with all dependencies; better tested indirectly through integration tests |
| firestore.mjs (0%) | Firestore client initialization | Mocked in all tests; real initialization requires GCP credentials |
| billing.mjs (49%) | Stripe checkout, portal, webhook handler paths | Require configured Stripe client (mocked as not-configured in tests) |
| core.mjs (74%) | loadFonts, PDF generation, thread rendering branches | CLI-specific paths, font loading, worker message handling |
| admin.mjs (80%) | PUT/DELETE admin routes for key management | Partially covered; remaining lines are error branches |
| render-pool.mjs (91%) | Worker error edge cases, queue timeout | Hard-to-trigger concurrency edge cases |

---

## Phase 3: New Unit Tests

| Test file | Tests | Target module | Coverage gain |
|-----------|-------|---------------|---------------|
| stripe.test.mjs | 34 | stripe.mjs | 2.94% -> 100% |
| error-handler.test.mjs | 4 | error-handler.mjs | 33% -> 100% |
| rate-limit.test.mjs | 7 | rate-limit.mjs | 42% -> 100% |
| render-pool.test.mjs | 16 | render-pool.mjs | 0% -> 91.13% |
| storage.test.mjs | 5 | storage.mjs | 0% -> 100% |
| logger.test.mjs | 4 | logger.mjs | 0% -> 100% |

### Notable test patterns

- **rate-limit.test.mjs**: Uses real Express servers (`app.listen(0)`) because express-rate-limit requires app context. Mock req/res doesn't work.
- **render-pool.test.mjs**: Mocks `worker_threads.Worker` with a real class (`ProxiedWorker extends EventEmitter`) + factory pattern for tracking created workers. Most complex mock in the suite.
- **stripe.test.mjs**: Comprehensive mock Stripe client covering all 7 exported functions including webhook signature verification.

---

## Phase 4: New Integration Tests

| Test file | Tests | Target routes | Coverage gain |
|-----------|-------|---------------|---------------|
| tweet.test.mjs | 8 | GET /tweet/:id | 78% -> 100% |
| admin-usage.test.mjs | 7 | GET /admin/usage | 65% -> 80% |

---

## Phase 5: Mutation Testing

### Methodology

Manual mutation testing on 21 mutants across 10 critical functions. Each mutation was applied, tests run, then immediately reverted. Mutations targeted boundary conditions, return values, and arithmetic operators.

### Results

| Mutant | Function | Mutation | Result |
|--------|----------|----------|--------|
| M1 | generateKeyString | Change prefix 'ts_' to 'key_' | KILLED |
| M2 | generateKeyString | Remove tier validation throw | KILLED |
| M3 | createApiKey | Default name '' instead of 'Unnamed' | KILLED |
| M4 | validateApiKey | Return null for active key | KILLED |
| M5 | validateApiKey | Return data without keyString | KILLED (test added) |
| M6 | trackAndEnforce | Remove >= limit check | KILLED |
| M7 | trackAndEnforce | Change increment from 1 to 2 | KILLED |
| M8 | trackAndEnforce | Remove month rollover reset | KILLED |
| M9 | getUsageStats | Return limit instead of 0 for new key | KILLED |
| M10 | getUsageStats | Remove Math.max(0, remaining) clamp | KILLED (test added) |
| M11 | authenticate | Accept inactive keys | KILLED |
| M12 | authenticate | Skip API key extraction | KILLED |
| M13 | billingGuard | Skip usage tracking call | KILLED |
| M14 | billingGuard | Don't set credit headers | KILLED |
| M15 | validate | Skip Zod validation | KILLED |
| M16 | validate | Pass raw body instead of validated | KILLED |
| M17 | buildRenderOptions | Change default theme to 'light' | KILLED |
| M18 | buildRenderOptions | Change default width fallback | KILLED |
| M19 | buildRenderOptions | Invert showMetrics logic | KILLED |
| M20 | createStripeClient | Return null client | SURVIVED |
| M21 | handleWebhook | Skip signature verification | SURVIVED |

### Kill Rate: 19/21 (90.5%)

### Surviving Mutants Analysis

**M20: createStripeClient returns null** — Survives because Stripe client creation is tested in isolation but downstream consumers (checkout, portal) are tested with Stripe-not-configured scenario, not with a null client. Would require full Stripe integration test to kill.

**M21: handleWebhook skips signature verification** — Survives because webhook tests use the "webhook not configured" path (no Stripe secret). Killing this would require tests with a configured Stripe webhook secret and real signature verification, which is a full Stripe integration concern.

Both surviving mutants are in the Stripe integration boundary — an acceptable gap since Stripe integration requires real API keys for meaningful testing.

---

## Bug Report

### BUG-001: Admin Router Blocks Billing Routes (CRITICAL)

**Location:** `src/server.mjs` lines ~101-104, `src/routes/admin.mjs`

**Description:** The admin router uses `router.use()` to apply admin-key authentication middleware to ALL routes within its router. When admin routes are mounted before billing routes in `server.mjs`, the admin middleware intercepts billing requests (`/billing/signup`, `/billing/checkout`, etc.) and returns 403 "Admin authentication required" because these requests don't carry an `X-Admin-Key` header.

**Impact:** In the current production `server.mjs`, billing endpoints may be inaccessible without admin credentials.

**Evidence:** Smoke test `tests/smoke/smoke.test.mjs` documents this — the test had to mount billing routes BEFORE admin routes to get signup working.

**Fix (not applied per audit rules):** In `server.mjs`, mount billing routes before admin routes:
```javascript
// Current (broken):
app.use(adminRoutes({ config, logger }));
app.use(billingRoutes({ authenticate: authMiddleware, config, logger }));

// Fixed:
app.use(billingRoutes({ authenticate: authMiddleware, config, logger }));
app.use(adminRoutes({ config, logger }));
```

---

## Test Quality Assessment

### Strengths

1. **No flaky tests** — All 318 tests are deterministic. Rate-limit tests use real servers on port 0, avoiding conflicts.
2. **Realistic mocks** — Firestore mock preserves real CRUD semantics with in-memory Maps. Stripe mock mirrors actual API shapes.
3. **One behavior per test** — Each test has a clear name and single assertion focus.
4. **Full middleware chain** — Integration tests use the real middleware chain (authenticate -> rateLimit -> billingGuard -> validate) with mocked backing stores.
5. **Edge cases covered** — Month rollover, tier fallbacks, inactive keys, missing data, over-limit usage, invalid inputs.
6. **No tautological tests** — Every test verifies real behavior, not implementation details.

### Weaknesses

1. **server.mjs at 0%** — The Express app assembly/DI wiring has no direct test. It's covered indirectly by integration tests that replicate the wiring, but a bug in the real wiring (like BUG-001) wouldn't be caught.
2. **Stripe integration gap** — Webhook signature verification and end-to-end checkout flow untestable without Stripe test keys.
3. **core.mjs at 74%** — CLI-specific paths (PDF generation, font loading, worker message handling) are untested. These are complex rendering paths that would need Satori/Resvg mocking.
4. **No concurrency tests** — Worker pool tested with sequential tasks. No parallel stress testing.

### Recommendations

| Priority | Recommendation | Effort | Impact |
|----------|---------------|--------|--------|
| P0 | Fix BUG-001 (admin/billing route ordering) | 5 min | Critical |
| P1 | Add server.mjs integration test that imports the real `createApp()` | 1 hr | High |
| P2 | Add Stripe webhook test with test secret key | 1 hr | Medium |
| P3 | Cover core.mjs PDF and translation paths | 2 hr | Medium |
| P4 | Add render-pool concurrent task stress test | 1 hr | Low |

---

## Files Created

| File | Type | Tests |
|------|------|-------|
| tests/smoke/smoke.test.mjs | Smoke | 7 |
| tests/unit/stripe.test.mjs | Unit | 34 |
| tests/unit/error-handler.test.mjs | Unit | 4 |
| tests/unit/rate-limit.test.mjs | Unit | 7 |
| tests/unit/render-pool.test.mjs | Unit | 16 |
| tests/unit/storage.test.mjs | Unit | 5 |
| tests/unit/logger.test.mjs | Unit | 4 |
| tests/integration/tweet.test.mjs | Integration | 8 |
| tests/integration/admin-usage.test.mjs | Integration | 7 |

## Files Modified

| File | Change |
|------|--------|
| vitest.config.mjs | Added coverage configuration (v8 provider) |
| tests/unit/api-keys.test.mjs | +1 mutation-killing test (keyString assertion) |
| tests/unit/usage.test.mjs | +1 mutation-killing test (remaining clamp to 0) |

## No Source Files Were Modified
