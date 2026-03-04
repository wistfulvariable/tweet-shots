# Rendering Pipeline

## Core Flow

```
fetchTweet(id) → pre-fetch images to base64 → generateTweetHtml() → html() → satori() → Resvg → PNG/SVG
```

Rendering logic is split across focused modules (all re-exported via `core.mjs` for backward compatibility):
- `tweet-fetch.mjs` — `fetchTweet`, `extractTweetId`, `fetchThread`
- `tweet-html.mjs` — `generateTweetHtml`, themes, gradients, formatting
- `tweet-render.mjs` — `renderTweetToImage`, `loadFonts`, image pre-fetching
- `tweet-emoji.mjs` — `fetchEmoji`, `emojiToCodepoint`, Twemoji CDN fetch + cache
- `tweet-fonts.mjs` — `loadLanguageFont`, `getSupportedLanguages`, Noto Sans lazy loading
- `tweet-utils.mjs` — `translateText`, `processBatch`, `generatePDF` (CLI-only)

## Satori Constraints (CRITICAL)

- **Flexbox only** — `display: flex` required on every container element
- **No** `position: absolute/fixed`, CSS Grid, `overflow: scroll`, `display: block`
- **Images must be data URIs** — Satori cannot load remote URLs at render time
- **Inline styles only** — no CSS classes, stylesheets, or `<style>` tags
- `loadAdditionalAsset` delegates to `fetchEmoji` (emoji→SVG) and `loadLanguageFont` (script→font)

## Font Loading

**Primary (Latin):** Bundled `fonts/Inter-Regular.woff` + `fonts/Inter-Bold.woff` (always loaded).
**Fallback (Latin):** Google Fonts CDN URLs (Inter TTF v20). Only used if bundled fonts are missing.
**Multilingual:** 13 Noto Sans fonts in `fonts/` — lazy-loaded by `loadLanguageFont()` when Satori encounters non-Latin text. Cached per-process per-language in module-level Map.
**Custom fonts:** Users can provide `fontUrl` (+ optional `fontBoldUrl`) to fetch a custom font at render time via `fetchFontAsArrayBuffer()` (10s timeout). Custom fonts replace Inter in the Satori `fonts` array. If fetch fails, falls back to default Inter silently. `fontFamily` option overrides the CSS `font-family` in generated HTML (default fallback stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ...`). If `fontUrl` given without `fontFamily`, the Satori font name defaults to `"CustomFont"`. Custom fonts are NOT cached across requests (per-render fetch).

Fonts are cached in `_cachedFonts` (Inter) and `_fontCache` (Noto Sans) module-level variables. Node `Buffer.buffer` is a shared ArrayBuffer pool — must copy to a new `ArrayBuffer` before passing to Satori.

## Emoji Rendering

`tweet-emoji.mjs` handles `loadAdditionalAsset(code='emoji', segment)`:
- Converts emoji grapheme → Twemoji hex codepoint format (hyphen-joined, FE0F stripped)
- Fetches SVG from jsdelivr CDN (`jdecked/twemoji@latest`) with 5s timeout
- In-memory LRU cache (max 500 entries) per-process/per-worker
- Negative 404 results cached (unknown emoji). Network errors NOT cached (transient).
- Graceful fallback: returns null → Satori renders empty box (no crash).

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
header=76, text=ceil(len/45)*28, media=300, quote=120, metrics=56, date=40, url=36, +2*padding
```

No retry or overflow detection. Known limitation — CJK text and heavy newlines are worst case.

## Worker Thread Pool

`render-pool.mjs` manages N workers (default: `cpus - 1`, min 2). Each worker imports `tweet-render.mjs` directly (which imports tweet-emoji.mjs and tweet-fonts.mjs — each worker gets its own emoji/font caches). Image buffers are transferred (not copied) via `postMessage` transferable. Pool auto-replaces crashed workers. Skipped in test env (`NODE_ENV=test`).

Dynamic timeout: `30s base + 5s per media image, max 60s`. `countMediaImages()` counts main + quote tweet images. Timeout errors return 504 with `RENDER_TIMEOUT` code. `settled` flag prevents race between timeout and successful completion.

## Scale Factor

Satori always renders at 1x. Scale is applied by Resvg: `fitTo: { mode: 'width', value: scaledWidth }`.

## Constants

- **THEMES:** light, dark (default), dim, black → `{ bg, text, textSecondary, border, link }`
- **DIMENSIONS:** auto (550px), instagramFeed (1080x1080), instagramStory (1080x1920), etc.
- **GRADIENTS:** sunset, ocean, forest, fire, midnight, sky, candy, peach
