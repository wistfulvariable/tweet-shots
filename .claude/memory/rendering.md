# Rendering Pipeline

## Source of Truth: core.mjs

All rendering code lives in `core.mjs`. Both `tweet-shots.mjs` (CLI) and `api-server.mjs` import from it. Never duplicate rendering logic in other files.

## Core Flow
```
fetchTweet(id) → pre-fetch all images to base64 → generateTweetHtml() → html() → satori() → Resvg → PNG/SVG
```

## Satori Constraints (CRITICAL)
- Only Flexbox layout — `display: flex` required on every container
- No `position: absolute/fixed`, no CSS Grid, no `overflow: scroll`
- Images MUST be data URIs — Satori cannot load remote URLs at render time
- Inline styles only — no CSS classes or stylesheets
- SVG elements inline in JSX work, but must use correct Satori attribute names

## Image Pre-fetching (core.mjs — renderTweetToImage)
Before Satori call, all images are replaced with base64 data URIs:
- Profile pic: `profile_image_url_https.replace('_normal', '_400x400')` → base64
- Media: `mediaDetails[i].media_url_https` or `photos[i].url` → base64
- Quote tweet profile pic + media → base64
- Logo (if provided) → base64
Failure is silent (`fetchImageAsBase64` returns `null` on error).

## Height Calculation (core.mjs — renderTweetToImage)
Estimated, not measured — can overflow or underflow:
```js
baseHeight = 140 + (padding * 2)
textHeight = Math.ceil(textLength / 45) * 28  // ~45 chars/line, 28px
mediaHeight = hasMedia ? 320 : 0
quoteTweetHeight = hasQuoteTweet ? 120 : 0
metricsHeight = showMetrics ? 60 : 0
dateHeight = hideDate ? 0 : 40
```
Both CLI and API use this same formula (via core.mjs).

## Font Loading — Cached Per Process

```js
// core.mjs
let _cachedFonts = null;

export async function loadFonts() {
  if (_cachedFonts) return _cachedFonts;
  // ... fetch Inter 400 + 700 from fonts.gstatic.com ...
  _cachedFonts = fonts;
  return fonts;
}
```
- First render: 2 HTTP requests to Google Fonts CDN (~200-500ms overhead)
- Subsequent renders: instant (returns cached array)
- Cache is per-process — server restart clears it
- If both fonts fail: throws `Error('Failed to load any fonts')`

## Scale Factor
Implemented via Resvg `fitTo: { mode: 'width', value: scaledWidth }` — not a Satori option.
Satori always renders at 1x; Resvg upscales to achieve 2x/3x output.

## Text Processing Order (generateTweetHtml in core.mjs)
1. Strip `t.co` media URLs from text (they display as images)
2. HTML-escape: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`
3. Newlines → `<br/>`
4. Replace `t.co` short URLs with `display_url` (styled in link color)
5. Replace `@mentions` via regex (case-insensitive)
6. Replace `#hashtags` via regex (case-insensitive)

**Note:** Quote tweet text decodes HTML entities first (Twitter sends them pre-encoded), then does NOT re-escape — intentional, different from main tweet handling.

## THEMES constant
```js
{ light, dark, dim, black } → { bg, text, textSecondary, border, link }
```
Default theme: `dark`. Link color is always `#1d9bf0` across all themes.

## DIMENSIONS constant
```js
auto: { width: 550, height: null }  // height is auto-calculated
instagramFeed: { width: 1080, height: 1080 }
instagramStory / tiktok: { width: 1080, height: 1920 }
// etc.
```
Fixed-dimension presets do NOT enforce fixed height — height still uses content estimate.

## GRADIENTS constant
8 named gradients: sunset, ocean, forest, fire, midnight, sky, candy, peach.
Applied via `background: linear-gradient(...)` in bgStyle.
Gradient takes priority over `backgroundColor` if both are set.
