# Project Memory — Index

tweet-shots: CLI + REST API for generating tweet screenshots via Satori/Resvg (no browser). See CLAUDE.md for rules.

## Current State

- **Architecture:** Modular Express app with Firestore, Cloud Run deployment (rewrite complete)
- **Deployment:** `https://tweet-shots-api-1084185199991.us-central1.run.app`
- **Tests:** 224 tests passing (8 unit + 4 integration test files)
- **GCP:** Project `tweet-shots-api`, Firestore + GCS in `us-central1`
- **Test API Key:** `ts_free_3958a9cac86343c5b62d0c2e7d928302`

## Topic Files

| File | When to load |
|---|---|
| testing.md | Writing or fixing tests |
| rendering-pipeline.md | Touching core.mjs, Satori, Resvg, fonts, workers |
| billing-stripe.md | Stripe integration, webhook handling, tier changes |
| data-model.md | Firestore schemas, queries, usage tracking |
| api-endpoints.md | Adding/modifying API routes, request/response shapes |
| deployment.md | Docker, Cloud Run, Secret Manager, CI/CD |
| pitfalls.md | Active gotchas and known limitations |
| security.md | Auth boundaries, input validation, accepted risks |
| feature-inventory.md | CLI/API features, rendering options, unsupported features |
| twitter-api.md | Syndication API, tweet data shapes, known limitations |
