# Architectural Complexity Audit — Run 01 (2026-03-03)

## 1. Executive Summary

**Overall Assessment: LEAN** — This is a well-proportioned ~3,100 LOC codebase with clean dependency flow, zero circular dependencies, and no cargo-culted patterns. The architecture reflects deliberate choices made during recent refactoring (core.mjs decomposition, unified key format, unified usage tracking) rather than accumulated accident.

**Single biggest complexity tax:** The `core.mjs` re-export hub adds one layer of indirection (25 lines) that all API routes and the worker thread import through, when they could import sub-modules directly. This is mild and intentional (backward compatibility), not a major drag.

**Top 3 simplification opportunities:**
1. **Inline `error-handler.mjs`** into `server.mjs` — a 6-line middleware that exists only to inject a logger; save a file and an import (Effort: Trivial, Risk: None)
2. **Migrate route imports from `core.mjs` to direct sub-modules** — routes already know which functions they need; remove the hub indirection for new code (Effort: Small, Risk: None)
3. **Eliminate duplicate error response pattern** across `screenshot.mjs` and `tweet.mjs` — extract a 5-line shared helper (Effort: Trivial, Risk: None)

---

## 2. Structural Complexity Map

### 2.1 Dependency Graph Summary

**Total source modules:** 30 (.mjs files, excluding tests)
**Total source lines:** ~3,143
**Total test lines:** ~6,566 (2.1:1 test-to-source ratio)
**External dependencies:** 13 production, 3 dev

**Hub modules** (imported by 3+ other source files):

| Module | Imported By | Assessment |
|--------|-------------|------------|
| `core.mjs` | 4 files (screenshot.mjs, tweet.mjs, render-worker.mjs, tweet-shots.mjs) | Re-export hub; justified for CLI compatibility, mildly redundant for API routes |
| `config.mjs` | 4 files (server.mjs, rate-limit.mjs, request-schemas.mjs, usage.mjs) | Single source of truth for env + TIERS; appropriate hub |
| `firestore.mjs` | 3 files (api-keys.mjs, usage.mjs, stripe.mjs) | Lazy singleton + collection refs; well-designed data access layer |
| `errors.mjs` | 3 files (tweet-fetch.mjs, screenshot.mjs, tweet.mjs) | AppError class; minimal, correct |
| `validate.mjs` | 3 files (screenshot.mjs, billing.mjs, admin.mjs) | Middleware factory; reused correctly |
| `request-schemas.mjs` | 3 files (screenshot.mjs, billing.mjs, admin.mjs) | Zod schemas; co-located validation definitions |

**Circular dependencies:** None detected. The dependency graph is strictly acyclic:
- Core modules have no inter-dependencies (tweet-render.mjs → tweet-html.mjs is unidirectional)
- Services don't import routes or middleware
- Routes receive middleware via DI, not import
- All imports flow: entry points → routes → services/middleware → utilities → externals

**Orphaned modules:** None. `tweet-shots.mjs` is a CLI entry point (run directly, not imported). All other modules are imported by at least one source file.

**Deepest dependency chains** (entry point → leaf):

| Chain | Depth | Path |
|-------|-------|------|
| Screenshot render | 6 layers | server.mjs → screenshot.mjs → core.mjs → tweet-render.mjs → tweet-html.mjs → (pure) |
| Auth + Firestore | 5 layers | server.mjs → authenticate.mjs → api-keys.mjs → firestore.mjs → @google-cloud/firestore |
| Billing + Stripe | 5 layers | server.mjs → billing.mjs → stripe.mjs → api-keys.mjs → firestore.mjs |
| Validation | 4 layers | routes → validate.mjs → (Zod); routes → request-schemas.mjs → config.mjs |
| Rate limiting | 3 layers | server.mjs → rate-limit.mjs → express-rate-limit |

### 2.2 Layer Analysis Per Operation

