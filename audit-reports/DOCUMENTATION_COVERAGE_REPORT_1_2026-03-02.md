# Documentation Coverage Report — Run 1 — 2026-03-02

## Run Summary

**Branch:** `documentation-2026-03-02`
**Date:** 2026-03-02
**Model:** Claude Sonnet 4.6
**Scope:** Full codebase — all 4 source files, all config/data files, git history
**Tests:** No tests exist in this project

---

## Phase 0: Existing Standards

No `CLAUDE.md`, `.cursorrules`, or `CONTRIBUTING.md` found. No conflicts. Proceeded directly.

---

## Phase 1: Codebase Discovery

### Files Analyzed

| File | Lines | Role |
|---|---|---|
| `tweet-shots.mjs` | 1175 | CLI entry point + full rendering core |
| `api-server.mjs` | 821 | Express REST API server |
| `stripe-billing.mjs` | 510 | Stripe billing module (disconnected) |
| `landing.html` | ~300 | Static marketing page |
| `api-keys.json` | 14 | Live API key store (committed to git) |
| `package.json` | 25 | Dependencies + scripts |
| `tweet-shots-api.service` | 34 | systemd unit file |
| `API.md` | 256 | Human-facing API reference |
| `README.md` | 112 | Human-facing CLI reference |

### Architecture Summary

Single-purpose tool with dual surface area (CLI + REST API). Rendering pipeline:
1. `fetchTweet()` → Twitter syndication API (cdn.syndication.twimg.com)
2. Pre-fetch all images to base64 (required by Satori)
3. `generateTweetHtml()` → inline-styled HTML string
4. `html()` (satori-html) → Satori VDOM
5. `satori()` → SVG
6. `Resvg.render()` → PNG buffer

### Key Architectural Finding

`stripe-billing.mjs` is a complete, well-structured billing module that exports `addBillingRoutes(app)` — but this function is **never called** from `api-server.mjs`. Stripe billing was built but not integrated. The API server runs its own simplified (non-Stripe) `/billing/signup` endpoint.

---

## Phase 2: CLAUDE.md

**Created:** `CLAUDE.md` at project root
**Lines:** 201
**Sections:** Project Identity, Tech Stack, Project Structure, Architectural Rules, Data Model, Auth Model, Environment Variables, Build/Deploy Commands, Coding Conventions, Twitter Syndication API, Documentation Hierarchy

---

## Phase 3: Tier 2 Memory Files

**Created in `.claude/memory/`:**

| File | Lines | Topic |
|---|---|---|
| `rendering.md` | 70 | Satori constraints, image pre-fetch, height calc, fonts |
| `api-routes.md` | 68 | Middleware stack, all routes, auth, rate limiting |
| `billing.md` | 72 | Stripe integration, disconnected module, two usage systems |
| `data-storage.md` | 65 | JSON file schemas, key formats, storage patterns |
| `security.md` | 71 | 7 security findings (2 critical, 3 high/medium, 2 low) |
| `feature-inventory.md` | 79 | CLI features, API features, unsupported features |
| `pitfalls.md` | 74 | Code duplication, behavioral quirks, edge cases |
| `deployment.md` | 75 | systemd, Docker, env checklist, Stripe webhook |
| `twitter-api.md` | 65 | API endpoint, response shape, limitations |

**Total Tier 2:** 9 files, ~649 lines

---

## Phase 4: MEMORY.md

**Created:** `.claude/memory/MEMORY.md`
**Lines:** 30
**Contents:** Index of topic files + current project state snapshot

---

## Security Findings Detail

### CRITICAL — api-keys.json committed to git

File is tracked by git and contains live keys including one with a real email address. The `.gitignore` does not exclude it.

**Affected files:** `api-keys.json`
**Evidence:** `git ls-files api-keys.json` returns the file; current content has `ts_free_6d2407...` key with `test@example.com`
**Fix:** Add to `.gitignore`, `git rm --cached api-keys.json`, rotate exposed keys

