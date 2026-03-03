# Dependency Health Report #01 — 2026-03-03

**Branch:** `dependency-health-2026-03-03`
**Runtime:** Node.js 20+ (ES Modules)
**Package Manager:** npm with package-lock.json

---

## 1. Executive Summary

| Metric | Value |
|---|---|
| **Total dependencies** | 489 unique (18 direct, 471 transitive) |
| **Dependencies with known vulnerabilities** | 0 (npm audit clean) |
| **Dependencies 1+ major versions behind** | 0 (all upgraded) |
| **Potentially abandoned dependencies** | 1 (satori-html — last release Dec 2022) |
| **License risks found** | 0 (all MIT/Apache-2.0/ISC/BSD/MPL-2.0) |
| **Upgrades applied** | 7 |
| **Dependencies removed** | 1 (uuid → native crypto.randomUUID()) |
| **Infrastructure added** | Dependabot for automated dependency PRs |
| **Net package reduction** | 42 unique packages removed (531→489) |

---

## 2. Vulnerability Report

```
npm audit: found 0 vulnerabilities
```

| Package | CVE | Severity | Used in Project? | Fix Available? | Fix Applied? |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

**No known vulnerabilities.** The project has a clean audit.

**Note on crypto-js:** The transitive dependency `crypto-js@4.2.0` (via pdfkit) is an abandoned library. While version 4.2.0 patches CVE-2023-46233 specifically, the library is officially discontinued and will receive no future security patches. A future pdfkit release is expected to replace it with `@noble/ciphers`. See Section 8 for details.

---

## 3. License Compliance

### License Distribution (319 production packages)

| License | Count | Risk |
|---|---|---|
| MIT | 253 | None |
| Apache-2.0 | 22 | None |
| ISC | 19 | None |
| BSD-3-Clause | 14 | None |
| BlueOak-1.0.0 | 4 | None |
| MPL-2.0 | 3 | Low — see note |
| MIT* | 2 | None |
| 0BSD | 1 | None |
| BSD-2-Clause | 1 | None |

**No GPL, AGPL, SSPL, BSL, or UNKNOWN licenses found.**

### MPL-2.0 Packages

| Package | Notes |
|---|---|
| satori@0.24.1 | Core rendering engine (Vercel). MPL-2.0 is file-level copyleft — modifications to MPL-licensed source files must be shared, but using it as a library does not infect your code. |
| @resvg/resvg-js@2.6.2 | SVG→PNG converter. Same MPL-2.0 terms. |
| @resvg/resvg-js-win32-x64-msvc@2.6.2 | Platform binary for resvg. |

**Assessment:** MPL-2.0 is compatible with the project's use case (using these as unmodified libraries). No action required unless the project modifies the source code of satori or resvg-js directly.

---

## 4. Staleness Report

### Direct Dependencies — Sorted by Risk

| Package | Current | Latest | Gap | Last Published | Health |
|---|---|---|---|---|---|
| ~~satori~~ | ~~0.12.2~~ | ~~0.24.1~~ | ~~Upgraded~~ | — | **Upgraded** |
| ~~express~~ | ~~4.22.1~~ | ~~5.2.1~~ | ~~Upgraded~~ | — | **Upgraded** |
| ~~uuid~~ | ~~9.0.1~~ | ~~13.0.0~~ | ~~Removed~~ | — | **Replaced with native** |
| ~~helmet~~ | ~~7.2.0~~ | ~~8.1.0~~ | ~~Upgraded~~ | — | **Upgraded** |
| ~~express-rate-limit~~ | ~~7.5.1~~ | ~~8.2.1~~ | ~~Upgraded~~ | — | **Upgraded** |
| ~~pdfkit~~ | ~~0.15.2~~ | ~~0.17.2~~ | ~~Upgraded~~ | — | **Upgraded** |

**All direct dependencies are now at their latest versions.** Zero outdated packages reported by `npm outdated`.

### All Other Direct Dependencies — Current

