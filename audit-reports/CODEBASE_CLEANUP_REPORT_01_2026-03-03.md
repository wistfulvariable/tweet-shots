# Codebase Cleanup Report #01

**Date:** 2026-03-03
**Branch:** `codebase-cleanup-2026-03-03`
**Baseline:** All 390 tests passing (24 test files)
**Final:** All 390 tests passing (24 test files)

---

## 1. Summary

| Metric | Value |
|---|---|
| Files modified | 5 |
| Lines removed (net) | 8 |
| Lines added | 28 |
| Lines deleted | 36 |
| Unused dependencies removed | 0 |
| Commits made | 4 |
| Tests affected | 0 (all 390 pass before and after) |

---

## 2. Dead Code Removed

### Unused Config Values

| Config | Location | Evidence | Action |
|---|---|---|---|
| `PUBLIC_URL` | `src/config.mjs:28`, `tests/helpers/test-fixtures.mjs:23` | Defined in Zod schema but never referenced by any `config.PUBLIC_URL` usage in source. Storage service constructs GCS URLs directly via `https://storage.googleapis.com/...` | **Removed** |
| `GCP_PROJECT_ID` | `src/config.mjs:23`, `tests/helpers/test-fixtures.mjs:20` | Defined in Zod schema but never referenced by any application code. Firestore and Cloud Storage clients auto-detect project from Application Default Credentials | **Removed** |

### Stale File References

| Reference | Location | Issue | Action |
|---|---|---|---|
| `api-server.mjs` | `.dockerignore:6` | File deleted during modular rewrite | **Removed** |
| `stripe-billing.mjs` | `.dockerignore:7` | File deleted during modular rewrite | **Removed** |
| `tweet-shots-api.service` | `.dockerignore:8` | Systemd service file, removed when migrating to Cloud Run | **Removed** |
| `smoke.test.mjs` | `.dockerignore:9` | Moved to `tests/smoke/` directory | **Removed** |
| `api-keys.json` | `.dockerignore:12` | Pre-Firestore JSON storage, no longer exists | **Removed** |
| `usage.json` | `.dockerignore:13` | Pre-Firestore JSON storage, no longer exists | **Removed** |
| `customers.json` | `.dockerignore:14` | Pre-Firestore JSON storage, no longer exists | **Removed** |
| `subscriptions.json` | `.dockerignore:15` | Pre-Firestore JSON storage, no longer exists | **Removed** |
| `api-server.mjs` reference | `core.mjs:5` (JSDoc) | Stale reference to old monolithic server file | **Updated** to `src/server.mjs` |

### Items Verified as NOT Dead Code

| Item | Why It Looks Unused | Why It's Actually Used |
|---|---|---|
| `pino-pretty` (npm dep) | Zero direct imports | Referenced as string transport target: `transport: { target: 'pino-pretty' }` in `src/logger.mjs` |
| `@vitest/coverage-v8` (npm dep) | Zero direct imports | Referenced by vitest config `provider: 'v8'` |
| `escapeRegExp()` in core.mjs | Not exported | Correctly scoped as private; used locally for safe regex in entity replacement |
| `_cachedFonts` module state | Only one write site | Intentional module-level caching pattern, read on every render |

### Scan Results: No Issues Found

- **Unused exports:** 0 — All exported functions/constants are imported elsewhere
- **Unused imports:** 0 — All imports are referenced in their file
- **Unreachable code:** 0 — No code after return/throw, no permanently false conditionals
- **Orphaned files:** 0 — All .mjs files are imported or are entry points
- **Commented-out code blocks:** 0 — Only explanatory comments exist
- **TODO/FIXME/HACK/XXX/TEMP comments:** 0 — Clean codebase

---

## 3. Duplication Reduced

### Implemented (Low-Risk)

| Helper | Call Sites | Lines Saved | Description |
|---|---|---|---|
| `getHighResProfileUrl(user)` | 4 → 1 definition | ~4 lines | Consolidates `user?.profile_image_url_https?.replace('_normal', '_400x400')` pattern used in HTML generation (×2) and pre-fetch (×2) |
| `verifiedBadgeSvg(color, size)` | 2 → 1 definition | ~10 lines | Consolidates identical SVG path data for verified badge (18px main tweet, 14px quote tweet) |
| `getFirstMediaUrl(tweet)` | 2 → 1 definition | ~2 lines | Consolidates `tweet.mediaDetails?.[0]?.media_url_https \|\| tweet.photos?.[0]?.url` fallback |

