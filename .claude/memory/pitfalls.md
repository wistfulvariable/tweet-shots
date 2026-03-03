# Pitfalls & Active Gotchas

## Height Estimation Can Overflow

Satori height is estimated from content, not measured. Long tweets, CJK text, or many newlines can exceed the declared height. **Satori clips silently** — no error, just truncated output.

```
textHeight = Math.ceil(textLength / 45) * 28  // assumes ~45 chars/line
```

No fallback or retry mechanism exists.

## Logo Overlay Does Not Render

`addLogoToHtml()` in `core.mjs` uses `position: absolute`, which Satori does not support. The logo/watermark feature is broken in rendered output. CLI `--logo` flag accepts the argument but the logo won't appear.

## Thread Walking Only Goes Backward

`fetchThread()` walks `parent.id_str` chain upward to find the thread start. Cannot discover tweets posted **after** the entry tweet. Syndication API limitation — no fix available.

## Only First Media Image Rendered

`generateTweetHtml()` only uses `mediaDetails[0]` or `photos[0]`. Multi-image tweets show only the first photo.

## Date Formatting Is Locale-Dependent

`formatDate()` uses `toLocaleTimeString('en-US')` and `toLocaleDateString('en-US')` — output varies by runtime locale settings on some platforms.

## Quote Tweet Text Processing Differs From Main Tweet

Main tweet: HTML-escape first, then process entities.
Quote tweet: HTML-decode first (Twitter sends pre-encoded), then truncate to 200 chars. Different pipeline — intentional but surprising.

## Satori loadAdditionalAsset Returns undefined

Set to `async () => undefined` to block network requests for emoji/font fallback. Missing emoji render as empty boxes rather than causing timeouts.

## Boolean Query Param Naming Inversion

GET `/screenshot` uses `hideMetrics=true` → internally maps to `showMetrics: false`. POST body accepts both `hideMetrics` (bool) and `showMetrics` (bool), with `hideMetrics: true` taking priority.

## TweetId in URL Must Be Decoded

`GET /screenshot/:tweetIdOrUrl` calls `decodeURIComponent()` before `extractTweetId`. Full tweet URLs passed as path params must be URL-encoded by the client.
