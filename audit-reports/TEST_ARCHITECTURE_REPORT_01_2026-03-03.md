# Test Architecture & Antipattern Audit Report

**Run:** 01 | **Date:** 2026-03-03 | **Suite:** 364 tests across 22 files | **Runtime:** 2.24s

---

## 1. Executive Summary

**Suite Health Rating: ADEQUATE (leaning Strong)**

| Metric | Value |
|---|---|
| Total Test Files | 22 (14 unit, 7 integration, 1 smoke) |
| Total Tests | 364 |
| Total Antipatterns Found | 23 instances across 5 categories |
| Regression Effectiveness | 7/10 — catches most happy-path and error-path regressions |
| Zero-Assertion Tests | 0 |
| Tautological Tests | 0 |
| Misleading Test Names | 2 |
| Implementation-Coupled Tests | 8 |
| Mock Overuse Instances | 5 |
| Duplication Instances | 8 |

**Verdict:** This test suite **would** catch a subtle billing bug introduced on a Friday afternoon. The billing/Stripe module has the deepest test coverage in the project (50+ tests across unit + integration), covering upgrades, downgrades, cancellations, webhook routing, edge cases, and Firestore state mutations. The suite's main weakness is mock-heavy integration tests that don't exercise real middleware wiring and some implementation-coupling in the screenshot route tests. There are no decorative tests — every test asserts something meaningful.

---

## 2. Test Inventory & Classification

### Test File Catalog

| File | Tests | Type | Source Module | Runtime |
|---|---|---|---|---|
| `tests/unit/schemas.test.mjs` | 28 | Unit | `src/schemas/request-schemas.mjs` | <50ms |
| `tests/unit/authenticate.test.mjs` | 5 | Unit | `src/middleware/authenticate.mjs` | <50ms |
| `tests/unit/billing-guard.test.mjs` | 5 | Unit | `src/middleware/billing-guard.mjs` | <50ms |
| `tests/unit/validate.test.mjs` | 5 | Unit | `src/middleware/validate.mjs` | <50ms |
| `tests/unit/config.test.mjs` | 11 | Unit | `src/config.mjs` | <50ms |
| `tests/unit/core.test.mjs` | 60 | Unit | `core.mjs` | <100ms |
| `tests/unit/error-handler.test.mjs` | 4 | Unit | `src/middleware/error-handler.mjs` | <50ms |
| `tests/unit/logger.test.mjs` | 4 | Unit | `src/logger.mjs` | <50ms |
| `tests/unit/rate-limit.test.mjs` | 6 | Unit | `src/middleware/rate-limit.mjs` | <200ms |
| `tests/unit/render-pool.test.mjs` | 14 | Unit | `src/workers/render-pool.mjs` | <100ms |
| `tests/unit/storage.test.mjs` | 5 | Unit | `src/services/storage.mjs` | <50ms |
| `tests/unit/api-keys.test.mjs` | 14 | Unit | `src/services/api-keys.mjs` | <50ms |
| `tests/unit/stripe.test.mjs` | 28 | Unit | `src/services/stripe.mjs` | <50ms |
| `tests/unit/usage.test.mjs` | 12 | Unit | `src/services/usage.mjs` | <50ms |
| `tests/integration/health.test.mjs` | 4 | Integration | Routes: health, landing | <100ms |
| `tests/integration/admin.test.mjs` | 7 | Integration | Routes: admin | <100ms |
| `tests/integration/billing.test.mjs` | 10 | Integration | Routes: billing | <100ms |
| `tests/integration/admin-usage.test.mjs` | 7 | Integration | Routes: admin usage | <100ms |
| `tests/integration/api-contracts.test.mjs` | 45 | Integration | All routes (contract) | <200ms |
| `tests/integration/screenshot.test.mjs` | 22 | Integration | Routes: screenshot | <100ms |
| `tests/integration/tweet.test.mjs` | 9 | Integration | Routes: tweet | <100ms |
| `tests/smoke/smoke.test.mjs` | 7 | Smoke | Full app wiring | <100ms |

### Testing Pyramid

| Level | Tests | % |
|---|---|---|
| Unit | 201 | 55.2% |
| Integration | 156 | 42.9% |
| Smoke | 7 | 1.9% |
| E2E | 0 | 0% |

