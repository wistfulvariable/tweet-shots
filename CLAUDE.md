# tweet-shots — CLAUDE.md

## Project Identity

tweet-shots converts Twitter/X tweet URLs or IDs into pixel-perfect PNG/SVG screenshots — no browser automation. Dual interface: a Node.js CLI script and an Express REST API with API-key auth, tiered rate limiting, and Stripe billing. Core rendering pipeline: Twitter syndication API → HTML string → Satori (SVG) → Resvg (PNG).

---

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| Node.js | 20+ | Runtime (ES Modules — `"type": "module"`) |
| Express | 4.18 | REST API server |
| Satori | 0.12 | HTML/CSS → SVG rendering |
| @resvg/resvg-js | 2.6 | SVG → PNG conversion |
| satori-html | 0.3 | HTML string → Satori VDOM |
| Stripe | 20.4 | Subscription billing |
| pdfkit | 0.15 | PDF generation from image arrays |
| helmet / cors / express-rate-limit | latest | API security middleware |
| uuid | 9 | API key ID generation |

---

## Project Structure

```
tweet-shots/
├── tweet-shots.mjs        # CLI entry point + full rendering core (1175 lines)
├── api-server.mjs         # Express REST API — duplicates rendering logic (821 lines)
├── stripe-billing.mjs     # Stripe billing module — NOT wired into api-server.mjs
├── landing.html           # Static marketing landing page
├── api-keys.json          # Live API key store (JSON file — NOT a database)
├── usage.json             # Usage counters per key (created at runtime)
├── customers.json         # Stripe customer data (created at runtime)
├── subscriptions.json     # Stripe subscription data (created at runtime)
├── tweet-shots-api.service # systemd unit for Linux deployment
├── examples/              # Sample output images (dark.png, quote-tweet.png)
├── API.md                 # REST API reference (human-facing)
└── README.md              # CLI usage reference (human-facing)
```

---

## Architectural Rules

**DO:**
- Pre-fetch all remote images to base64 before calling Satori — Satori cannot fetch URLs at render time
- Pass `display: flex` on every container element — Satori only supports Flexbox layout
- Load fonts from Google Fonts (Inter 400 + 700) on every render call — no font cache exists
- Use `extractTweetId()` to normalize both URLs and raw IDs before any fetch
- Use `ts_<tier>_<uuid>` format for API keys created by the admin API; stripe-billing uses base64-of-email pattern (do not mix)

**DO NOT:**
- Use block-level CSS (`display: block`, `position: absolute`, `grid`) — Satori rejects them
- Render images directly from remote URLs in HTML — must convert to data URIs first
- Add billing enforcement through `stripe-billing.mjs` routes without first wiring it into `api-server.mjs` (it is currently disconnected — see `.claude/memory/billing.md`)
- Rely on JSON files for concurrent writes — `api-keys.json` and `usage.json` have no locking

---

## Data Model Overview

| Store | File | Key Structure |
|---|---|---|
| API Keys | `api-keys.json` | `{ "ts_<tier>_<id>": { name, tier, email?, created, active } }` |
| Usage | `usage.json` | `{ "ts_<tier>_<id>": { total, monthly: { "YYYY-MM": count }, lastUsed } }` |
| Customers | `customers.json` | `{ "<email>": { stripeCustomerId, apiKey, tier, usageThisMonth, ... } }` |
| Subscriptions | `subscriptions.json` | `{ "<stripeSubscriptionId>": { email, tier, status, currentPeriodEnd } }` |

Usage is saved every 10 requests — up to 9 counts can be lost on crash.

---

## Auth Model

**API auth:** `X-API-KEY` header or `?apiKey=` query param. Keys validated against in-memory `apiKeys` map loaded from `api-keys.json` on startup.

**Admin auth:** `X-Admin-Key` header compared to `process.env.ADMIN_KEY`. Default is `"admin-secret-key"` if env not set — **change this before any deployment**.

**Tiers:** `free` (10 req/min), `pro` (100 req/min), `business` (1000 req/min). Billing monthly credit limits are separate from rate limits.

**Rate limiting:** per-`apiKey` via `express-rate-limit`, one limiter instance per tier.

---

## Environment Variables

| Variable | Default | Required | Description |
|---|---|---|---|
| `PORT` | `3000` | No | Server bind port |
| `HOST` | `0.0.0.0` | No | Server bind address |
| `ADMIN_KEY` | `admin-secret-key` | **Yes** | Admin endpoint auth — change this |
| `STRIPE_SECRET_KEY` | — | For billing | Stripe secret key |
| `STRIPE_PRICE_PRO` | `price_pro_placeholder` | For billing | Stripe Price ID for Pro tier |
| `STRIPE_PRICE_BUSINESS` | `price_business_placeholder` | For billing | Stripe Price ID for Business tier |
| `STRIPE_WEBHOOK_SECRET` | — | For billing | Webhook signature verification |
| `OPENAI_API_KEY` | — | For translation | GPT-4o-mini translation feature |
| `PUBLIC_URL` | — | For URL response | Base URL for saved image hosting |
| `OUTPUT_DIR` | `./output` | No | Directory for URL-response saved images |
| `API_KEYS_FILE` | `./api-keys.json` | No | API key storage path |
| `USAGE_FILE` | `./usage.json` | No | Usage tracking storage path |

---

## Build/Deploy Commands

```bash
# Install
npm install

# Development (auto-reload)
npm run dev

# Production
npm start

# CLI usage
node tweet-shots.mjs <tweet-url-or-id> [options]

# systemd deployment
sudo cp tweet-shots-api.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable tweet-shots-api
sudo systemctl start tweet-shots-api

# Docker
docker build -t tweet-shots .
docker run -p 3000:3000 -e ADMIN_KEY=<secret> tweet-shots
```

---

## Coding Conventions

- ES Modules throughout (`import`/`export`, `.mjs` extension)
- Section dividers: `// ===...=== // SECTION NAME // ===...===`
- Named function exports from `stripe-billing.mjs`; all other code unexported
- Config constants at top of each file (`THEMES`, `DIMENSIONS`, `GRADIENTS`, `CONFIG`)
- `options = {}` destructuring with defaults in every function signature
- `console.error` for errors, `console.log` for progress; no logger library
- Error responses: `{ error: string, code: "SCREAMING_SNAKE_CASE" }`

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
| **MEMORY.md** | Every conversation | Index + current state |
| **.claude/memory/*.md** | On demand | Feature-specific deep dives |
| **API.md / README.md** | Human reference | API reference, CLI usage |
| **Inline comments** | When code is read | Non-obvious "why" explanations |

Rule: Prevents mistakes on unrelated tasks → CLAUDE.md. Spans features → MEMORY.md. One feature only → sub-memory file. Single line → inline comment.
