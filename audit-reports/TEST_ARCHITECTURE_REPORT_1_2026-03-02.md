# Test Architecture Report — tweet-shots
**Run:** 1 | **Date:** 2026-03-02 | **Auditor:** Claude (automated)

---

## 1. Executive Summary

**Suite Health Rating:** Decorative

| Metric | Value |
|---|---|
| Total test files | 1 (`smoke.test.mjs`) |
| Total tests | 10 |
| Lines of production code | ~1,932 |
| Tests per 100 lines | ~0.5 |
| Antipatterns found | 7 (across 5 categories) |
| Modules with zero tests | 5 of 5 modules have majority-zero coverage |
| Regression effectiveness score | 2 / 10 |

**Verdict:** This test suite **would not** catch a subtle billing bug introduced on a Friday afternoon. It would not catch a rendering regression, an auth bypass on inactive keys, or a wrong-tier assignment on subscription upgrade. The 8 utility tests (`extractTweetId`, `formatNumber`, `formatDate`) are well-written and would catch regressions in those functions — but they cover roughly 70 lines out of 1,932. The remaining 98% of the codebase, including the entire rendering pipeline, billing module, and all API endpoints, has no tests.

---

## 2. Test Inventory

### 2.1 File Catalog

| File | Tests | Type | Framework | Approx. Runtime | Source Module |
|---|---|---|---|---|---|
| `smoke.test.mjs` | 10 | Unit (8) + Integration/Smoke (2) | `node:test` (built-in) | ~2–5s | `core.mjs`, `api-server.mjs` |

**Note:** `package.json` has no `test` script. Running tests requires knowing `node --test smoke.test.mjs`. There are no devDependencies.

### 2.2 Testing Pyramid

```
         E2E: 0
      ─────────────
    Integration: 2
  ───────────────────
       Unit: 8
```

The pyramid shape is not inverted — but it's almost empty. Eight unit tests and two smoke-level integration tests for a 1,932-line codebase is critically under-tested, not incorrectly structured.

### 2.3 Coverage Distribution

| Module | Lines | Tests | Coverage |
|---|---|---|---|
| `core.mjs` | 825 | 8 (utility fns only) | ~8% of functions, ~4% behavioral |
| `api-server.mjs` | 559 | 2 (smoke only) | <1% of behavior |
| `stripe-billing.mjs` | 548 | 0 | 0% |
| `tweet-shots.mjs` (CLI) | 350 | 0 | 0% |
| `smoke.test.mjs` | 115 | — | — (test file itself) |

**Modules with zero tests:**
- `stripe-billing.mjs` — 548 lines, entire billing/subscription lifecycle
- `tweet-shots.mjs` — 350 lines of CLI argument parsing
- `core.mjs::generateTweetHtml` — the primary HTML template function
- `core.mjs::renderTweetToImage` — the main entry point called by CLI and API
- `core.mjs::fetchTweet`, `fetchThread`, `fetchImageAsBase64`, `addLogoToHtml`, `processBatch`, `generatePDF`, `translateText`, `loadFonts`

---

## 3. Antipattern Findings

### 3.1 Summary by Category

| Category | Count | Severity |
|---|---|---|
| Server startup side-effect leaking into tests | 1 | High |
| Test helper swallows errors silently | 1 | Medium |
| Shared server state not cleaned up | 1 | Medium |
| Missing `test` script (discoverability) | 1 | Low |
| Fragile locale-dependent date assertion | 1 | Low |
| Missing `formatNumber` boundary cases | 1 | Low |
| No timeout on async HTTP helper | 1 | Low |

**Total: 7 antipatterns across 5 categories**

### 3.2 Detailed Findings Table