| Operation | Files Touched | Meaningful Layers | Indirection Ratio | Glue Code Lines |
|-----------|--------------|-------------------|-------------------|-----------------|
| GET /screenshot | 10 | 8 | **1.25** | ~15 (buildRenderOptions, render wrapper) |
| POST /screenshot | 11 | 9 | **1.22** | ~20 (above + response type dispatch) |
| GET /tweet/:id | 7 | 6 | **1.17** | ~5 (error response block) |
| POST /billing/signup | 6 | 5 | **1.20** | ~5 (conditional Stripe path check) |
| POST /billing/checkout | 6 | 5 | **1.20** | ~3 (Stripe client check) |
| POST /billing/webhook | 7 | 6 | **1.17** | ~5 (event type routing) |
| Admin CRUD (avg) | 4 | 3 | **1.33** | ~3 (field mapping in list) |
| GET /health | 1 | 1 | **1.00** | 0 |
| CLI screenshot | 7 | 6 | **1.17** | ~10 (parseArgs, buildRenderOptions) |

**Key insight:** Every indirection ratio is below 1.5. No operation has a layer that purely forwards calls without adding value. The middleware chain (auth → rate-limit → billing-guard → validate) is the longest common prefix across authenticated routes, and every link does distinct work.

### 2.3 Abstraction Inventory

| Abstraction | Type | Location | Implementations | Justification | Verdict |
|-------------|------|----------|-----------------|---------------|---------|
| `core.mjs` re-exports | Hub module | `core.mjs` (25 lines) | 1 (re-export layer) | Backward compatibility for CLI + existing imports | **Simplify** — migrate API routes to direct imports |
| `createRenderPool()` | Factory | `render-pool.mjs` | 1 | Worker thread pool for CPU-blocking Satori/Resvg renders | **Keep** — justified by CPU isolation |
| `createStripeClient()` | Factory | `stripe.mjs` | 1 | Optional Stripe SDK init | **Keep** — guards against missing config |
| `getDb()` lazy singleton | Singleton | `firestore.mjs` | 1 | Heavy SDK init, reuse across requests | **Keep** — standard pattern |
| `getStorage()` lazy singleton | Singleton | `storage.mjs` | 1 | Heavy SDK init | **Keep** — same justification |
| `createLogger()` | Factory | `logger.mjs` | 1 | Encapsulates dev/prod branching | **Keep** — prevents duplication |
| `errorHandler()` | Middleware factory | `error-handler.mjs` (11 lines) | 1 | Inject logger into Express error middleware | **Remove** — inline into server.mjs |
| `authenticate()` | Middleware factory | `authenticate.mjs` | 1 | Inject logger, return middleware closure | **Keep** — used for DI and testing |
| `billingGuard()` | Middleware factory | `billing-guard.mjs` | 1 | Inject logger, fail-open logic | **Keep** — complex enough to warrant module |
| `validate()` | Middleware factory | `validate.mjs` | 1 | Reused across 3 route modules | **Keep** — prevents duplication |
| `applyRateLimit()` | Middleware | `rate-limit.mjs` | 1 | Pre-created tier limiters | **Keep** — correct rate-limit pattern |
| Route factory DI | Pattern | All `src/routes/*.mjs` | 6 routes | Enable testing without full server; conditional deps | **Keep** — justified by testability |
| Collection ref functions | Convenience | `firestore.mjs` (4 one-liners) | 1 each | Avoid repeating `getDb().collection('...')` | **Keep** — minimal cost, consistent API |

**Abstraction tax total:** ~36 lines of pure indirection code (core.mjs re-exports + error-handler.mjs + render wrapper in screenshot.mjs). This is 1.1% of the source codebase — negligible.

### 2.4 Directory Structure Assessment

```
tweet-shots/
├── core modules (root)  — CLI entry point + rendering pipeline
├── src/
│   ├── middleware/       — 5 files, all pure middleware
│   ├── routes/           — 6 files, one per endpoint group
│   ├── services/         — 5 files, one per external system
│   ├── schemas/          — 1 file (all request schemas)
│   └── workers/          — 2 files (pool + worker)
└── tests/
    ├── unit/             — 17 files
    ├── integration/      — 7 files
    ├── smoke/            — 1 file
    └── helpers/          — 2 files
```

**Assessment: Structure matches architecture.**
- Related files are co-located by responsibility (not scattered by type)
- No catch-all directories (`/utils`, `/helpers`, `/common`)
- Nesting depth is appropriate (max 3 levels: `src/middleware/file.mjs`)
- The `schemas/` directory has only 1 file — could be inlined into routes, but it's not causing problems at current scale
- Root-level core modules (`tweet-*.mjs`) are separate from server code (`src/`) — clean CLI/API boundary

