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
├── core.mjs                     # Rendering core (shared by CLI + API)
├── tweet-shots.mjs              # CLI entry point
├── landing.html                 # Marketing landing page
├── fonts/                       # Bundled Inter fonts (no runtime fetch)
│   ├── Inter-Regular.woff
│   └── Inter-Bold.woff
├── src/
│   ├── server.mjs               # Express app entry point
│   ├── errors.mjs               # AppError class (client errors with statusCode)
│   ├── config.mjs               # Zod-validated env config + TIERS
│   ├── logger.mjs               # pino structured logging
│   ├── middleware/
│   │   ├── authenticate.mjs     # API key auth via Firestore
│   │   ├── rate-limit.mjs       # Per-tier rate limiting
│   │   ├── billing-guard.mjs    # Monthly credit enforcement (fails open)
│   │   ├── validate.mjs         # Zod schema validation
│   │   └── error-handler.mjs    # Global error handler
│   ├── routes/
│   │   ├── screenshot.mjs       # GET + POST /screenshot
│   │   ├── tweet.mjs            # GET /tweet/:id
│   │   ├── admin.mjs            # Admin key CRUD
│   │   ├── billing.mjs          # Stripe checkout/portal/signup/webhook
│   │   ├── health.mjs           # /health, /pricing, /docs
│   │   └── landing.mjs          # GET / (landing page)
│   ├── services/
│   │   ├── firestore.mjs        # Firestore client + collection refs
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
│   ├── smoke/                   # App-alive smoke tests (7 tests)
│   ├── unit/                    # Per-service unit tests (17 files)
│   ├── integration/             # API endpoint tests (7 files)
│   └── helpers/                 # Firestore mock, test fixtures
├── Dockerfile                   # Cloud Run container
├── .dockerignore
├── vitest.config.mjs
└── package.json
```

---

## Architectural Rules

**DO:**
- Pre-fetch all remote images to base64 before calling Satori — Satori cannot fetch URLs at render time
- Pass `display: flex` on every container element — Satori only supports Flexbox layout
- Use `extractTweetId()` from `core.mjs` to normalize both URLs and raw IDs
- Use unified `ts_<tier>_<uuid>` format for all API keys (single format everywhere)
- Call `trackAndEnforce()` via billing-guard middleware on every authenticated request
- Keep API key strings stable across tier changes (only update the tier field)
- Mount billing routes BEFORE admin routes in `server.mjs` — admin's `router.use()` guard blocks all requests without `X-Admin-Key`, including `/billing/*` paths
- Throw `AppError` (from `src/errors.mjs`) for client errors in `core.mjs` — route catch blocks use `instanceof AppError` to return `err.statusCode`, plain `Error` becomes 500 with generic message
- Check `findKeyByEmail()` before creating new keys in signup — prevents orphaned duplicate keys

**DO NOT:**
- Use block-level CSS (`display: block`, `position: absolute`, `grid`) — Satori rejects them
- Use HTML attributes for `<img>` width/height (`width="80"`) — satori-html parses them as strings, satori 0.24+ rejects non-numeric values. Use CSS style instead: `style="width: 80px; height: 80px;"`
- Render images directly from remote URLs in HTML — must convert to data URIs first
- Block the event loop with synchronous rendering — use the worker thread pool
- Bypass Firestore for data storage — no local JSON files
- Trust downloaded font files without verifying signature bytes (`wOFF` for WOFF1, `00010000` hex for TTF) — Google Fonts URLs expire across versions and silently return HTML 404 pages
- Create express-rate-limit instances inside request handlers — pre-create at module load
- Use `!==` for secret comparison — use `crypto.timingSafeEqual` to prevent timing attacks
- Interpolate untrusted strings into `new RegExp()` without escaping — use `escapeRegExp()` in `core.mjs`
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

Public routes (`/`, `/health`, `/pricing`, `/docs`) skip all middleware. Admin routes use `X-Admin-Key` header comparison only (no Firestore lookup).

---

## Data Model (Firestore)

| Collection | Doc ID | Fields |
|---|---|---|
| `apiKeys` | `ts_<tier>_<uuid>` | `tier, name, email, active, created` |
| `usage` | `ts_<tier>_<uuid>` | `total, currentMonth, currentMonthCount, lastUsed` |
| `customers` | `<email>` | `stripeCustomerId, apiKeyId, tier, name, created` |
| `subscriptions` | `<stripeSubId>` | `email, tier, status, currentPeriodEnd, updated` |

Usage tracking uses `FieldValue.increment()` for atomic concurrent writes.

---

## Auth Model

**API auth:** `X-API-KEY` header or `?apiKey=` query param. Keys validated against Firestore `apiKeys` collection.

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

# Cloud Run
gcloud run deploy tweet-shots-api \
  --image <tag> --region us-central1 --allow-unauthenticated \
  --port 8080 --memory 1Gi --cpu 2
```

---

## Coding Conventions

- ES Modules throughout (`import`/`export`, `.mjs` extension)
- Dependency injection: route modules receive middleware/services as constructor args
- pino for structured logging (pretty in dev, JSON in prod)
- Zod schemas for all request validation
- Error responses: `{ error: string, code: "SCREAMING_SNAKE_CASE" }`
- `options = {}` destructuring with defaults in every function signature

---

## Twitter Syndication API

- Endpoint: `https://cdn.syndication.twimg.com/tweet-result?id=<id>&token=<random>`
- Token is a random integer 0–999999 (required but not validated by Twitter)
- Returns `{ text, user, entities, mediaDetails, photos, quoted_tweet, ... }`
- Unavailable for: private accounts, deleted tweets, some older tweets
- Videos: appear as static thumbnail in `mediaDetails[0].media_url_https`
- The API does **not** expose thread continuation — thread walking is best-effort via `parent.id_str`

---

## Documentation Hierarchy

| Layer | Loaded | What goes here |
|---|---|---|
| **CLAUDE.md** | Every conversation | Rules preventing mistakes on ANY task |
| **MEMORY.md** | Every conversation | Cross-session index + learned patterns |
| **.claude/memory/*.md** | On demand | Feature-specific deep dives |
| **Inline comments** | When code is read | Non-obvious "why" explanations |

Rule: Prevents mistakes on unrelated tasks → CLAUDE.md. Spans features → MEMORY.md. One feature only → sub-memory. Single line → inline comment.

**Topic files** (load when working on that area):

| File | When to load |
|---|---|
| `testing.md` | Writing or fixing tests |
| `rendering-pipeline.md` | Touching core.mjs, Satori, Resvg, fonts, workers |
| `billing-stripe.md` | Stripe integration, webhook handling, tier changes |
| `data-model.md` | Firestore schemas, queries, usage tracking |
| `api-endpoints.md` | Adding/modifying API routes, request/response shapes |
| `deployment.md` | Docker, Cloud Run, Secret Manager, CI/CD |