**Assessment:** The pyramid is slightly bottom-heavy integration — 43% integration is higher than a typical healthy ratio (70/20/10). However, the integration tests are lightweight (Express + in-memory mock Firestore, no real DB), so runtime is still fast (2.24s total). This is acceptable for an API project where the real risk is in route wiring, middleware ordering, and HTTP contract compliance.

### Coverage Distribution

| Module | Has Unit Tests | Has Integration Tests | Has Any Tests |
|---|---|---|---|
| `core.mjs` | Yes (60 tests) | Indirect via screenshot/tweet | Yes |
| `src/config.mjs` | Yes (11 tests) | No | Yes |
| `src/logger.mjs` | Yes (4 tests) | No | Yes |
| `src/schemas/request-schemas.mjs` | Yes (28 tests) | Indirect | Yes |
| `src/middleware/authenticate.mjs` | Yes (5 tests) | Via all auth routes | Yes |
| `src/middleware/billing-guard.mjs` | Yes (5 tests) | Via auth routes | Yes |
| `src/middleware/validate.mjs` | Yes (5 tests) | Via all POST routes | Yes |
| `src/middleware/error-handler.mjs` | Yes (4 tests) | Via smoke/contracts | Yes |
| `src/middleware/rate-limit.mjs` | Yes (6 tests) | No | Yes |
| `src/services/api-keys.mjs` | Yes (14 tests) | Via admin routes | Yes |
| `src/services/usage.mjs` | Yes (12 tests) | Via billing routes | Yes |
| `src/services/stripe.mjs` | Yes (28 tests) | Partial (no-Stripe path) | Yes |
| `src/services/storage.mjs` | Yes (5 tests) | Mocked in screenshot | Yes |
| `src/services/firestore.mjs` | No (3 lines, trivial) | Mocked everywhere | Acceptable gap |
| `src/workers/render-pool.mjs` | Yes (14 tests) | No | Yes |
| `src/workers/render-worker.mjs` | No | No | **Gap** |
| `src/routes/screenshot.mjs` | No unit | Yes (22 + contract) | Yes |
| `src/routes/tweet.mjs` | No unit | Yes (9 + contract) | Yes |
| `src/routes/admin.mjs` | No unit | Yes (7 + 7 + contract) | Yes |
| `src/routes/billing.mjs` | No unit | Yes (10 + contract) | Yes |
| `src/routes/health.mjs` | No unit | Yes (4 + contract) | Yes |
| `src/routes/landing.mjs` | No unit | Yes (1 + contract) | Yes |
| `src/server.mjs` | No | Partial via smoke | **Weak** |

**Untested modules:**
- `src/workers/render-worker.mjs` — excluded from coverage by `vitest.config.mjs`, worker entry point. Moderate risk.
- `src/server.mjs` — only tested via smoke tests (middleware wiring, graceful shutdown, raw body parsing, request ID middleware). Moderate risk.

---

## 3. Antipattern Findings

### 3A. Implementation Coupling (8 instances, Severity: Medium)

Tests that assert on internal mock call details rather than observable behavior.

| File | Test | What's Wrong | Severity | Suggested Fix |
|---|---|---|---|---|
| `screenshot.test.mjs` | "calls renderTweetToImage with default options" | Asserts exact mock call args (`expect.objectContaining({ theme: 'dark', width: 550 })`). If the default width constant changes, this test breaks even though behavior is correct. | Medium | Assert on response content-type/body instead. Keep 1 test for option passthrough, remove exact-value assertions. |
| `screenshot.test.mjs` | "respects query params for render options" | Same — asserts mock was called with exact options object. | Medium | One parameterized test for "query params reach renderer" is fine; remove per-param mock assertions. |
| `screenshot.test.mjs` | "applies gradient from query param" | Asserts `renderTweetToImage` mock called with `{ backgroundGradient: 'sunset' }`. | Low | Acceptable as an integration-level "options passthrough" test, but slightly coupled. |
| `screenshot.test.mjs` | "applies hex color params" | Asserts 3 specific color values on mock call. | Low | Same pattern. |
| `screenshot.test.mjs` | "handles boolean query string params" | Asserts mock call args `{ showMetrics: false, hideMedia: true }`. | Low | Tests the controller's transform logic — acceptable. |
| `screenshot.test.mjs` | "handles dimension presets" | Asserts `width: 1080` on mock call. | Low | Tests DIMENSIONS lookup — acceptable if the constant is considered API surface. |
| `billing-guard.test.mjs` | "passes correct parameters to trackAndEnforce" | Asserts exact args to mock dependency. | Low | Acceptable for middleware plumbing. |
| `tweet.test.mjs` | "logs error when fetch fails" | Asserts `mockLogger.error` called with exact object shape. | Low | Logging format is an implementation detail. Assert that an error *was* logged, not the exact shape. |

