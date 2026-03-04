# tweet-shots — CLAUDE.md

## Project Identity

tweet-shots converts Twitter/X tweet URLs or IDs into pixel-perfect PNG/SVG screenshots — no browser automation. Dual interface: a Node.js CLI script and an Express REST API with Firestore-backed auth, tiered rate limiting, Stripe billing, and worker thread rendering. Core rendering pipeline: Twitter syndication API → HTML string → Satori (SVG) → Resvg (PNG).

---

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| Node.js | 20+ | Runtime (ES Modules — `"type": "module"`) |
| Express | 5.2 | REST API server |
| Satori | 0.24 | HTML/CSS → SVG rendering |
| @resvg/resvg-js | 2.6 | SVG → PNG conversion |
| satori-html | 0.3 | HTML string → Satori VDOM |
| Firebase Admin | 13.4 | Server-side ID token verification (dashboard) |
| Firestore | 8.3 | API keys, usage, customer data |
| Cloud Storage | 7.19 | Screenshot URL-response hosting |
| Stripe | 20.4 | Subscription billing |
| Zod | 4.3 | Request validation schemas |
| pino | 10.3 | Structured logging (GCP Cloud Logging) |
| pdfkit | 0.17 | PDF generation from image arrays |
| vitest | 4.0 | Test framework |
| helmet | 8.1 | HTTP security headers |
| cors | 2.8 | CORS middleware |
| express-rate-limit | 8.2 | Per-tier rate limiting |
| eslint + eslint-plugin-security | 9.x / 4.x | Security-focused static analysis |

---

## Project Structure

```
tweet-shots/
├── core.mjs                     # Re-export hub (backward-compatible entry point)
├── tweet-fetch.mjs              # Tweet ID extraction, data fetching, thread walking
├── tweet-html.mjs               # HTML template generation, themes, gradients
├── tweet-render.mjs             # Satori/Resvg rendering pipeline, image pre-fetch
├── tweet-emoji.mjs              # Emoji rendering (Twemoji CDN fetch + LRU cache)
├── tweet-fonts.mjs              # Multilingual font loading (Noto Sans, lazy from disk)
├── tweet-utils.mjs              # CLI-only utilities (translation, batch, PDF)
├── tweet-shots.mjs              # CLI entry point
├── landing.html                 # Landing page with interactive demo (vanilla JS)
├── fonts/                       # Bundled fonts (Inter + 13 Noto Sans variants)
│   ├── Inter-Regular.woff       # Latin (always loaded)
│   ├── Inter-Bold.woff          # Latin bold (always loaded)
│   └── NotoSans*-Regular.ttf    # JP, SC, TC, KR, Thai, Arabic, Hebrew, etc. (lazy-loaded)
├── src/
│   ├── server.mjs               # Express app entry point
│   ├── errors.mjs               # AppError class + sendRouteError helper
│   ├── config.mjs               # Zod-validated env config + TIERS
│   ├── logger.mjs               # pino structured logging
│   ├── middleware/
│   │   ├── authenticate.mjs     # API key auth via Firestore
│   │   ├── firebase-auth.mjs    # Firebase Bearer token auth (dashboard)
│   │   ├── rate-limit.mjs       # Per-tier rate limiting
│   │   ├── billing-guard.mjs    # Monthly credit enforcement (fails open)
│   │   ├── validate.mjs         # Zod schema validation
│   │   └── error-handler.mjs    # Global error handler
│   ├── routes/
│   │   ├── screenshot.mjs       # GET + POST /screenshot
│   │   ├── tweet.mjs            # GET /tweet/:id
│   │   ├── admin.mjs            # Admin key CRUD
│   │   ├── billing.mjs          # Stripe checkout/portal/signup/webhook
│   │   ├── dashboard.mjs        # /dashboard (HTML + API for user dashboard)
│   │   ├── demo.mjs             # GET /demo/screenshot/:tweetIdOrUrl (public, IP-limited)
│   │   ├── health.mjs           # /health, /pricing, /docs
│   │   └── landing.mjs          # GET / (landing page)
│   ├── services/
│   │   ├── firestore.mjs        # Firestore client + collection refs
│   │   ├── firebase-auth.mjs    # Firebase Admin SDK (token verification)
│   │   ├── dashboard.mjs        # Dashboard business logic (user linking, data)
│   │   ├── api-keys.mjs         # API key CRUD + findKeyByEmail (unified ts_<tier>_<uuid>)
│   │   ├── usage.mjs            # Unified tracking + enforcement
│   │   ├── stripe.mjs           # Stripe customer/subscription mgmt
│   │   └── storage.mjs          # Cloud Storage uploads
│   ├── workers/
│   │   ├── render-pool.mjs      # worker_threads pool manager
│   │   └── render-worker.mjs    # Worker entry point
│   └── schemas/
│       └── request-schemas.mjs  # Zod schemas for all requests
├── .github/
│   ├── dependabot.yml           # Automated dependency update PRs
│   └── workflows/
│       └── ci.yml               # GitHub Actions: tests, npm audit, gitleaks, eslint
├── eslint.config.mjs            # ESLint flat config with eslint-plugin-security
├── .npmrc                       # npm security settings (audit=true, save-exact)
├── audit-reports/               # Test coverage + security audit reports
├── tests/
│   ├── smoke/                   # App-alive smoke tests (9 tests)
│   ├── unit/                    # Per-service unit tests (21 files)
│   ├── integration/             # API endpoint tests (9 files)
│   └── helpers/                 # Firestore mock, test fixtures
├── Dockerfile                   # Cloud Run container
├── .dockerignore
├── vitest.config.mjs
└── package.json
```

