# Feature Discovery & Opportunity Audit — Run 01

**Date:** 2026-03-03
**Scope:** Full codebase — core rendering, API server, CLI, billing, infrastructure, tests
**Method:** Static code analysis (read-only, no running app, no web search)

---

## 1. Executive Summary

**Product maturity: Solid v1** — tweet-shots has a well-architected rendering pipeline, a clean API with tiered auth/billing, and a functional CLI. The codebase is unusually clean for its maturity level: no TODO/FIXME comments, comprehensive test suite (546 tests), security-hardened, with structured logging and CI/CD.

**Untapped potential is significant.** Several features are 80-95% built but not wired up. The rendering core is the strongest asset — the business opportunity lies in exposing more of what already works through the API, not in building new technology.

**Opportunity breakdown:**
| Category | Count | Effort Range |
|---|---|---|
| Unfinished features (80%+ done) | 4 | Hours to days each |
| Underutilized infrastructure | 5 | Days each |
| Natural extensions | 6 | Days to 1 week each |
| Logical additions | 8 | Days to weeks each |
| Ambitious opportunities | 4 | Weeks to months each |

**Top 5 highest-value opportunities:**
1. **Wire up emoji rendering** — `tweet-emoji.mjs` is complete, untested, unconnected. ~2 hours of work for visually complete tweet screenshots.
2. **Expose thread capture via API** — `fetchThread()` exists, CLI uses it, no API route. ~1 day.
3. **Screenshot caching layer** — Same tweet+options rendered repeatedly hits Twitter API and Satori every time. Firestore + GCS already available. ~2-3 days.
4. **Translation via API** — `translateText()` exists in CLI, not in API. International users can't translate via REST. ~1 day.
5. **HTML signup form + docs page** — Landing page funnels are broken (POST-only endpoints). ~2 days for both.

---

## 2. Unfinished Features

