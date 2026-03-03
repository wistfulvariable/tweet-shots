# API Routes & Middleware

## Middleware Stack (applied in order)
```
helmet({ contentSecurityPolicy: false })
cors()                   → all origins allowed
express.json()
request logger           → console.log timestamp + method + path
```

## Auth Middleware: `authenticate`
- Reads `X-API-KEY` header or `?apiKey=` query param
- Looks up in `apiKeys` map (loaded from `api-keys.json` at startup, held in memory)
- Sets `req.apiKey` and `req.keyData` on success
- Returns `401 { error, code: "MISSING_API_KEY" | "INVALID_API_KEY" }`

## Rate Limit Middleware: `applyRateLimit`
- One `express-rate-limit` instance per tier, stored in `rateLimiters` map
- Key generator is `req.apiKey` (not IP)
- Limits: free=10/min, pro=100/min, business=1000/min
- Returns `{ error: "Rate limit exceeded", code: "RATE_LIMITED" }` on breach

## Route Summary

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | `{ status: "ok", timestamp }` |
| GET | `/` | None | Landing HTML (if Accept: text/html) or JSON info |
| GET | `/docs` | None | Inline API documentation JSON |
| GET | `/pricing` | None | Plan listing JSON |
| GET | `/screenshot/:tweetIdOrUrl` | API key | Generate + return image binary |
| POST | `/screenshot` | API key | Generate with JSON options, multiple response types |
| GET | `/tweet/:tweetIdOrUrl` | API key | Raw tweet JSON from syndication API |
| GET | `/billing/usage` | API key | Current month usage stats |
| POST | `/billing/signup` | None | Create free-tier key by email |
| POST | `/admin/keys` | Admin key | Create API key |
| GET | `/admin/keys` | Admin key | List keys (key prefix masked) |
| DELETE | `/admin/keys/:key` | Admin key | Soft-revoke key (sets `active: false`) |
| GET | `/admin/usage` | Admin key | All usage stats |
| `/images/*` | — | None | Static file serving from `OUTPUT_DIR` (if dir exists) |

## GET /screenshot/:tweetIdOrUrl
- Query params map to render options (see API.md for full list)
- `hideMetrics=true` → `showMetrics: false` (inverted param name vs internal option)
- `radius` query param maps to `borderRadius` option
- `gradient` query param maps to `backgroundGradient` option
- Response headers: `Content-Type`, `X-Tweet-ID`, `X-Tweet-Author`

## POST /screenshot
- Body: `{ tweetId, tweetUrl, response, theme, dimension, format, scale, gradient, bgColor, ... }`
- `tweetId` or `tweetUrl` accepted (both run through `extractTweetId`)
- `response` type: `"image"` (default) | `"base64"` | `"url"`
- `"url"` response requires `PUBLIC_URL` env var; saves to `OUTPUT_DIR`
- `hideMetrics` (bool) and `showMetrics` (bool) both work; `hideMetrics: true` takes priority

## Admin Auth
```js
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin-secret-key';
// Compared directly: adminKey !== ADMIN_KEY
```
Default `'admin-secret-key'` is used if env not set — deployment risk.

## Error Response Shape
```json
{ "error": "Human-readable message", "code": "SCREAMING_SNAKE_CASE" }
```
All route-level errors return 400. Unhandled express errors return 500.

## Usage Tracking
`trackUsage(apiKey)` increments in-memory `usage` object and saves to disk every 10 calls.
Called after successful render, before sending response.
