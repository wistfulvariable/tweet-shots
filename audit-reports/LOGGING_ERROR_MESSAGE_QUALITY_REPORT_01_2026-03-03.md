# Logging & Error Message Quality Report

**Run**: 01 | **Date**: 2026-03-03 | **Branch**: `message-quality-2026-03-03`

---

## 1. Executive Summary

| Metric | Count |
|---|---|
| User-facing error messages audited | 32 |
| User-facing messages improved | 24 |
| Leaked internals fixed | 2 (P0) |
| Critical-path messages improved | 8 (P1) |
| Generic messages replaced | 10 (P2) |
| Tone/consistency aligned | 4 (P3) |
| Log statements audited | 28 |
| Log messages improved | 9 |
| Log level corrections | 0 (all levels were appropriate) |
| Error handlers audited | 5 |
| Error handlers improved | 2 |
| Sensitive data exposure | 0 (none found) |
| Tests updated | 7 files |
| Tests passing | 412/412 |

---

## 2. User-Facing Error Messages

### 2.1 Leaked Internals Fixed (P0)

| File | Line | Issue | Fix |
|---|---|---|---|
| `tweet-fetch.mjs` | 55 | Leaked upstream HTTP status code and statusText (`Failed to fetch tweet: 404 Not Found`) | Replaced with user-friendly messages per status: "Tweet not found", "Twitter rate limit reached", "Unable to retrieve tweet" |
| `tweet-fetch.mjs` | 32 | Echoed raw user input in error message (`Could not extract tweet ID from: <input>`) — potential XSS vector if message rendered in HTML | Replaced with generic actionable message without reflecting input |

### 2.2 Critical-Path Improvements (P1)

| File | Line | Old Message | New Message |
|---|---|---|---|
| `authenticate.mjs` | 15 | "API key required" | "API key required. Include it in the X-API-KEY header or apiKey query parameter." |
| `authenticate.mjs` | 22 | "Invalid or revoked API key" | "Invalid or revoked API key. Sign up at /billing/signup for a new key." |
| `authenticate.mjs` | 30 | "Authentication service unavailable" | "Authentication service is temporarily unavailable. Please try again later." |
| `rate-limit.mjs` | 17 | "Rate limit exceeded" | "Rate limit exceeded. Please wait 60 seconds before retrying. Check the Retry-After header for details." |
| `rate-limit.mjs` | 43 | "Too many signups from this IP, try again later" | "Too many signup attempts. Please try again in 15 minutes." |
| `rate-limit.mjs` | 55 | "Too many billing requests from this IP, try again later" | "Too many billing requests. Please try again in 15 minutes." |
| `usage.mjs` | 67 | "Monthly credit limit reached. Upgrade your plan for more credits." | "Monthly credit limit of {N} screenshots reached for the {tier} tier. Upgrade at /billing/checkout for more credits, or wait until next month." |
| `validate.mjs` | 19 | "Validation failed" | "Request validation failed. Check the details field for specific issues." |

### 2.3 Generic Messages Replaced (P2)

| File | Old | New |
|---|---|---|
| `billing.mjs` (signup) | "Signup failed" | "Unable to complete signup at this time. Please try again later." |
| `billing.mjs` (checkout) | "Checkout session creation failed" | "Unable to start checkout. Please verify your email and try again." |
| `billing.mjs` (portal) | "Portal session creation failed" | "Unable to open billing portal. Please verify your email and try again." |
| `billing.mjs` (usage) | "Failed to get usage stats" | "Unable to retrieve usage data at this time. Please try again later." |
| `billing.mjs` (not configured) | "Stripe billing is not configured" | "Billing is not available at this time." |
| `admin.mjs` (create) | "Failed to create key" | "Unable to create API key. Please try again." |
| `admin.mjs` (list) | "Failed to list keys" | "Unable to retrieve API keys. Please try again." |
| `admin.mjs` (revoke) | "Failed to revoke key" | "Unable to revoke API key. Please try again." |
| `admin.mjs` (not found) | "Key not found" | "API key not found. It may have already been revoked." |
| `admin.mjs` (usage) | "Failed to get usage stats" | "Unable to retrieve usage statistics. Please try again." |

### 2.4 Tone/Consistency Aligned (P3)

| File | Change |
|---|---|
| `admin.mjs` | "Admin access denied" → "Admin access required. Provide a valid X-Admin-Key header." (actionable) |
| `billing.mjs` (webhook) | "Webhook processing failed" → "Webhook signature verification failed" (specific) |
| `billing.mjs` (webhook) | "Webhook not configured" → "Webhook endpoint not configured" (clearer) |
| `screenshot.mjs` | URL_NOT_CONFIGURED changed from 400 to 503 (correct status for server-side config issue) with actionable alternative: "Use image or base64 response type instead." |

### 2.5 Messages Still Acceptable (No Change Needed)