---

## Architectural Rules

**DO:**
- Pre-fetch all remote images to base64 before calling Satori — Satori cannot fetch URLs at render time. `preFetchAllImages()` returns a `Map<url, base64>` (does NOT mutate the tweet object). After `satori-html` parses the small HTML, `injectImageSources()` walks the VDOM tree to replace URL `src` values with base64. This avoids satori-html's O(n²) parsing on large base64 strings. Uses `twitterImageUrl()` to request optimally-sized Twitter CDN variants (`?name=small|medium`)
- Pass `display: flex` on every container element — Satori only supports Flexbox layout
- Use `extractTweetId()` from `tweet-fetch.mjs` to normalize both URLs and raw IDs — import directly from sub-modules (`tweet-fetch.mjs`, `tweet-render.mjs`), not `core.mjs`
- Use unified `ts_<tier>_<uuid>` format for all API keys (single format everywhere)
- Call `trackAndEnforce()` via billing-guard middleware on every single-item authenticated request
- Use `checkAndReserveCredits()` for batch requests instead of billingGuard — batch does N-credit validation upfront in the handler (fail-open on Firestore error). Do not add billingGuard to the batch middleware chain
- Keep API key strings stable across tier changes (only update the tier field)
- Mount billing routes BEFORE admin routes in `server.mjs` — admin's `router.use()` guard blocks all requests without `X-Admin-Key`, including `/billing/*` paths
- Throw `AppError` (from `src/errors.mjs`) for client errors in core sub-modules (`tweet-fetch.mjs`, etc.) — route catch blocks use `sendRouteError(res, err, code, logger)` which maps `AppError` to its `statusCode` and plain `Error` to 500 with generic message. Always pass `logger` so 500s get logged server-side.
- Check `findKeyByEmail()` before creating new keys in signup — prevents orphaned duplicate keys
- Include `...(req.id && { requestId: req.id })` in all middleware error JSON responses — enables support correlation. Route handlers get this automatically via `sendRouteError()` and the global error handler.
- Use `loadAdditionalAsset` in Satori for emoji and multilingual fonts — `tweet-emoji.mjs` fetches Twemoji SVGs from CDN (5s timeout, LRU cache), `tweet-fonts.mjs` lazy-loads bundled Noto Sans from `fonts/`. Both modules are imported by `tweet-render.mjs` and used per-render.
- When adding new root-level `.mjs` files, add a `COPY` line to the Dockerfile — each root `.mjs` must be explicitly listed (includes `tweet-emoji.mjs`, `tweet-fonts.mjs`)

