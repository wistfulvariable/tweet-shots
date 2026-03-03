# Security Audit Report #01 — 2026-03-03

**Project:** tweet-shots
**Branch:** `security-audit-2026-03-03`
**Auditor:** Automated + Manual (Claude Opus 4.6)
**Scope:** Full codebase, dependencies, git history, infrastructure config
**Test Baseline:** 390/390 passing before and after all fixes

---

## 1. Executive Summary

The tweet-shots API demonstrates a **strong foundational security posture** with proper authentication layering, Zod input validation, Helmet security headers, rate limiting, and a hardened Docker image (non-root, multi-stage, minimal base). However, the audit uncovered one **critical finding** (admin key committed to git history), one **medium finding** (ReDoS vulnerability in regex), and several **low-severity** issues. Four mechanical fixes were applied and verified: timing-safe admin key comparison, ReDoS prevention, untracking the committed secret file, and gitignore/npmrc hardening. Zero automated security tooling exists in the project or CI/CD pipeline, which is the most significant gap to address.

---

## 2. Automated Security Scan Results

### Tools Discovered and Run

| Tool | Version | Findings | Critical | High | Medium | Low | False Positives |
|------|---------|----------|----------|------|--------|-----|-----------------|
| npm audit | 10.x (built-in) | 0 | 0 | 0 | 0 | 0 | 0 |

### Tools Recommended but Unavailable

| Tool | What It Catches | Effort to Add | Priority |
|------|----------------|---------------|----------|
| gitleaks | Secrets in git history | Low (npx or GitHub Action) | **High** |
| eslint-plugin-security | Code-level vulns (ReDoS, injection) | Low (devDep + config) | **High** |
| hadolint | Dockerfile best practice violations | Low (npx) | Medium |
| trivy / grype | Container image CVEs | Medium (CI integration) | Medium |
| semgrep | SAST pattern matching | Medium (CI integration) | Medium |
| snyk | Dependency + code analysis | Medium (account + CI) | Low |

### Security CI/CD Assessment

**RESOLVED:** GitHub Actions CI pipeline added (`.github/workflows/ci.yml`) with three jobs:
- **test:** `npm ci` + `npm audit --audit-level=high` + `npm test` (blocks PRs on high+ CVEs or test failures)
- **secrets-scan:** gitleaks against full git history (blocks PRs with leaked secrets)
- **lint-security:** eslint with `eslint-plugin-security` rules (warns on unsafe patterns)

**Remaining gap:** No container image scanning (trivy/grype). Recommended as a future addition.

---

## 3. Fixes Applied (Phase 5)

| # | Issue | Severity | Location | Fix Applied | Tests Pass? | Detected By |
|---|-------|----------|----------|-------------|-------------|-------------|
| 1 | Timing attack on admin key comparison | Medium | `src/routes/admin.mjs:23` | Replaced `!==` with `crypto.timingSafeEqual` | 390/390 | Manual review |
| 2 | ReDoS in mention/hashtag regex | Medium | `core.mjs:431,441` | Added `escapeRegExp()` before `new RegExp()` | 390/390 | Manual review |
| 3 | Admin key tracked in git | Critical | `.admin-key` | `git rm --cached .admin-key` | 390/390 | Manual review |
| 4 | Missing `.npmrc` security config | Low | (new file) | Added `.npmrc` with `audit=true`, `save-exact=true` | 390/390 | Manual review |
| 5 | Incomplete `.gitignore` patterns | Low | `.gitignore` | Added `.env*`, `*.pem`, `*.key`, `*.p12`, credential patterns | 390/390 | Manual review |
| 6 | Admin key in git history (CRIT-1) | Critical | Secret Manager | Rotated key, disabled old version, redeployed Cloud Run | Verified via curl | Manual review |
| 7 | No CI/CD security tooling | High | (new files) | Added GitHub Actions pipeline: tests + npm audit + gitleaks + eslint-plugin-security | 390/390 | Manual review |

### Fix Details