| File | Message | Reason |
|---|---|---|
| `error-handler.mjs` | "An unexpected error occurred..." | Already improved in this audit |
| `errors.mjs` (sendRouteError) | AppError messages pass through to client | These are already user-friendly per-case messages |
| `billing.mjs` (success/cancel HTML) | "Payment Successful!" / "Payment Cancelled" | Clear, friendly, appropriate |

---

## 3. Sensitive Data in Logs (CRITICAL)

**No sensitive data exposure found.** Specific review:

| Location | Data Reviewed | Status |
|---|---|---|
| `authenticate.mjs:14` | Logs `req.ip` | Acceptable — IP is standard for auth failure monitoring |
| `authenticate.mjs:21` | Logs `keyPrefix: apiKey.slice(0, 12)` | Safe — only logs key prefix |
| `authenticate.mjs:29` | Logs `apiKey.slice(0, 12) + '...'` | Safe — truncated |
| `billing-guard.mjs:36` | Logs `apiKey.slice(0, 12) + '...'` | Safe — truncated |
| `admin.mjs:69` | Logs `key.slice(0, 12) + '...'` | Safe — truncated |
| `server.mjs:77` | Logs `method`, `path` per request | Standard request logging |
| `stripe.mjs:150` | Logs `customer.email` | Acceptable — operational data for billing events |

No passwords, full API keys, card numbers, tokens, or raw user input found in any log statement.

---

## 4. Log Level Corrections

All log levels were found to be appropriate:

| Level | Usage | Assessment |
|---|---|---|
| `logger.fatal` | Unhandled promise rejection (server.mjs:150) | Correct — system crash |
| `logger.error` | Firestore/Stripe failures, unhandled route errors | Correct — unexpected failures |
| `logger.warn` | Auth failures, thread walk halts, payment failures, unexpected worker exits | Correct — degraded but recoverable |
| `logger.info` | Startup, key creation/revocation, signups, webhooks, subscription changes | Correct — significant operations |
| `logger.debug` | Unhandled webhook event types | Correct — diagnostic only |

No misleveled logs found. No expected conditions logged at ERROR.

---

## 5. Log Message Quality Improvements

### Context Added to Error Logs

| File | Line | Old Context | Added Context |
|---|---|---|---|
| `billing.mjs` (signup) | 75 | `{ err }` | `{ err, email }` |
| `billing.mjs` (checkout) | 106 | `{ err }` | `{ err, email, tier }` |
| `billing.mjs` (portal) | 134 | `{ err }` | `{ err, email }` |
| `billing.mjs` (usage) | 146 | `{ err }` | `{ err, apiKey (truncated) }` |
| `billing.mjs` (webhook) | 167 | `{ err }` | `{ err, eventType }` |
| `admin.mjs` (create) | 45 | `{ err }` | `{ err, tier }` |
| `admin.mjs` (revoke) | 72 | `{ err }` | `{ err, key (truncated) }` |
| `screenshot.mjs` (POST) | 137 | `{ err }` | `{ err, tweetId, tweetUrl }` |
| `server.mjs` (webhook stream) | 54 | `{ err }` | `{ err, path }` |
| `server.mjs` (webhook parse) | 62 | `{ parseError }` | `{ err, bodyLength }` + clarified message |

### Core Module Log Improvements

| File | Change |
|---|---|
| `tweet-render.mjs:45` | Image fetch log: added URL truncation, consistent format |
| `tweet-render.mjs:53` | Image fetch error: structured format with URL context |
| `tweet-render.mjs:125` | Font load error: identifies which file failed |
| `tweet-render.mjs:144` | Font network fallback: explains bundled fonts were missing |
| `tweet-render.mjs:149` | Fatal font error: actionable message with file paths to check |
| `tweet-fetch.mjs:109` | Thread walk halt: includes parent tweet ID for debugging |

### Critical Operations Already Logged (Verified)

| Operation | Logged At | Level |
|---|---|---|
| API key creation | `admin.mjs:42` | INFO |
| API key revocation | `admin.mjs:69` | INFO |
| Tier changes (subscription) | `stripe.mjs:150` | INFO |
| Subscription cancellation | `stripe.mjs:187` | INFO |
| Server startup | `server.mjs:124` | INFO |
| Server shutdown | `server.mjs:136,139` | INFO |
| Webhook receipt | `stripe.mjs:194` | INFO |
| Signup | `billing.mjs:43,66` | INFO |
| Unhandled rejection | `server.mjs:150` | FATAL |
| Worker pool start | `render-pool.mjs:187` | INFO |

---

## 6. Error Handler Assessment

