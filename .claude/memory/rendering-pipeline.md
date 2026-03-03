# Rendering Pipeline

## Core Flow

```
fetchTweet(id) → pre-fetch images to base64 → generateTweetHtml() → html() → satori() → Resvg → PNG/SVG
```

All rendering lives in `core.mjs`. Both CLI (`tweet-shots.mjs`) and API (via `render-worker.mjs`) import from it.

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

`fetchImageAsBase64()` returns `null` on failure (silent degradation — image simply missing).

## Height Estimation

Calculated, not measured. **Can overflow** (Satori clips silently at declared height):

```
base=140+2*padding, text=ceil(len/45)*28, media=320, quote=120, metrics=60, date=40
```

No retry or overflow detection. Known limitation — CJK text and heavy newlines are worst case.

## Worker Thread Pool

`render-pool.mjs` manages N workers (default: `cpus - 1`, min 2). Each worker imports `core.mjs` independently. Image buffers are transferred (not copied) via `postMessage` transferable. Pool auto-replaces crashed workers. Skipped in test env (`NODE_ENV=test`).

## Scale Factor

Satori always renders at 1x. Scale is applied by Resvg: `fitTo: { mode: 'width', value: scaledWidth }`.

## Constants

- **THEMES:** light, dark (default), dim, black → `{ bg, text, textSecondary, border, link }`
- **DIMENSIONS:** auto (550px), instagramFeed (1080x1080), instagramStory (1080x1920), etc.
- **GRADIENTS:** sunset, ocean, forest, fire, midnight, sky, candy, peach
