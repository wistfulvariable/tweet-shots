# Project Memory — Index

tweet-shots: CLI + REST API for generating tweet screenshots via Satori/Resvg (no browser). See CLAUDE.md for rules.

## Current State

- **Architecture:** Modular Express 5 app with Firestore, Cloud Run deployment, worker thread rendering
- **Deployment:** `https://tweet-shots-api-1084185199991.us-central1.run.app`
- **Tests:** ~670 tests passing across 26 files (19 unit + 10 integration + 1 smoke)
- **GCP:** Project `tweet-shots-api`, Firestore + GCS in `us-central1`
- **CI:** GitHub Actions — tests + npm audit + gitleaks + eslint-plugin-security
- **Test API Key:** `ts_free_3958a9cac86343c5b62d0c2e7d928302`
- **Deploy:** `npm run deploy` — Kaniko build with layer caching via `cloudbuild.yaml`, then Cloud Run deploy

## Topic Files

| File | When to load |
|---|---|
| testing.md | Writing or fixing tests |
| rendering-pipeline.md | Satori, Resvg, fonts, workers, image pre-fetch |
| billing-stripe.md | Stripe integration, webhooks, tier changes |
| data-model.md | Firestore schemas, queries, usage tracking |
| api-endpoints.md | Adding/modifying routes, request/response shapes |
| deployment.md | Docker, Cloud Run, Secret Manager, CI/CD |
| pitfalls.md | Active gotchas and known limitations |
| security.md | Auth boundaries, input validation, accepted risks |
| feature-inventory.md | CLI/API features, rendering options, unsupported |
| twitter-api.md | Syndication API, tweet data shapes, limitations |
| debugging.md | Rendering failures, font/emoji issues, auth/config diagnosis |
