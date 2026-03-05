# Pitfalls & Active Gotchas

## Height Estimation Can Overflow

Satori height is estimated from content, not measured. Long tweets, CJK text, or many newlines can exceed the declared height. **Satori clips silently** — no error, just truncated output.

```
textHeight = Math.ceil(textLength / 45) * 28  // assumes ~45 chars/line
```

No fallback or retry mechanism exists.

## Thread Walking Only Goes Backward

`fetchThread()` walks `parent.id_str` chain upward to find the thread start. Cannot discover tweets posted **after** the entry tweet. Syndication API limitation — no fix available.

## Date Formatting Is Locale-Dependent

`formatDate()` uses `toLocaleTimeString('en-US')` and `toLocaleDateString('en-US')` — output varies by runtime locale settings on some platforms.

## Quote Tweet Text Processing Differs From Main Tweet

Main tweet: HTML-escape first, then process entities.
Quote tweet: HTML-decode first (Twitter sends pre-encoded), then truncate to 200 chars. Different pipeline — intentional but surprising.

## Satori loadAdditionalAsset — Emoji and Font Fallback

`loadAdditionalAsset` delegates to `fetchEmoji` (emoji→Twemoji SVG from CDN, 5s timeout, LRU cached) and `loadLanguageFont` (script→Noto Sans from disk, cached per-process). If CDN is unavailable, emoji gracefully degrades to empty boxes. If a font file is missing from `fonts/`, that script renders as tofu. Font files must be present in Docker image (Dockerfile COPYs `fonts/` directory).

## Boolean Query Param Naming Inversion

GET `/screenshot` uses `hideMetrics=true` → internally maps to `showMetrics: false`. POST body accepts both `hideMetrics` (bool) and `showMetrics` (bool), with `hideMetrics: true` taking priority.

## TweetId in URL Must Be Decoded

`GET /screenshot/:tweetIdOrUrl` calls `decodeURIComponent()` before `extractTweetId`. Full tweet URLs passed as path params must be URL-encoded by the client.

## Phone Frame Height Math

Phone frame adds `PHONE_CHROME.notch (40) + PHONE_CHROME.homeBar (28) + PHONE_CHROME.border*2 (20)` px to canvas height. If you change the inner card layout, re-check total canvas height calculation in `renderTweetToImage()`.

## landing.js Has 24-Hour Browser Cache

`/landing.js` is served with `Cache-Control: public, max-age=86400`. Changes to `landing.js` won't be visible to returning users for up to 24 hours. `landing.html` (inline CSS) has no such cache and updates immediately on deploy. If you need JS changes to propagate instantly, add a cache-busting query param to the `<script src>` tag in `landing.html`.

## Reply-to Mention Prefix and Entity Deduplication

Reply tweets include hidden `@mention` prefixes in `text` (e.g. `@user See @user in action`). The `display_text_range` field trims them — `processTweetText` calls `text.substring(range[0])`. Without this, reply-to mentions render visibly and duplicate the inline mention.

The same `screen_name` can appear multiple times in `entities.user_mentions` (once for the reply-to, once inline). `colorizeEntities` uses a global regex (`gi` flag), so a single pass colors ALL occurrences. The `seen` Set deduplication prevents a second pass from double-wrapping already-colored spans (the regex would match `@user` inside the existing `<span>@user</span>`).

## Custom Font Not Cached

`fontUrl` fonts are fetched fresh on every request (10s timeout). High-traffic endpoints or slow font CDNs will add latency proportional to font file size. Fallback to Inter is silent — no error surfaced to caller.
