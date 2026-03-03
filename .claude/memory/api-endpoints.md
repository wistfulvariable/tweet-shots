# API Endpoints

## Route Table

| Method | Path | Auth | Middleware Chain |
|---|---|---|---|
| GET | `/` | None | Landing HTML (Accept: text/html) or JSON info |
| GET | `/health` | None | `{ status, timestamp }` |
| GET | `/pricing` | None | Tier listing with prices |
| GET | `/docs` | None | Inline API documentation |
| GET | `/screenshot/:tweetIdOrUrl` | API key | auth → rateLimit → billing → validate(query) → handler |
| POST | `/screenshot` | API key | auth → rateLimit → billing → validate(body) → handler |
| GET | `/tweet/:tweetIdOrUrl` | API key | auth → rateLimit → billing → handler |
| GET | `/billing/usage` | API key | auth → handler |
| POST | `/billing/signup` | None | signupLimiter (5/15min by IP) → validate → handler |
| POST | `/billing/checkout` | None | validate → handler (requires Stripe) |
| POST | `/billing/portal` | None | validate → handler (requires Stripe) |
| POST | `/webhook/stripe` | Stripe sig | Raw body verification → handler |
| GET | `/billing/success` | None | Static HTML page |
| GET | `/billing/cancel` | None | Static HTML page |
| POST | `/admin/keys` | Admin key | admin auth → validate → handler |
| GET | `/admin/keys` | Admin key | admin auth → handler |
| DELETE | `/admin/keys/:key` | Admin key | admin auth → handler |
| GET | `/admin/usage` | Admin key | admin auth → handler |
| GET | `/demo/screenshot/:tweetIdOrUrl` | None | demoLimiter (5/min by IP) → validate(query) → handler |

## GET /screenshot Query Params → Render Options

| Query Param | Internal Option | Notes |
|---|---|---|
| `hideMetrics` | `showMetrics: false` | Inverted name! |
| `radius` | `borderRadius` | Renamed |
| `gradient` | `backgroundGradient` | Renamed |
| `bgColor` | `backgroundColor` | Renamed |

Boolean query params use string `"true"`/`"false"` (Zod `boolString` transform).

## POST /screenshot Response Types

| `response` value | Returns |
|---|---|
| `image` (default) | Binary PNG/SVG with `Content-Type` header |
| `base64` | JSON: `{ success, tweetId, author, format, data }` |
| `url` | Uploads to GCS, returns JSON: `{ success, tweetId, author, format, url }` |

`url` response requires `GCS_BUCKET` config. Files stored at `screenshots/<tweetId>-<timestamp>.<format>`.

## Zod Schemas

All in `src/schemas/request-schemas.mjs`:
- `screenshotQuerySchema` — GET query params (string coercion, boolString transform)
- `screenshotBodySchema` — POST body (native types, refine: tweetId or tweetUrl required)
- `createKeySchema` — admin key creation
- `signupSchema` — email required
- `checkoutSchema` — email + tier (pro/business only)
- `portalSchema` — email + optional returnUrl
- `demoQuerySchema` — subset of screenshotQuerySchema (no format, scale, or custom colors)

## Error Response Format

All errors: `{ error: "message", code: "SCREAMING_SNAKE_CASE", requestId?: "uuid" }`.
Validation errors add: `{ details: [{ field, message }] }`. `requestId` included when `req.id` is available (middleware and route errors, not validation).

## Response Headers (Authenticated Requests)

- `X-Request-ID` — UUID per request
- `X-Credits-Limit` — Monthly credit cap
- `X-Credits-Remaining` — Remaining credits
- `X-Tweet-ID` — Tweet ID (screenshot routes)
- `X-Tweet-Author` — Tweet author handle (screenshot routes)
- `X-Render-Time-Ms` — Render duration in ms (screenshot + demo routes)