**Pattern:** The screenshot integration tests are the worst offenders — 6 of 22 tests assert on mock call arguments rather than HTTP response behavior. These tests will break if the internal option-naming changes, even if the HTTP API behavior is unchanged.

### 3B. Mock Overuse (5 instances, Severity: Low-Medium)

| File | Test | What's Wrong | Severity | Suggested Fix |
|---|---|---|---|---|
| `core.test.mjs` | Mock setup (lines 10-72) | 5 separate `vi.mock()` calls for satori, resvg, satori-html, fs, pdfkit. Mock setup is 62 lines; the test file is 944 lines (6.6%). | Low | Acceptable given core.mjs does real rendering. These mocks are necessary. |
| `render-pool.test.mjs` | MockWorker + ProxiedWorker (lines 12-83) | 71-line mock class that re-implements worker_threads behavior. The mock is more complex than `render-pool.mjs` itself. | Medium | The mock duplicates significant worker_threads API surface. Consider extracting to a shared helper or using a simpler mock that only proxies postMessage/terminate. |
| `stripe.test.mjs` | createMockStripe() (lines 47-78) | 31-line factory re-implementing Stripe client. Manageable but needs updating if Stripe API changes. | Low | Acceptable — Stripe is an external dependency. |
| `screenshot.test.mjs` | Mock core.mjs (lines 26-47) | Re-implements `extractTweetId` with regex. If the real regex changes, mock and production diverge silently. | Medium | Import the real `extractTweetId` from core.mjs instead of re-implementing it in the mock. Only mock `fetchTweet` and `renderTweetToImage`. |
| `api-contracts.test.mjs` | Same `extractTweetId` mock | Duplicate re-implementation of extractTweetId. | Medium | Same fix — use `vi.importActual()` for extractTweetId. |

**Pattern:** `extractTweetId` is re-implemented in 4 test files (screenshot.test, tweet.test, api-contracts.test, smoke.test). If the real function's URL parsing changes, all 4 mocks would silently diverge. This is the single most dangerous mock pattern in the suite.

### 3C. Duplication & Bloat (8 instances, Severity: Low)

| File | Test | What's Wrong | Severity | Suggested Fix |
|---|---|---|---|---|
| `screenshot.test.mjs` + `api-contracts.test.mjs` | Near-identical setup blocks | Both files have ~40 lines of identical mock setup (Firestore, core.mjs, storage, beforeEach seeding). | Low | Extract a `createTestServer(routeConfig)` helper that sets up Express + mocks. |
| `api-contracts.test.mjs` + `smoke.test.mjs` | Nearly identical server wiring | Both spin up full Express apps with the same mock + route mounting. 95% identical code. | Medium | Share a `createTestApp()` factory. |
| `screenshot.test.mjs` | beforeEach re-sets mock implementations | 15 lines of `mockImplementation()` calls after `vi.clearAllMocks()`. Pattern duplicated in tweet.test and api-contracts.test. | Low | Consider using `vi.mock()` with `{ once: false }` or restructuring to avoid clearAllMocks. |
| `admin.test.mjs` + `admin-usage.test.mjs` | Identical Firestore mock + server setup | Two files for the same admin routes — could be one file. | Low | Merge into a single `admin.test.mjs`. |
| 4 integration test files | Identical `extractTweetId` mock function | Copy-pasted regex mock across screenshot, tweet, api-contracts, smoke. | Medium | Extract to `tests/helpers/core-mock.mjs`. |

### 3D. Wrong Test Level (1 instance, Severity: Low)

| File | Test | What's Wrong | Severity | Suggested Fix |
|---|---|---|---|---|
| `rate-limit.test.mjs` | All 6 tests | Labeled as "unit tests" but spins up real Express servers with `app.listen()`. These are integration tests. | Low | Move to `tests/integration/` or rename the describe block. Cosmetic issue only — the tests themselves are well-written. |

