# Rendering Pipeline

## Core Flow

```
fetchTweet(id) → pre-fetch images to base64 → generateTweetHtml() → html() → satori() → Resvg → PNG/SVG
```

Modules: `tweet-fetch.mjs` (fetch/extract), `tweet-html.mjs` (HTML template), `tweet-render.mjs` (pipeline), `tweet-emoji.mjs` (Twemoji CDN), `tweet-fonts.mjs` (Noto Sans lazy), `tweet-utils.mjs` (CLI-only).

## Satori Constraints (CRITICAL)

- **Flexbox only** — `display: flex` required on every container element
- **No** `position: absolute/fixed`, CSS Grid, `overflow: scroll`, `display: block`
- **Images must be data URIs** — Satori cannot load remote URLs at render time
- **Inline styles only** — no CSS classes, stylesheets, or `<style>` tags
- `loadAdditionalAsset` delegates to `fetchEmoji` (emoji→SVG) and `loadLanguageFont` (script→font)

## Font Loading

**Primary (Latin):** Bundled `fonts/Inter-Regular.woff` + `fonts/Inter-Bold.woff` (always loaded). Falls back to Google Fonts CDN if bundled files missing.
**Multilingual:** 13 Noto Sans fonts in `fonts/` — lazy-loaded per-language by `loadLanguageFont()`, cached per-process.
**Custom fonts:** `fontUrl` fetched at render time (10s timeout), replaces Inter. If `fontUrl` without `fontFamily`, Satori font name defaults to `"CustomFont"`. Not cached across requests.

## Emoji Rendering

`tweet-emoji.mjs`: emoji grapheme → Twemoji hex codepoint → SVG from jsdelivr CDN (5s timeout). LRU cache (500 entries). 404s cached; network errors not. Returns null on failure → Satori renders empty box.

## Image Pre-fetching

Before Satori call: profile pic (`_normal` → `_400x400`), media, quote tweet images, logo (if any) — all fetched to base64. `fetchImageAsBase64()`: 10s timeout, returns null on failure. Twitter CDN capped at `medium` (1200px) — `large` causes timeouts on multi-image tweets.

## Height Estimation

Calculated, not measured. **Satori clips silently** if content exceeds declared height:
```
header=76, text=ceil(len/45)*28, media=300, quote=120, metrics=56, date=40, url=36, watermark=28, +2*padding
```
Thread mode uses narrower constants: `THREAD_HEADER_HEIGHT=56`, `THREAD_CHARS_PER_LINE=42`. Watermark adds `HEIGHT_WATERMARK` once (not per tweet in threads).

## Advanced Rendering Modes

**Thread** (`thread: true`): `renderThreadToImage()` fetches thread via `fetchThread()`, calls `generateThreadHtml()` — 48px avatar column + 2px connector lines. NOT run via worker pool — called directly.

**Phone frame** (`frame: 'phone'`): Dark chrome with notch (40px) + homeBar (28px) + border (10px each side). Canvas height += `notch + homeBar + border×2`.

**Logo** (`logo` URL): User-supplied branding image, pre-fetched to base64 with tweet images, placed as flex row. NOT `position: absolute`. Auth routes only — excluded from demo (SSRF protection).

**Watermark** (internal `watermark: true`): Automatic "tweet-shots.com" text at card bottom, after logo. Injected server-side by route handlers — NOT a user-facing API parameter. Free tier + demo = watermarked; pro/business/owner = clean. Colors per theme via `WATERMARK_COLORS` from `tweet-html.mjs`.

**Custom gradient** (`gradientFrom`/`gradientTo`/`gradientAngle`): Takes priority over named presets. Outer container uses CSS `linear-gradient()`. `GRADIENT_FRAME_PADDING = 40` added when gradient/canvas wraps card.

## Worker Thread Pool

`render-pool.mjs`: N workers (`cpus - 1`, min 2). Each worker has its own emoji/font caches. PNG buffers transferred (not copied) as Transferable. Dynamic timeout: `30s + 5s × media_count`, max 60s → 504 `RENDER_TIMEOUT`. Skipped in test env.

## Scale & Constants

Scale applied by Resvg (`fitTo: { mode: 'width', value: rasterWidth }`), not Satori. Default scale: 2. `rasterWidth = outputWidth || canvasWidth * scale` — when `outputWidth` is set (50–5000), it overrides `scale` for the final PNG pixel width. Since SVG is vector, Resvg rasterizes at any target width without quality loss.
- **THEMES:** light, dark (default), dim, black
- **DIMENSIONS:** auto (550px), instagramFeed, instagramStory, instagramVertical, tiktok, linkedin, twitter, facebook, youtube
- **GRADIENTS:** sunset, ocean, forest, fire, midnight, sky, candy, peach