| Package | Installed | Latest | Status |
|---|---|---|---|
| @google-cloud/firestore | 8.3.0 | 8.3.0 | Current |
| @google-cloud/storage | 7.19.0 | 7.19.0 | Current |
| @resvg/resvg-js | 2.6.2 | 2.6.2 | Current |
| cors | 2.8.6 | 2.8.6 | Current |
| express | 5.2.1 | 5.2.1 | Current (upgraded) |
| express-rate-limit | 8.2.1 | 8.2.1 | Current (upgraded) |
| helmet | 8.1.0 | 8.1.0 | Current (upgraded) |
| pdfkit | 0.17.2 | 0.17.2 | Current (upgraded) |
| pino | 10.3.1 | 10.3.1 | Current |
| pino-pretty | 13.1.3 | 13.1.3 | Current |
| satori | 0.24.1 | 0.24.1 | Current (upgraded) |
| satori-html | 0.3.2 | 0.3.2 | Current (but unmaintained) |
| stripe | 20.4.0 | 20.4.0 | Current |
| zod | 4.3.6 | 4.3.6 | Current |

### Dev Dependencies

| Package | Installed | Latest | Status |
|---|---|---|---|
| vitest | 4.0.18 | 4.0.18 | Current |
| @vitest/coverage-v8 | 4.0.18 | 4.0.18 | Current |
| eslint | 9.39.3 | 9.39.3 | Current |
| eslint-plugin-security | 4.0.0 | 4.0.0 | Current |

---

## 5. Upgrades Applied

| Package | From | To | Type | Tests Pass? |
|---|---|---|---|---|
| uuid | 9.0.1 | **REMOVED** | Replaced with `crypto.randomUUID()` | Yes (390/390) |
| pdfkit | 0.15.2 | 0.17.2 | Minor | Yes (390/390) |
| helmet | 7.2.0 | 8.1.0 | Major | Yes (390/390) |
| express-rate-limit | 7.5.1 | 8.2.1 | Major | Yes (390/390) |
| express | 4.22.1 | 5.2.1 | Major | Yes (390/390) |
| satori | 0.12.2 | 0.24.1 | 12 minor (pre-1.0) | Yes (390/390) |

### Details

**uuid → crypto.randomUUID():**
- uuid was only used in `src/services/api-keys.mjs` for `v4()` (random UUID generation)
- Node.js 20+ provides `crypto.randomUUID()` natively — same RFC 4122 v4 output, 3x faster, zero dependencies
- Eliminated 1 direct dependency

**pdfkit 0.15.2 → 0.17.2:**
- Bug fixes, dynamic sizing, rotatable text, table support
- Removed 40 transitive packages from the tree (fontkit migration)
- Note: crypto-js still present as transitive dep (removal is in unreleased pdfkit master)

**helmet 7.2.0 → 8.1.0:**
- HSTS max-age increased from 180 to 365 days (security improvement)
- Stricter CSP validation (not applicable — project disables CSP)
- Requires Node 18+ (project uses 20+)

**express-rate-limit 7.5.1 → 8.2.1:**
- IPv6 subnet masking prevents rate limit bypass via address cycling (security improvement)
- Added `draft-8` standard headers support
- Requires Node 16+ (project uses 20+)

**express 4.22.1 → 5.2.1:**
- `req.query` now read-only, `req.param()` removed, stricter route matching, automatic async error forwarding
- Codebase scan found zero incompatible patterns — no code changes required
- All middleware (helmet, cors, express-rate-limit) confirmed compatible with Express 5
- Node 18+ required (project uses 20+)

**satori 0.12.2 → 0.24.1:**
- 12 minor versions of CSS rendering improvements: text-indent, object-fit/position, text-shadow, text-decoration-skip-ink
- ~10% core performance improvement (v0.21.0)
- Pre-1.0 semver means any minor can contain breaking changes — visual regression testing recommended
- All 390 unit/integration tests pass; production visual verification recommended

