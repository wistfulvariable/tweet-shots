# tweet-shots API

A production-ready REST API for generating tweet/X screenshots as PNG or SVG — no browser automation.

## Quick Start

```bash
npm install
npm start          # http://localhost:3000
npm run dev        # auto-reload for development
```

---

## Authentication

All API requests (except `/demo/*`, `/health`, `/pricing`, `/docs`, `/`) require an API key.

| Method | Format |
|--------|--------|
| Header | `X-API-KEY: ts_free_abc123...` |
| Query | `?apiKey=ts_free_abc123...` |

Obtain a key via the `/billing/signup` endpoint or the admin panel.

---

## Endpoints

### GET /screenshot/:tweetIdOrUrl

Returns a screenshot image (PNG by default).

```bash
curl -H "X-API-KEY: <key>" \
  "https://api.example.com/screenshot/1617979122625712128?theme=dark&scale=2" \
  -o tweet.png
```

**URL parameter:** a tweet ID or full tweet URL (URL-encoded when using the full URL).

**Query parameters:**

| Param | Values | Default | Description |
|-------|--------|---------|-------------|
| `theme` | `light` `dark` `dim` `black` | `dark` | Color theme |
| `dimension` | `auto` `instagramFeed` `instagramStory` `instagramVertical` `tiktok` `linkedin` `twitter` `facebook` `youtube` | `auto` | Canvas size preset |
| `format` | `png` `svg` | `png` | Output format |
| `scale` | `1` `2` `3` | `2` | Resolution multiplier (2 = retina) |
| `gradient` | `sunset` `ocean` `forest` `fire` `midnight` `sky` `candy` `peach` | — | Named background gradient |
| `gradientFrom` | `#rrggbb` | — | Custom gradient start color (requires `gradientTo`) |
| `gradientTo` | `#rrggbb` | — | Custom gradient end color (requires `gradientFrom`) |
| `gradientAngle` | `0`–`360` | `135` | Custom gradient angle in degrees |
| `bgColor` | `#rrggbb` | — | Solid background color |
| `textColor` | `#rrggbb` | — | Override primary text color |
| `linkColor` | `#rrggbb` | — | Override link/mention/hashtag color |
| `hideMetrics` | `true` `false` | `false` | Hide engagement stats |
| `hideMedia` | `true` `false` | `false` | Hide images |
| `hideDate` | `true` `false` | `false` | Hide timestamp |
| `hideVerified` | `true` `false` | `false` | Hide verified badge |
| `hideQuoteTweet` | `true` `false` | `false` | Hide quoted tweet |
| `hideShadow` | `true` `false` | `false` | Hide drop shadow |
| `showUrl` | `true` `false` | `false` | Show tweet URL at bottom |
| `padding` | `0`–`100` | `20` | Padding in pixels |
| `radius` | `0`–`100` | `16` | Card border radius |
| `fontFamily` | string | — | Custom font family name |
| `fontUrl` | URL | — | Custom font file URL (.ttf/.woff/.otf) |
| `fontBoldUrl` | URL | — | Custom bold font URL |
| `logo` | URL | — | Watermark/logo image URL |
| `logoPosition` | `top-left` `top-right` `bottom-left` `bottom-right` | `bottom-right` | Logo placement |
| `logoSize` | `16`–`200` | `40` | Logo size in pixels |
| `frame` | `phone` | — | Wrap tweet in phone mockup frame |
| `thread` | `true` `false` | `false` | Render full thread as a single image |

**Response headers:**
```
Content-Type: image/png
X-Tweet-ID: 1617979122625712128
X-Author: karpathy
X-Render-Time-Ms: 342
X-Credits-Used: 1
X-Credits-Remaining: 49
```

---

### POST /screenshot

More control: JSON body with explicit response format.

```bash
curl -X POST -H "X-API-KEY: <key>" \
  -H "Content-Type: application/json" \
  -d '{
    "tweetId": "1617979122625712128",
    "theme": "dark",
    "dimension": "instagramFeed",
    "gradientFrom": "#1a1a2e",
    "gradientTo": "#16213e",
    "response": "base64"
  }' \
  https://api.example.com/screenshot
```

**Body fields** (all render params from GET are supported, plus):