### 3E. Misleading Tests (2 instances, Severity: Low)

| File | Test | What's Wrong | Severity | Suggested Fix |
|---|---|---|---|---|
| `core.test.mjs` | "formats AM times correctly" | Name says "AM" but assertion is `expect(result).toMatch(/AM|PM/)` — accepts either. | Low | Rename to "includes AM/PM designator" or fix to assert on the actual value. |
| `core.test.mjs` | "formats PM times correctly" | Same issue — `15:30 UTC` might render as AM in certain timezones. Assertion accepts both. | Low | Same fix. The test is actually testing that `formatDate` includes an AM/PM designator, not that it's correct for PM. |

### 3F. Fragile Snapshots

**None found.** The suite uses no snapshot testing. This is appropriate for an API project.

### 3G. Shared & Leaking State

**Minimal risk.** Most files use `beforeEach` to clear mock stores. Two patterns worth noting:

1. `config.test.mjs` saves/restores `process.env` — correctly done with `beforeEach`/`afterEach`.
2. `core.test.mjs` manually saves/restores `globalThis.fetch` — correctly done, but the `loadFonts` tests note that caching behavior may leak across tests (line 767-769 comment acknowledges this).
3. `rate-limit.test.mjs` accumulates servers in a `servers` array cleaned up in `afterAll` — correct but fragile if a test fails mid-setup.

### 3H. Test Helper Bugs

**The Firestore mock is well-implemented** (195 lines). Two observations:

1. **Missing `where().get()` without `limit()`**: The mock's `where()` method returns an object with only `.limit()`. If production code calls `.where().get()` directly, the mock would fail at test time (good — surfaces the issue). However, `.where().orderBy()` or `.where().select()` would also crash, which might mask real bugs as mock bugs.

2. **`test-fixtures.mjs` MOCK_KEY_DATA missing `keyString`**: The fixture doesn't include `keyString`, but `validateApiKey` in production adds it. Tests that use this fixture directly for mock Firestore data won't have `keyString` in the stored doc — which matches production behavior (keyString is the doc ID, not a field). This is correct.

---

## 4. Regression Effectiveness Assessment

| Module | Test Count | Effectiveness | Rating | Why |
|---|---|---|---|---|
| **core.mjs** (extractTweetId, formatDate/Number) | 22 | Strong | Tests pure functions with boundary values, error cases, and varied inputs. Would catch off-by-one, URL parsing changes, and edge cases. |
| **core.mjs** (fetchTweet, fetchThread) | 17 | Strong | Tests happy path, HTTP errors, empty responses, thread walking logic, author-boundary stopping. Would catch most regressions. |
| **core.mjs** (generateTweetHtml) | 18 | Strong | Tests HTML escaping, theme colors, entity rendering, media handling, quote tweets, truncation. Would catch most rendering regressions. |
| **core.mjs** (renderTweetToImage) | 8 | Adequate | Tests format selection, image pre-fetching, dimension calculation. Mocks prevent testing actual Satori/Resvg integration. Would miss Satori API changes. |
| **src/middleware/authenticate.mjs** | 5 | Strong | Tests missing key, invalid key, error path, header vs query precedence. Would catch auth bypass regressions. |
| **src/middleware/billing-guard.mjs** | 5 | Strong | Tests allowed/rejected/error paths, header setting. Would catch billing enforcement regressions. |
| **src/middleware/validate.mjs** | 5 | Adequate | Tests body/query validation, error shape. Missing: custom Zod refinements, transform functions. |
| **src/middleware/error-handler.mjs** | 4 | Adequate | Tests 500 response, logging, no-stack errors. Missing: duplicate calls, response-already-sent edge case. |
| **src/middleware/rate-limit.mjs** | 6 | Weak | Tests first-request-passes and header presence, but never actually tests rate limiting (exceeding the limit). Would NOT catch a bug where rate limiting stops working. |
| **src/services/api-keys.mjs** | 14 | Strong | Tests CRUD operations, validation, batch writes, uniqueness. Would catch most data-layer regressions. |
| **src/services/usage.mjs** | 12 | Strong | Tests creation, increment, limit enforcement, month rollover, tier limits, clamping. Would catch billing logic regressions. |
| **src/services/stripe.mjs** | 28 | Strong | Tests customer CRUD, checkout/portal sessions, subscription lifecycle, webhook routing, missing fields, orphaned customers. Would catch most Stripe integration regressions. |
| **src/services/storage.mjs** | 5 | Adequate | Tests upload parameters, URL format, content type, caching, error propagation. Sufficient for a thin wrapper. |
| **src/workers/render-pool.mjs** | 14 | Strong | Tests pool sizing, task dispatch, queuing, error handling, shutdown, worker replacement. Would catch pool management regressions. |
| **src/workers/render-worker.mjs** | 0 | None | No tests. Worker entry point is excluded from coverage. Risk: bugs in message handling, font loading, or error reporting within the worker would be invisible. |
| **src/routes/screenshot.mjs** | 22 + 14 contract | Adequate | Good coverage of happy paths and error shapes. Weakness: mock-coupled option passthrough tests. Would catch most HTTP-level regressions. |
| **src/routes/tweet.mjs** | 9 + 3 contract | Strong | Tests auth, data shape, URL extraction, error logging. |
| **src/routes/admin.mjs** | 14 + 9 contract | Strong | Tests CRUD, auth gates, error shapes, default values. |
| **src/routes/billing.mjs** | 10 + 12 contract | Strong | Tests signup, Stripe-not-configured, usage stats, webhook rejection, success/cancel pages. |
| **src/routes/health.mjs** | 4 + 3 contract | Adequate | Tests response shape and content types. Simple module, adequate coverage. |
| **src/server.mjs** | 7 (smoke) | Weak | Only tested via smoke tests. Raw body parsing, request ID middleware, graceful shutdown, CORS, helmet config — all untested. |
| **src/schemas/request-schemas.mjs** | 28 | Strong | Thorough schema validation testing with boundary values, defaults, coercion. |
| **src/config.mjs** | 11 | Strong | Tests required vars, defaults, overrides, frozen objects, optional vars. |

