# Feature Inventory

## CLI Features (tweet-shots.mjs)

- **Single tweet** — `tweet-shots <url-or-id> [options]`
- **Batch** — `--batch <file>` reads URLs from text file, 500ms delay between, `--batch-dir` for output
- **Thread** — `--thread` walks parent chain (same author only), renders as single image with connector lines; `--thread-pdf` for PDF export
- **Translation** — `--translate <lang>` via GPT-4o-mini (requires `OPENAI_API_KEY`)
- **Logo/watermark** — `--logo <url>` with position (top/bottom) + size options; renders as flex row (not position:absolute)
- **PDF** — Thread images combined via pdfkit, one page per tweet
- **JSON** — `-j`/`--json` outputs raw tweet data

## API Features

### Response Types (POST /screenshot)
- `image` (default) — binary PNG/SVG
- `base64` — JSON with base64-encoded image
- `url` — uploads to GCS, returns public URL

### Endpoints
- `GET /screenshot/:tweetIdOrUrl` — direct image response
- `POST /screenshot` — JSON body with options + response type
- `POST /screenshot/batch` — JSON array or CSV file upload, per-tier limits (free=10, pro=100, business=500), 5 concurrent renders, response: base64 or url
- `GET /tweet/:tweetIdOrUrl` — raw tweet JSON
- `GET /docs` — HTML docs page (browsers) or JSON (API clients), content-negotiated
- `GET /billing/signup` — HTML signup form page (client-side JS POSTs to create key)
- `POST /billing/signup` — create free-tier API key
- `POST /billing/checkout` — Stripe checkout session
- `GET /billing/usage` — credit stats (authenticated)
- `GET /billing/success` — styled post-checkout success page
- `GET /billing/cancel` — styled post-checkout cancel page
- `GET /demo/screenshot/:tweetIdOrUrl` — public demo (IP-limited, PNG only)
- Admin CRUD via `/admin/keys` and `/admin/usage`

## Rendering Options (both CLI and API)

| Option | Default | Values |
|---|---|---|
| theme | `dark` | light, dark, dim, black |
| dimension | `auto` | auto, instagramFeed, instagramStory, instagramVertical, tiktok, linkedin, twitter, facebook, youtube |
| format | `png` | png, svg |
| scale | `1` | 1, 2, 3 |
| gradient | — | sunset, ocean, forest, fire, midnight, sky, candy, peach |
| gradientFrom | — | Hex color (custom gradient start; takes priority over named gradient) |
| gradientTo | — | Hex color (custom gradient end) |
| gradientAngle | `135` | 0-360 degrees |
| backgroundColor | — | Hex color |
| textColor | — | Hex color |
| linkColor | — | Hex color |
| padding | `20` | 0-100 |
| borderRadius | `16` | 0-100 |
| frame | — | `phone` (renders card inside dark phone mockup chrome) |
| logo | — | URL to image file (watermark; requires auth route — not available on demo) |
| logoPosition | `bottom` | top, bottom |
| logoSize | `80` | 20-200 px |
| thread | `false` | Render full thread as single image (via `renderThreadToImage()`) |
| hideMetrics | `false` | Show/hide engagement stats |
| hideMedia | `false` | Show/hide images |
| hideDate | `false` | Show/hide timestamp |
| hideVerified | `false` | Show/hide checkmark |
| hideQuoteTweet | `false` | Show/hide quoted tweet |
| hideShadow | `false` | Show/hide drop shadow |
| showUrl | `false` | Show tweet URL at bottom of image |
| fontFamily | — | Custom CSS font-family name (max 100 chars) |
| fontUrl | — | URL to custom font file (.ttf/.woff/.otf) |
| fontBoldUrl | — | URL to custom bold font file (optional) |

## Notes

**Multi-image grid:** 1–4 photos auto-laid out. Heights: 1=280px, 2=220px, 3–4=160px. No option needed — driven by `mediaDetails` count.

**Font/emoji:** Emoji via Twemoji CDN (LRU cached, 500/worker). Multilingual via 13 bundled Noto Sans fonts (JP/KR/ZH/TH/AR/HE/etc). `fontUrl` fetches custom font per-request (10s timeout, not cached); not on demo route.

## Not Supported

- Twitter polls (no renderable structure in syndication API)
- Videos as video (static thumbnail only)
- Thread forward-walking (syndication API limitation — parent chain only)