| Field | Values | Default | Description |
|-------|--------|---------|-------------|
| `tweetId` | string | — | Tweet ID *(required if no tweetUrl)* |
| `tweetUrl` | string | — | Full tweet URL *(required if no tweetId)* |
| `response` | `image` `base64` `url` | `image` | Response format |
| `backgroundGradient` | same as GET `gradient` | — | Named gradient (alias) |
| `backgroundColor` | `#rrggbb` | — | Background color (alias for `bgColor`) |
| `showMetrics` | boolean | — | Show/hide metrics (overrides `hideMetrics`) |
| `borderRadius` | `0`–`100` | — | Card border radius (alias for `radius`) |
| `logo` | URL | — | Watermark/logo image URL |
| `logoPosition` | `top-left` `top-right` `bottom-left` `bottom-right` | `bottom-right` | Logo placement |
| `logoSize` | `16`–`200` | `40` | Logo size in pixels |
| `frame` | `phone` | — | Phone mockup frame |
| `gradientFrom` | `#rrggbb` | — | Custom gradient start |
| `gradientTo` | `#rrggbb` | — | Custom gradient end |
| `gradientAngle` | `0`–`360` | `135` | Custom gradient angle |
| `thread` | boolean | `false` | Render full thread as a single image |

**Response format — `"response": "base64"`:**
```json
{
  "success": true,
  "tweetId": "1617979122625712128",
  "author": "karpathy",
  "format": "png",
  "data": "iVBORw0KGgo..."
}
```

**Response format — `"response": "url"`:**
```json
{
  "success": true,
  "tweetId": "1617979122625712128",
  "author": "karpathy",
  "format": "png",
  "url": "https://storage.googleapis.com/tweet-shots-screenshots/..."
}
```

---

### POST /screenshot/batch

Render multiple tweets in one request. Accepts JSON or `multipart/form-data` with a CSV file.

**JSON:**
```bash
curl -X POST -H "X-API-KEY: <key>" \
  -H "Content-Type: application/json" \
  -d '{
    "urls": ["1617979122625712128", "https://x.com/user/status/123456"],
    "theme": "dark",
    "response": "base64"
  }' \
  https://api.example.com/screenshot/batch
```

**Multipart (CSV file):**
```bash
curl -X POST -H "X-API-KEY: <key>" \
  -F "file=@tweet-ids.csv" \
  -F "theme=dark" \
  -F "response=base64" \
  https://api.example.com/screenshot/batch
```

CSV format: one tweet ID or URL per line, optional header row.

**Response:**
```json
{
  "results": [
    { "url": "1617979122625712128", "success": true, "data": "iVBORw0KGgo..." },
    { "url": "123456", "success": false, "error": "Tweet not found" }
  ],
  "total": 2,
  "succeeded": 1,
  "failed": 1
}
```

**Tier limits:**

| Tier | Max tweets/batch |
|------|-----------------|
| free | 10 |
| pro | 100 |
| business | 500 |

All render options from POST /screenshot are supported. `logo`, `fontUrl`, and `fontBoldUrl` are available here but not on the demo endpoint.

---

### GET /demo/screenshot/:tweetIdOrUrl

Public endpoint for the interactive demo — no API key required, IP rate-limited (10 req/15 min).

Same as GET `/screenshot` but **`logo`, `fontUrl`, and `fontBoldUrl` are excluded** to prevent SSRF attacks on the public endpoint.

```bash
curl "https://api.example.com/demo/screenshot/1617979122625712128?theme=dark&frame=phone"
```

---

### GET /tweet/:tweetId

Returns raw tweet data as JSON (useful for debugging or building custom renderers).

```bash
curl -H "X-API-KEY: <key>" \
  https://api.example.com/tweet/1617979122625712128
```

---

### GET /health

Returns API health status — no auth required.

```bash
curl https://api.example.com/health
```

```json
{ "status": "ok", "timestamp": "2025-01-15T12:00:00.000Z" }
```

---

### GET /pricing

Returns tier pricing information — no auth required.

---

## Rendering Features

### Multi-image Grid

Tweets with multiple photos are rendered in a responsive grid:

| Photo count | Layout |
|-------------|--------|
| 1 | Full width, 280px tall |
| 2 | Side-by-side, 220px tall |
| 3 | Left half + stacked right column |
| 4 | 2×2 grid, 160px per cell |

### Thread Rendering

Set `thread=true` to capture an entire thread as a single image. The API walks the parent chain up to 10 tweets and renders them top-to-bottom with connector lines and shared avatar.

