# Deployment

## Docker (Multi-Stage Build)

`Dockerfile` uses two stages:
1. **deps** — `node:20-slim`, `npm ci --omit=dev`
2. **production** — `node:20-slim`, installs `libfontconfig1` (Resvg needs it), runs as non-root `app` user

Copied files: `package.json`, `core.mjs`, `tweet-fetch.mjs`, `tweet-html.mjs`, `tweet-render.mjs`, `tweet-emoji.mjs`, `tweet-fonts.mjs`, `tweet-utils.mjs`, `tweet-shots.mjs`, `landing.html`, `fonts/`, `src/`. Each root `.mjs` file must be COPY'd explicitly. The `fonts/` directory contains Inter (always loaded, ~200KB) + 13 Noto Sans variants for multilingual rendering (lazy-loaded, ~30MB total).

```bash
docker build -t tweet-shots .
docker run -p 8080:8080 -e ADMIN_KEY=<secret> tweet-shots
```

Production image exposes port 8080, `NODE_ENV=production`.

## Cloud Run

```bash
gcloud run deploy tweet-shots-api \
  --source . --region us-central1 --allow-unauthenticated \
  --port 8080 --memory 1Gi --cpu 2 --project tweet-shots-api
```

- **Service URL:** `https://tweet-shots-api-1084185199991.us-central1.run.app`
- **GCP Project:** `tweet-shots-api`
- **Region:** `us-central1` (same as Firestore)
- Worker pool size adapts to available CPUs on the Cloud Run instance

## Secret Manager

| Secret | Purpose |
|---|---|
| `ADMIN_KEY` | Admin endpoint auth (min 16 chars) |
| `STRIPE_SECRET_KEY` | Stripe API (needs at least one version) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification |
| `STRIPE_PRICE_PRO` | Stripe Price ID for Pro tier |
| `STRIPE_PRICE_BUSINESS` | Stripe Price ID for Business tier |

Secrets are mapped to env vars in the Cloud Run service config.

## GCS Storage

- **Bucket:** `tweet-shots-screenshots`
- **Path pattern:** `screenshots/<tweetId>-<timestamp>.<format>`
- **Cache-Control:** `public, max-age=31536000` (1 year)
- Used by `url` response type in `POST /screenshot`

## Firestore

- Auto-detected via ADC on Cloud Run (no explicit project ID needed)
- Region: `us-central1`
- Collections: `apiKeys`, `usage`, `customers`, `subscriptions`

## Graceful Shutdown

Server handles `SIGTERM` and `SIGINT`:
1. Stop accepting new connections
2. Shut down worker pool (`renderPool.shutdown()`)
3. Force exit after 10s if connections don't close

## CI/CD — GitHub Actions

Pipeline: `.github/workflows/ci.yml` — runs on push/PR to master.

| Job | What it does |
|---|---|
| **test** | `npm ci` → `npm audit --audit-level=high` → `npm test` |
| **secrets-scan** | gitleaks v2 against full git history |
| **lint-security** | eslint with eslint-plugin-security |

All three jobs run in parallel. PRs blocked if any job fails.

## Stripe Webhook

Register in Stripe Dashboard: `POST https://<domain>/webhook/stripe`

Events to enable: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`.