---

## 6. Major Upgrades Needed (Not Applied)

All major upgrades have been applied. No remaining outdated dependencies.

---

## 7. Dependency Weight & Reduction

### Heavy Dependencies

| Package | Transitive Deps | Usage | Alternative | Effort |
|---|---|---|---|---|
| @google-cloud/firestore | ~60 (via google-gax, protobufjs) | Core data store | None (required) | N/A |
| @google-cloud/storage | ~40 (via google-auth-library, gaxios) | Screenshot hosting | None (required) | N/A |
| eslint + plugins | ~30 | Dev-only linting | Already dev-only | N/A |
| pdfkit | ~10 | PDF generation | None reasonable | N/A |
| stripe | 1 (@types/node) | Billing | None (required) | N/A |

### Dependencies Removed

| Package | Reason | Replacement |
|---|---|---|
| uuid | Only v4() used in 1 file | `crypto.randomUUID()` (Node.js native) |

### Replacement Opportunities (Not Implemented — Document Only)

| Package | Current Usage | Potential Replacement | Effort | Recommendation |
|---|---|---|---|---|
| satori-html | HTML→VDOM converter for Satori | `@gotedo/satori-html` (maintained fork) or custom ~50-line converter | Low (fork) / Medium (custom) | Switch to fork only if bugs are encountered |
| pino-pretty | Dev transport for pretty logs | Could move to devDependencies | Trivial | Low priority — pragmatic to keep in deps for local development |

### Redundancy Check
- No duplicate functionality found (no two date libraries, HTTP clients, etc.)
- No micro-packages that should be inlined (no `is-odd`, `left-pad` style deps)
- All dependencies serve distinct purposes

---

## 8. Abandoned/At-Risk Dependencies

| Package | Type | Last Release | Maintainer Activity | Risk | Recommendation |
|---|---|---|---|---|---|
| satori-html@0.3.2 | Direct | Dec 2022 (3+ years) | Inactive (12 open issues, no PRs merged) | Medium | Monitor. Switch to `@gotedo/satori-html` fork if bugs surface |
| crypto-js@4.2.0 | Transitive (pdfkit) | Oct 2023 (officially discontinued) | **Abandoned** — maintainer stated active development discontinued | Medium | Await pdfkit release that replaces it with `@noble/ciphers` |

### Notes on crypto-js
- crypto-js@4.2.0 patches the known CVE-2023-46233 vulnerability
- However, it will receive **no future security patches**
- pdfkit's unreleased master branch has already replaced crypto-js with `@noble/ciphers` and `@noble/hashes`
- The project uses pdfkit only for PDF generation from image arrays — crypto-js is used internally by pdfkit for PDF encryption features, which this project does not use
- **Practical risk is low** because the vulnerable code path (PBKDF2 with weak defaults) is not exercised by this project's usage pattern

---

## 9. Recommendations

### Priority-Ordered Action Items

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| 1 | ~~Upgrade satori~~ | ~~Rendering improvements~~ | — | **DONE** | Upgraded 0.12.2→0.24.1. All tests pass. Visual regression testing of production screenshots recommended. |
| 2 | ~~Migrate to Express 5~~ | ~~Modern routing~~ | — | **DONE** | Upgraded 4.22.1→5.2.1. Zero code changes needed. |
| 3 | ~~Set up Dependabot~~ | ~~Automated PRs~~ | — | **DONE** | `.github/dependabot.yml` added with weekly npm + GitHub Actions checks. |
| 4 | Monitor pdfkit for crypto-js removal | Eliminates abandoned transitive dependency | Low — crypto-js 4.2.0 has no active CVEs and vulnerable code path isn't used | Only if time allows | Check pdfkit releases periodically. Upgrade when `@noble/ciphers` replacement ships. |
| 5 | Verify satori visual output in production | Confirms rendering quality after 12-version jump | Low — tests pass but pixel output may differ | Yes | Render a set of reference tweets (text-only, media, quoted, emoji-heavy, RTL) and compare before/after. |

