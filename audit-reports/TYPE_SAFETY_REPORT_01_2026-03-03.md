# Type Safety & Error Handling Hardening Report

**Run:** 01
**Date:** 2026-03-03
**Branch:** `robustness-hardening-2026-03-03`
**Tests passing:** 408/408

---

## 1. Summary

| Metric | Count |
|---|---|
| Error handling issues fixed | 8 |
| Type safety issues fixed | 2 |
| JSDoc annotations added | 7 functions |
| Empty catch blocks fixed | 1 |
| Silent error swallowing fixed | 2 |
| Status code mapping corrected | 1 |
| Tests updated | 3 |
| Tests still passing | 408/408 |

---

## 2. Type Safety Improvements Made

| File | Change | Risk Level | Before → After |
|---|---|---|---|
| `src/routes/screenshot.mjs:35` | Use `??` instead of `\|\|` for scale default | MEDIUM | `params.scale \|\| 1` (swallows 0) → `params.scale ?? 1` (preserves 0) |
| `src/routes/screenshot.mjs:44` | `hideQuoteTweet` now accepts string `'true'` | MEDIUM | `params.hideQuoteTweet === true` (ignores query string) → `=== true \|\| === 'true'` (consistent with siblings) |

## 3. Type Safety Improvements Recommended (Not Implemented)

- **Discriminated union for render results** — `renderTweetToImage()` returns `{data, format, contentType}` but the shape varies by format. A discriminated union (`{format: 'svg', contentType: 'image/svg+xml'}` vs `{format: 'png', contentType: 'image/png'}`) would make it type-safe.
- **Branded types for tweet IDs vs API keys** — Both are strings, easy to mix up. TypeScript branded types or runtime validation would catch misuse.
- **`fetchImageAsBase64()` return type** — Returns `string | null`. Could use a Result type to distinguish "image not found" from "network error".
- **`preFetchProfileImage/preFetchMediaImages` side effects** — These mutate input objects in-place without returning anything. Converting to pure functions that return modified copies would improve predictability.
- **Stripe webhook subscription validation** — `subscription.items?.data?.[0]?.price?.id` chains many optionals. A Zod schema for the webhook payload would catch malformed events at the boundary.
- **`validate()` middleware source param** — `source` is `'body' | 'query'` in JSDoc but unchecked at runtime. Passing `'headers'` or any string would silently use wrong request property.

---

## 4. Error Handling Fixes Made

| File | Issue | Fix Applied |
|---|---|---|
| `src/workers/render-worker.mjs:20-22` | Only `err.message` sent to parent — error name lost | Now sends `errorName` alongside `error` message; uses `String(err)` fallback for non-Error rejections |
| `src/workers/render-pool.mjs:44-50` | Pool reconstructed Error without preserving error name | Now sets `err.name` from worker's `errorName` field |
| `tweet-fetch.mjs:39-43` | All non-OK responses mapped to 404 | Now maps 404→404, 429→429, other→502 (bad gateway) |
| `tweet-render.mjs:37-41` | No check on `response.ok` before converting to base64 — silently produced corrupt data URIs from error pages | Now checks `response.ok` and returns null early with descriptive log |
| `tweet-render.mjs:108` | Empty catch block on font file read — errors silently swallowed | Now logs `e.message` with font filename for debugging |
| `src/errors.mjs:19-25` | `sendRouteError` had no server-side logging capability for 500s | Added optional `logger` parameter; logs 500+ errors server-side when provided |
| `src/server.mjs:49-61` | Webhook body parsing stream had no `error` event handler — could crash on client disconnect | Added `req.on('error')` handler; also logs JSON parse failures instead of silently swallowing |
| `src/middleware/billing-guard.mjs:34-37` | Error path skipped setting credit headers — clients got no `X-Credits-*` headers when tracking failed | Now sets `X-Credits-Limit` (from tier config) and `X-Credits-Remaining: unknown` in error path |

---

## 5. Error Handling Infrastructure Assessment

### What's Good
- **`AppError` class** with explicit `statusCode` — clean separation of client vs internal errors
- **`sendRouteError()` helper** — consistent error response format across routes, masks internal errors from clients
- **Global error handler** — catches unhandled errors, logs with request context, returns clean 500
- **Fail-open billing guard** — Firestore outages don't block rendering (intentional design)
- **Zod validation middleware** — all API inputs validated at the boundary with consistent error format
- **Timing-safe admin key comparison** — `crypto.timingSafeEqual` used correctly

### What's Missing
- **No unhandled rejection handler** — `process.on('unhandledRejection')` is not registered. If a promise rejects without a catch (e.g., in a background task), Node.js will terminate the process in newer versions.
- **No request timeout** — Long-running renders have no timeout. If Satori or Resvg hangs, the request hangs indefinitely.
- **Thread walking swallows all errors** — `tweet-fetch.mjs:78-80` catches everything, not just 404s. A rate limit (429) silently halts thread walking.

### Error Response Consistency
The API uses a consistent `{ error: string, code: string }` pattern for errors, which is good. Success responses are less consistent — some include `{ success: true }`, others don't. This is a minor DX issue, not a robustness concern.

---

## 6. Bugs Discovered

| Severity | Finding |
|---|---|
| **MEDIUM** | `hideQuoteTweet` in `buildRenderOptions()` only checked `=== true` (boolean), while all sibling flags (`hideMedia`, `hideDate`, `hideShadow`, `hideVerified`) also checked `=== 'true'` (string). GET requests with `?hideQuoteTweet=true` (query string) would **not** hide the quote tweet because query strings are strings, not booleans. Fixed. |
| **MEDIUM** | `scale` default used `\|\|` operator: `params.scale \|\| 1`. If a caller passed `scale: 0` (e.g., via POST body), the `\|\|` would treat 0 as falsy and use 1 instead. Fixed with `??`. Note: Zod schema enforces `min(1)`, so `scale: 0` can't reach here through validated paths — but the function also accepts unvalidated params from `buildRenderOptions`. |
| **MEDIUM** | All Twitter API non-OK responses were mapped to HTTP 404. A 429 (rate limited) or 500 (server error) from Twitter would appear as "tweet not found" to the client, making transient failures indistinguishable from permanent ones. Fixed. |
| **LOW** | `fetchImageAsBase64()` didn't check `response.ok` — a 404 or 500 response body (e.g., an HTML error page) would be silently base64-encoded and embedded as an image, producing a corrupt render. Fixed. |

---

## 7. Recommendations

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| 1 | Add `process.on('unhandledRejection')` handler | Prevents silent process crashes from unhandled promise rejections | High | Yes | Register in `server.mjs` to log the rejection and let the process exit gracefully. Node.js will terminate on unhandled rejections by default. |
| 2 | Add render timeout | Prevents hanging requests when Satori/Resvg encounters edge cases | Medium | Probably | Wrap `renderTweetToImage()` calls in `Promise.race()` with a 30s timeout. Could also be implemented at the worker pool level. |
| 3 | Narrow thread-walking catch to 404 only | Prevents silently truncated threads from rate limits or transient errors | Medium | Yes | In `fetchThread()`, check `err.statusCode === 404` and only break on 404. Re-throw or log other errors. |
| 4 | Standardize success response envelope | Consistent API surface for clients | Low | Only if time allows | Decide whether all success responses include `{ success: true }` or none do. Currently mixed. |
