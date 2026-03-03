# Feature Inventory

## CLI Features (tweet-shots.mjs)

### Single Tweet
```bash
tweet-shots <url-or-id> [options]
```
Full option set — most complete interface.

### Batch Processing (`--batch`)
- Reads URLs/IDs from a text file (one per line, `#` for comments)
- 500ms delay between requests to avoid rate limiting
- Creates output directory if needed
- Reports success/failure per URL

### Thread Capture (`--thread`)
- Walks `tweet.parent.id_str` chain upward to find thread start
- Only includes tweets from the same author (filters cross-author replies)
- Saves individual PNG per tweet
- `--thread-pdf` wraps all images into a single PDF via pdfkit
- Thread continuation (tweets after the entry point) is NOT supported — syndication API limitation

### AI Translation (`--translate <lang>`)
- Requires `OPENAI_API_KEY` env var
- Uses `gpt-4o-mini` with `temperature: 0.3`
- Preserves emojis, @mentions, #hashtags, URLs
- Falls back to original text on API error (silent graceful degradation)
- Applied to `tweet.text` before rendering; does not translate quote tweet text

### Logo/Watermark (`--logo <url>`)
- Fetches logo URL → base64 → adds as absolute-positioned img overlay
- Positions: `top-left`, `top-right`, `bottom-left`, `bottom-right`
- Default: `bottom-right`, 40px
- Inserted via string replace: `baseHtml.replace(/<\/div>\s*$/, ...)`
- **Note:** Satori does not support `position: absolute` — the logo overlay likely does not render correctly in the final image. This is a known limitation in the current implementation.

### PDF Export
- Created from array of PNG buffers via pdfkit
- Each image gets its own page, sized to image dimensions + 40px padding
- Metadata: Title = "Thread by @username", Author = display name

## API-Only Features

### Response Types (POST /screenshot)
- `image` (default) — binary PNG/SVG
- `base64` — JSON `{ success, tweetId, author, format, data: "base64string" }`
- `url` — saves to disk, returns `{ success, tweetId, author, format, url }`

### Static Image Hosting
- `GET /images/:filename` served from `OUTPUT_DIR` (if dir exists at startup)
- Enabled by `PUBLIC_URL` + `OUTPUT_DIR` env vars

## Rendering Options (both CLI and API)

| Option | Default | Description |
|---|---|---|
| theme | `dark` | light / dark / dim / black |
| dimension | `auto` | Social media size preset |
| format | `png` | png / svg |
| scale | `1` | 1 / 2 / 3 (Resvg upscale) |
| backgroundGradient | — | Named gradient preset |
| backgroundColor | — | Hex color override |
| backgroundImage | — | URL (CLI only; requires base64 pre-fetch) |
| textColor | — | Override primary text color |
| linkColor | — | Override link/mention/hashtag color |
| padding | `20` | px |
| borderRadius | `16` | px |
| showMetrics | `true` | Engagement stats section |
| hideMedia | `false` | Images/video thumbnails |
| hideDate | `false` | Timestamp |
| hideVerified | `false` | Blue checkmark badge |
| hideQuoteTweet | `false` | Quoted tweet card (CLI only) |
| hideShadow | `false` | Drop shadow |

**CLI-only features:** `backgroundImage`, `hideQuoteTweet`, logo/watermark, batch, thread, translation, PDF

**API-only features:** `base64` and `url` response types

## What's NOT Supported
- Polls (mentioned in README as not supported)
- Twitter videos as video (rendered as static thumbnail)
- Thread forward-walking (only backward via parent chain)
- Multiple images in a tweet (only first image rendered)
- Profile picture in quote tweet always fetched at `_400x400` size in CLI, but not in API
