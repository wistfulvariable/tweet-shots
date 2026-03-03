# File Decomposition Report #01 — 2026-03-03

**Branch:** `file-decomposition-2026-03-03`
**Commit:** `90ce6b1`
**Test result:** 390/390 passing (24 test files, 0 failures)

---

## 1. Executive Summary

Scanned 29 source files (`.mjs`) and 1 HTML file. Identified 3 files over 300 lines. Decomposed the largest file (`core.mjs`, 839 lines) into 4 focused modules. The remaining 2 oversized files (`tweet-shots.mjs` at 351 lines, `landing.html` at 412 lines) were classified as single-responsibility/inherently-monolithic and skipped.

**Result:** Largest source file reduced from **839 → 406 lines**. Zero files over 500 lines. All 390 tests pass unchanged. Zero test or production file changes — only new files created and `core.mjs` converted to a re-export hub.

---

## 2. File Size Inventory

### Files Over 300 Lines (Before)

| File | Before (lines) | After (lines) | Action | New Files Created |
|---|---|---|---|---|
| `core.mjs` | 839 | 26 (re-export hub) | **SPLIT** | `tweet-fetch.mjs` (90), `tweet-html.mjs` (406), `tweet-render.mjs` (247), `tweet-utils.mjs` (137) |
| `landing.html` | 412 | 412 | SKIP (static HTML) | — |
| `tweet-shots.mjs` | 351 | 351 | SKIP (single responsibility) | — |

### All Source Files After Split (sorted by line count)

| File | Lines | Responsibility |
|---|---|---|
| `tweet-html.mjs` | 406 | HTML template generation, themes, gradients, formatting |
| `tweet-shots.mjs` | 351 | CLI entry point, argument parsing, dispatch |
| `tweet-render.mjs` | 247 | Satori/Resvg rendering pipeline, font loading, image pre-fetch |
| `src/services/stripe.mjs` | 219 | Stripe customer/subscription lifecycle |
| `src/routes/billing.mjs` | 195 | Billing endpoints (signup, checkout, portal, webhook) |
| `src/workers/render-pool.mjs` | 166 | Worker thread pool manager |
| `src/routes/screenshot.mjs` | 152 | Screenshot GET/POST endpoints |
| `src/server.mjs` | 141 | Express app entry point, DI wiring |
| `tweet-utils.mjs` | 137 | CLI utilities (translation, batch processing, PDF) |
| `src/services/api-keys.mjs` | 127 | API key CRUD |
| `src/schemas/request-schemas.mjs` | 111 | Zod validation schemas |
| `src/services/usage.mjs` | 109 | Usage tracking and credit enforcement |
| `src/routes/admin.mjs` | 96 | Admin key CRUD endpoints |
| `tweet-fetch.mjs` | 90 | Tweet ID extraction, data fetching, thread walking |
| `src/routes/health.mjs` | 76 | Health, pricing, docs endpoints |
| `src/middleware/rate-limit.mjs` | 58 | Per-tier rate limiting |
| `src/config.mjs` | 53 | Zod-validated environment config |
| `src/middleware/billing-guard.mjs` | 41 | Monthly credit enforcement |
| `src/routes/landing.mjs` | 41 | Landing page route |
| `src/routes/tweet.mjs` | 38 | Tweet data endpoint |
| `src/services/storage.mjs` | 36 | Cloud Storage uploads |
| `src/middleware/authenticate.mjs` | 34 | API key authentication |
| `src/logger.mjs` | 28 | pino structured logging |
| `src/middleware/validate.mjs` | 28 | Zod validation middleware |
| `core.mjs` | 26 | Re-export hub (backward compatibility) |
| `src/services/firestore.mjs` | 24 | Firestore client singleton |
| `src/workers/render-worker.mjs` | 24 | Worker thread entry point |
| `src/errors.mjs` | 14 | AppError class |
| `src/middleware/error-handler.mjs` | 12 | Global error handler |

---