```bash
# GET
curl -H "X-API-KEY: <key>" \
  "https://api.example.com/screenshot/1234567890?thread=true"

# POST
curl -X POST -H "X-API-KEY: <key>" -H "Content-Type: application/json" \
  -d '{"tweetId": "1234567890", "thread": true, "response": "base64"}' \
  https://api.example.com/screenshot
```

### Phone Mockup Frame

Wrap the tweet card in a realistic iPhone-style bezel:

```bash
curl -H "X-API-KEY: <key>" \
  "https://api.example.com/screenshot/1234567890?frame=phone&backgroundGradient=ocean"
```

### Custom Gradient Background

Specify exact gradient colors instead of named presets:

```bash
curl -H "X-API-KEY: <key>" \
  "https://api.example.com/screenshot/1234567890?gradientFrom=%23ff6b6b&gradientTo=%234ecdc4&gradientAngle=120"
```

The custom gradient takes priority over the named `gradient` parameter.

### Logo / Watermark

Add a custom watermark image (URL must be publicly accessible):

```bash
curl -H "X-API-KEY: <key>" \
  "https://api.example.com/screenshot/1234567890?logo=https%3A%2F%2Fexample.com%2Flogo.png&logoPosition=bottom-right&logoSize=40"
```

*Not available on the `/demo/` endpoint.*

---

## Rate Limits

| Tier | Requests/min | Monthly Credits |
|------|-------------|----------------|
| free | 10 | 50 |
| pro | 100 | 1,000 |
| business | 1,000 | 10,000 |

Rate limit headers are returned on every response:
```
X-Credits-Used: 1
X-Credits-Remaining: 49
```

---

## Billing Endpoints

### POST /billing/signup

Register an email to receive an API key.

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "name": "Your Name"}' \
  https://api.example.com/billing/signup
```

### POST /billing/checkout

Create a Stripe checkout session for Pro or Business upgrade.

```bash
curl -X POST -H "X-API-KEY: <key>" \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "tier": "pro"}' \
  https://api.example.com/billing/checkout
```

### POST /billing/portal

Get a Stripe customer portal URL to manage/cancel subscription.

```bash
curl -X POST -H "X-API-KEY: <key>" \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com"}' \
  https://api.example.com/billing/portal
```

---

## Admin Endpoints

Require `X-Admin-Key` header (must be at least 16 characters, set via `ADMIN_KEY` env var).

### POST /admin/keys — Create API key

```bash
curl -X POST -H "X-Admin-Key: <admin-key>" \
  -H "Content-Type: application/json" \
  -d '{"name": "My App", "tier": "pro"}' \
  https://api.example.com/admin/keys
```

### GET /admin/keys — List all keys

```bash
curl -H "X-Admin-Key: <admin-key>" https://api.example.com/admin/keys
```

### DELETE /admin/keys/:keyId — Revoke key

```bash
curl -X DELETE -H "X-Admin-Key: <admin-key>" \
  https://api.example.com/admin/keys/ts_pro_abc123
```

### GET /admin/usage — Usage statistics

```bash
curl -H "X-Admin-Key: <admin-key>" https://api.example.com/admin/usage
```

---

## Error Responses

All errors return JSON:

```json
{
  "error": "Human-readable message",
  "code": "SCREAMING_SNAKE_CASE_CODE",
  "requestId": "optional-correlation-id"
}
```

Common error codes:

| Code | Status | Cause |
|------|--------|-------|
| `INVALID_REQUEST` | 400 | Validation failed (see `error` for details) |
| `TWEET_NOT_FOUND` | 404 | Tweet unavailable (private/deleted) |
| `INVALID_TWEET_ID` | 400 | Bad tweet ID or URL |
| `UNAUTHORIZED` | 401 | Missing or invalid API key |
| `RATE_LIMIT_EXCEEDED` | 429 | Per-minute rate limit hit |
| `CREDITS_EXHAUSTED` | 402 | Monthly credit limit reached |
| `RENDER_TIMEOUT` | 504 | Tweet took too long (try `hideMedia=true`) |
| `DEMO_SCREENSHOT_FAILED` | 500 | Demo render failed |

---

## Deployment

### Google Cloud Run (recommended)

```bash
gcloud run deploy tweet-shots-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 2 \
  --project tweet-shots-api