### Dependency Addition Policy (Suggested)

Before adding a new dependency, require:
1. **Justification**: Why can't this be done with native features or existing deps?
2. **Health check**: Last release < 1 year, active maintainer(s), no critical CVEs
3. **License**: Must be MIT, Apache-2.0, ISC, BSD, or BlueOak-1.0.0
4. **Weight**: Check transitive dependency count — avoid packages that pull in massive trees for minimal functionality
5. **Bus factor**: Prefer packages maintained by organizations or multiple maintainers over single-person projects

---

## Appendix A: Lock File Status

| Check | Result |
|---|---|
| Lock file present? | Yes (`package-lock.json`) |
| Committed to repo? | Yes |
| Consistent with manifest? | Yes (`npm ci --dry-run` succeeds) |
| Duplicate packages at different versions? | No significant duplicates detected |

## Appendix B: Complete Dependency Inventory (Direct Only)

| # | Package | Version | Type | License | Used In | Purpose |
|---|---|---|---|---|---|---|
| 1 | @google-cloud/firestore | 8.3.0 | Runtime | Apache-2.0 | `src/services/firestore.mjs` | Firestore client + FieldValue |
| 2 | @google-cloud/storage | 7.19.0 | Runtime | Apache-2.0 | `src/services/storage.mjs` | Cloud Storage uploads |
| 3 | @resvg/resvg-js | 2.6.2 | Runtime | MPL-2.0 | `core.mjs` | SVG→PNG conversion |
| 4 | cors | 2.8.6 | Runtime | MIT | `src/server.mjs` | CORS middleware |
| 5 | express | 5.2.1 | Runtime | MIT | `src/server.mjs` + routes | Web framework |
| 6 | express-rate-limit | 8.2.1 | Runtime | MIT | `src/middleware/rate-limit.mjs` | Per-tier rate limiting |
| 7 | helmet | 8.1.0 | Runtime | MIT | `src/server.mjs` | HTTP security headers |
| 8 | pdfkit | 0.17.2 | Runtime | MIT | `core.mjs` | PDF generation |
| 9 | pino | 10.3.1 | Runtime | MIT | `src/logger.mjs` | Structured logging |
| 10 | pino-pretty | 13.1.3 | Runtime | MIT | `src/logger.mjs` (transport) | Dev log formatting |
| 11 | satori | 0.24.1 | Runtime | MPL-2.0 | `core.mjs` | HTML/CSS→SVG rendering |
| 12 | satori-html | 0.3.2 | Runtime | MIT | `core.mjs` | HTML→VDOM for Satori |
| 13 | stripe | 20.4.0 | Runtime | MIT | `src/services/stripe.mjs` | Billing/subscriptions |
| 14 | zod | 4.3.6 | Runtime | MIT | `src/config.mjs`, `src/schemas/` | Schema validation |
| 15 | vitest | 4.0.18 | Dev | MIT | 25 test files | Test framework |
| 16 | @vitest/coverage-v8 | 4.0.18 | Dev | MIT | `vitest.config.mjs` | Coverage reporting |
| 17 | eslint | 9.39.3 | Dev | MIT | `eslint.config.mjs` | Linting |
| 18 | eslint-plugin-security | 4.0.0 | Dev | Apache-2.0 | `eslint.config.mjs` | Security lint rules |

## Appendix C: Git Commits on This Branch

```
8dea4d9 chore: replace uuid package with native crypto.randomUUID()
795f309 chore: bump pdfkit from 0.15.2 to 0.17.2
f226812 chore: upgrade helmet from 7.2.0 to 8.1.0
cf6d839 chore: upgrade express-rate-limit from 7.5.1 to 8.2.1
d3b442b chore: migrate from Express 4 to Express 5
620aa62 chore: add Dependabot for automated dependency updates
b6fa57d chore: upgrade satori from 0.12.2 to 0.24.1
```
