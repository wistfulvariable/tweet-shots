# tweet-shots API Design Guide

Conventions codified from the API Design Audit (2026-03-03). Reference this guide when adding or modifying endpoints.

---

## URL Naming

- **Path segments:** lowercase-hyphenated (`/billing/signup`, `/admin/keys`)
- **Path parameters:** camelCase (`:tweetIdOrUrl`, `:key`)
- **Resource collections:** plural (`/admin/keys`, not `/admin/key`)
- **Resource items:** `/:identifier` under the collection (`/admin/keys/:key`)
- **Group prefixes:** group related endpoints under a common prefix (`/admin/*`, `/billing/*`)
- **No versioning prefix** in current API. When breaking changes are needed, use `/v2/` prefix strategy.

## Field Naming

- **All fields:** camelCase (`tweetId`, `apiKey`, `successUrl`, `monthlyCredits`)
- **Booleans (state):** no prefix (`active`, `success`)
- **Booleans (rendering toggles):** `hide*` prefix (`hideMetrics`, `hideMedia`, `hideDate`)
- **Collections in responses:** resource-specific name (`keys`, `stats`, `tiers` — not `items` or `data`)
- **Success indicator:** include `success: true` on mutation/action responses. Omit on pure read responses.
- **Timestamps:** ISO 8601 strings (`2024-01-15T12:00:00.000Z`)

## HTTP Methods

| Method | When to Use | Idempotent? |
|--------|-------------|:-----------:|
| GET | Read-only, no side effects | Yes |
| POST | Create resource or trigger action | No (unless action is naturally idempotent) |
| DELETE | Remove resource (soft-delete OK) | Yes (second call returns 404) |

- **No PUT/PATCH** currently. If added: PUT for full replacement, PATCH for partial update.

## Status Codes

| Code | When to Use |
|------|-------------|
| 200 | Successful read, successful action with response body |
| 201 | Successful resource creation (POST that creates something) |
| 400 | Client error: bad input, validation failure, malformed request |
| 401 | Missing or invalid authentication (API key) |
| 403 | Valid authentication but insufficient authorization (admin access) |
| 404 | Resource not found |
| 429 | Rate limit exceeded (per-minute or monthly) |
| 500 | Internal server error (never expose details) |
| 503 | Service dependency unavailable (e.g., Stripe not configured) |

## Error Response Format

**Standard error:**
```json
{
  "error": "Human-readable error message",
  "code": "SCREAMING_SNAKE_ERROR_CODE"
}
```

**Validation error (extends standard):**
```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "field": "fieldName", "message": "Description of what's wrong" }
  ]
}
```

**Rules:**
- Every error response MUST include `error` (string) and `code` (string).
- `code` uses SCREAMING_SNAKE_CASE and is unique per error type.
- Validation errors include `details` array with ALL field errors (never fail-on-first).
- Never expose stack traces, internal paths, or SQL/query details in error messages.
- Error codes follow pattern: `{DOMAIN}_{ACTION}_{RESULT}` (e.g., `KEY_CREATE_FAILED`, `BILLING_NOT_CONFIGURED`).

**Client vs internal errors (AppError pattern):**
- `tweet-fetch.mjs` throws `AppError` (from `src/errors.mjs`) for client errors — bad tweet ID, tweet not found, fetch failure. These carry appropriate `statusCode` (400 for bad input, 404 for not found).
- Route catch blocks: `err instanceof AppError ? err.statusCode : 500`. Internal errors (Satori crash, OOM) return 500 with `"Internal server error"` — never leak the real message.

## Request Validation

- Use **Zod** schemas for all input validation.
- Use the `validate(schema, source)` middleware — never validate inside handlers.
- `source` is `'body'` for POST or `'query'` for GET.
- All validated data is available on `req.validated` (never read raw `req.body`/`req.query` after validation).
- Boolean query parameters use the `boolString` transform (`"true"`/`"false"` → `true`/`false`).
- Boolean body parameters use native `z.boolean()`.

## Authentication & Authorization

- **API key auth:** `X-API-KEY` header or `?apiKey=` query param → `authenticate` middleware.
- **Admin auth:** `X-Admin-Key` header → router-level guard in admin.mjs.
- **Stripe webhook auth:** `stripe-signature` header → Stripe SDK verification.
- **Public endpoints:** no auth middleware applied.

## Middleware Chain

Authenticated routes apply middleware in this exact order:

```
authenticate → applyRateLimit → billingGuard → validate(schema) → handler
```

- Never reorder. Each middleware depends on data set by the previous one.
- `authenticate` sets `req.apiKey` + `req.keyData`.
- `applyRateLimit` reads `req.keyData.tier`.
- `billingGuard` calls `trackAndEnforce()`, sets `X-Credits-*` headers.
- `validate` sets `req.validated`.

## Rate Limiting

- **Per-tier:** Pre-created `express-rate-limit` instances at module load (never inside request handlers).
- **IP-based:** For unauthenticated endpoints with abuse risk (e.g., signup: 5 req/15min, billing checkout/portal: 10 req/15min).
- **Headers:** Use `standardHeaders: true` (RFC `RateLimit-*` headers). Set `legacyHeaders: false`.

## Pagination (When Needed)

Currently no endpoints require pagination. When adding paginated endpoints:

- Use **cursor-based** pagination for large or frequently changing datasets.
- Use **offset/limit** only for small, stable datasets.
- Parameter names: `cursor` (opaque string), `limit` (integer, default 20, max 100).
- Response metadata: `{ data: [...], nextCursor: "..." | null, hasMore: boolean }`.

## Content Types

- JSON responses: use `res.json()` (auto-sets `Content-Type: application/json`).
- Image responses: explicitly set `Content-Type` (`image/png`, `image/svg+xml`).
- HTML responses: use `res.send()` with HTML string or `res.sendFile()`.

## Response Headers

Standard headers set by the API:

| Header | Set By | Description |
|--------|--------|-------------|
| `X-Request-ID` | Global middleware | Unique request identifier |
| `X-Tweet-ID` | Screenshot handler | Resolved tweet ID |
| `X-Tweet-Author` | Screenshot handler | Tweet author screen name |
| `X-Credits-Limit` | Billing guard | Monthly credit limit |
| `X-Credits-Remaining` | Billing guard | Credits remaining this month |
| `RateLimit-*` | express-rate-limit | Per-minute rate limit info |

## Adding a New Endpoint Checklist

1. Choose HTTP method and URL path following conventions above.
2. Add route in the appropriate route file (or create new file if new resource group).
3. Create Zod schema in `request-schemas.mjs` for any input.
4. Apply middleware chain: `authenticate` → `applyRateLimit` → `billingGuard` → `validate(schema)` → handler.
5. Return errors using standard `{ error, code }` format.
6. Use 201 for creation, 200 for reads/updates, 204 for no-content responses.
7. Add contract tests in `api-contracts.test.mjs`.
8. Add integration tests in the appropriate test file.
9. Update `/docs` endpoint response in `health.mjs`.
