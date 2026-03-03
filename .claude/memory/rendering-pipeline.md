# Rendering Pipeline

## Core Flow

```
fetchTweet(id) → pre-fetch images to base64 → generateTweetHtml() → html() → satori() → Resvg → PNG/SVG
```

Rendering logic is split across focused modules (all re-exported via `core.mjs` for backward compatibility):
- `tweet-fetch.mjs` — `fetchTweet`, `extractTweetId`, `fetchThread`
- `tweet-html.mjs` — `generateTweetHtml`, themes, gradients, formatting
- `tweet-render.mjs` — `renderTweetToImage`, `loadFonts`, image pre-fetching
- `tweet-utils.mjs` — `translateText`, `processBatch`, `generatePDF` (CLI-only)

## Satori Constraints (CRITICAL)

- **Flexbox only** — `display: flex` required on every container element
- **No** `position: absolute/fixed`, CSS Grid, `overflow: scroll`, `display: block`
- **Images must be data URIs** — Satori cannot load remote URLs at render time
- **Inline styles only** — no CSS classes, stylesheets, or `<style>` tags
- `loadAdditionalAsset` is set to `async () => undefined` to prevent network emoji/font fallback

## Font Loading

**Primary:** Bundled `fonts/Inter-Regular.woff` + `fonts/Inter-Bold.woff` (no network needed).
**Fallback:** Google Fonts CDN URLs (Inter TTF v20). Only used if bundled fonts are missing.

Fonts are cached in `_cachedFonts` module-level variable (per-process, cleared on restart). Node `Buffer.buffer` is a shared ArrayBuffer pool — must copy to a new `ArrayBuffer` before passing to Satori.

## Image Pre-fetching

Before Satori call, `renderTweetToImage()` replaces all URLs with base64 data URIs:
- Profile pic: `_normal` → `_400x400` for high-res
- Media: from `mediaDetails[].media_url_https` or `photos[].url`
- Quote tweet: profile pic + first media image
- Logo (if provided)

`fetchImageAsBase64()` has 10s per-image timeout via AbortController. Returns `null` on failure (silent degradation — image simply missing). Twitter CDN images capped at `medium` size (1200px) — `large` (2048px) causes timeouts on multi-image tweets.

## Height Estimation

Calculated, not measured. **Can overflow** (Satori clips silently at declared height):

```
base=140+2*padding, text=ceil(len/45)*28, media=320, quote=120, metrics=60, date=40
```

No retry or overflow detection. Known limitation — CJK text and heavy newlines are worst case.

## Worker Thread Pool

`render-pool.mjs` manages N workers (default: `cpus - 1`, min 2). Each worker imports `tweet-render.mjs` directly. Image buffers are transferred (not copied) via `postMessage` transferable. Pool auto-replaces crashed workers. Skipped in test env (`NODE_ENV=test`).

Dynamic timeout: `30s base + 5s per media image, max 60s`. `countMediaImages()` counts main + quote tweet images. Timeout errors return 504 with `RENDER_TIMEOUT` code. `settled` flag prevents race between timeout and successful completion.

## Scale Factor

Satori always renders at 1x. Scale is applied by Resvg: `fitTo: { mode: 'width', value: scaledWidth }`.

## Constants

- **THEMES:** light, dark (default), dim, black → `{ bg, text, textSecondary, border, link }`
- **DIMENSIONS:** auto (550px), instagramFeed (1080x1080), instagramStory (1080x1920), etc.
- **GRADIENTS:** sunset, ocean, forest, fire, midnight, sky, candy, peach