### Most Dangerous Gaps

1. **Rate limiting never actually rate-limits in tests.** The `rate-limit.test.mjs` tests verify the first request passes and headers are set, but no test sends enough requests to trigger a 429. A bug that disables rate limiting entirely would go unnoticed.

2. **`render-worker.mjs` has zero tests.** This is the worker thread entry point that actually calls Satori and Resvg. A regression here (e.g., wrong message format, error serialization bug) would be invisible to the test suite.

3. **`server.mjs` middleware wiring barely tested.** The raw body parser for Stripe webhooks, request ID injection, CORS config, helmet settings, and graceful shutdown — none are directly tested. Smoke tests only verify routes respond, not that middleware is correctly wired.

4. **`extractTweetId` re-implemented in 4 mock files.** If the real function adds support for new URL formats, the mocks won't reflect that. Integration tests would still pass with the old mock regex.

---

## 5. Structural Assessment

### Organization
**Good.** Test files are in a separate `tests/` directory with clear `unit/`, `integration/`, `smoke/` subdirectories. Shared utilities live in `tests/helpers/`. File naming is consistent: `<module>.test.mjs`. Every test file has a doc comment explaining what it tests.

### Naming Conventions
**Good.** Test names are descriptive and follow a consistent pattern: `"returns 401 when no API key provided"`, `"creates a free key with valid admin auth"`. No `test1` or `works correctly` names found. Two minor naming accuracy issues noted in section 3E.

### Setup/Teardown Patterns
**Good.** Consistent `beforeEach` for state reset, `beforeAll/afterAll` for server lifecycle. `vi.clearAllMocks()` used appropriately. One minor concern: `rate-limit.test.mjs` accumulates server handles without per-test cleanup.

### Custom Matchers/Utilities
- `createFirestoreMock()` — well-built, 195-line in-memory Firestore. Used across 10 test files.
- `test-fixtures.mjs` — shared constants and `currentMonth()` utility. Small and correct.
- `expectErrorShape()` and `expectJsonContentType()` — good DRY helpers in api-contracts.test.
- No custom vitest matchers registered. Not needed given the test patterns.

### Configuration
- `restoreMocks: true` in vitest.config — good, prevents mock leakage.
- `testTimeout: 10_000` and `hookTimeout: 10_000` — reasonable for integration tests with Express servers.
- Actual runtime is 2.24s, well under timeouts.
- No parallelism configuration — tests run sequentially by default. Acceptable given 2s runtime.

---

## 6. Recommendations (Priority-Ordered)

