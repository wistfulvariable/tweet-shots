# Product Polish & UX Friction Audit — Run 01

**Date:** 2026-03-03
**Scope:** Full user-facing surface (landing page, API, CLI, demo, billing, admin)
**Method:** Static code analysis (read-only, no running app)

---

## 1. Executive Summary

**Overall polish level: Fair** — The product has strong technical foundations and a clean landing page, but the path from "interested visitor" to "paying customer" has multiple dead ends and friction points. The core rendering pipeline works well. The biggest gaps are in onboarding (no signup form, placeholder URLs in docs), post-checkout UX (no confirmation of what happened), and silent failures in CLI/rendering that leave users confused.

**Worst friction:** Landing page code examples use `api.example.com` (dead URL), `/docs` returns raw JSON, and there's no HTML signup form — the three steps a first-time user would take all fail.

**Journey health:**
| Journey | Health |
|---------|--------|
| Landing → Demo → Generate screenshot | Smooth |
| Landing → Signup → Get API key | Significant friction |
| Landing → Docs → Understand API | Broken (JSON wall) |
| API → Screenshot (authenticated) | Smooth |
| API → Screenshot (rate limited) | Some friction |
| CLI → Single screenshot | Smooth |
| CLI → Batch processing | Significant friction |
| CLI → Thread capture | Some friction |
| Free → Paid upgrade | Significant friction |
| Admin → Key management | Some friction |
| Billing → Stripe checkout → Confirmation | Significant friction |

---

## 2. User Journey Map

### Entry Points

| Entry Point | Exists | Health |
|-------------|--------|--------|
| Landing page (browser) | Yes | Good — clear value prop, live demo |
| Landing page (curl/API client) | Yes | Fair — JSON response, but links point to JSON endpoints |
| `/docs` | Yes | Broken — returns raw JSON, not HTML |
| `/pricing` | Yes | Broken — returns raw JSON, not HTML |
| Demo (public, no auth) | Yes | Good — works, rate-limited, clear feedback |
| CLI (`node tweet-shots.mjs`) | Yes | Good — help text covers basics |
| Direct API call (with key) | Yes | Smooth — standard REST |
| Billing signup link | Exists as POST endpoint | Broken — no GET/HTML form |
| Billing checkout link | Exists as POST endpoint | Broken — no GET/HTML form |
| GitHub repo | Yes (linked in footer) | N/A (external) |

### Core Journeys

**First-time visitor (browser):**
1. Lands on `/` → sees hero, demo, pricing, code example — **Good**
2. Tries demo → works (5 req/min IP limit) — **Good**
3. Clicks "Get API Key" → scrolls to pricing — **Good**
4. Clicks "Get Started" (free) → hits POST `/billing/signup?tier=free` — **Broken** (no form, no email collection, GET returns nothing useful)
5. Clicks "View Docs" → gets raw JSON — **Broken**
6. Copies code example → uses `api.example.com` — **Broken**

**First-time developer (API client):**
1. Reads `/docs` JSON → understands endpoints — **Fair** (parseable but ugly)
2. Signs up via POST `/billing/signup` with email/name → gets API key — **Smooth** (if they know the endpoint)
3. Makes screenshot request → works — **Smooth**
4. Hits rate limit → sees error with Retry-After header — **Fair** (message could be clearer)
5. Hits credit limit → sees error with upgrade CTA — **Fair** (no pricing details in error)

**CLI user:**
1. Runs `node tweet-shots.mjs --help` → sees options — **Good**
2. Runs `node tweet-shots.mjs <url>` → gets screenshot — **Smooth**
3. Runs batch → gets summary but no per-URL error details — **Significant friction**
4. Runs thread → works, but silently truncates if network issues — **Some friction**

---

## 3. Critical Friction Points

