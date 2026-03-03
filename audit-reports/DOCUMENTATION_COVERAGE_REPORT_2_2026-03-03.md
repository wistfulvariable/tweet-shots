# Documentation Coverage Report — Run 2 — 2026-03-03

## Run Summary

**Date:** 2026-03-03
**Model:** Claude Opus 4.6
**Scope:** Full codebase post-rewrite — 22 source files, 12 test files, all config
**Tests:** 114 passing (10 test files) — verified before and after documentation changes

---

## What Changed

### CLAUDE.md (Tier 1)

**Previous state:** 211 lines, accurate for post-rewrite codebase but missing middleware chain documentation.

**Changes made:**
- Added "Request Flow (Middleware Chain)" section — documents the strict middleware ordering that must not be reordered (authenticate → rateLimit → billingGuard → validate → handler)
- Added note about express-rate-limit pre-creation requirement to DO NOT list
- Updated Documentation Hierarchy to include a topic file reference table with trigger conditions
- Updated MEMORY.md cross-reference description

**New line count:** ~240 lines (within 250-350 target)

### Tier 2 Memory Files (.claude/memory/)

**Previous state:** 9 files, all describing the pre-rewrite codebase (JSON file storage, monolithic api-server.mjs, disconnected stripe-billing.mjs, systemd deployment, zero test coverage). Every file contained stale or incorrect information.

**Changes made:**
- **Deleted 4 stale files:** `api-routes.md`, `billing.md`, `data-storage.md`, `rendering.md`
- **Created 5 new files:** `testing.md`, `rendering-pipeline.md`, `billing-stripe.md`, `data-model.md`, `api-endpoints.md`
- **Rewrote 5 existing files:** `deployment.md`, `pitfalls.md`, `security.md`, `feature-inventory.md`, `twitter-api.md`
- **Rewrote index:** `MEMORY.md`

**New file count:** 10 topic files + 1 index = 11 files

| File | Lines | Status |
|---|---|---|
| MEMORY.md | 30 | Rewritten — updated state, topic index |
| testing.md | 55 | New — Vitest config, Firestore mock pattern, integration test setup |
| rendering-pipeline.md | 55 | New — Satori constraints, font loading, worker pool, height estimation |
| billing-stripe.md | 45 | New — Unified key format, customer lifecycle, webhook events |
| data-model.md | 55 | New — Field-level Firestore schemas, usage tracking mechanics |
| api-endpoints.md | 65 | New — Route table, param mapping, Zod schemas, response headers |
| deployment.md | 55 | Rewritten — Docker multi-stage, Cloud Run, Secret Manager, GCS |
| pitfalls.md | 40 | Rewritten — Only active issues (removed 6 resolved items) |
| security.md | 40 | Rewritten — Current auth model, Zod validation, accepted risks |
| feature-inventory.md | 55 | Rewritten — Updated for modular architecture, GCS upload |
| twitter-api.md | 55 | Updated — Minor reference fixes |

### Auto-Memory MEMORY.md

Updated with topic file index table and corrected lessons learned.

---

## Coverage Analysis

### Source Files Documented

| Source File | Covered In |
|---|---|
| `core.mjs` | CLAUDE.md (arch rules), rendering-pipeline.md, feature-inventory.md |
| `src/server.mjs` | CLAUDE.md (structure, middleware chain) |
| `src/config.mjs` | CLAUDE.md (env vars, tiers) |
| `src/logger.mjs` | CLAUDE.md (coding conventions) |
| `src/middleware/authenticate.mjs` | CLAUDE.md (auth model, middleware chain), api-endpoints.md |
| `src/middleware/rate-limit.mjs` | CLAUDE.md (arch rules, tiers), api-endpoints.md |
| `src/middleware/billing-guard.mjs` | CLAUDE.md (arch rules), billing-stripe.md |
| `src/middleware/validate.mjs` | CLAUDE.md (middleware chain), api-endpoints.md |
| `src/middleware/error-handler.mjs` | CLAUDE.md (coding conventions) |
| `src/services/firestore.mjs` | data-model.md |
| `src/services/api-keys.mjs` | CLAUDE.md (key format), data-model.md |
| `src/services/usage.mjs` | data-model.md, billing-stripe.md |
| `src/services/stripe.mjs` | billing-stripe.md |
| `src/services/storage.mjs` | deployment.md (GCS) |
| `src/routes/screenshot.mjs` | api-endpoints.md |
| `src/routes/tweet.mjs` | api-endpoints.md |
| `src/routes/admin.mjs` | api-endpoints.md |
| `src/routes/billing.mjs` | api-endpoints.md, billing-stripe.md |
| `src/routes/health.mjs` | api-endpoints.md |
| `src/routes/landing.mjs` | api-endpoints.md |
| `src/workers/render-pool.mjs` | rendering-pipeline.md |
| `src/workers/render-worker.mjs` | rendering-pipeline.md |
| `src/schemas/request-schemas.mjs` | api-endpoints.md |
| `tweet-shots.mjs` | feature-inventory.md |
| `tests/` (all files) | testing.md |

**Coverage: 100%** — every source file is documented in at least one tier.

### Patterns Documented

| Pattern | Location |
|---|---|
| Dependency injection (routes) | CLAUDE.md |
| Firestore mock pattern | testing.md |
| Integration test setup | testing.md |
| Error response format | CLAUDE.md, api-endpoints.md |
| Image pre-fetch to base64 | CLAUDE.md (arch rules), rendering-pipeline.md |
| Flexbox-only Satori layout | CLAUDE.md (arch rules), rendering-pipeline.md |
| Billing guard fails-open | CLAUDE.md, billing-stripe.md, security.md |
| Atomic usage tracking | data-model.md |

---

## Findings

### Active Issues Found During Audit

1. **Logo overlay feature is broken** — `addLogoToHtml()` in `core.mjs` uses `position: absolute` which Satori does not support. The `--logo` CLI flag and any API usage of logo parameters silently produce no visible logo. (pitfalls.md)

2. **Height estimation can cause clipping** — Satori clips content at declared height with no error. Long tweets or CJK text will be truncated. No overflow detection or retry. (pitfalls.md)

3. **Only first media image rendered** — Multi-image tweets show only the first photo. (pitfalls.md)

4. **Emoji render as empty boxes** — `loadAdditionalAsset` returns `undefined` to prevent network requests. Tweets with emoji-heavy content will have gaps. (pitfalls.md, feature-inventory.md)

### Observations

- **Test coverage is strong for services and middleware** but there are no tests for `core.mjs` rendering functions (HTML generation, image fetching, font loading). These are the most complex functions in the codebase.
- **No tests for the screenshot or tweet route handlers** — integration tests cover admin, billing, and health routes but not the core screenshot endpoint.
- **Worker pool has no tests** — `render-pool.mjs` is untested.

---

## Token Budget Analysis

| Tier | Files | Lines | Est. Tokens | % of 200K |
|---|---|---|---|---|
| Tier 1 (always loaded) | CLAUDE.md + MEMORY.md | ~275 | ~9K | ~4.5% |
| Tier 2 (1-2 files/task) | 10 topic files | ~60 avg | ~2K | ~1% |
| **Typical total** | | ~335-395 | ~11-13K | **~5.5-6.5%** |

Well within the 5-7% target for always-loaded, and 6-9% for typical total.