### Documented But Not Implemented (Higher Risk)

| Duplication | Files | Risk | Reasoning |
|---|---|---|---|
| **Media pre-fetch loops** (mediaDetails + photos iteration) | core.mjs:729-746, 758-769 | Medium-High | 6 similar loops for pre-fetching media URLs. Extracting would change the rendering pipeline flow; each loop has slightly different error handling and nested property access. Risk of subtle behavioral changes. |
| **Entity link replacement** (URLs, mentions, hashtags) | core.mjs:422-450, 541-548 | Medium | 4 similar regex replacement patterns for different entity types. Each has unique property access (`url.url`, `@${mention.screen_name}`, `#${hashtag.text}`). Abstracting would require a generic interface that may reduce readability. |
| **HTML escape / unescape** | core.mjs:414-419 (escape), 526-531 (decode) | Medium | Opposite operations for main tweet (escape raw text) vs quote tweet (decode pre-encoded text). Could extract paired utilities, but only 2 call sites each. Marginal benefit. |
| **Integration test setup** (~30 lines × 4 files) | tests/integration/*.test.mjs | Medium | Firestore mock + Express server + listen + teardown pattern repeated across 4 integration test files. Extracting requires a shared test infrastructure module and changes to all test files. |
| **Rate limiter factory** (2 near-identical functions) | src/middleware/rate-limit.mjs:39-57 | Low | Only 2 instances with different parameters. Extracting adds complexity for marginal gain. |

---

## 4. Consistency Changes

### Scan Results: Codebase Already Highly Consistent

| Dimension | Status | Notes |
|---|---|---|
| **Naming conventions** | Consistent | Files: kebab-case. Functions/vars: camelCase. Constants: UPPER_SNAKE_CASE. Private state: underscore prefix. |
| **Import ordering** | Consistent | All 27 source files follow: npm packages → node builtins → internal modules |
| **Error handling** | Consistent | Unified AppError pattern for client errors, plain Error for internal errors. `instanceof AppError ? err.statusCode : 500` in all route catch blocks |
| **Async patterns** | Consistent | Pure async/await throughout. Zero callbacks, zero promise chains |
| **String quotes** | Consistent | Double quotes exclusively (matching no linter override) |
| **JSDoc style** | Consistent | File-level block comment + function-level @param/@returns + ASCII section dividers |
| **Function signatures** | Mostly consistent | All use `options = {}` destructuring except `src/services/stripe.mjs` which uses direct params (intentional — 3-5 required params per function) |
| **Export style** | Consistent | Named exports throughout. Zero default exports. |
| **Middleware pattern** | Consistent | Factory function returning `(req, res, next) =>` handler with DI |

**No consistency changes were needed.** The one deviation (Stripe service using direct params) is intentional and acceptable — forcing an options object for `getOrCreateCustomer(stripe, email, name)` would reduce readability.

---

## 5. Configuration & Feature Flags

### Feature Flag Inventory

| Flag/Variable | Location | Type | Value | Age | Action |
|---|---|---|---|---|---|
| `NODE_ENV` | config.mjs:11 | Permanent operational | Dynamic | Original | Keep |
| `ADMIN_KEY` | config.mjs:14 | Permanent security | Required, min 16 chars | Original | Keep |
| `STRIPE_SECRET_KEY` | config.mjs:17 | Permanent feature toggle | Optional (billing disabled if unset) | ~3 months | Keep |
| `STRIPE_PRICE_PRO` | config.mjs:18 | Permanent operational | Optional | ~3 months | Keep |
| `STRIPE_PRICE_BUSINESS` | config.mjs:19 | Permanent operational | Optional | ~3 months | Keep |
| `STRIPE_WEBHOOK_SECRET` | config.mjs:20 | Permanent security | Optional | ~3 months | Keep |
| `GCS_BUCKET` | config.mjs:24 | Permanent operational | Default: `tweet-shots-screenshots` | ~3 months | Keep |
| `OPENAI_API_KEY` | config.mjs:27 | Permanent feature toggle | Optional (translation disabled if unset) | ~3 months | Keep |
| `config.NODE_ENV !== 'test'` | server.mjs:39 | Hard-coded toggle | Disables worker pool in test | ~3 months | Keep (sensible) |

**No stale feature flags found.** All flags are permanent operational or security toggles. No temporary rollout flags exist.

### Flag Coupling

No flag coupling detected. Each flag controls an independent feature:
- Stripe flags are independent of each other (but all required for billing)
- OPENAI_API_KEY is independent
- NODE_ENV affects logging format and worker pool only

### Configuration Sprawl

| Config | Location | Issue | Action |
|---|---|---|---|
| `PUBLIC_URL` | config.mjs:28 | Defined but never consumed | **Removed** |
| `GCP_PROJECT_ID` | config.mjs:23 | Defined but never consumed | **Removed** |
| Rate limit: 5 req/15min (signup) | rate-limit.mjs:42 | Hard-coded, not configurable | Documented — appropriate for single-deployment model |
| Rate limit: 10 req/15min (billing) | rate-limit.mjs:55 | Hard-coded, not configurable | Documented — appropriate for single-deployment model |
| Worker pool size: `max(2, cpus-1)` | render-pool.mjs:26 | Auto-calculated, not overridable | Documented — reasonable default |

### Default Value Audit

| Config | Default | Concern | Recommendation |
|---|---|---|---|
| `PORT` | 3000 | None — safe for dev, overridden in Dockerfile to 8080 | No change needed |
| `HOST` | 0.0.0.0 | None — required for containerized environments | No change needed |
| `NODE_ENV` | development | None — forces explicit production declaration | No change needed |
| `GCS_BUCKET` | tweet-shots-screenshots | None — project-specific, matches actual bucket | No change needed |
| Monthly usage reset timezone | Process-local (UTC in Cloud Run) | Not explicitly declared; could shift if deployment moves | Document assumption |

### TODO/FIXME/HACK Inventory

**Zero TODO/FIXME/HACK/XXX/TEMP comments found in source code.** The codebase is clean — all known issues have been fixed or documented in CLAUDE.md memory files.

---

## 6. Couldn't Touch

| Item | Reason |
|---|---|
| **Media pre-fetch duplication** in core.mjs | Higher-risk refactoring of the rendering pipeline. Each pre-fetch loop handles a slightly different data shape (mediaDetails vs photos, main tweet vs quote tweet). Extracting to a generic helper risks subtle behavioral changes. Recommend a dedicated PR with thorough render output comparison. |
| **Integration test setup duplication** | Would require creating a shared test infrastructure module and modifying all 4 integration test files. The duplication is boilerplate (Express server + Firestore mock wiring), not business logic. Risk of breaking test isolation if shared state leaks. |
| **Stripe service function signatures** | The Stripe service uses direct params instead of options destructuring (the only consistency deviation). This is an intentional trade-off — functions like `getOrCreateCustomer(stripe, email, name)` have 3+ required params where direct args are clearer. Converting to options objects would reduce readability. |
| **`console.warn`/`console.error` in core.mjs** | Used in CLI context (translateText, fetchImageAsBase64, loadFonts). Since core.mjs is shared between CLI and API, and the CLI has no structured logger, console output is appropriate. In API context, these run inside worker threads where console output goes to process stderr (acceptable). |

---

## 7. Recommendations

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| 1 | Extract media pre-fetch into shared helper | Reduces 6 similar loops to 1 reusable function in core.mjs | Low | Only if time allows | The `mediaDetails` / `photos` dual-path pre-fetch is the largest remaining duplication. Would benefit from a dedicated PR with visual render output comparison to verify no behavioral change. |
| 2 | Document timezone assumption for monthly usage reset | Prevents silent month-boundary drift if deployment moves from Cloud Run | Medium | Probably | `usage.mjs` uses `new Date()` which is process-local timezone. Cloud Run defaults to UTC but this isn't explicitly set. Add a note to CLAUDE.md or set `TZ=UTC` in Dockerfile. |
| 3 | Extract integration test server setup helper | Reduces ~120 lines of repeated boilerplate across 4 test files | Low | Only if time allows | Create `tests/helpers/setup-integration-server.mjs` with a `createTestServer(routeFactory, deps)` function. Low risk but touches all integration tests. |
| 4 | Make worker pool size configurable via env var | Allows operators to tune pool size in memory-constrained environments | Low | Only if time allows | Current auto-calculation `max(2, cpus-1)` is reasonable. Only worth adding `WORKER_POOL_SIZE` env var if scaling issues emerge in production. |