```

Set secrets via Secret Manager and mount as environment variables in Cloud Run.

### Docker

```bash
docker build -t tweet-shots .
docker run -p 8080:8080 \
  -e ADMIN_KEY=your-secret-key-here \
  -e NODE_ENV=production \
  tweet-shots
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ADMIN_KEY` | **Yes** | — | Admin endpoint auth (min 16 chars) |
| `PORT` | No | `3000` | Server bind port |
| `HOST` | No | `0.0.0.0` | Server bind address |
| `NODE_ENV` | No | `development` | `development` / `production` / `test` |
| `STRIPE_SECRET_KEY` | For billing | — | Stripe secret key |
| `STRIPE_PRICE_PRO` | For billing | — | Stripe Price ID for Pro tier |
| `STRIPE_PRICE_BUSINESS` | For billing | — | Stripe Price ID for Business tier |
| `STRIPE_WEBHOOK_SECRET` | For billing | — | Stripe webhook signature secret |
| `GCS_BUCKET` | For URL response | `tweet-shots-screenshots` | Cloud Storage bucket name |
| `FIREBASE_WEB_API_KEY` | For dashboard | — | Firebase public web API key |
| `FIREBASE_AUTH_DOMAIN` | For dashboard | — | Firebase auth domain |
| `OPENAI_API_KEY` | For translation | — | GPT-4o-mini translation API key |

---

## Integration Examples

### JavaScript / Node.js

```javascript
// Single tweet — image response
const res = await fetch('https://api.example.com/screenshot/1617979122625712128?theme=dark&scale=2', {
  headers: { 'X-API-KEY': 'ts_pro_your-key' },
});
const imageBuffer = Buffer.from(await res.arrayBuffer());

// Single tweet — base64 response with phone frame
const res2 = await fetch('https://api.example.com/screenshot', {
  method: 'POST',
  headers: { 'X-API-KEY': 'ts_pro_your-key', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tweetId: '1617979122625712128',
    theme: 'dark',
    frame: 'phone',
    backgroundGradient: 'ocean',
    response: 'base64',
  }),
});
const { data } = await res2.json();
const imageBuffer2 = Buffer.from(data, 'base64');

// Thread as single image
const res3 = await fetch('https://api.example.com/screenshot', {
  method: 'POST',
  headers: { 'X-API-KEY': 'ts_pro_your-key', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tweetId: '1617979122625712128',
    thread: true,
    gradientFrom: '#1a1a2e',
    gradientTo: '#16213e',
    response: 'base64',
  }),
});
```

### Python

```python
import requests
import base64

# Single tweet with custom gradient and logo
response = requests.post(
    'https://api.example.com/screenshot',
    headers={'X-API-KEY': 'ts_pro_your-key'},
    json={
        'tweetId': '1617979122625712128',
        'theme': 'dark',
        'gradientFrom': '#ff6b6b',
        'gradientTo': '#4ecdc4',
        'logo': 'https://example.com/logo.png',
        'logoPosition': 'bottom-right',
        'response': 'base64',
    }
)
data = response.json()
image_bytes = base64.b64decode(data['data'])
with open('tweet.png', 'wb') as f:
    f.write(image_bytes)
```

### cURL — quick examples

```bash
# Dark theme, retina resolution
curl -H "X-API-KEY: <key>" \
  "https://api.example.com/screenshot/1617979122625712128?theme=dark&scale=2" \
  -o tweet.png

# Instagram feed size with ocean gradient
curl -H "X-API-KEY: <key>" \
  "https://api.example.com/screenshot/1617979122625712128?dimension=instagramFeed&gradient=ocean" \
  -o instagram.png

# Phone frame with custom purple gradient
curl -H "X-API-KEY: <key>" \
  "https://api.example.com/screenshot/1617979122625712128?frame=phone&gradientFrom=%236c5ce7&gradientTo=%23a29bfe" \
  -o phone.png

# Thread as single image
curl -H "X-API-KEY: <key>" \
  "https://api.example.com/screenshot/1617979122625712128?thread=true&theme=dark" \
  -o thread.png

# Batch render
curl -X POST -H "X-API-KEY: <key>" \
  -H "Content-Type: application/json" \
  -d '{"urls":["id1","id2","id3"],"theme":"dark","response":"base64"}' \
  https://api.example.com/screenshot/batch
```

---

## Pricing

| Plan | Price | Credits/month | Rate limit |
|------|-------|--------------|------------|
| Free | $0 | 50 | 10 req/min |
| Pro | $9/mo | 1,000 | 100 req/min |
| Business | $49/mo | 10,000 | 1,000 req/min |
