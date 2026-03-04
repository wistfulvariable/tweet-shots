# Debugging & Diagnostics

## Rendering Output Problems

**Truncated/clipped tweet image:** Height estimation overflow. Satori clips silently. Worst cases: CJK text, many newlines, `thread: true` with long tweets. No fix — height is estimated from constants, not measured.

**Blank/missing image in tweet card:** Image pre-fetch failed (10s timeout). `fetchImageAsBase64()` returns `null` on failure — image element renders empty. Check: network connectivity to `pbs.twimg.com`, CDN image URL validity.

**Blank emoji (empty box):** Twemoji CDN unavailable or unknown codepoint. `fetchEmoji()` returns `null` → Satori renders empty box. Check: CDN `cdn.jsdelivr.net` accessible, emoji has a Twemoji SVG (not all emoji do).

**Tofu/missing non-Latin text:** Noto Sans font file missing from `fonts/` directory. Check: `fonts/NotoSans<Script>-Regular.ttf` exists. Docker build must `COPY fonts/ fonts/`.

**Wrong font rendering:** Custom `fontUrl` fetched but `fontFamily` not set → Satori font name defaults to `"CustomFont"`. HTML still uses `font-family: -apple-system, ...`. Set `fontFamily` to match the font name Satori uses.

## Worker & Timeout Issues

**504 RENDER_TIMEOUT:** Dynamic timeout exceeded (`30s + 5s × media_count`, max 60s). Satori hung on large SVG or Resvg on complex render. Workaround: `hideMedia=true` or reduce image count. Worker is replaced after crash/timeout.

**Render pool not available (test env):** `render-pool.mjs` creates workers only when `NODE_ENV !== 'test'`. Integration tests mock `renderPool` via DI — passing `renderPool: null` causes tests to call `renderTweetToImage()` directly.

**Worker crash loop:** Worker crashes → pool spawns replacement → same crash. Check: memory exhaustion on very large tweets, bad font file signature (`wOFF` magic bytes for WOFF1, `00 01 00 00` hex for TTF). Font load fails silently; rendering crashes later.

## Auth / API Key Issues

**401 on valid key:** `validateApiKey()` returns null if `active: false` (revoked) OR key not found in Firestore. `authenticate` middleware logs the key prefix (first 12 chars).

**Firestore unreachable → billing guard fails open:** Requests proceed. `X-Credits-Remaining: unknown` header indicates Firestore was unavailable. Check GCP Firestore status.

**Admin routes returning 401:** Admin router guard (`router.use()`) applies to ALL routes in the router — including billing routes mounted under it. Check mount order in `server.mjs` — billing must be mounted BEFORE admin.

## Configuration Issues

**Server fails to start:** Zod config validation failure. Missing `ADMIN_KEY` (required, min 16 chars) is the most common cause. Run `node src/server.mjs` locally with `NODE_ENV=development` to see descriptive error.

**Stripe checkout returns 503 BILLING_NOT_CONFIGURED:** `STRIPE_SECRET_KEY` not set. Signup still works — only checkout/portal need Stripe.

**Font fallback to CDN:** Bundled `fonts/Inter-Regular.woff` or `fonts/Inter-Bold.woff` missing. App falls back to Google Fonts CDN (Inter TTF). If CDN also unavailable, render fails.

## Test Failures

**Mock not intercepting:** `vi.mock()` must be declared before `await import()`. Vitest hoists static mocks but dynamic imports respect order. Re-check import sequence.

**Firestore state leaking between tests:** `mock.collections.<name>._store.clear()` must be called in `beforeEach`. Shared in-memory Map across tests in same file.

**Rate limit exhaustion across tests:** Rate limiter instances are pre-created at module load and share state. Use separate Express `app` instances for tests that would exhaust rate limit buckets.
