# Project Memory — Index

tweet-shots: CLI + REST API for generating tweet screenshots via Satori/Resvg (no browser). See CLAUDE.md for rules.

## Current State

- 7 commits on master; most recent: Stripe billing + landing page + production deploy
- No test files exist (zero test coverage)
- `stripe-billing.mjs` is disconnected — Stripe billing not active in API server
- API keys and sensitive data committed to git (needs gitignore fix)
- Known live keys: `ts_free_test123` (test), `ts_free_6d2407...` (test@example.com)
- Server: http://localhost:3000 (development)

## Topic Files

| File | When to load |
|---|---|
| rendering.md | Modifying image generation, Satori layout, themes, fonts, height calc |
| api-routes.md | Adding/modifying API endpoints, middleware, auth, rate limits |
| billing.md | Stripe integration, tier system, disconnected billing module |
| data-storage.md | JSON file schema, API key formats, usage tracking |
| security.md | Security issues, auth details, vulnerability findings |
| feature-inventory.md | CLI features, API features, rendering options, unsupported features |
| pitfalls.md | Code duplication, behavioral quirks, edge cases, gotchas |
| deployment.md | systemd, Docker, env vars, Stripe webhook setup |
| twitter-api.md | Syndication API, tweet data shapes, known limitations |