| # | Flow | Location | Issue | Severity | Type |
|---|------|----------|-------|----------|------|
| 1 | Landing → Code example | [landing.html:643-650](landing.html#L643-L650) | Code examples use `api.example.com` placeholder URL | Critical | Broken |
| 2 | Landing → Docs | [landing.html:462](landing.html#L462), [health.mjs](src/routes/health.mjs) | `/docs` link returns raw JSON, not HTML documentation | Critical | Broken |
| 3 | Landing → Signup | [landing.html:602](landing.html#L602), [billing.mjs](src/routes/billing.mjs) | "Get Started" links to POST endpoint, no signup HTML form exists | Critical | Missing |
| 4 | API → Signup | [billing.mjs](src/routes/billing.mjs) | No email verification — typo in email = lost API key, no recovery | High | Missing |
| 5 | CLI → Batch | [tweet-shots.mjs:244-262](tweet-shots.mjs#L244-L262) | No per-URL error details; exit code 0 even on partial failures | High | Incomplete |
| 6 | API → Render | [tweet-render.mjs:73-94](tweet-render.mjs#L73-L94) | Image pre-fetch failures return null silently — screenshots missing images with no indication | High | Confusing |
| 7 | Billing → Checkout → Success | [billing.mjs](src/routes/billing.mjs) | Post-checkout success page doesn't show API key or new tier | High | Incomplete |
| 8 | API → POST /screenshot | [screenshot.mjs](src/routes/screenshot.mjs), [request-schemas.mjs](src/schemas/request-schemas.mjs) | Redundant parameter pairs (`bgColor`/`backgroundColor`, `gradient`/`backgroundGradient`, `radius`/`borderRadius`, `hideMetrics`/`showMetrics`) with silent precedence | Medium | Confusing |
| 9 | API → Validate | [validate.mjs](src/middleware/validate.mjs) | Validation errors missing `requestId` (inconsistent with auth/billing middleware) | Medium | Incomplete |
| 10 | API → Rate limit | [rate-limit.mjs](src/middleware/rate-limit.mjs) | Rate limit messages don't specify the window or when to retry | Medium | Incomplete |
| 11 | CLI → Render | [tweet-render.mjs](tweet-render.mjs), [tweet-shots.mjs](tweet-shots.mjs) | CLI rendering has no timeout — hangs indefinitely on bad input | Medium | Broken |
| 12 | API → Credit limit | [billing-guard.mjs](src/middleware/billing-guard.mjs) | Credit exhaustion error doesn't include reset date, pricing info, or usage stats | Medium | Incomplete |
| 13 | CLI → Thread | [tweet-fetch.mjs:84-121](tweet-fetch.mjs#L84-L121) | Thread walking silently truncates on network errors; no user notification | Medium | Confusing |
| 14 | Demo → Rate limit | [landing.html:471](landing.html#L471) | Demo rate limit (5/min) not mentioned upfront; no recovery path when hit | Medium | Confusing |
| 15 | Admin → Delete key | [admin.mjs](src/routes/admin.mjs) | DELETE returns `{ success: true }` without confirming which key/email was deleted | Low | Incomplete |

---

## 4. First-Use & Onboarding

### Signup Friction

- **No signup HTML form exists.** Landing page pricing buttons link to POST API endpoints (`/billing/signup?tier=free`, `/billing/checkout?tier=pro`). A browser GET request to these URLs returns nothing useful. Users clicking these buttons from the landing page hit a dead end.
- **No email verification.** POST `/billing/signup` accepts any email string and immediately returns an API key. A typo means the key is permanently associated with a wrong email — no recovery mechanism exists.
- **Idempotent signup is good but misleading.** Calling signup twice with the same email returns the same key, but the response says "Your API key is ready! Save it somewhere safe" both times — no indication it's a recovery, not a new account.
- **No upgrade path in signup response.** Free signup doesn't mention upgrade options or link to checkout.

### Empty States

- **No empty states apply** — this is an API product, not a dashboard. The closest equivalent is the demo result area before generating, which correctly starts hidden.

### Documentation Gap

- `/docs` returns machine-readable JSON, not human-readable HTML. Developers expect a formatted reference page. The JSON content is comprehensive (endpoints, params, auth) but unusable in a browser.
- `/pricing` also returns raw JSON. The landing page has pricing embedded in HTML, but the JSON endpoint doesn't link back to it.
- `docs/ERROR_MESSAGES.md` is excellent but completely undiscoverable — not linked from `/docs`, landing page, or any API response.

---

## 5. Core Workflow

### Screenshot API (Authenticated)

**Step count:** 2 steps (signup → screenshot). Minimal friction once the user has a key.

**GET /screenshot/:tweetIdOrUrl:**
- Works cleanly, returns binary PNG/SVG with useful headers (`X-Tweet-ID`, `X-Render-Time-Ms`)
- No response format choice (always binary). Users wanting base64 or URL must use POST.

**POST /screenshot:**
- Three response formats (image, base64, url). Flexible.
- **Redundant parameter pairs are confusing:** `bgColor` vs `backgroundColor`, `gradient` vs `backgroundGradient`, `radius` vs `borderRadius`, `hideMetrics` vs `showMetrics`. If both are sent, silent precedence applies with no warning. Source of subtle bugs.
- `response=url` fails with 503 when GCS bucket isn't configured — correct but the error could clarify this is an infrastructure config issue, not a request error.

### Demo (Public)

- Works well. Loading states with elapsed time ("Still rendering... 12s") are a nice touch.
- "Copy API call" button correctly uses `window.location.origin` (not the broken `api.example.com`).
- Rate limit (5 req/min per IP) not disclosed until hit. Should warn upfront.
- Stripped parameters (`format`, `scale`) are silently ignored rather than rejected with a helpful message.
- Different error code (`DEMO_RENDER_TIMEOUT` vs `RENDER_TIMEOUT`) creates parsing burden for consumers checking both paths.

### CLI

- Help text is comprehensive but missing: input format examples for batch files, dimension preset actual sizes, translation language list.
- No progress indication for single-tweet renders (can take 30+ seconds for media-heavy tweets). Users think the tool is hung.
- Batch processing lacks per-URL error reporting and always exits 0 even on partial failures — breaks CI/CD integration.
- Scale factor accepts any integer with no validation. `--scale 100` silently passes to Satori and may hang.
- Dimension preset validation absent. `--dimension fake_preset` silently falls back to default width.

### Forms & Inputs

- Demo form inputs are well-designed: chip pickers for theme/gradient, dropdown for dimensions, checkboxes for toggles.
- Demo input placeholder is helpful: "Paste tweet URL or ID (e.g. https://x.com/user/status/123...)"
- Empty input handled correctly (focus returns to input, no request sent).

### Feedback & Loading

- Demo has excellent loading feedback (spinner + elapsed timer + contextual message).
- API responses include `X-Render-Time-Ms` header — useful for monitoring but undocumented.
- Billing guard sets `X-Credits-Remaining` header — also undocumented.
- No loading feedback in CLI for long single-tweet renders.

---

## 6. Edge Cases & Errors

### Destructive Actions

- **Key deletion** (DELETE `/admin/keys/:key`): Returns `{ success: true }` without confirming metadata of the deleted key. No undo, no cascade warning (all users of that key lose access immediately).
- **No "temporarily disable" option** — only hard delete (soft-delete via `active: false`), no suspend/resume.

### Common Error States

| Scenario | Handled? | Quality |
|----------|----------|---------|
| Network offline (demo) | Yes | Good — "Network error. Please check your connection." |
| Invalid tweet URL | Yes | Good — actionable message |
| Tweet deleted/private | Yes | Fair — "Tweet not found or is no longer available" (doesn't distinguish cause) |
| Rate limited (API) | Yes | Fair — mentions Retry-After header but doesn't explain it |
| Rate limited (demo) | Yes | Fair — suggests signup but no link/button |
| Credit limit exceeded | Yes | Fair — mentions upgrade path but no pricing details |
| Render timeout | Yes | Good — suggests hideMedia as workaround |
| Invalid API key | Yes | Fair — suggests signup, doesn't distinguish typo from revocation |
| Stripe not configured | Yes | Good — returns 503 with clear message |
| Firestore outage | Yes | Fair — billing guard fails open silently, auth fails hard |

### Boundaries

- **Long tweet text:** Height calculation uses `CHARS_PER_LINE = 45` which doesn't account for emoji widths, resulting in occasional clipping.
- **Multi-image quote tweets:** Only first image is fetched/rendered. No warning that the quote tweet is incomplete.
- **Large images:** Capped at Twitter CDN 'medium' size (1200px) with 10s per-image timeout. Good handling.
- **Special characters:** Tweet text HTML-escaped via `escapeHtml()`. RegExp inputs escaped via `escapeRegExp()`. Solid.

---

## 7. Settings & Account

### API Key Lifecycle

| Action | Exists? | Notes |
|--------|---------|-------|
| Create key | Yes | Via `/billing/signup` or admin |
| Use key | Yes | `X-API-KEY` header or `?apiKey=` query |
| View key info | No | No endpoint to check current tier/usage for a key holder |
| Rotate key | No | Must revoke + recreate manually |
| Temporarily disable | No | Only hard revoke |
| Delete/revoke | Yes (admin only) | No self-service revocation |
| Upgrade tier | Yes (via Stripe portal) | Key string stays stable |

**Missing:** Self-service key info (`GET /me`), key rotation, temporary disable, usage history export.

### Billing Management

- Stripe portal (`POST /billing/portal`) works for subscription management.
- **No email verification** ties portal access to key ownership — anyone with an email can access billing.
- **No confirmation email** after signup, checkout, or tier change.
- **Payment failure handling:** Only logs a warning. No auto-downgrade, no notification to user. User continues to get charged/rejected without knowing why.

---

## 8. Notifications

### Inventory

| Notification | Type | Exists? | Quality |
|-------------|------|---------|---------|
| Welcome email after signup | Email | No | Missing |
| API key delivery | In response body | Yes | Fair — "Save it somewhere safe" but no email backup |
| Credit limit approaching | Any | No | Missing |
| Credit limit hit | API response | Yes | Fair |
| Tier upgrade confirmation | Any | No | Missing |
| Payment failure alert | Any | No | Missing — only server-side log |
| Password reset | N/A | N/A | No passwords (key-based auth) |
| Invoice/receipt | Via Stripe | Stripe default | Not app-controlled |

**Missing notifications that users would expect:**
1. Email with API key after signup (backup in case response is lost)
2. Warning at 80% credit usage
3. Confirmation of tier change after Stripe checkout
4. Alert on payment failure with "update payment method" CTA

### User Control

No notification preferences exist (no emails are sent by the app at all).

---

## 9. Accessibility Notes

**Landing page (quick scan, verify in running app):**
- `lang="en"` set on `<html>` — good
- `<img id="demo-image" alt="Generated tweet screenshot">` — generic but acceptable alt text
- Chip buttons have no `aria-pressed` state for screen readers — **issue**
- Color-only information: gradient chip names (sunset, ocean, etc.) are text-based, not color-only — good
- Demo form inputs have `<label>` elements — good
- Keyboard navigation: Enter key triggers generate — good. Tab order appears logical.
- **Focus management:** After generate, focus doesn't move to result area — screen reader users won't know the image appeared. **Issue.**
- Mobile responsiveness: Media query at 768px reduces h1 font size and removes featured card transform. Basic but functional.
- **No skip navigation link** for keyboard users to bypass hero section.
- **No ARIA live region** on demo result area — screen readers won't announce dynamically loaded content. **Issue.**
- Contrast ratios: `var(--text-secondary): #94a3b8` on `var(--bg): #0f172a` = ~5.7:1 (passes AA). `var(--accent): #3b82f6` on dark = ~4.9:1 (passes AA for large text, borderline for small text).

---

## 10. Recommendations

### Quick Fixes (hours)

| # | Fix | Impact | Risk if Ignored |
|---|-----|--------|-----------------|
| 1 | Replace `api.example.com` in [landing.html:643-650](landing.html#L643-L650) with actual deployment URL | First-time users can copy-paste working examples | Critical — every trial user hits this |
| 2 | Add `requestId` to validation error responses in [validate.mjs](src/middleware/validate.mjs) | Consistent error format for support correlation | Medium — support burden |
| 3 | Standardize timeout error code to `RENDER_TIMEOUT` everywhere (remove `DEMO_RENDER_TIMEOUT`) | Simplifies client error handling | Low — minor DX friction |
| 4 | Add demo rate limit warning text near "No API key needed" in [landing.html:471](landing.html#L471) | Users won't be surprised by sudden 429 | Medium — frustration |
| 5 | Include `monthResetDate` (UTC) in credit-exhaustion 429 responses | Users know when credits refresh | Low — support question reduction |
| 6 | Add `aria-pressed` to demo chip buttons and `aria-live="polite"` to result area | Screen reader users can use the demo | Medium — accessibility |

### Medium Fixes (days)

| # | Fix | Impact | Risk if Ignored |
|---|-----|--------|-----------------|
| 7 | Create HTML documentation page at `/docs` (render the JSON data as formatted HTML) | Developers can actually read the docs | Critical — unusable docs |
| 8 | Create signup HTML form page (GET `/billing/signup` returns a form) | First-time users can actually sign up from the landing page | Critical — broken signup funnel |
| 9 | Consolidate redundant API parameters (deprecate aliases, document precedence) | Eliminates "why isn't my setting applied?" bugs | Medium — ongoing support |
| 10 | Add per-URL error reporting to CLI batch output + exit code 1 on partial failures | CI/CD integration works; users can debug batch failures | High — CLI power users |
| 11 | Surface image pre-fetch failures in API response (header or warning field) | Users know their screenshot is missing images | Medium — quality perception |
| 12 | Post-checkout success page shows API key + new tier + next steps | Users trust the upgrade worked | High — payment confidence |
| 13 | Handle Stripe payment failures (auto-downgrade to free tier, log-visible alert) | Prevent "paid but can't use" scenario | High — revenue + trust |

### Larger Fixes (weeks)

| # | Fix | Impact | Risk if Ignored |
|---|-----|--------|-----------------|
| 14 | Add email verification to signup flow | Prevents lost keys from typos; enables account recovery | Medium — low frequency but high pain |
| 15 | Add `GET /me` endpoint (key info, tier, usage, reset date) | Self-service troubleshooting; reduces "what tier am I on?" support | Medium — DX improvement |
| 16 | Add key rotation endpoint (`POST /api-keys/rotate`) | Security best practice; users can rotate without downtime | Low — security hygiene |
| 17 | Add notification emails (welcome, credit warning at 80%, tier change confirmation) | Professional product experience; reduces support | Medium — product maturity |
| 18 | CLI timeout + progress indicator for single-tweet renders | Prevents indefinite hangs; users know it's working | Medium — CLI reliability |
| 19 | Firestore connection check at startup + in-memory auth cache fallback | Resilience during Firestore outages | Low — rare but catastrophic when it happens |

---

*Report generated by static code analysis. Items marked "verify in running app" require live testing to confirm.*