**DO NOT:**
- Use block-level CSS (`display: block`, `position: absolute`, `grid`) — Satori rejects them
- Use HTML attributes for `<img>` width/height (`width="80"`) — satori-html parses them as strings, satori 0.24+ rejects non-numeric values. Use CSS style instead: `style="width: 80px; height: 80px;"`
- Render images directly from remote URLs in HTML — must convert to data URIs first
- Embed base64 data URIs directly in HTML strings passed to `satori-html` — satori-html has O(n²) parse time (100KB=623ms, 200KB=7.5s). Always inject base64 into the VDOM tree post-parse via `injectImageSources()`
- Block the event loop with synchronous rendering — use the worker thread pool (dynamic timeout: 30s base + 5s per media image, max 60s; hung Satori/Resvg renders reject automatically). Timeout errors return 504 with `RENDER_TIMEOUT` code
- Bypass Firestore for data storage — no local JSON files
- Trust downloaded font files without verifying signature bytes (`wOFF` for WOFF1, `00010000` hex for TTF) — Google Fonts URLs expire across versions and silently return HTML 404 pages
- Create express-rate-limit instances inside request handlers — pre-create at module load
- Use `!==` for secret comparison — use `crypto.timingSafeEqual` to prevent timing attacks
- Interpolate untrusted strings into `new RegExp()` without escaping — use `escapeRegExp()` in `tweet-html.mjs`
- Forward raw `err.message` from Stripe or external APIs to clients — use generic error messages, log the real error server-side
- Throw `new AppError(message)` without an explicit `statusCode` when the error isn't a 400 — always specify the correct HTTP status (e.g. `404` for not-found)

---

## Request Flow (Middleware Chain)

Authenticated routes apply middleware in this order — **do not reorder**:

`authenticate` → `applyRateLimit` → `billingGuard` → `validate(schema)` → handler

- `authenticate` attaches `req.apiKey` + `req.keyData` (required by all downstream middleware)
- `applyRateLimit` reads `req.keyData.tier` (must run after auth)
- `billingGuard` calls `trackAndEnforce()`, sets `X-Credits-*` response headers, fails open on error
- `validate` runs Zod schema against `req.body` or `req.query`, sets `req.validated`

Public routes (`/`, `/health`, `/pricing`, `/docs`) skip all middleware. Admin routes use `X-Admin-Key` header comparison only (no Firestore lookup). Demo route (`/demo/screenshot/:tweetIdOrUrl`) uses IP-based rate limiting only (no auth, no billing). Dashboard API routes (`/dashboard/api/*`) use `dashboardLimiter` (30 req/min/IP) + `firebaseAuth` middleware (Bearer token). GET `/dashboard` serves the HTML page with no auth required.

Batch route (`POST /screenshot/batch`) uses: `authenticate` → `applyRateLimit` → handler. No `billingGuard` or `validate` in chain — the handler detects input format (JSON vs multipart), validates internally, then calls `checkAndReserveCredits()` for N-credit upfront reservation. Fails open on Firestore error.

---

## Data Model (Firestore)

| Collection | Doc ID | Fields |
|---|---|---|
| `apiKeys` | `ts_<tier>_<uuid>` | `tier, name, email, active, created` |
| `usage` | `ts_<tier>_<uuid>` | `total, currentMonth, currentMonthCount, lastUsed` |
| `customers` | `<email>` | `stripeCustomerId, apiKeyId, tier, name, created, firebaseUid?` |
| `subscriptions` | `<stripeSubId>` | `email, tier, status, currentPeriodEnd, updated` |

Usage tracking uses `FieldValue.increment()` for atomic concurrent writes.

---

## Auth Model

**API auth:** `X-API-KEY` header or `?apiKey=` query param. Keys validated against Firestore `apiKeys` collection.

**Firebase auth (dashboard):** `Authorization: Bearer <token>` header. Firebase Admin SDK verifies Google ID tokens server-side. Used only for `/dashboard/api/*` routes. Middleware attaches `req.firebaseUser = { uid, email, name, emailVerified, picture }`. Requires `firebase-admin` package + Application Default Credentials on Cloud Run.

**Admin auth:** `X-Admin-Key` header compared to `config.ADMIN_KEY` via `crypto.timingSafeEqual`. Must be at least 16 characters — no default.