| File | Test / Code | Antipattern | Severity | Suggested Fix |
|---|---|---|---|---|
| `smoke.test.mjs:73` | `withServer()` | `import('./api-server.mjs')` triggers `app.listen(3000)` at module scope, spawning a port-3000 server that's never closed. Test talks to a separate ephemeral-port server. Two live servers during test run; port-3000 server leaks after tests. | High | Move `app.listen(...)` inside a guarded block: `if (process.env.NODE_ENV !== 'test' && !process.argv.includes('--test'))`. Export `app` and `startServer()` separately. |
| `smoke.test.mjs:95` | `get()` helper | `JSON.parse(body \|\| '{}')` silently returns `{}` on parse failure. If the server returns an HTML error page (500, unhandled route), the test sees `{}` and will likely pass the wrong assertion or give a confusing failure message. | Medium | Wrap in try/catch and re-throw with the raw body: `try { return JSON.parse(body); } catch { throw new Error('Non-JSON response: ' + body.slice(0, 200)); }` |
| `smoke.test.mjs:73–88` | `withServer()` | Module-level `apiKeys` map in `api-server.mjs` is shared across `withServer()` calls (ES module cache). If one test modifies it (future tests might), state leaks into later tests. | Medium | Load a fresh test key file path via env var before import, or reset state between tests. |
| `package.json` | n/a | No `test` script defined. `npm test` exits with "Missing script: test". The only documented run command is in a comment inside `smoke.test.mjs`. | Low | Add `"test": "node --test smoke.test.mjs"` to `scripts`. |
| `smoke.test.mjs:59–61` | `formatDate — returns formatted string` | Regex `/\d+:\d{2}\s*(AM\|PM)\s*·\s*Jan\s+15,\s+2024/i` depends on `en-US` locale behavior of `toLocaleTimeString`. If the system locale produces `14:30` (24h) instead of `2:30 PM`, or if Node's ICU data is trimmed, this test fails for environmental reasons unrelated to code correctness. | Low | Pin the assertion to a known string: confirm `formatDate` always forces `en-US` locale (it does), then assert a literal string like `'2:30 PM · Jan 15, 2024'` rather than a permissive regex. |
| `smoke.test.mjs:43–56` | `formatNumber` tests | No test for the exact boundary `formatNumber(1000)` — should return `'1K'`, not `'0.1K'` or `'1000'`. Also no test for `formatNumber(1000000)` (exact 1M boundary). The current implementation uses `>= 1000` so 1000 maps to `'1K'` — but without a test, a refactor changing `>=` to `>` would silently regress. | Low | Add: `assert.equal(formatNumber(1000), '1K')` and `assert.equal(formatNumber(1000000), '1M')`. |
| `smoke.test.mjs:90–98` | `get()` helper | No timeout on `http.get`. If the server hangs on a request, the test process hangs indefinitely rather than failing with a useful message. | Low | Add `req.setTimeout(5000, () => req.destroy(new Error('Request timeout')))`. |

---

## 4. Regression Effectiveness

### 4.1 Per-Module Rating

| Module / Function | Tests | Regression Effectiveness | Why |
|---|---|---|---|
| `core.mjs::extractTweetId` | 4 | **Strong** | Tests all input types (numeric ID, twitter.com URL, x.com URL) and the error path. Would catch a regex change that breaks URL parsing. |
| `core.mjs::formatNumber` | 3 | **Adequate** | Covers K, M, and passthrough. Misses exact 1K/1M boundaries and negative/NaN inputs. A `>` vs `>=` regression would slip through. |
| `core.mjs::formatDate` | 1 | **Weak** | Single happy-path test with a permissive regex. Does not test: midnight formatting, DST transitions, invalid date strings, or year rollover. |
| `core.mjs::generateTweetHtml` | 0 | **None** | Zero tests on the 275-line primary HTML template function. Any change to quote-tweet rendering, metrics layout, entity substitution order, or custom color application is completely unverified. |
| `core.mjs::renderTweetToImage` | 0 | **None** | Zero tests on the main render entry point. Height calculation math (`calculatedHeight`), scale application, media pre-fetching, and SVG/PNG branching are all untested. |
| `core.mjs::fetchTweet` | 0 | **None** | Network-dependent, but testable with mock fetch. Error paths (non-OK response, missing `data.text`) are untested. |
| `core.mjs::fetchThread` | 0 | **None** | Thread-walking logic (same-author check, `parents.unshift` ordering) is untested. Incorrect thread order would be silently wrong. |
| `core.mjs::addLogoToHtml` | 0 | **None** | Regex `/<\/div>\s*$/` could match the wrong `</div>` or fail on trailing whitespace variations. Zero tests. |
| `core.mjs::processBatch` | 0 | **None** | Batch processing, error accumulation, comment/empty-line skipping — zero tests. |
| `core.mjs::generatePDF` | 0 | **None** | PDF generation entirely untested. |
| `core.mjs::translateText` | 0 | **None** | Translation fallback behavior (when `OPENAI_API_KEY` is absent) and API error handling untested. |
| `core.mjs::loadFonts` | 0 | **None** | Font caching logic untested. A regression in `_cachedFonts` reset would cause every render to re-fetch fonts. |
| `api-server.mjs::authenticate` | 1 | **Decorative** | Only tests the missing-key path (returns `MISSING_API_KEY`). The inactive-key path (`keyData.active === false` → `INVALID_API_KEY`) and query-param key path are untested. An auth bypass on inactive keys would not be caught. |
| `api-server.mjs::GET /health` | 1 | **Adequate** | Correctly tests the one thing it claims to test. |
| `api-server.mjs::GET /screenshot/:id` | 0 | **None** | Authenticated path, dimension selection, all query param options, and error response entirely untested. |
| `api-server.mjs::POST /screenshot` | 0 | **None** | Base64 response mode, URL response mode, and image mode all untested. |
| `api-server.mjs::Admin routes` | 0 | **None** | Key creation, listing, revocation, and usage stats entirely untested. |
| `api-server.mjs::trackUsage` | 0 | **None** | Monthly counter, periodic save (every 10 requests), and month rollover logic untested. |
| `stripe-billing.mjs::handleSubscriptionUpdate` | 0 | **None** | Tier assignment logic (`priceId === PRICE_IDS.pro`) and key sync callback are entirely untested. This is the highest-risk gap: a wrong tier assignment on subscription upgrade/downgrade would not be caught. |
| `stripe-billing.mjs::handleSubscriptionCancelled` | 0 | **None** | Key revocation on cancellation untested. |
| `stripe-billing.mjs::trackUsage` | 0 | **None** | Monthly limit enforcement, reset date comparison, and increment logic untested. A bug allowing usage beyond the limit would not be caught. |
| `stripe-billing.mjs::getOrCreateCustomer` | 0 | **None** | Customer deduplication logic untested. |
| `tweet-shots.mjs` (CLI) | 0 | **None** | CLI argument parsing entirely untested. Flags like `--thread-pdf` implicitly setting `thread: true` are undocumented behaviors that could regress silently. |

