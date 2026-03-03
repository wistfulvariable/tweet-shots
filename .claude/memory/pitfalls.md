# Pitfalls & Gotchas

## RESOLVED: Code Duplication Between CLI and API

**Fixed.** All shared rendering logic now lives in `core.mjs`. Both `tweet-shots.mjs` (CLI) and `api-server.mjs` import from it. `core.mjs` is the single source of truth for:
- `THEMES`, `DIMENSIONS`, `GRADIENTS` constants
- `extractTweetId()`, `fetchTweet()`, `fetchImageAsBase64()`
- `formatDate()`, `formatNumber()`
- `generateTweetHtml()` — full version with quote tweets, SVG icons, entity colorization
- `loadFonts()` — with module-level font cache
- `renderTweetToImage()`

**When modifying rendering logic, only edit `core.mjs`.** Do not re-introduce duplicates in `tweet-shots.mjs` or `api-server.mjs`.

## RESOLVED: API Server Had Simplified/Diverged generateTweetHtml

**Fixed.** The API server now uses the full `generateTweetHtml` from `core.mjs`, which includes:
- Quote tweet rendering
- URL/mention/hashtag entity colorization (blue links)
- SVG metric icons (not emoji)
- `textSecondaryColor` and `hideQuoteTweet` options

## RESOLVED: Font Loading on Every Render

**Fixed.** `loadFonts()` in `core.mjs` caches fonts in `_cachedFonts` (module-level). First call fetches from Google Fonts CDN; subsequent calls return the cache. Cache is per-process (server restart clears it).

## Height Estimation Can Overflow (still active)

The calculated Satori height is based on character count approximation. Long tweets, CJK text, or content with many newlines can exceed the calculated height and be silently clipped — Satori clips to the declared height with no error.

```js
// core.mjs — height formula
baseHeight = 140 + (padding * 2)
textHeight = Math.ceil(textLength / 45) * 28   // ~45 chars/line assumed
mediaHeight = hasMedia ? 320 : 0
quoteTweetHeight = hasQuoteTweet ? 120 : 0
```
No fallback or retry. Still a known limitation.

## Logo Overlay Likely Doesn't Render (still active)

`addLogoToHtml()` (core.mjs) injects `position: absolute` styling, which Satori does not support. The logo watermark feature cannot work as implemented.

## Thread Walking Only Goes Backward (still active)

`fetchThread()` walks `parent.id_str` chain upward — cannot discover tweets after the starting point. Syndication API limitation; no fix available.

## API Keys Loaded at Startup Only (still active)

`apiKeys` and `usage` maps are loaded from disk once at startup. **Exception:** Stripe subscription callbacks (`onKeySync`, `onKeyRevoke`) do update the in-memory map at runtime. External edits to `api-keys.json` still require restart.

## RESOLVED: No Rate Limiting on /billing/signup

**Fixed.** `POST /billing/signup` now has `signupLimiter`: 5 requests per 15 minutes per IP.

## Implicit String → Number Coercions (still active)

Query params are strings. `parseInt(req.query.scale) || 1` silently falls back to `1` for invalid values like `scale=abc`. Same for `padding` and `radius`.

## Usage Not Saved on Crash (still active)

Usage saves every 10 calls. Up to 9 records lost on crash. File writes are not atomic — crash mid-write can corrupt `usage.json`.

## TweetId in URL Must Be Decoded

`GET /screenshot/:tweetIdOrUrl` calls `decodeURIComponent()` before `extractTweetId`. Full tweet URLs passed as path params must be URL-encoded by the client. Short numeric IDs work without encoding.