**Tiers (defined in `src/config.mjs`):**

| Tier | Rate Limit | Monthly Credits | Price |
|---|---|---|---|
| free | 10 req/min | 50 | $0 |
| pro | 100 req/min | 1,000 | $9 |
| business | 1,000 req/min | 10,000 | $49 |

**Billing guard fails open:** If Firestore is unavailable, requests proceed (usage not tracked). This prevents infrastructure outages from blocking all rendering.

---

## Environment Variables

| Variable | Default | Required | Description |
|---|---|---|---|
| `PORT` | `3000` | No | Server bind port |
| `HOST` | `0.0.0.0` | No | Server bind address |
| `NODE_ENV` | `development` | No | development / production / test |
| `ADMIN_KEY` | — | **Yes (min 16 chars)** | Admin endpoint auth |
| `STRIPE_SECRET_KEY` | — | For billing | Stripe secret key |
| `STRIPE_PRICE_PRO` | — | For billing | Stripe Price ID for Pro |
| `STRIPE_PRICE_BUSINESS` | — | For billing | Stripe Price ID for Business |
| `STRIPE_WEBHOOK_SECRET` | — | For billing | Webhook signature verification |
| `GCS_BUCKET` | `tweet-shots-screenshots` | For URL response | Cloud Storage bucket |
| `FIREBASE_WEB_API_KEY` | — | For dashboard | Firebase public web API key |
| `FIREBASE_AUTH_DOMAIN` | — | For dashboard | Firebase auth domain |
| `OPENAI_API_KEY` | — | For translation | GPT-4o-mini translation |

---

## Build/Deploy Commands

```bash
# Install
npm install

# Development (auto-reload)
npm run dev

# Production
npm start

# Tests
npm test                  # All tests
npm run test:unit         # Unit only
npm run test:integration  # Integration only

# CLI usage
node tweet-shots.mjs <tweet-url-or-id> [options]

# Docker
docker build -t tweet-shots .
docker run -p 8080:8080 -e ADMIN_KEY=<secret> tweet-shots

# Cloud Run (Kaniko build with layer caching + deploy)
npm run deploy
```

---

## Coding Conventions

- ES Modules throughout (`import`/`export`, `.mjs` extension)
- Dependency injection: route modules receive middleware/services as constructor args
- pino for structured logging (pretty in dev, JSON in prod)
- Zod schemas for all request validation
- Error responses: `{ error: string, code: "SCREAMING_SNAKE_CASE", requestId?: string }` — see `docs/ERROR_MESSAGES.md` for full style guide
- `options = {}` destructuring with defaults in every function signature

---

## Documentation Hierarchy

| Layer | Loaded | What goes here |
|---|---|---|
| **CLAUDE.md** | Every conversation | Rules preventing mistakes on ANY task |
| **MEMORY.md** | Every conversation | Cross-session index + learned patterns |
| **.claude/memory/*.md** | On demand | Feature-specific deep dives |
| **Inline comments** | When code is read | Non-obvious "why" explanations |

Rule: Prevents mistakes on unrelated tasks → CLAUDE.md. Spans features → MEMORY.md. One feature only → sub-memory. Single line → inline comment.

**Topic files** (in `.claude/memory/`, load when working on that area):

| File | When to load |
|---|---|
| `testing.md` | Writing or fixing tests |
| `rendering-pipeline.md` | Satori, Resvg, fonts, workers, image pre-fetch |
| `billing-stripe.md` | Stripe integration, webhooks, tier changes |
| `data-model.md` | Firestore schemas, queries, usage tracking |
| `api-endpoints.md` | Adding/modifying routes, request/response shapes |
| `deployment.md` | Docker, Cloud Run, Secret Manager, CI/CD |
| `pitfalls.md` | Active gotchas and known limitations |
| `security.md` | Auth boundaries, input validation, accepted risks |
| `feature-inventory.md` | CLI/API features, rendering options, unsupported |
| `twitter-api.md` | Syndication API, tweet data shapes, limitations |
| `debugging.md` | Rendering failures, font/emoji issues, auth/config diagnosis |