| Feature | Evidence | Completion % | Effort to Finish | Value | Recommendation |
|---|---|---|---|---|---|
| **Emoji rendering** | [tweet-emoji.mjs](tweet-emoji.mjs) — 120 lines, fully built with CDN fetch, codepoint conversion, LRU cache (500 max), test hooks (`clearEmojiCache`, `getEmojiCacheSize`). [tweet-render.mjs:430](tweet-render.mjs#L430) — `loadAdditionalAsset: async () => undefined` actively disables Satori's emoji callback. | 95% | 2 hours — wire `fetchEmoji` into `loadAdditionalAsset`, add unit tests, test with emoji-heavy tweets | **High** — Tweets with emoji currently show blank boxes or missing characters. Every emoji in every tweet is silently broken. | **Build immediately** |
| **Thread API endpoint** | [tweet-fetch.mjs:84-121](tweet-fetch.mjs#L84-L121) — `fetchThread()` walks parent chain, filters by author. [tweet-shots.mjs](tweet-shots.mjs) — CLI `handleThread()` uses it with optional PDF. No route in [src/routes/](src/routes/) exposes it. | 85% | 1 day — new route `GET /thread/:tweetId`, reuse `fetchThread` + render pool. Decide on response format (array of images, zip, PDF). | **High** — Thread capture is listed on the landing page ("Capture entire threads") but only works via CLI. API customers can't access it. | **Build soon** |
| **Translation via API** | [tweet-utils.mjs](tweet-utils.mjs) — `translateText()` calls GPT-4o-mini, preserves entities. CLI supports `--translate <lang>`. No `translate` param in [request-schemas.mjs](src/schemas/request-schemas.mjs) or screenshot routes. `OPENAI_API_KEY` already in [config.mjs](src/config.mjs). | 80% | 1 day — add `translate` param to screenshot schemas, call `translateText` before render in screenshot route, gate behind pro+ tier. | **Medium** — Listed on landing page ("AI Translation — Translate tweets to any language with one parameter") but API-only users can't use it. | **Build soon** |
| **Batch API endpoint** | [tweet-utils.mjs](tweet-utils.mjs) — `processBatch()` accepts URL array, renders sequentially with 500ms delay. CLI supports `--batch`. No bulk endpoint exists. Worker pool in [render-pool.mjs](src/workers/render-pool.mjs) handles concurrent renders. | 70% | 2-3 days — new `POST /batch` endpoint accepting array of tweet IDs, queue through render pool, return array of results or zip. Needs credit deduction logic (1 per tweet), request size limits. | **Medium** — Business tier advertises "Batch processing" on landing page pricing. Currently CLI-only. | **Build** |

---

## 3. Underutilized Infrastructure

| Infrastructure | Current Usage | Potential Usage | Effort | Value |
|---|---|---|---|---|
| **Firestore usage collection** | Stores `total`, `currentMonthCount`, `currentMonth`, `lastUsed` per key. Only queried in `trackAndEnforce()`, `getUsageStats()`, and admin `GET /admin/usage`. | Usage trends over time (store monthly snapshots), popular hours/days, per-key analytics dashboard, credit burndown alerts, churn prediction signals. | 2-3 days to add monthly history retention + analytics endpoint | **Medium** — Currently all historical data is overwritten on month rollover. Once it's gone, it's gone. |
| **Cloud Storage (GCS)** | Only used in `POST /screenshot` with `response=url` mode. Files stored at `screenshots/{tweetId}-{timestamp}.{format}` with 1-year cache. | Screenshot caching layer (same tweet+options = same file), public gallery/showcase, audit trail of generated screenshots. Bucket `tweet-shots-screenshots` already configured, upload function exists in [storage.mjs](src/services/storage.mjs). | 1-2 days for caching, 1 week for gallery | **High** for caching — eliminates redundant renders |
| **Worker thread pool** | Renders single tweets via `render(tweet, options)`. Dynamic timeout (30s + 5s/image, max 60s). Size defaults to `max(2, cpus-1)`. | Batch rendering queue (accept N tweets, dispatch to pool), parallel thread rendering, priority queues per tier (business gets priority). Pool already handles queuing and drain. | 1-2 days for batch support, 1 week for priority queues | **Medium** — Pool is well-built but underused |
| **pino structured logging** | Logs every request with `reqId`, method, path, error context. JSON in production, pretty in dev. GCP Cloud Logging integration. | Request analytics (popular tweets, render times, error rates, tier distribution), operational dashboards (latency P50/P95/P99), abuse detection (IP patterns, bulk usage). Data is being generated but not aggregated or queried. | 0 effort for GCP Log Explorer queries; 1-2 days for BigQuery export; 1 week for a dashboard | **Low-Medium** — Valuable for product decisions but not user-facing |
| **PDFKit dependency** | Only used in `tweet-utils.mjs:generatePDF()` for CLI thread PDF export. Installed as production dependency (not devDependency). | API thread-to-PDF endpoint, multi-tweet PDF reports, newsletter-ready PDF export. | 0 for dependency; 1 day for API route | **Low** — Niche use case, adds bundle size. Consider moving to devDependency if API PDF isn't built. |

---

## 4. Data Opportunities

### Underutilized Data

| Data Available | Feature Enabled | Pipeline Support | Effort | Impact |
|---|---|---|---|---|
| `usage.lastUsed` per key | Stale key identification, engagement tracking, churn risk | Firestore queries exist, admin endpoint returns it | Low (query + alert logic) | Medium — identifies inactive paid users before they churn |
| `X-Render-Time-Ms` computed per request | Performance monitoring, slow-render analytics, SLO dashboards | Computed in [screenshot.mjs](src/routes/screenshot.mjs) and [demo.mjs](src/routes/demo.mjs) but only sent as response header, not stored | Low (log it as structured field; already in pino) | Medium — identifies performance regressions before users notice |
| Tweet data from syndication API | Popular tweet tracking, content analytics, tweet unavailability patterns | `fetchTweet()` returns full tweet JSON including metrics (likes, retweets, views) | Medium (store tweet metadata in Firestore) | Low — interesting but tangential to core product |
| `TIERS` definition in [config.mjs](src/config.mjs) | Dynamic pricing, A/B testing tier limits, promotional credits | Frozen object, single source of truth | Low (make configurable via env vars or Firestore) | Medium — enables promotional pricing without deploys |

### Missing Data That Would Unlock Value

| Feature Desired | Data Needed | Collection Effort |
|---|---|---|
| Usage history/trends | Monthly usage snapshots (currently overwritten on rollover) | Low — save `{month, count}` array instead of overwriting `currentMonthCount` |
| Screenshot caching | Content hash of `tweetId + options` → cached result URL | Low — SHA-256 of params, store in Firestore or GCS path convention |
| Render performance optimization | Per-render timing breakdown (fetch, HTML gen, Satori, Resvg) | Low — `Date.now()` checkpoints in `renderTweetToImage()` |
| Customer health scoring | Last activity, usage trend, tier, payment status | Medium — aggregate from existing collections |

---

## 5. Feature Opportunities

### Natural Extensions (high confidence, small effort)

#### 5.1 — Emoji Rendering (Wire Up)
- **Category:** Natural extension (95% complete)
- **Evidence:** [tweet-emoji.mjs](tweet-emoji.mjs) — complete module with `emojiToCodepoint()`, `fetchEmoji()`, bounded LRU cache. [tweet-render.mjs:430](tweet-render.mjs#L430) — Satori's `loadAdditionalAsset` callback is explicitly disabled (`async () => undefined`).
- **Existing foundation:** 95% — module written, tested hooks exported, CDN URL configured.
- **Effort:** 2-3 hours. Wire `fetchEmoji` into `loadAdditionalAsset`, add unit tests for `tweet-emoji.mjs`, integration test with an emoji-heavy tweet fixture.
- **Impact:** Every tweet with emoji currently renders with missing characters. This is visible in every screenshot.
- **Dependencies:** None.
- **Priority:** **Critical**

#### 5.2 — Screenshot Caching
- **Category:** Natural extension
- **Evidence:** [storage.mjs](src/services/storage.mjs) — GCS upload exists with 1-year cache headers. [screenshot.mjs](src/routes/screenshot.mjs) — `response=url` mode already uploads to GCS. Same tweet+options could be served from cache.
- **Existing foundation:** 60% — upload function, GCS bucket, cache headers all exist.
- **Effort:** 2-3 days. Hash `tweetId + theme + dimension + all options` → check GCS/Firestore for cached URL → return cached or render + cache. Need cache invalidation strategy (tweet edits are rare but happen).
- **Impact:** Eliminates redundant Twitter API calls and Satori renders. Faster responses for popular tweets. Reduces compute costs.
- **Dependencies:** Decide on cache key strategy, TTL, invalidation.
- **Priority:** **High**

#### 5.3 — Thread API Endpoint
- **Category:** Natural extension (85% complete)
- **Evidence:** [tweet-fetch.mjs:84-121](tweet-fetch.mjs#L84-L121) — `fetchThread()` walks parent chain. [tweet-shots.mjs](tweet-shots.mjs) — CLI `handleThread()` renders each tweet, optionally generates PDF. No API route.
- **Existing foundation:** 85% — fetching and rendering work. Needs route, response format decisions, credit accounting.
- **Effort:** 1-2 days. New `GET /thread/:tweetId` route, render each tweet in thread, return as JSON array of base64 images (or zip, or PDF). Credit cost = N tweets.
- **Impact:** Thread capture is marketed on landing page but inaccessible to API users.
- **Dependencies:** Decide on response format. PDF adds complexity (PDFKit is available).
- **Priority:** **High**

#### 5.4 — Translation via API
- **Category:** Natural extension (80% complete)
- **Evidence:** [tweet-utils.mjs](tweet-utils.mjs) — `translateText()` calls GPT-4o-mini. CLI `--translate <lang>` works. `OPENAI_API_KEY` in [config.mjs](src/config.mjs). Not in API schemas.
- **Existing foundation:** 80% — translation function works. Needs schema param, route integration, tier gating.
- **Effort:** 1 day. Add `translate` (ISO 639-1 code) to `screenshotQuerySchema`/`screenshotBodySchema`, call `translateText(tweet.text, lang)` before render in screenshot route, gate behind pro+ tier.
- **Impact:** International user base can translate tweets. Listed on landing page but API-only users can't use it.
- **Dependencies:** `OPENAI_API_KEY` must be set in production.
- **Priority:** **High**

#### 5.5 — HTML Docs Page
- **Category:** Natural extension
- **Evidence:** [health.mjs](src/routes/health.mjs) — `GET /docs` returns comprehensive JSON (endpoints, params, auth, examples). [landing.html:462](landing.html#L462) — "View Docs" links to `/docs`. JSON is machine-readable but unusable in a browser.
- **Existing foundation:** 70% — all content exists as structured JSON. Needs HTML template.
- **Effort:** 1-2 days. Server-side HTML template that renders the JSON docs data. Can be a single static HTML file like `landing.html` with the JSON embedded, or a template rendered from the existing JSON structure.
- **Impact:** Critical for developer onboarding. Current docs are raw JSON.
- **Dependencies:** None.
- **Priority:** **High**

#### 5.6 — HTML Signup Form
- **Category:** Natural extension
- **Evidence:** [landing.html:602-603](landing.html#L602-L603) — "Get Started" links to `/billing/signup?tier=free` (POST endpoint). [billing.mjs](src/routes/billing.mjs) — only POST handler exists. Browser click = dead end.
- **Existing foundation:** 60% — POST endpoint works, just needs a GET handler returning an HTML form.
- **Effort:** 1 day. Add GET handler for `/billing/signup` returning HTML form (email + name → POST via JS). Add GET handler for `/billing/checkout` with tier selector.
- **Impact:** Critical for conversion funnel. Landing page → signup is currently broken for browser users.
- **Dependencies:** None.
- **Priority:** **High**

---

### Logical Additions (users would expect these)

#### 5.7 — `GET /me` Self-Service Endpoint
- **Category:** Logical addition
- **Evidence:** [authenticate.mjs](src/middleware/authenticate.mjs) — attaches `req.keyData` (tier, name, email, active). [usage.mjs](src/services/usage.mjs) — `getUsageStats()` returns tier, used, limit, remaining. No endpoint combines them for the key holder.
- **Existing foundation:** 50% — all data is available, just not exposed in one place.
- **Effort:** 3-4 hours. New `GET /me` route behind `authenticate` middleware. Return `{ tier, name, email, usage: { used, limit, remaining, total, lastUsed }, monthResetsAt }`.
- **Impact:** Self-service troubleshooting. Reduces "what tier am I on?" / "how many credits left?" support queries.
- **Dependencies:** None.
- **Priority:** **Medium**

#### 5.8 — Custom Gradients (User-Defined Colors)
- **Category:** Logical addition
- **Evidence:** [tweet-html.mjs:42-51](tweet-html.mjs#L42-L51) — 8 hardcoded gradient presets. Users can customize `bgColor`, `textColor`, `linkColor` but NOT create custom gradients. The gradient rendering infrastructure (two-layer wrapper, padding, shadow) is fully built.
- **Existing foundation:** 80% — rendering path exists. Just need to accept `gradientFrom` + `gradientTo` params and construct CSS string.
- **Effort:** 3-4 hours. Add `gradientFrom` (hex) + `gradientTo` (hex) + `gradientAngle` (number, default 135) to schemas. In `generateTweetHtml`, construct `linear-gradient(${angle}deg, ${from} 0%, ${to} 100%)` when custom params present.
- **Impact:** Power users and brands want their brand colors as gradient backgrounds.
- **Dependencies:** None.
- **Priority:** **Medium**

#### 5.9 — Multiple Media Images
- **Category:** Logical addition
- **Evidence:** [tweet-html.mjs:368-375](tweet-html.mjs#L368-L375) — `getFirstMediaUrl(tweet)` returns only first media. Twitter API returns full `mediaDetails` array (up to 4 images). [tweet-render.mjs:121-131](tweet-render.mjs#L121-L131) — `preFetchAllImages` already fetches ALL media images (loop over `mediaDetails`), but the HTML template only uses the first one.
- **Existing foundation:** 70% — image fetching handles all images, HTML template only renders one. Need grid layout for 2-4 images (like Twitter's native layout: 2 side-by-side, 3 in L-shape, 4 in grid).
- **Effort:** 1-2 days. Modify `generateTweetHtml` to render a Satori-compatible flexbox grid for 2/3/4 images. Adjust height calculation to account for multi-image layouts.
- **Impact:** Many tweets have multiple images. Current output shows only the first — users see an incomplete screenshot.
- **Dependencies:** Satori flexbox layout testing for grid patterns.
- **Priority:** **High**

#### 5.10 — API Key Rotation
- **Category:** Logical addition
- **Evidence:** [api-keys.mjs](src/services/api-keys.mjs) — `generateKeyString(tier)` creates new keys, `revokeApiKey()` deactivates. No atomic rotate (create new + revoke old). Users must manually create via admin + revoke old.
- **Existing foundation:** 60% — key creation and revocation exist separately.
- **Effort:** 1 day. New `POST /api-keys/rotate` (authenticated) — generates new key with same tier/email, revokes old key, returns new key. Atomic via Firestore batch.
- **Impact:** Security best practice. Users can rotate compromised keys without admin involvement.
- **Dependencies:** Needs authenticated endpoint (current auth returns key data → can self-rotate).
- **Priority:** **Medium**

#### 5.11 — Watermark Text
- **Category:** Logical addition
- **Evidence:** [tweet-html.mjs:282-299](tweet-html.mjs#L282-L299) — `addLogoToHtml()` adds image logos with position control. No text watermark equivalent. Architecture supports it (absolute positioning with position params).
- **Existing foundation:** 40% — logo overlay infrastructure exists (position system, HTML injection pattern).
- **Effort:** 3-4 hours. Add `watermarkText`, `watermarkColor`, `watermarkPosition` params. Generate positioned span element in `addLogoToHtml` variant.
- **Impact:** Content creators and brands want attribution text ("via @brand") overlaid on screenshots.
- **Dependencies:** None. Satori supports text rendering.
- **Priority:** **Nice-to-have**

#### 5.12 — Video Thumbnail Indicators
- **Category:** Logical addition
- **Evidence:** Twitter syndication API returns `mediaDetails[].type === 'video'` with `media_url_https` as the thumbnail. [tweet-html.mjs](tweet-html.mjs) renders video thumbnails identically to photos — no play button or video indicator.
- **Existing foundation:** 50% — thumbnail already renders. Need play button SVG overlay.
- **Effort:** 3-4 hours. Check `mediaDetails[].type` in HTML generation. If video, overlay a play button SVG (absolute positioned, centered, semi-transparent).
- **Impact:** Users can tell screenshots contain video content. Currently misleading — looks like a still image.
- **Dependencies:** Satori SVG overlay support (should work with flex positioning).
- **Priority:** **Medium**

#### 5.13 — Response Headers Documentation
- **Category:** Logical addition
- **Evidence:** [screenshot.mjs](src/routes/screenshot.mjs) sets `X-Tweet-ID`, `X-Tweet-Author`, `X-Render-Time-Ms`. [billing-guard.mjs](src/middleware/billing-guard.mjs) sets `X-Credits-Remaining`, `X-Credits-Limit`, `X-Credits-Tier`. None documented in [health.mjs](src/routes/health.mjs) `/docs` response or landing page.
- **Existing foundation:** 90% — headers already exist. Just need documentation.
- **Effort:** 1-2 hours. Add response headers section to `/docs` JSON output.
- **Impact:** Developers can build monitoring, dashboards, credit tracking on these headers.
- **Dependencies:** None.
- **Priority:** **Medium**

#### 5.14 — Padding/Radius Sliders in Demo
- **Category:** Logical addition
- **Evidence:** [landing.html](landing.html) — demo form has theme chips, gradient chips, dimension selector, toggle checkboxes. No padding or radius sliders, even though both params exist in [demoQuerySchema](src/schemas/request-schemas.mjs) (padding 0-100, radius 0-100).
- **Existing foundation:** 95% — schema already validates both params for demo. Just need HTML sliders.
- **Effort:** 2-3 hours. Add two `<input type="range">` sliders with labels to the demo form. Include in `buildQueryString()`.
- **Impact:** Demo showcases the full customization power. Currently hidden options.
- **Dependencies:** None.
- **Priority:** **Nice-to-have**

---

### Ambitious Opportunities (differentiators)

#### 5.15 — Bulk/Batch API Endpoint
- **Category:** Ambitious
- **Evidence:** [tweet-utils.mjs](tweet-utils.mjs) — `processBatch()` processes URL arrays sequentially. [render-pool.mjs](src/workers/render-pool.mjs) — worker pool supports concurrent rendering with queuing. No API bulk endpoint.
- **Existing foundation:** 40% — sequential batch exists, pool handles concurrency. Need: bulk request schema, credit deduction per tweet, response aggregation, error handling per item, request size limits.
- **Effort:** 1 week. `POST /batch` accepting `{ tweets: [{ tweetId, options }], response: "base64"|"url" }`. Process through render pool with per-tier concurrency limits. Return `{ results: [{ tweetId, success, data/error }] }`. Credit cost = N tweets.
- **Impact:** High-volume customers (newsletter tools, social media managers) need bulk processing. Currently must loop API calls.
- **Dependencies:** Credit accounting, request size limits, response format decisions.
- **Priority:** **Medium**

#### 5.16 — oEmbed Endpoint
- **Category:** Ambitious
- **Evidence:** No oEmbed support exists. The rendering pipeline produces PNG/SVG from tweet IDs — exactly what oEmbed provides. [health.mjs](src/routes/health.mjs) already serves structured JSON at multiple endpoints.
- **Existing foundation:** 20% — rendering pipeline works, but oEmbed has specific format requirements (JSON response with `type`, `provider_name`, `url`, `width`, `height`).
- **Effort:** 1-2 days. `GET /oembed?url=<tweet-url>&format=json` returning standard oEmbed response. Could enable CMS embedding (WordPress, Ghost, Notion).
- **Impact:** Makes tweet-shots a drop-in replacement for Twitter embeds in any CMS supporting oEmbed. Significant distribution channel.
- **Dependencies:** None technical. Marketing to CMS plugin developers.
- **Priority:** **Medium**

#### 5.17 — Webhook Notifications
- **Category:** Ambitious
- **Evidence:** [stripe.mjs](src/services/stripe.mjs) — `handleWebhook()` processes Stripe events. [billing-guard.mjs](src/middleware/billing-guard.mjs) — detects credit exhaustion. No outbound webhook/notification system exists.
- **Existing foundation:** 10% — event detection exists (credit exhaustion, tier changes, payment failures). No delivery infrastructure.
- **Effort:** 2-3 weeks. Webhook registration (Firestore collection), event dispatch (queue + retry), signature verification, delivery dashboard. Start with: credit exhaustion, tier change, payment failure events.
- **Impact:** Enterprises want programmatic alerts. Enables integration with monitoring tools (PagerDuty, Slack, etc.).
- **Dependencies:** Queue infrastructure (Cloud Tasks or simple in-process retry). Webhook secret management.
- **Priority:** **Nice-to-have**

#### 5.18 — Embeddable Widget
- **Category:** Ambitious
- **Evidence:** Demo endpoint exists at `/demo/screenshot/:tweetIdOrUrl` returning PNG. Landing page has a working interactive demo. No JS embed snippet.
- **Existing foundation:** 30% — demo endpoint returns cacheable PNG. Need: JS loader script, iframe or img tag generation, CORS already enabled.
- **Effort:** 1-2 weeks. `<script src="tweet-shots.js" data-tweet="..." data-theme="dark"></script>` that creates an img tag pointing to the demo endpoint (or authenticated endpoint with key in data attribute). Responsive sizing.
- **Impact:** Bloggers and newsletters could embed screenshots without API integration.
- **Dependencies:** CORS is already enabled. Need to decide on auth model (demo endpoint = rate limited, API key in client JS = exposed).
- **Priority:** **Nice-to-have**

---

## 6. Automation & Intelligence

### Manual → Automated

| Manual Process | Automation | Effort | Impact |
|---|---|---|---|
| Same tweet rendered repeatedly (no caching) | Content-hash caching in GCS with TTL | 2-3 days | High — eliminates redundant work |
| Admin manually creates keys for new users | Self-service signup already exists (POST `/billing/signup`) | Already automated | N/A |
| Monthly usage resets require no action | `trackAndEnforce()` detects month rollover automatically | Already automated | N/A |
| Stale key cleanup | Scheduled job querying `lastUsed < 90 days ago` → warn/revoke | 1 day (Cloud Scheduler + Cloud Function) | Low — prevents Firestore bloat |
| Font version monitoring | Bundled fonts eliminate this. But add a startup check that validates font file signatures (already known pattern per MEMORY.md) | 2 hours | Low — prevents silent rendering failures |

### Smart Defaults

| Opportunity | Data Available | Implementation | Effort |
|---|---|---|---|
| Auto-detect optimal theme based on tweet author's profile colors | Tweet API returns `user.profile_background_color`, `user.profile_link_color` | Map Twitter colors to closest theme (`light` if bg is light, `dark` if dark) when theme=auto | 2-3 hours |
| Auto-select dimension based on referrer | HTTP `Referer` header | If referrer contains "instagram.com" → instagramFeed default; "linkedin.com" → linkedin; etc. | 2-3 hours |
| Suggest gradient based on tweet media dominant color | Media image exists, color extraction possible via Resvg/canvas analysis | Extract dominant color from first media image, suggest complementary gradient | 1-2 days (needs color extraction library) |

### AI-Augmentable Features

| Feature | What's Augmented | Data Feeds It | Existing Infra | Minimal Viable Version |
|---|---|---|---|---|
| **Translation** (already exists) | Tweet text | Tweet text → GPT-4o-mini | `translateText()` in [tweet-utils.mjs](tweet-utils.mjs), `OPENAI_API_KEY` in config | Wire into API (see 5.4 above) |
| **Alt text generation** | Screenshot accessibility | Tweet text + media description | OpenAI API already configured | Add `alt` param to response JSON: GPT-4o-mini summarizes tweet content as image alt text. 2-3 hours. |
| **Smart cropping/framing** | Dimension preset fitting | Tweet content length, media presence | Height estimation in [tweet-render.mjs](tweet-render.mjs) | When tweet is short + no media, auto-shrink canvas height for fixed presets instead of centering in large whitespace. 3-4 hours. |
| **Content moderation** | Abuse prevention | Tweet text from syndication API | N/A (new) | Flag NSFW or policy-violating tweets before rendering. Could use OpenAI moderation API. 1 day. |

---

## 7. Platform Opportunities

### API-as-Product Assessment

**Current state:** The API is already productized with auth, billing, and rate limiting. It serves as the primary product.

**Third-party API potential:**
- The core value (tweet → image) is self-contained and stateless (no user data beyond keys)
- Standard REST patterns, Zod-validated inputs, structured error responses
- Three response modes (binary, base64, URL) cover different integration patterns
- Rate limits and billing are per-key, naturally supporting multi-tenant usage

**Integration opportunities:**
| Integration | Mechanism | Effort | Value |
|---|---|---|---|
| Zapier/Make webhook action | Already works — POST `/screenshot` with API key | Documentation only | High — no-code users |
| WordPress plugin | REST API compatible | Plugin development (external) | Medium — large market |
| Slack bot | Slash command → API call → upload PNG | 2-3 days for a thin bot | Medium — developer audience |
| Chrome extension | Content script extracts tweet URL → API call → show screenshot | 1-2 weeks | Medium — direct user access |

### Multi-Tenancy Assessment

**Current state:** Single-tenant SaaS. API keys are per-user, not per-organization.

**Multi-tenant signals in codebase:**
- `apiKeys` collection already supports `name` and `email` fields — could add `organizationId`
- `customers` collection keyed by email — could add team/org grouping
- No row-level security or organization-scoped queries exist

**Recommendation:** Not worth building now. The product is B2D (business-to-developer), not B2B enterprise. Multi-tenancy adds complexity without clear demand. If enterprise customers appear, add `organizationId` to apiKeys and customers collections.

### Extensibility Assessment

**Plugin/custom fields:** Not applicable — this is a rendering API, not a data platform.

**Custom themes:** Users can already override `bgColor`, `textColor`, `linkColor`. Full custom themes (saved color presets) would be a natural extension:
- Add `POST /themes` (authenticated) — save named theme with colors
- Add `GET /themes` — list user's themes
- Accept `themeId` as alternative to `theme` name in screenshot params
- Effort: 3-5 days including Firestore collection, CRUD, schema validation
- Priority: **Nice-to-have** — custom gradients (5.8) covers 80% of the need with less complexity

---

## 8. Recommended Build Order

### Quick Wins (hours to 1-2 days)

| # | Feature | Effort | Value | Reason for Priority |
|---|---|---|---|---|
| 1 | **Wire up emoji rendering** (5.1) | 2-3 hours | Critical | Every emoji tweet is broken. Highest value-per-effort in the entire list. |
| 2 | **Document response headers** (5.13) | 1-2 hours | Medium | Zero risk, immediate DX improvement. |
| 3 | **HTML signup form** (5.6) | 1 day | High | Conversion funnel is broken. |
| 4 | **HTML docs page** (5.5) | 1-2 days | High | Developer onboarding is broken. |
| 5 | **Translation via API** (5.4) | 1 day | High | Feature already built, just not exposed. |
| 6 | **Custom gradients** (5.8) | 3-4 hours | Medium | Infrastructure exists, adds brand customization. |

### Medium Investments (days to 1 week)

| # | Feature | Effort | Value | Reason for Priority |
|---|---|---|---|---|
| 7 | **Screenshot caching** (5.2) | 2-3 days | High | Reduces costs, improves latency, GCS already configured. |
| 8 | **Thread API endpoint** (5.3) | 1-2 days | High | Marketed feature, CLI-only. |
| 9 | **Multiple media images** (5.9) | 1-2 days | High | Images already fetched, only first rendered. Visible quality gap. |
| 10 | **`GET /me` endpoint** (5.7) | 3-4 hours | Medium | Self-service, reduces support. |
| 11 | **Key rotation** (5.10) | 1 day | Medium | Security best practice. |
| 12 | **Video thumbnails** (5.12) | 3-4 hours | Medium | Distinguishes video from photo content. |

### Strategic Investments (weeks to month)

| # | Feature | Effort | Value | Reason for Priority |
|---|---|---|---|---|
| 13 | **Bulk/batch API** (5.15) | 1 week | Medium | Business tier differentiator. |
| 14 | **oEmbed endpoint** (5.16) | 1-2 days | Medium | Distribution channel via CMS integrations. |
| 15 | **Usage history retention** (Section 3, Firestore) | 2-3 days | Medium | Prevents data loss, enables analytics. |
| 16 | **Webhook notifications** (5.17) | 2-3 weeks | Low | Enterprise feature, significant infra investment. |
| 17 | **Embeddable widget** (5.18) | 1-2 weeks | Low | Niche use case, auth challenges. |

---

## Appendix A: Vestigial / Barely-Used Dependencies

| Dependency | Usage | Recommendation |
|---|---|---|
| `pdfkit` (0.17.2) | CLI thread PDF only. Not used by API server. Production dependency adding ~2MB. | Move to devDependency if no API PDF endpoint planned. Or keep if thread API (5.3) will include PDF. |
| `pino-pretty` (13.1.3) | Dev-only log formatting. Listed as production dependency. | Move to devDependency — [Dockerfile](Dockerfile) uses `--omit=dev`, so it's already excluded from prod image. But `npm install` in dev installs it either way. No action needed. |

## Appendix B: Files Referenced

| File | Section(s) |
|---|---|
| [tweet-emoji.mjs](tweet-emoji.mjs) | 2, 5.1 |
| [tweet-fetch.mjs](tweet-fetch.mjs) | 2 (thread), 5.3 |
| [tweet-html.mjs](tweet-html.mjs) | 5.8, 5.9, 5.11, 5.12 |
| [tweet-render.mjs](tweet-render.mjs) | 5.1, 5.2, 5.9, 6 |
| [tweet-utils.mjs](tweet-utils.mjs) | 2, 5.4, 5.15, 6 |
| [src/routes/screenshot.mjs](src/routes/screenshot.mjs) | 5.2, 5.4, 5.13 |
| [src/routes/demo.mjs](src/routes/demo.mjs) | 5.13, 5.14, 5.18 |
| [src/routes/health.mjs](src/routes/health.mjs) | 5.5, 5.13 |
| [src/routes/billing.mjs](src/routes/billing.mjs) | 5.6 |
| [src/services/usage.mjs](src/services/usage.mjs) | 3, 4, 5.7 |
| [src/services/storage.mjs](src/services/storage.mjs) | 3, 5.2 |
| [src/services/api-keys.mjs](src/services/api-keys.mjs) | 5.10 |
| [src/workers/render-pool.mjs](src/workers/render-pool.mjs) | 3, 5.15 |
| [src/middleware/billing-guard.mjs](src/middleware/billing-guard.mjs) | 5.13, 5.17 |
| [src/middleware/authenticate.mjs](src/middleware/authenticate.mjs) | 5.7 |
| [src/config.mjs](src/config.mjs) | 4, 5.4 |
| [src/schemas/request-schemas.mjs](src/schemas/request-schemas.mjs) | 5.4, 5.8, 5.14 |
| [landing.html](landing.html) | 5.5, 5.6, 5.14 |
| [package.json](package.json) | Appendix A |

---

*Report generated by static code analysis. No code was modified. No web searches performed.*