## 3. Splits Executed

### Split 1: `core.mjs` → 4 modules + re-export hub

**Original:** `core.mjs` — 839 lines, 16 exports, 6 distinct responsibility groups
**Fan-out:** 4 production files + 6 test files import from `core.mjs`

| New File | Lines | Responsibility | Exports |
|---|---|---|---|
| `tweet-fetch.mjs` | 90 | Tweet ID extraction, syndication API fetch, thread walking | `extractTweetId`, `fetchTweet`, `fetchThread` |
| `tweet-html.mjs` | 406 | Theme/gradient constants, HTML template generation, formatting helpers, logo overlay | `THEMES`, `GRADIENTS`, `formatDate`, `formatNumber`, `getHighResProfileUrl`, `addLogoToHtml`, `generateTweetHtml` |
| `tweet-render.mjs` | 247 | Dimension presets, image pre-fetching, font loading, Satori→Resvg pipeline | `DIMENSIONS`, `fetchImageAsBase64`, `loadFonts`, `renderTweetToImage` |
| `tweet-utils.mjs` | 137 | AI translation, batch processing, PDF generation (CLI-only) | `translateText`, `processBatch`, `generatePDF` |
| `core.mjs` (retained) | 26 | Re-export hub — preserves all existing import paths | All 16 exports via re-export |

**Strategy:** Retained `core.mjs` as a thin re-export hub rather than updating all 10 consumer files (4 production routes/workers + 6 test files with `vi.mock()` calls). This eliminated all risk of breaking test mocks while achieving the decomposition goal.

**Cross-dependencies between new modules:**
- `tweet-render.mjs` → `tweet-html.mjs` (imports `generateTweetHtml`, `addLogoToHtml`, `getHighResProfileUrl`)
- `tweet-utils.mjs` → `tweet-fetch.mjs` (imports `extractTweetId`, `fetchTweet`)
- `tweet-utils.mjs` → `tweet-render.mjs` (imports `renderTweetToImage`)
- No circular dependencies. All edges are one-way.

**Import references updated:** 0 (re-export hub preserves all existing paths)
**Config updated:** `vitest.config.mjs` — added 4 new files to coverage include
**Lint:** 0 errors, 6 warnings (pre-existing security warnings from original code — non-literal RegExp, fs filename)
**Test result:** 390/390 passing
**Commit:** `90ce6b1`

---

## 4. Splits Attempted but Reverted

None. The single split executed cleanly on first attempt.

---

## 5. Files Skipped

### `landing.html` (412 lines) — Inherently Monolithic

A single-page marketing HTML file with responsive design, pricing table, and API docs. It's a self-contained static asset — splitting it into partial HTML files would reduce readability and add build complexity with no architectural benefit.

**Future pass:** Not recommended. HTML landing pages are inherently monolithic.

### `tweet-shots.mjs` (351 lines) — Single Responsibility, Just Long

CLI entry point: 98 lines of help text, 107 lines of argument parsing, ~140 lines of dispatch logic (batch, thread, single tweet). All code serves one purpose (CLI interface). The length comes from comprehensive help text and the many CLI flags.

**Future pass:** Could extract the arg parser into a separate module if CLI grows, but current size is manageable and the flag-to-handler mapping benefits from co-location.

---

## 6. Structural Observations (Documentation Only)

### Directory Structure

The project uses a flat root for shared modules (`core.mjs`, `tweet-shots.mjs`) and organized `src/` for the API server. The 4 new files follow this convention (root-level, kebab-case `.mjs`). No directory restructuring recommended — the flat root works well for the 6 shared files.

### Barrel File Assessment

`core.mjs` now serves as a barrel (re-export hub). This is pragmatic for backward compatibility but means:
- **Pros:** Zero migration cost, all tests and production code work unchanged
- **Cons:** Tree-shaking is impaired (bundlers importing from `core.mjs` pull all 4 sub-modules), and the module resolution adds one indirection
- **Recommendation:** Over time, migrate production consumers (`src/routes/screenshot.mjs`, `src/routes/tweet.mjs`, `src/workers/render-worker.mjs`) to import directly from the sub-modules. Test mocks would need updating at the same time. This is a follow-up task, not urgent.