#### Fix 1: Timing-Safe Admin Key Comparison
**Commit:** `605804f`
**What changed:** `src/routes/admin.mjs` — replaced `adminKey !== config.ADMIN_KEY` with `crypto.timingSafeEqual(Buffer.from(adminKey), Buffer.from(config.ADMIN_KEY))`. Added early return for missing/non-string keys. Length mismatch is handled before `timingSafeEqual` (which throws on length mismatch).

#### Fix 2: ReDoS Prevention in Entity Regex
**Commit:** `2622990`
**What changed:** `core.mjs` — added `escapeRegExp()` utility that escapes `[.*+?^${}()|[\]\\]`. Applied to `mention.screen_name` and `hashtag.text` before interpolation into `new RegExp()`. Twitter entity data comes from the syndication API which could contain special characters.

#### Fix 3: Untrack `.admin-key` from Git
**Commit:** `8bc52ae`
**What changed:** `git rm --cached .admin-key` removes the file from the git index while keeping the local file. The `.gitignore` already had the rule but it was ineffective because the file was tracked before the rule existed.

#### Fix 4: `.npmrc` Security Config
**Commit:** `7901ef8`
**What changed:** Created `.npmrc` with `audit=true` (warns about known vulnerabilities on install) and `save-exact=true` (prevents range-based version drift).