**No structural issues found.**

---

## 3. Data Flow Complexity

### 3.1 Transformation Chains

#### Tweet Data Pipeline (fetch → render)

```
Twitter Syndication API response (JSON)
  → extractTweetId() normalizes URL/ID [tweet-fetch.mjs]
  → fetchTweet() fetches & parses JSON [tweet-fetch.mjs]
  → preFetchProfileImage() mutates tweet.user.profile_image_url_https to base64 [tweet-render.mjs]
  → preFetchMediaImages() mutates tweet.mediaDetails[].media_url_https to base64 [tweet-render.mjs]
  → generateTweetHtml() builds HTML string from tweet object [tweet-html.mjs]
  → satori() converts HTML → SVG [external]
  → Resvg.render() converts SVG → PNG [external]
```

**Reshapes:** 3 meaningful transformations (JSON → mutated JSON → HTML string → binary image). Each does real work. The in-place mutation of tweet image URLs to base64 data URIs is the only side effect — justified because Satori cannot fetch URLs.

#### Screenshot Options Flow (request → render)

```
HTTP request (query params or JSON body)
  → Zod schema validation + coercion [request-schemas.mjs]
  → buildRenderOptions() normalizes aliases (bgColor→backgroundColor, radius→borderRadius) [screenshot.mjs]
  → renderTweetToImage() applies defaults for remaining options [tweet-render.mjs]
```

**Finding:** Options are normalized in 3 stages. Stage 2 (`buildRenderOptions`) handles field alias reconciliation that Zod could do via `.transform()`. This is a mild redundancy — the 20-line function in screenshot.mjs could be partially absorbed into the Zod schema.

#### API Key Flow (creation → auth → tier change)

```
Signup/admin request → generateKeyString(tier) → Firestore write [api-keys.mjs]
Auth request → Firestore doc lookup by key string → req.apiKey + req.keyData [authenticate.mjs]
Stripe webhook → updateApiKeyTier(keyString, newTier) → Firestore update [api-keys.mjs]
```

**Reshapes:** 2 (creation, tier update). Unified key format (`ts_<tier>_<uuid>`) eliminates previous dual-format complexity. Clean.

### 3.2 State Management

**Sources of truth by entity:**

| Entity | Primary Source | Duplicated? | Risk |
|--------|---------------|-------------|------|
| Tweet data | Twitter API | No (fetched fresh) | None |
| API Key + Tier | `apiKeys` collection | `customers.tier` mirrors it | **Low** — atomic batch keeps them in sync |
| Usage counts | `usage` collection | No | None |
| Customer record | `customers` collection | Stripe is true source for billing | Low — webhook keeps mirror current |
| Subscription | Stripe API | `subscriptions` collection mirrors | Low — idempotent webhook handler |
| Configuration | Environment variables | Hardcoded `TIERS` object | None — TIERS is immutable constant |

**One duplication concern:** `apiKeys.tier` and `customers.tier` both store the customer's tier. They're always updated together via Firestore atomic batch, so divergence is impossible under normal operation. However, manual admin operations could desync them. Recommend documenting this invariant.

**No derived values stored and manually synced.** All derived values (remaining credits, current month, canvas height) are computed on demand — correct and simple.

### 3.3 Configuration Layers

**Single configuration layer:** `src/config.mjs` loads environment variables via Zod schema with typed defaults. Configuration is frozen after load. No runtime config, no feature flags, no database-driven settings, no cascading overrides.

```
Environment variables → Zod schema (coerce + validate + defaults) → Object.freeze() → config object
```

**Config values that have never varied from defaults:**
- `HOST` (always `0.0.0.0`)
- `GCS_BUCKET` (always `tweet-shots-screenshots`)

These are correctly kept as configurable defaults — they *could* change per deployment, and the cost of the config entry is zero.

**Assessment: Configuration is clean and minimal.** One file, one schema, one frozen object. No complexity.

---

## 4. Pattern Complexity

### 4.1 Premature Generalization