### 4.2 Mutation Testing Proxy

Without a mutation testing tool, the following code patterns are identified as **high-risk for undetected mutations** (common changes that would pass the current test suite):

1. **`stripe-billing.mjs:195–196`** — `if (priceId === PRICE_IDS.pro) tier = 'pro'; if (priceId === PRICE_IDS.business) tier = 'business';` — changing `===` to `!==` on either line would silently assign wrong tiers.
2. **`api-server.mjs:150`** — `if (!keyData || !keyData.active)` — removing `|| !keyData.active` would allow revoked keys to authenticate. No test covers inactive key rejection.
3. **`core.mjs:101–102`** — `if (usage[apiKey].total % 10 === 0) { saveJSON(...) }` — changing `10` to any other number would silently change flush frequency.
4. **`core.mjs:528–529`** — `const qtText = qtText.replace(/&amp;/g, '&') ...` quote-tweet entity decoding — any entity decoding regression would produce escaped HTML in rendered output. Zero tests.
5. **`core.mjs:792–798`** — Height calculation arithmetic — any coefficient change silently produces clipped or excessively padded images.

---

## 5. Structural Assessment

### 5.1 Organization

**Poor.** All tests live in a single file (`smoke.test.mjs`) that mixes utility unit tests with server integration tests. There is no `tests/` or `__tests__/` directory. Test discovery is manual (no `npm test` script).

Finding tests for a given module requires searching the single file, which is currently manageable (115 lines) but will become a problem as tests are added without structure.

### 5.2 Naming Conventions

**Good for what exists.** Test names follow the pattern `<function> — <scenario>` (e.g., `extractTweetId — parses twitter.com URL`), which is descriptive and consistent. The server tests follow `<METHOD> <path> — <expectation>` which is also clear.

### 5.3 Setup / Teardown

**Problematic.** No `afterEach` or `afterAll` cleanup. The `withServer()` helper correctly closes the ephemeral test server via `server.close()` in a `finally` block — that part is good. However, the module-level `app.listen(3000)` triggered by the import is never closed.

### 5.4 Test Utilities

**Minimal but reasonable.** The `withServer()` and `get()` helpers are fit-for-purpose smoke test utilities. The primary issue is the silent JSON parse failure in `get()`.

### 5.5 Configuration

**Missing.** No test configuration file (`.node-test-runner`, `vitest.config`, etc.). No test timeout configuration. No parallelism settings. The `package.json` has no `test` script and no `devDependencies`.

---

## 6. Recommendations