#### Fix 5: `.gitignore` Credential Patterns
**Commit:** `eca9486`
**What changed:** Added patterns for `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `credentials.json`, `service-account*.json`.

---

## 4. Critical Findings (Unfixed)

### CRIT-1: Admin Key Was in Git History — NOW RESOLVED

- **Severity:** Critical (resolved)
- **Location:** `.admin-key` in git commit `63a84d0d`
- **Description:** The admin key `ts_admin_b148f0...` was committed to the repository before the `.gitignore` rule existed.
- **Resolution:**
  1. Key rotated in GCP Secret Manager (old version 1 disabled, new version 2 created)
  2. Cloud Run redeployed to pick up new key
  3. Verified old key returns 403, new key returns 200
  4. `.admin-key` untracked from git index
- **Remaining action:** Git history still contains the old key. Since it's been rotated, this is now informational. Consider rewriting history with `git filter-repo` or BFG Repo-Cleaner when convenient.
- **Detected By:** Manual review (git history search)

---

## 5. High Findings (Unfixed)

None.

---

## 6. Medium Findings (Unfixed)

### MED-1: Wildcard CORS Configuration

- **Severity:** Medium
- **Location:** `src/server.mjs:46`
- **Description:** `app.use(cors())` defaults to `Access-Control-Allow-Origin: *`, allowing any origin to make cross-origin requests to the API.
- **Impact:** While authenticated endpoints require the `X-API-KEY` header (which cannot be set cross-origin without CORS preflight approval), the wildcard CORS still allows: (1) any website to read public endpoint responses, (2) potential amplification if combined with other vulnerabilities. API key auth inherently prevents CSRF for authenticated routes.
- **Proof:**
  ```javascript
  // src/server.mjs:46
  app.use(cors());  // No configuration — defaults to wildcard
  ```
- **Recommendation:** Configure explicit allowed origins:
  ```javascript
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  }));
  ```
- **Why It Wasn't Fixed:** Requires knowing the intended consumer origins. If the API is truly public (any client), wildcard may be intentional. Needs team decision.
- **Effort:** Quick fix (5 minutes), but requires decision on allowed origins
- **Detected By:** Manual review

### MED-2: CSP Explicitly Disabled

- **Severity:** Medium
- **Location:** `src/server.mjs:45`
- **Description:** Helmet is configured with `contentSecurityPolicy: false`, disabling the Content-Security-Policy header entirely.
- **Impact:** Browsers loading API responses directly (e.g., HTML landing page at `/`) have no CSP protection. For a pure JSON API this is low risk, but the landing page at `/` serves HTML.
- **Proof:**
  ```javascript
  // src/server.mjs:45
  app.use(helmet({ contentSecurityPolicy: false }));
  ```
- **Recommendation:** Enable CSP with a permissive-but-present policy for the landing page:
  ```javascript
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  }));
  ```
- **Why It Wasn't Fixed:** CSP configuration requires testing against the landing page to ensure it doesn't break inline styles/scripts. Needs manual verification.
- **Effort:** Moderate (requires testing landing page compatibility)
- **Detected By:** Manual review

---

## 7. Low Findings (Unfixed)

### LOW-1: Query Parameter API Key Authentication

- **Severity:** Low
- **Location:** `src/middleware/authenticate.mjs:11`
- **Description:** API keys can be passed via `?apiKey=` query parameter in addition to the `X-API-KEY` header. Query parameters appear in server access logs, browser history, CDN caches, and HTTP referrer headers.
- **Impact:** Potential key exposure via logs or referrer leakage. Mitigated by HTTPS in production (no plaintext sniffing).
- **Proof:**
  ```javascript
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  ```
- **Recommendation:** Document that header auth is strongly preferred. Consider logging a warning when query param auth is used. Optionally add `Referrer-Policy: no-referrer` header.
- **Why It Wasn't Fixed:** Breaking change for existing users who may rely on query param auth. Design decision, not a bug.
- **Effort:** Quick fix for warning; breaking change to remove
- **Detected By:** Manual review

### LOW-2: No Input Format Validation on API Key Before Firestore Lookup

- **Severity:** Low
- **Location:** `src/middleware/authenticate.mjs:11-20`
- **Description:** Any non-empty string is accepted as a candidate API key and sent to Firestore for lookup. Malformed keys waste Firestore read operations.
- **Impact:** Minimal — Firestore returns `null` for non-existent keys. Same 401 response regardless.
- **Recommendation:** Optional: add `^ts_(free|pro|business)_[a-f0-9]{32}$` format check before Firestore lookup to save reads.
- **Why It Wasn't Fixed:** Not a vulnerability — optimization only. Could break if key format changes.
- **Effort:** Quick fix
- **Detected By:** Manual review

### LOW-3: No Admin Route Rate Limiting

- **Severity:** Low
- **Location:** `src/routes/admin.mjs`
- **Description:** Admin endpoints (`/admin/keys`, `/admin/usage`) have no rate limiting. An attacker with a valid admin key could make unlimited requests.
- **Impact:** Low — admin key is a strong secret (38 chars). Brute-force is infeasible. But a compromised key could exhaust Firestore.
- **Recommendation:** Consider adding a conservative rate limiter (e.g., 60 req/min) on admin routes.
- **Why It Wasn't Fixed:** Low priority given admin key strength. Would need separate limiter instance.
- **Effort:** Quick fix
- **Detected By:** Manual review

---

## 8. Informational

### INFO-1: Billing Guard Fails Open (Accepted Design)

- **Location:** `src/middleware/billing-guard.mjs:34-38`
- **Description:** When Firestore is unreachable, billing guard calls `next()` without tracking usage. This is explicitly documented as a design decision to prioritize availability.
- **Assessment:** Accepted risk. Documented in CLAUDE.md.

### INFO-2: Permanent API Keys (No Expiration)

- **Location:** `src/services/api-keys.mjs`
- **Description:** API keys never expire — they are permanent until revoked. Standard pattern for server-to-server REST APIs.
- **Assessment:** Acceptable for current use case.

### INFO-3: Stripe Webhook Properly Secured

- **Location:** `src/routes/billing.mjs:150-168`
- **Description:** Stripe webhook uses `stripe.webhooks.constructEvent()` with HMAC-SHA256 signature verification. Raw body is captured before JSON parsing.
- **Assessment:** Correct implementation.

### INFO-4: 3 Deprecated Transitive Dependencies

- **Packages:** `glob@10.5.0`, `jpeg-exif@1.1.4`, `node-domexception@1.0.0`
- **Risk:** No security vulnerabilities, but indicate unmaintained code paths.
- **Recommendation:** Monitor for updates to parent packages.

---

## 9. Supply Chain Risk Assessment

### Post-Install Scripts

| Package | Script Type | Behavior | Risk Level | Recommendation |
|---------|-------------|----------|------------|----------------|
| esbuild | postinstall | Downloads platform binary from npmjs.org | Low | Expected for native tooling |
| protobufjs | postinstall | Version scheme check, no network | Low | Standard |
| fsevents | native addon | macOS-only, optional | Low | Not installed on Windows/Linux |

### Typosquatting Risks

No typosquatting risks detected. All 17 direct dependencies are well-known, high-download-count packages from verified publishers.

### Namespace/Scope Risks

| Check | Result |
|-------|--------|
| Private scope confusion | No private scopes in use |
| Unscoped internal packages | None |
| `.npmrc` registry mixing | No `.npmrc` existed (now added) |

### Lock File Integrity

- **Status:** PASS
- `package-lock.json` committed, lockfileVersion 3
- 467/467 resolved URLs point to `https://registry.npmjs.org/`
- Zero non-npmjs.org registry URLs
- No anomalous modifications detected