**None found.** Specific checks:
- No multi-provider abstractions (Stripe is the only payment processor; there's no `PaymentProvider` interface wrapping it)
- No plugin systems
- No configurable pipelines
- No abstract base classes
- No schema versioning
- No i18n infrastructure wrapping English strings
- TIERS is a frozen constant, not a configurable registry

### 4.2 Unnecessary Indirection

| Pattern | Location | Assessment |
|---------|----------|------------|
| `core.mjs` re-export hub | `core.mjs` (25 lines) | **Mild indirection** — API routes import through it instead of directly from sub-modules. The comment says "Direct imports preferred for new code" but routes haven't migrated yet |
| `render()` wrapper | `screenshot.mjs:62-67` | **Justified** — provides pool-or-direct fallback. Could be removed if pool is always created, but test ergonomics favor keeping it |
| `errorHandler()` in own file | `error-handler.mjs` (11 lines) | **Over-separated** — 4 lines of logic wrapped in a factory for DI consistency. Could inline into server.mjs |
| `sendScreenshotError()` | `screenshot.mjs:51-57` | **Mild DRY violation** — same pattern exists inline in `tweet.mjs:28-32`. Extract to shared helper or keep duplicated (2 occurrences is borderline) |
| `buildRenderOptions()` | `screenshot.mjs:28-48` | **Justified** — normalizes field aliases and boolean inversions. Could partially move into Zod schema transforms, but current approach is clear |

### 4.3 Cargo-Culted Patterns

**None found.** Specific checks:
- DI pattern in server.mjs: appropriate — enables testing, conditional middleware
- Service/route separation: proportionate for 6 routes and 5 services
- Middleware chain: each link does distinct work (auth, rate-limit, billing, validation)
- Worker thread pool: justified — Satori + Resvg are CPU-intensive
- Zod validation: appropriate — schemas document API contracts + provide runtime safety

### 4.4 Organic Growth Tangles

**Previous tangles (resolved):**
- Dual key formats (UUID admin keys + base64 Stripe keys) → unified `ts_<tier>_<uuid>` format
- Disconnected usage tracking (one counted, one enforced, neither complete) → unified `trackAndEnforce()`
- Monolithic `core.mjs` (900+ lines) → decomposed into 4 focused sub-modules

**Current mild inconsistencies:**
- `core.mjs` still used as import source by API routes (despite comment recommending direct imports)
- Error response pattern duplicated across `screenshot.mjs` and `tweet.mjs` (5 lines each)
- `showMetrics`/`hideMetrics` naming inconsistency in schemas (both exist, `buildRenderOptions` reconciles)

**No TODO/FIXME/HACK comments found in source code.**

---

## 5. Complexity Quantification

### 5.1 Indirection Scores Per Operation

| Operation | Files | Meaningful | Ratio | Assessment |
|-----------|-------|-----------|-------|------------|
| GET /screenshot | 10 | 8 | 1.25 | **Green** |
| POST /screenshot | 11 | 9 | 1.22 | **Green** |
| GET /tweet/:id | 7 | 6 | 1.17 | **Green** |
| POST /billing/signup | 6 | 5 | 1.20 | **Green** |
| POST /billing/checkout | 6 | 5 | 1.20 | **Green** |
| POST /billing/webhook | 7 | 6 | 1.17 | **Green** |
| Admin CRUD | 4 | 3 | 1.33 | **Green** |
| GET /health | 1 | 1 | 1.00 | **Green** |
| CLI screenshot | 7 | 6 | 1.17 | **Green** |

**All operations score green (ratio < 2.0).** No yellow or red flags.

### 5.2 Abstraction Overhead

| Category | Count | Lines |
|----------|-------|-------|
| Re-export hub (core.mjs) | 1 | 25 |
| Factory with single type (errorHandler) | 1 | 11 |
| Render wrapper (pool fallback) | 1 | 6 |
| **Total abstraction tax** | **3** | **42** |
| **As % of source** | — | **1.3%** |

This is exceptionally low. The codebase carries almost no unnecessary abstraction weight.

### 5.3 Onboarding Complexity Per Area

| Area | Files to Read | Layers | Patterns to Learn | Rating |
|------|--------------|--------|-------------------|--------|
| Health/public routes | 2 (health.mjs, landing.mjs) | 1 | None | **Simple** |
| Screenshot pipeline | 5 (screenshot.mjs, tweet-fetch, tweet-html, tweet-render, render-pool) | 4 | Worker pool, Satori VDOM, base64 prefetch | **Moderate** |
| Authentication | 3 (authenticate.mjs, api-keys.mjs, firestore.mjs) | 3 | Firestore, DI middleware | **Simple** |
| Billing/Stripe | 4 (billing.mjs, stripe.mjs, api-keys.mjs, usage.mjs) | 3 | Stripe webhooks, atomic batches, tier mapping | **Moderate** |
| Admin CRUD | 2 (admin.mjs, api-keys.mjs) | 2 | X-Admin-Key guard | **Simple** |
| Rate limiting | 2 (rate-limit.mjs, config.mjs) | 2 | express-rate-limit pre-creation | **Simple** |
| CLI | 3 (tweet-shots.mjs, core.mjs, tweet-*.mjs) | 3 | Arg parsing, render pipeline | **Moderate** |
| Configuration | 1 (config.mjs) | 1 | Zod schema | **Simple** |

**No area rates as Complex or Labyrinthine.** A new developer can understand any subsystem by reading 2-5 files. The rendering pipeline (Moderate) is the densest area, but that's intrinsic complexity — you need to understand Satori's constraints (flexbox-only, no remote URLs, CSS-only image dimensions) regardless of architecture.

---

## 6. Simplification Roadmap

### Full Finding List

| # | Finding | Category | Effort | Risk | Impact | Priority |
|---|---------|----------|--------|------|--------|----------|
| 1 | `error-handler.mjs` is 11 lines wrapping 4 lines of logic, exists only for DI consistency | **Remove** | Trivial (<1h) | Low | Save 1 file + 1 import | This week |
| 2 | API routes import from `core.mjs` instead of directly from sub-modules | **Simplify** | Trivial (<1h) | Low | Remove 1 indirection layer for API code paths | This week |
| 3 | Error response pattern duplicated in `screenshot.mjs:51-57` and `tweet.mjs:28-32` | **Collapse** | Trivial (<1h) | Low | 1 shared helper instead of 2 copies | This week |
| 4 | `showMetrics`/`hideMetrics` dual naming in schemas + `buildRenderOptions` reconciliation | **Simplify** | Small (<1d) | Low | Cleaner API surface; less alias handling | This month |
| 5 | `buildRenderOptions()` field alias normalization could move into Zod `.transform()` | **Replace** | Small (<1d) | Medium | Eliminate 20-line function; validation + normalization in one place | This month |
| 6 | `customers.tier` duplicates `apiKeys.tier` | **Accept** | — | — | Atomic batch prevents divergence; useful for email-based tier queries | Accept |
| 7 | Worker pool fallback (`if (renderPool)` in screenshot.mjs) adds untested production code path | **Accept** | — | — | Enables test ergonomics without real workers; mild complexity | Accept |
| 8 | Request schemas in single file (111 lines) | **Accept** | — | — | Not yet large enough to split by feature | Accept |

### This Week (trivial, high-confidence)

1. **Inline `error-handler.mjs` into `server.mjs`** — Delete the file, move the 4-line handler inline. Update imports. Tests still pass because the handler behavior is identical. Can be done in a Code Elegance or Codebase Cleanup run.

2. **Migrate route imports from `core.mjs` to direct sub-modules** — In `screenshot.mjs`, change `import { extractTweetId, fetchTweet, renderTweetToImage, DIMENSIONS } from '../../core.mjs'` to import from `../../tweet-fetch.mjs` and `../../tweet-render.mjs`. Same for `tweet.mjs` and `render-worker.mjs`. `core.mjs` stays for CLI backward compatibility.

3. **Extract shared error response helper** — Create a ~5-line `sendRouteError(res, err, code)` function, used by both `screenshot.mjs` and `tweet.mjs`. Could live in `src/routes/helpers.mjs` or `src/errors.mjs`.

### This Month (small, needs thought)

4. **Normalize `showMetrics`/`hideMetrics`** — Pick one convention (recommend `hideMetrics` to match all other `hide*` options), deprecate the other in the API docs, handle the old name via Zod transform.

5. **Move field alias resolution into Zod schema transforms** — The `buildRenderOptions()` function handles `bgColor`→`backgroundColor`, `radius`→`borderRadius` aliasing. This logic belongs in the Zod schema's `.transform()` step, which would eliminate the separate normalization function and centralize all input processing in one place.

### This Quarter

No structural changes needed. The architecture is appropriately sized for the current feature set and foreseeable growth (up to ~20-30 routes).

### Backlog

- **Split `request-schemas.mjs` by feature** — only if schemas exceed ~200 lines
- **Add `/admin/config` endpoint** — runtime config introspection (non-sensitive fields)
- **Consider caching tweet data** — currently fetched fresh per request; could add TTL cache if volume warrants it

### Dependency Graph Between Simplifications

```
#1 (inline error-handler) — independent
#2 (direct sub-module imports) — independent
#3 (shared error helper) — independent
#4 (hideMetrics normalization) → enables #5 (move aliases to Zod)
#5 (Zod transforms) — depends on #4 being resolved first
```

No blocking dependencies among the This Week items.

---

## 7. Accepted Complexity

These are complexities I evaluated and determined are **justified**:

| Complexity | Why It's Justified |
|---|---|
| **Worker thread pool** (162 lines) | Satori + Resvg are genuinely CPU-intensive; blocking the event loop would kill API throughput on Cloud Run |
| **DI pattern for route factories** | Enables testing routes without full server bootstrap; enables conditional deps (renderPool=null in tests) |
| **Firestore lazy singletons** (getDb, getStorage) | SDK clients are expensive to init; standard pattern for cloud services |
| **Middleware chain** (auth → rate-limit → billing → validate) | Each link does distinct work; ordering is documented and tested |
| **Stripe service** (221 lines) | Stripe integration is inherently complex (webhooks, idempotent event handling, atomic multi-doc updates); this is essential complexity |
| **`customers.tier` duplicating `apiKeys.tier`** | Enables efficient email-based tier queries; atomic batch prevents divergence |
| **`subscriptions` collection mirroring Stripe** | Avoids Stripe API calls on every billing query; webhook keeps it current |
| **Zod validation on every request** | Schemas ARE the API contract documentation; runtime safety in a dynamic language |
| **Worker pool fallback** (`if (renderPool)`) | Enables test ergonomics; mild cost (1 conditional per render call) |
| **`core.mjs` re-export hub** | Still needed by CLI (`tweet-shots.mjs`) which imports many symbols; removing it would spread imports across 4 files |

---

## 8. Recommendations

### Priority-Ordered Next Steps

1. **This week:** Execute findings #1-3 (inline error-handler, direct sub-module imports, shared error helper). These are mechanical, low-risk, improve code hygiene.
2. **This month:** Execute findings #4-5 (normalize hideMetrics naming, move alias resolution to Zod transforms). These improve API consistency and centralize input processing.
3. **Ongoing:** Continue comprehensive testing — the 2.1:1 test-to-source ratio is excellent and enables safe refactoring.

### Which Overnight Prompts Should Run Next

- **Code Elegance** — Target `tweet-html.mjs` (419 lines, the largest source file) and `tweet-shots.mjs` (358 lines) for function-level complexity analysis
- **Codebase Cleanup** — Execute the three This Week items from this roadmap
- **File Decomposition** — Not needed; recent decomposition of core.mjs is complete and the remaining files are appropriately sized

### Conventions to Prevent New Complexity

1. **Direct imports over hub modules** — New code should import from `tweet-fetch.mjs`, `tweet-html.mjs`, `tweet-render.mjs` directly, not through `core.mjs`
2. **One source of truth per field** — If a field exists in one Firestore collection, don't duplicate it in another unless there's a strong query performance reason (and document the invariant)
3. **Zod schemas own all input normalization** — Field aliases, type coercion, and default values should live in the Zod schema's `.transform()` step, not in route handler utility functions
4. **Middleware earns its file** — A middleware module should contain non-trivial logic (>10 lines of meaningful work). One-liner wrappers that only inject a logger can be inlined

### Abstraction Decision Framework

When considering whether to add an abstraction, ask:

1. **Does it have more than one implementation today?** (If no, don't create an interface/factory)
2. **Is it needed for testability?** (If yes, DI is justified even with one implementation)
3. **Does it prevent duplication across 3+ call sites?** (If no, inline it)
4. **Will removing it change behavior?** (If no, it's pure indirection — remove it)
5. **Does the problem domain require it?** (Worker pool for CPU work: yes. Factory for one class: no.)

---

*Report generated by architectural complexity audit. Run 01 of the tweet-shots codebase.*
*Codebase snapshot: commit b412620 on master branch.*