Priority-ordered. Each recommendation is actionable independently.

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| 1 | Add `npm test` script to `package.json` | Discoverability + CI readiness | Tests won't run in any CI pipeline or standard workflow | Yes | Add `"test": "node --test smoke.test.mjs"`. Zero effort. |
| 2 | Fix server module side-effect (separate `app` from `app.listen`) | Enables all future server testing | Increasingly painful as more server tests are added; port conflicts in CI | Yes | Export `app` separately. Move `app.listen(...)` into a guard: `if (process.env.NODE_ENV !== 'test')`. The `withServer()` helper already handles its own ephemeral bind. |
| 3 | Fix `get()` helper to throw on non-JSON responses | Test correctness | Server errors will silently appear as `{}`, masking failures | Yes | 5-line fix: catch `JSON.parse` error, include raw response body in thrown error. |
| 4 | Write unit tests for `stripe-billing::handleSubscriptionUpdate` and `handleSubscriptionCancelled` | Catches billing regressions | Wrong tier assigned on upgrade/downgrade; old keys not revoked on cancel — both are silent money bugs | Yes, critical | Mock the `customers` in-memory map and `PRICE_IDS`. Inject test data and assert output state. No Stripe API needed for the pure logic. |
| 5 | Write unit tests for `stripe-billing::trackUsage` | Catches credit limit enforcement regressions | Users exceed monthly limits without being stopped | Yes, critical | Pure function with no external dependencies after data load. Test: under limit, at limit, over limit, month rollover. |
| 6 | Write unit tests for `core.mjs::generateTweetHtml` | Catches rendering regressions | Any template change (entity encoding, quote tweet, custom colors) is invisible | Yes | Pass a fixture tweet object, assert HTML contains expected strings. No Satori/Resvg needed. |
| 7 | Write tests for `api-server::authenticate` inactive-key path | Catches auth regressions | Revoked keys could remain usable | Yes | Easy: add an inactive key to `apiKeys`, assert 401 with `INVALID_API_KEY` code. |
| 8 | Add `extractTweetId` edge cases | Strengthens boundary coverage | Malformed URLs silently return null/undefined | Probably | Test: URL with query params, URL with fragment, mobile URL (`m.twitter.com`), empty string. |
| 9 | Add `formatNumber` boundary tests | Prevents off-by-one regressions | `>=` vs `>` change undetected | If time | Add `formatNumber(1000) === '1K'` and `formatNumber(1000000) === '1M'`. 2-line fix. |
| 10 | Add test timeout to `get()` helper | Prevents test suite hangs | Test runner hangs indefinitely on network issues | If time | `req.setTimeout(5000, ...)`. |

### Recommended Test Additions (by priority)

**Priority 1 — Catch billing bugs (untested critical path):**
```
stripe-billing::trackUsage — under limit, at limit, over limit, month rollover
stripe-billing::handleSubscriptionUpdate — tier mapping, key sync callback
stripe-billing::handleSubscriptionCancelled — key revocation, tier downgrade
```

**Priority 2 — Catch rendering bugs (untested core output):**
```
core::generateTweetHtml — entity encoding, quote tweet inclusion, hide flags, custom colors
core::addLogoToHtml — regex match on normal HTML, trailing whitespace, multiple closing divs
```

**Priority 3 — Strengthen auth (partially tested):**
```
api-server::authenticate — inactive key (INVALID_API_KEY), query-param key path
```

**Priority 4 — Cover remaining utilities:**
```
core::formatDate — midnight, noon, invalid date string
core::formatNumber — exact boundaries (1000, 1000000)
```

### What NOT to Test

- `renderTweetToImage` end-to-end (requires Satori + font fetch — slow, fragile, better covered by screenshots in CI)
- `fetchTweet` / `fetchThread` (network-dependent — mock or integration-test-only)
- PDF generation (binary output — smoke test is sufficient)
- CLI argument parsing in `tweet-shots.mjs` (low ROI; behavior already covered by `core.mjs` tests if those exist)

---

## Appendix: Test File Annotated

```
smoke.test.mjs (10 tests, 115 lines)
├── [UNIT — GOOD]   extractTweetId × 4  →  covers numeric ID, twitter.com URL, x.com URL, invalid input
├── [UNIT — GOOD]   formatNumber × 3    →  covers K suffix, M suffix, passthrough
├── [UNIT — WEAK]   formatDate × 1      →  single happy path, locale-fragile regex
├── [SMOKE — OK]    GET /health         →  verifies server starts and responds
└── [SMOKE — PARTIAL] GET /screenshot (no key) → verifies 401 on missing key only
```

**Confidence the suite would catch a subtle billing bug: Very Low (~5%).**
**Confidence the suite would catch a complete startup crash: High (~95%).**