### Maintainer Risk

No recent ownership transfers, suspicious releases, or compromised maintainer reports found for any direct dependency.

### Transitive Dependency Stats

| Metric | Value |
|--------|-------|
| Total packages | 467 |
| Production | 346 |
| Dev-only | 109 |
| Optional/platform | 65 |
| Flagged packages | 0 |

---

## 10. Categories with No Findings

The following categories were systematically checked and found clean:

| Category | Status | Notes |
|----------|--------|-------|
| SQL/NoSQL Injection | Clean | Firestore uses parameterized `.where()` queries |
| Command Injection | Clean | No `exec`, `spawn`, or `child_process` usage |
| XSS | Clean | Tweet text HTML-escaped (`&amp;`, `&lt;`, `&gt;`); landing page has no user input rendering |
| CSRF | Clean | API key header auth is inherently CSRF-safe; no session cookies |
| SSRF | Clean (API) | `logo` field is CLI-only; Zod strips it from API requests. `fetchImageAsBase64` in API context only fetches Twitter CDN URLs from syndication API response data. |
| Path Traversal | Clean | No file operations with user-supplied paths; GCS uses safe filename construction |
| Insecure Deserialization | Clean | No `eval`, `Function()`, or `vm`; JSON.parse only on Stripe webhook (signature-verified) |
| File Upload | Clean | No file upload endpoints |
| Error Information Leakage | Clean | Global error handler returns generic `Internal server error`; stack traces only in server logs |
| IDOR | Clean | Stateless API; authenticated endpoints return only the caller's own data |
| Dependency CVEs | Clean | `npm audit` reports 0 vulnerabilities |

---

## Appendix A: Files Reviewed

All source files were read and analyzed:

- `core.mjs` (rendering core)
- `src/server.mjs` (Express app)
- `src/config.mjs` (configuration)
- `src/logger.mjs` (logging)
- `src/errors.mjs` (error classes)
- `src/middleware/authenticate.mjs`
- `src/middleware/rate-limit.mjs`
- `src/middleware/billing-guard.mjs`
- `src/middleware/validate.mjs`
- `src/middleware/error-handler.mjs`
- `src/routes/screenshot.mjs`
- `src/routes/tweet.mjs`
- `src/routes/admin.mjs`
- `src/routes/billing.mjs`
- `src/routes/health.mjs`
- `src/routes/landing.mjs`
- `src/schemas/request-schemas.mjs`
- `src/services/firestore.mjs`
- `src/services/api-keys.mjs`
- `src/services/usage.mjs`
- `src/services/stripe.mjs`
- `src/services/storage.mjs`
- `src/workers/render-pool.mjs`
- `src/workers/render-worker.mjs`
- `landing.html`
- `Dockerfile`
- `.dockerignore`
- `.gitignore`
- `package.json`
- `package-lock.json`
- All test files in `tests/`

## Appendix B: Git History Search

Searched git history for:
- Deleted `.env`, `.key`, `.pem`, `.p12` files
- `ADMIN_KEY` references in source files
- `sk_live`, `sk_test`, `AKIA` patterns
- `.admin-key` file tracking history
