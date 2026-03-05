# API Endpoints

## Route Table

| Method | Path | Auth | Middleware Chain |
|---|---|---|---|
| GET | `/` | None | Landing HTML or JSON info |
| GET | `/health` | None | `{ status, timestamp }` |
| GET | `/pricing` | None | Tier listing with prices |
| GET | `/docs` | None | HTML (browser) or JSON (API client) |
| GET | `/screenshot/:tweetIdOrUrl` | API key | auth → rateLimit → billing → validate(query) → handler |
| POST | `/screenshot` | API key | auth → rateLimit → billing → validate(body) → handler |
| GET | `/tweet/:tweetIdOrUrl` | API key | auth → rateLimit → billing → handler |
| GET | `/billing/usage` | API key | auth → handler |
| GET | `/billing/signup` | None | HTML signup form |
| POST | `/billing/signup` | None | signupLimiter (5/15min IP) → validate → handler |
| POST | `/billing/checkout` | None | validate → handler (requires Stripe) |
| POST | `/billing/portal` | None | validate → handler (requires Stripe) |
| POST | `/webhook/stripe` | Stripe sig | Raw body verification → handler |
| GET | `/billing/success`, `/billing/cancel` | None | Static HTML pages |
| POST | `/admin/keys` | Admin key | admin auth → validate → handler |
| GET | `/admin/keys` | Admin key | admin auth → handler |
| DELETE | `/admin/keys/:key` | Admin key | admin auth → handler |
| GET | `/admin/usage` | Admin key | admin auth → handler |
| POST | `/screenshot/batch` | API key | auth → rateLimit → handler (internal validate + credit check) |
| GET | `/demo/screenshot/:tweetIdOrUrl` | None | demoLimiter (5/min IP) → validate(query) → handler |

## Query Param Name Mappings (GET /screenshot)

`hideMetrics` → `showMetrics: false` (inverted!), `radius` → `borderRadius`, `gradient` → `backgroundGradient`, `bgColor` → `backgroundColor`. Boolean params use string `"true"`/`"false"` (`boolString` Zod transform). Font params (`fontUrl`, `fontBoldUrl`, `fontFamily`) excluded from `/demo` — SSRF risk.

## POST /screenshot Response Types

| `response` | Returns |
|---|---|
| `image` (default) | Binary PNG/SVG |
| `base64` | JSON: `{ success, tweetId, author, format, data }` |
| `url` | Upload to GCS: `{ success, tweetId, author, format, url }` — requires `GCS_BUCKET` |

## Zod Schemas (`src/schemas/request-schemas.mjs`)

`screenshotQuerySchema`, `screenshotBodySchema`, `createKeySchema`, `signupSchema`, `checkoutSchema`, `portalSchema`, `demoQuerySchema` (subset — supports format/scale/bgColor/textColor/linkColor/outputWidth but excludes fontUrl/fontBoldUrl/fontFamily/logo for SSRF prevention), `batchScreenshotSchema`, `batchMultipartOptionsSchema`.

## Error Response Format

`{ error: string, code: "SCREAMING_SNAKE_CASE", requestId?: "uuid" }`. Validation errors add `details: [{ field, message }]`.

## Response Headers

`X-Request-ID`, `X-Credits-Limit`, `X-Credits-Remaining` (all auth routes); `X-Tweet-ID`, `X-Tweet-Author`, `X-Render-Time-Ms` (screenshot routes).

## POST /screenshot/batch

- **JSON**: `{ urls: [...], response: "base64"|"url", ...options }`
- **CSV**: multipart with `file` field (CSV with `url` header column) + form fields for options
- No `billingGuard` in chain — handler calls `checkAndReserveCredits()` upfront (fail-open)
- Limits: free=10, pro=100, business=500 URLs/request; 5 concurrent renders; 1 credit/URL
- Response: `{ success, total, succeeded, failed, results: [{ tweetId, success, data|url|error, code?, author? }] }`