### Shared Module Opportunities

`getHighResProfileUrl` is exported from `tweet-html.mjs` for use by `tweet-render.mjs`. It's a 1-line utility. If more cross-cutting helpers emerge, a `tweet-shared.mjs` could be warranted, but for one function the current placement is fine.

---

## 7. File Size Distribution

### Source Files Only (`.mjs`, excluding test files and configs)

| Range | Before | After | Change |
|---|---|---|---|
| 0–100 lines | 15 | 17 | +2 |
| 100–200 lines | 8 | 8 | — |
| 200–300 lines | 1 | 2 | +1 |
| 300–500 lines | 1 | 2 | +1 |
| 500+ lines | **1** | **0** | **-1** |
| **Total files** | **26** | **29** | **+3** |

**Largest file:** 839 → 406 lines (**52% reduction**)
**Average file size:** 114 → 107 lines (**6% reduction**)

---

## 8. Recommendations

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| 1 | Migrate production imports to sub-modules | Improves tree-shaking, removes indirection | Low | Only if time allows | Update `src/routes/screenshot.mjs`, `src/routes/tweet.mjs`, `src/workers/render-worker.mjs`, and `tweet-shots.mjs` to import directly from `tweet-fetch.mjs`/`tweet-render.mjs`. Requires updating 6 test mock paths simultaneously. Safe but tedious. |
| 2 | Monitor `tweet-html.mjs` size | Prevents re-accumulation | Low | Only if time allows | At 406 lines, it's the new largest file. The bulk is `generateTweetHtml` — a single template function with long SVG/HTML strings. If new template features are added (e.g., poll rendering, thread connectors), consider splitting into template partials. |
| 3 | Update CLAUDE.md project structure | Keeps documentation accurate | Medium | Yes | The project structure section in CLAUDE.md should list the 4 new files and note that `core.mjs` is now a re-export hub. Also update the "Key Files" table in MEMORY.md. |

---

## Appendix: Test Run Output

```
 ✓ tests/unit/render-pool.test.mjs (16 tests)
 ✓ tests/unit/storage.test.mjs (5 tests)
 ✓ tests/unit/render-worker.test.mjs (8 tests)
 ✓ tests/unit/config.test.mjs (14 tests)
 ✓ tests/unit/validate.test.mjs (5 tests)
 ✓ tests/unit/schemas.test.mjs (35 tests)
 ✓ tests/unit/usage.test.mjs (12 tests)
 ✓ tests/unit/api-keys.test.mjs (24 tests)
 ✓ tests/unit/core.test.mjs (86 tests)
 ✓ tests/unit/stripe.test.mjs (34 tests)
 ✓ tests/unit/billing-guard.test.mjs (5 tests)
 ✓ tests/unit/authenticate.test.mjs (6 tests)
 ✓ tests/unit/errors.test.mjs (7 tests)
 ✓ tests/unit/error-handler.test.mjs (4 tests)
 ✓ tests/unit/logger.test.mjs (4 tests)
 ✓ tests/integration/health.test.mjs (4 tests)
 ✓ tests/unit/rate-limit.test.mjs (12 tests)
 ✓ tests/integration/admin.test.mjs (7 tests)
 ✓ tests/integration/admin-usage.test.mjs (7 tests)
 ✓ tests/integration/billing.test.mjs (11 tests)
 ✓ tests/integration/tweet.test.mjs (8 tests)
 ✓ tests/integration/screenshot.test.mjs (24 tests)
 ✓ tests/smoke/smoke.test.mjs (7 tests)
 ✓ tests/integration/api-contracts.test.mjs (45 tests)

 Test Files  24 passed (24)
       Tests  390 passed (390)
```
