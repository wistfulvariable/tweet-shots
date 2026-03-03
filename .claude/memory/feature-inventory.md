# Feature Inventory

## CLI Features (tweet-shots.mjs)

- **Single tweet** — `tweet-shots <url-or-id> [options]`
- **Batch** — `--batch <file>` reads URLs from text file, 500ms delay between, `--batch-dir` for output
- **Thread** — `--thread` walks parent chain (same author only), `--thread-pdf` for PDF export
- **Translation** — `--translate <lang>` via GPT-4o-mini (requires `OPENAI_API_KEY`)
- **Logo** — `--logo <url>` with position/size options (**broken** — Satori doesn't support `position: absolute`)
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
- `GET /tweet/:tweetIdOrUrl` — raw tweet JSON
- `POST /billing/signup` — create free-tier API key
- `POST /billing/checkout` — Stripe checkout session
- `GET /billing/usage` — credit stats (authenticated)
- Admin CRUD via `/admin/keys` and `/admin/usage`

## Rendering Options (both CLI and API)

| Option | Default | Values |
|---|---|---|
| theme | `dark` | light, dark, dim, black |
| dimension | `auto` | auto, instagramFeed, instagramStory, instagramVertical, tiktok, linkedin, twitter, facebook, youtube |
| format | `png` | png, svg |
| scale | `1` | 1, 2, 3 |
| gradient | — | sunset, ocean, forest, fire, midnight, sky, candy, peach |
| backgroundColor | — | Hex color |
| textColor | — | Hex color |
| linkColor | — | Hex color |
| padding | `20` | 0-100 |
| borderRadius | `16` | 0-100 |
| hideMetrics | `false` | Show/hide engagement stats |
| hideMedia | `false` | Show/hide images |
| hideDate | `false` | Show/hide timestamp |
| hideVerified | `false` | Show/hide checkmark |
| hideQuoteTweet | `false` | Show/hide quoted tweet |
| hideShadow | `false` | Show/hide drop shadow |

## Not Supported

- Twitter polls (no renderable structure in syndication API)
- Videos as video (static thumbnail only)
- Thread forward-walking (syndication API limitation)
- Multiple images per tweet (only first rendered)
- Emoji rendering (shows empty boxes — `loadAdditionalAsset` disabled)