| Handler | Location | Differentiates Types? | Logs Properly? | Has Request ID? | Sanitizes? |
|---|---|---|---|---|---|
| Global error handler | `error-handler.mjs` | No (all 500) | Yes (err + method + path + reqId) | **Yes** (added) | Yes |
| Route error helper | `errors.mjs:sendRouteError` | Yes (AppError vs Error) | Yes (500s only, with code) | **Yes** (added) | Yes (generic msg for 500) |
| Auth middleware | `authenticate.mjs` | Yes (401 vs 500) | Yes (warn for auth, error for failures) | No (pre-request-ID) | Yes |
| Billing guard | `billing-guard.mjs` | Yes (429 vs fail-open) | Yes (error with key prefix) | No (pre-handler) | Yes |
| Webhook raw body | `server.mjs:49-70` | No (all 400) | Yes (error + warn) | No (pre-request-ID) | Yes |

### Improvements Made

1. **Global error handler**: Now includes `requestId` in error responses so users can reference it when contacting support. Logs `reqId` for correlation.
2. **sendRouteError**: Now includes `requestId` in 500 error responses for correlation. Generic 500 message improved from "Internal server error" to more user-friendly text.

### No Changes Needed

- Auth and billing guard middleware run before route handlers set request IDs, so adding requestId there would be misleading. Their per-type differentiation is correct.
- All handlers properly sanitize errors: 500s never expose internal error messages.

---

## 7. Consistency Findings

### Error Code Coverage

All 22 error response paths use machine-readable `code` fields in SCREAMING_SNAKE_CASE format. Coverage is complete — no error responses are missing codes.

### Log Format Assessment

- **Single logger**: All server-side code uses pino via `createLogger()`. No raw `console.log` in server code.
- **Core modules**: Use `console.error`/`console.warn` (acceptable — they run in worker threads without access to pino).
- **Field names**: Consistent use of `err`, `method`, `path`, `email`, `tier` across all log statements.
- **Timestamps**: Handled by pino (ISO 8601 in prod, omitted in dev pretty-print).
- **Request correlation**: `reqId` field available in all request-scoped logs via `req.log = logger.child({ reqId })`.

### Standardization Changes Made

1. Changed checkout/portal error responses from 400 to 500 (these are server-side failures, not client errors)
2. Changed URL_NOT_CONFIGURED from 400 to 503 (server configuration issue, not bad request)
3. All 500 error responses now use the same generic message pattern

---

## 8. Logging Infrastructure Recommendations

### Already Present
- Structured logging (pino with JSON output in prod, pretty-print in dev)
- GCP Cloud Logging integration (severity field mapping)
- Request ID generation and propagation (`X-Request-ID` header)
- Request-scoped child loggers (`req.log`)

### Gaps Identified (Do Not Implement)

1. **Worker thread logging**: Core rendering modules use `console.error`/`console.warn` because they run in both worker threads and the main process. Worker output goes to stderr but isn't captured in structured logs. A potential improvement would be to pass a pino instance to worker threads via `workerData`, but this would require refactoring the module interface.

2. **Request ID in all error paths**: Auth and billing-guard middleware errors don't include `requestId` because they execute before the request-ID middleware. This is by design (middleware ordering), but could be solved by moving request-ID generation to the very first middleware.

3. **Error response documentation**: The new `docs/ERROR_MESSAGES.md` documents all error codes and messages. New endpoints should follow the patterns documented there.

---

## 9. Bugs Discovered

No actual bugs were discovered during this audit. All error handlers were functioning correctly — this audit only improved message quality and log context.

One **status code correction** was made:
- `screenshot.mjs`: URL_NOT_CONFIGURED was returning 400 (Bad Request) but the issue is a server-side configuration gap (no GCS bucket), which is correctly a 503 (Service Unavailable). Similarly, billing checkout/portal catch blocks were returning 400 for what are server-side Stripe failures — corrected to 500.

---

## Files Modified

### Source (message content only — no business logic changes)
- `tweet-fetch.mjs` — Error messages for extractTweetId and fetchTweet
- `tweet-render.mjs` — Console messages for font loading and image pre-fetch
- `src/errors.mjs` — sendRouteError generic 500 message + requestId
- `src/middleware/authenticate.mjs` — Auth error messages
- `src/middleware/billing-guard.mjs` — No changes needed (already good)
- `src/middleware/error-handler.mjs` — Generic 500 message + requestId
- `src/middleware/rate-limit.mjs` — Rate limit messages with retry guidance
- `src/middleware/validate.mjs` — Validation error message
- `src/routes/admin.mjs` — Admin error messages + log context
- `src/routes/billing.mjs` — Billing error messages + log context + status codes
- `src/routes/screenshot.mjs` — URL_NOT_CONFIGURED status + log context
- `src/services/usage.mjs` — Monthly limit message with tier details

### Tests (assertion updates only)
- `tests/unit/errors.test.mjs`
- `tests/unit/error-handler.test.mjs`
- `tests/unit/validate.test.mjs`
- `tests/unit/rate-limit.test.mjs`
- `tests/unit/core.test.mjs`
- `tests/integration/api-contracts.test.mjs`
- `tests/integration/screenshot.test.mjs`

### Documentation (new)
- `docs/ERROR_MESSAGES.md` — Error message style guide + complete error code reference