### High Priority

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? |
|---|---|---|---|---|
| 1 | **Add rate-limit exhaustion test** — send N+1 requests and assert 429 | Catches rate-limit bypass regressions | Critical — rate limiting is a security boundary | Yes |
| 2 | **Stop re-implementing `extractTweetId` in mocks** — use `vi.importActual()` for it, only mock `fetchTweet`/`renderTweetToImage` | Eliminates silent mock drift for URL parsing | High — production URL parsing changes won't be reflected in tests | Yes |
| 3 | **Add `render-worker.mjs` unit tests** — test message handling, error serialization, font loading within worker context | Covers the one completely untested module | High — any worker bug is currently invisible | Yes |

### Medium Priority

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? |
|---|---|---|---|---|
| 4 | **Extract shared test server factory** — `createTestApp(options)` that sets up Express + mocks, used by api-contracts, smoke, screenshot, tweet, billing tests | Reduces ~200 lines of duplicated setup across 5 files | Low — duplication is maintenance burden, not a correctness risk | Probably |
| 5 | **Add `server.mjs` middleware wiring tests** — raw body parser, request ID injection, graceful shutdown signal handling | Catches misconfiguration regressions | Medium — smoke tests provide partial coverage | Probably |
| 6 | **Move `rate-limit.test.mjs` to integration directory** — it spins up real Express servers | Improves test organization accuracy | Low — cosmetic | If time |

### Low Priority

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? |
|---|---|---|---|---|
| 7 | **Reduce mock-call assertions in screenshot.test.mjs** — replace 6 mock-arg assertions with response-shape assertions | Reduces implementation coupling | Low — tests still catch functional regressions, just with false-positive risk on refactors | If time |
| 8 | **Merge admin.test.mjs + admin-usage.test.mjs** — both test admin routes with identical setup | Reduces file count and setup duplication | Low — cosmetic | If time |
| 9 | **Fix formatDate test names** — rename "formats AM/PM times correctly" to reflect actual assertion | Prevents confusion during debugging | Low — test works correctly, just named imprecisely | If time |

---

## Appendix: Test Counts by Source Module

| Source Module | Unit Tests | Integration Tests | Contract Tests | Smoke Tests | Total |
|---|---|---|---|---|---|
| `core.mjs` | 60 | 0 | 0 | 0 | 60 |
| `src/schemas/request-schemas.mjs` | 28 | 0 | 0 | 0 | 28 |
| `src/services/stripe.mjs` | 28 | 0 | 0 | 0 | 28 |
| `src/services/api-keys.mjs` | 14 | 7 | 9 | 0 | 30 |
| `src/services/usage.mjs` | 12 | 0 | 0 | 0 | 12 |
| `src/workers/render-pool.mjs` | 14 | 0 | 0 | 0 | 14 |
| `src/config.mjs` | 11 | 0 | 0 | 0 | 11 |
| `src/routes/screenshot.mjs` | 0 | 22 | 14 | 1 | 37 |
| `src/routes/billing.mjs` | 0 | 10 | 12 | 1 | 23 |
| `src/routes/admin.mjs` | 0 | 14 | 9 | 1 | 24 |
| `src/routes/tweet.mjs` | 0 | 9 | 3 | 1 | 13 |
| `src/routes/health.mjs` | 0 | 4 | 3 | 1 | 8 |
| `src/routes/landing.mjs` | 0 | 1 | 1 | 1 | 3 |
| `src/middleware/authenticate.mjs` | 5 | 0 | 2 | 1 | 8 |
| `src/middleware/billing-guard.mjs` | 5 | 0 | 1 | 0 | 6 |
| `src/middleware/rate-limit.mjs` | 6 | 0 | 0 | 0 | 6 |
| `src/middleware/validate.mjs` | 5 | 0 | 3 | 0 | 8 |
| `src/middleware/error-handler.mjs` | 4 | 0 | 0 | 0 | 4 |
| `src/services/storage.mjs` | 5 | 0 | 0 | 0 | 5 |
| `src/logger.mjs` | 4 | 0 | 0 | 0 | 4 |
| `src/workers/render-worker.mjs` | 0 | 0 | 0 | 0 | **0** |
| `src/server.mjs` | 0 | 0 | 0 | 7 | **7** |
| `src/services/firestore.mjs` | 0 | 0 | 0 | 0 | **0** |