### CRITICAL — .admin-key not gitignored

`.admin-key` file contains the actual admin key (`ts_admin_b148f0328cd1baa6fb40c6ff8d9a10a1`) and has no `.gitignore` entry.

**Fix:** Add `.admin-key` to `.gitignore`

### HIGH — Default admin key in source code

```js
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin-secret-key';
```
If env var not set, admin API is protected by an obvious default. The systemd service has a TODO placeholder.

### HIGH — Stripe webhook signature bypass

Without `STRIPE_WEBHOOK_SECRET`, the webhook handler accepts unsigned events:
```js
event = req.body; // No signature check
```
Any POST to `/webhook/stripe` can trigger tier upgrades.

### HIGH — Billing module disconnected (business logic)

`stripe-billing.mjs` is complete but unintegrated. Paying customers who complete Stripe checkout will not get upgraded API keys. The `/billing/signup` route creates free-tier keys only.

### MEDIUM — Email-derived API keys (predictable)

stripe-billing generates keys as `base64(email).slice(0, 24)`. Anyone who knows a user's email can compute their API key.

### MEDIUM — No rate limiting on /billing/signup

`POST /billing/signup` creates real API keys with no auth, no rate limiting, and CORS allows all origins.

---

## Code Quality Findings

### Significant Code Duplication

The following are fully duplicated between `tweet-shots.mjs` and `api-server.mjs`:
- `THEMES`, `DIMENSIONS`, `GRADIENTS` constants
- `extractTweetId()`, `fetchTweet()`, `fetchImageAsBase64()`
- `formatDate()`, `formatNumber()`
- `generateTweetHtml()` (with behavioral divergence — API version lacks quote tweet, entity colorization)
- `loadFonts()`, rendering functions, `loadJSON()`, `saveJSON()`

Additionally, the two versions of `generateTweetHtml` have **diverged** in behavior:
- CLI uses SVG icons for metrics; API uses emoji
- CLI processes URL/mention/hashtag entities; API does not
- CLI renders quote tweets; API does not

### No Test Coverage

Zero test files exist. No unit, integration, or smoke tests. Core rendering logic, API routes, auth, and billing are all untested.

### Font Network Dependency on Every Render

`loadFonts()` fetches 2 font files from Google Fonts CDN on every render. No caching. Render latency is heavily impacted by network speed. Server-side font caching would require a single initialization or lazy-loaded singleton.

### Height Estimation Can Clip Content

Satori height is calculated from character count (45 chars/line assumed). Long tweets, CJK text, or content with many newlines can exceed the calculated height and be silently clipped.

### Logo Overlay Incompatible with Satori

`addLogoToHtml()` injects `position: absolute` styling, which Satori does not support. The logo feature is broken by design.

---

## Documentation Gaps Found

| Gap | Severity | Status |
|---|---|---|
| No in-code comments explaining Satori CSS constraints | Medium | Documented in rendering.md |
| No explanation of why stripe-billing.mjs is not integrated | High | Documented in billing.md |
| API.md doesn't mention quote tweet rendering difference | Low | Documented in pitfalls.md |
| No documentation of `api-keys.json` security concern | Critical | Documented in security.md |
| CONTRIBUTING.md absent (no onboarding path) | Low | N/A — small project |

---

## Tier Budget Assessment

| Layer | Lines | Est. Tokens | % of 200K |
|---|---|---|---|
| CLAUDE.md (Tier 1) | 201 | ~6.2K | 3.1% |
| MEMORY.md (Tier 1 index) | 30 | ~0.9K | 0.5% |
| Typical Tier 2 (2 files) | ~140 | ~4.3K | 2.2% |
| **Typical session total** | **~370** | **~11.4K** | **~5.7%** |

Well within the 5-7% Tier 1 target. Tier 2 per-file average is 72 lines (within 40-80 line target).
