# UI Design Quality Audit Report

**Project**: tweet-shots
**Report ID**: UI_DESIGN_QUALITY_REPORT_01
**Date**: 2026-03-04
**Scope**: All user-facing pages (Landing, Docs, Signup, Dashboard, Billing Success/Cancel)
**Auditor**: Claude Opus 4.6

---

## Executive Summary

The tweet-shots web application has a **Developing** design quality rating -- situated between rough and competent. The dark theme is cohesive within individual pages, but significant fragmentation exists across pages due to each page defining its own inline CSS with no shared stylesheet or design tokens.

### Issue Breakdown

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 8 |
| Medium | 12 |
| Low | 6 |
| **Total** | **28** |

### Design System Status

**Partially exists.** Individual pages are internally consistent, but cross-page consistency is fragmented. No shared CSS variables, no shared stylesheet, and no documented design tokens.

### Top 5 Highest-Impact Improvements

1. **Fix dashboard CSP blocking inline scripts** -- the dashboard is completely non-functional in production
2. **Add visible focus indicators to all interactive elements** -- WCAG 2.1 AA failure across ~30+ elements
3. **Extract shared CSS variables into a common stylesheet or shared template** -- eliminates cross-page fragmentation
4. **Standardize card border-radius, container max-width, and heading scale across pages** -- visual cohesion
5. **Add missing focus/hover states to checkboxes and form controls** -- interaction design gap

---

## Screen-by-Screen Findings

### Landing Page (`/`)

**Screenshots**: `landing-desktop-1440.png`, `landing-laptop-1280.png`, `landing-tablet-768.png`, `landing-mobile-375.png`

#### Critical

| # | Finding | Details |
|---|---------|---------|
| L-C1 | Missing focus indicators on ~25+ interactive elements | CTA buttons ("Get API Key", "View Docs", "Get Started", "Subscribe" x2), all theme selector buttons (Dark/Light/Dim/Black), all gradient buttons (9), format/scale buttons (5), frame buttons, text input, select dropdown, checkboxes (8), "Download PNG" link, "Copy API call" button. Only the Generate button, nav links (barely visible dark outline), and footer links show focus. **WCAG 2.1 AA failure.** |

#### High

| # | Finding | Details |
|---|---------|---------|
| L-H1 | Code block overflows on mobile (375px) | The curl command examples in "Dead simple to use" section have very long URLs that extend beyond the viewport. No horizontal scroll or word-break applied. |
| L-H2 | Nav links are very small on mobile (480px breakpoint) | Nav links shrink to 0.75rem (12px), below comfortable reading size. "Sign In" button padding also shrinks significantly. |
| L-H3 | Pricing cards stack awkwardly on tablet (768px) | At tablet width, the 3-column pricing grid becomes 1-column. The "Most Popular" Pro card loses its `transform: scale(1.04)` featured appearance. The 3-col to 1-col transition is jarring -- a 2+1 layout at intermediate widths would be more graceful, though the current 1-col layout works functionally. |

#### Medium

| # | Finding | Details |
|---|---------|---------|
| L-M1 | Feature cards have different border color | Landing feature/price cards use `rgba(255,255,255,0.05)` while every other page uses `rgba(255,255,255,0.08)` (the `--border` variable). Cards appear slightly less defined. |
| L-M2 | Feature card border-radius (16px) differs from docs/billing/dashboard cards (12px) | Subtle visual inconsistency when navigating between pages. |
| L-M3 | Demo card has yet another radius (20px) | Three different card radii on one page (20px demo, 16px features/pricing). |
| L-M4 | "More options" accordion lacks open/close animation on content | The chevron rotates, but the content panel uses `max-height` transition which can feel abrupt depending on content. |
| L-M5 | Checkbox labels lack `cursor: pointer` | The checkboxes themselves do not show pointer cursor, and the label area is not clickable. |
| L-M6 | Line-height mismatch in code blocks | Landing uses 1.8, docs uses 1.7 for code blocks -- same content type, different reading experience. |

#### Low

| # | Finding | Details |
|---|---------|---------|
| L-L1 | Footer links use default link styling | The footer "API Docs / Dashboard / GitHub" links are generic blue (#3b82f6) without the nav-consistent styling used elsewhere on the page. |
| L-L2 | "Rate limited to 5 requests/min" text is very small | Uses inline style `font-size: 0.85rem` with a muted color that is hard to read. |

---

### Docs Page (`/docs`)

**Screenshots**: `docs-desktop-1440.png`, `docs-tablet-768.png`, `docs-mobile-375.png`

#### High

| # | Finding | Details |
|---|---------|---------|
| D-H1 | Sidebar disappears at 900px with no mobile substitute visible by default | The mobile nav exists but requires scrolling to the top to access it. Long docs page makes this problematic -- users deep in the page have no navigation. |
| D-H2 | Container max-width mismatch | Docs uses 1400px vs landing's 1200px. Navigating between pages creates a noticeable layout width jump. |

#### Medium

| # | Finding | Details |
|---|---------|---------|
| D-M1 | Tables overflow horizontally on mobile without visible scroll indicator | Large parameter tables (Parameters Reference has 5 columns) overflow on 375px mobile. There is an `overflow-x: auto` wrapper, but no visual affordance (scrollbar is hidden on iOS Safari, no shadow gradient hint). |
| D-M2 | Code blocks have very small text on mobile | Code blocks at 0.8125rem (13px) on an already narrow viewport. Combined with long URLs, readability suffers. |
| D-M3 | No sticky sidebar on desktop | The docs sidebar scrolls with the page. For a very long documentation page, this means losing navigation context. Standard docs pattern is a sticky sidebar. |
| D-M4 | Copy buttons lack feedback | After clicking "Copy", there is no visual confirmation that the copy succeeded (no tooltip, no text change to "Copied!"). |

#### Low

| # | Finding | Details |
|---|---------|---------|
| D-L1 | Pricing section in docs differs from landing page pricing | Docs pricing cards show different features (rate limits, batch limits) than landing pricing cards. This is intentional (different audience), but the visual styling differs slightly -- docs cards use h4 at 1.125rem while landing uses h3 at 1.5rem. |
| D-L2 | Section heading size (1.75rem) smaller than landing (2.5rem) | Appropriate for a documentation page, but the design system gap is notable. |

---

### Signup Page (`/billing/signup`)

**Screenshots**: `signup-desktop-1440.png`, `signup-mobile-375.png`

#### High

| # | Finding | Details |
|---|---------|---------|
| S-H1 | CSP blocks inline script in production | Console shows: `Executing inline script violates CSP directive 'script-src 'self' https://www.gstatic.com'`. The signup form's JavaScript (which handles form submission) may not work in production. |
| S-H2 | No navigation back to main site except small "Back to home" link | No header/nav, no branding context. User could feel lost arriving at this page. |

#### Medium

| # | Finding | Details |
|---|---------|---------|
| S-M1 | Input fields have low contrast against dark card | Input fields at `rgba(15,23,42,0.6)` on a `#1e293b` card surface have very low contrast between the input background and the card. |

#### Low

| # | Finding | Details |
|---|---------|---------|
| S-L1 | No inline input validation feedback | No inline validation for email format. The form relies entirely on server-side validation with a generic error display. |

---

### Dashboard (`/dashboard`)

**Screenshots**: `dashboard-unavailable-desktop-1440.png`, `dashboard-prod-desktop-1440.png`

#### Critical

| # | Finding | Details |
|---|---------|---------|
| DA-C1 | Dashboard completely broken in production | CSP blocks the inline `<script>` tag at line 156. The page shows "Loading..." forever and never renders the sign-in button or any dashboard content. Error: `Executing inline script violates the following Content Security Policy directive 'script-src 'self' https://www.gstatic.com'`. The dashboard script must be externalized (like `landing.js` and `docs.js`) or a CSP nonce/hash must be added. |

#### High

| # | Finding | Details |
|---|---------|---------|
| DA-H1 | "Dashboard Not Available" state is visually bare | When Firebase is not configured, the page shows minimal content with no styling for the error state -- just a heading, paragraph, and unstyled link on a dark background. No nav, no branding context beyond the heading. |

#### Medium

| # | Finding | Details |
|---|---------|---------|
| DA-M1 | Dashboard uses different monospace font stack | `'SF Mono', 'Fira Code', monospace` vs landing/docs which use `'Monaco', 'Menlo', monospace/Consolas`. API keys will render in different fonts across pages. |

---

### Billing Success (`/billing/success`)

**Screenshots**: `billing-success-desktop-1440.png`, `billing-success-mobile-375.png`

#### Medium

| # | Finding | Details |
|---|---------|---------|
| BS-M1 | No navigation/header | User arrives from Stripe redirect with no nav context, just a centered card with links. Same issue as signup. |
| BS-M2 | Links stacked vertically with no visual hierarchy | "Check your credits", "API documentation", and "Back to home" all look identical. The primary action (check credits) should be visually distinct. |

---

### Billing Cancel (`/billing/cancel`)

**Screenshots**: `billing-cancel-desktop-1440.png`

#### Medium

| # | Finding | Details |
|---|---------|---------|
| BC-M1 | Same minimal design as success page | No nav, no header, minimal content. Consistent with other billing pages but feels disconnected from the main site. |

---

## Design System State

The app uses a consistent dark theme with blue accent colors. Within individual pages, design is reasonably coherent. Across pages, there is significant fragmentation because each page defines its own inline CSS with no shared stylesheet.

### Key Inconsistencies

| Token / Pattern | Variation 1 | Variation 2 | Variation 3 | Variation 4 |
|-----------------|-------------|-------------|-------------|-------------|
| Monospace font stack | `'Monaco', 'Menlo', monospace` | `'Consolas', monospace` | `'SF Mono', 'Fira Code', monospace` | `'Monaco', 'Menlo', 'Consolas', monospace` |
| Card border-radius | 12px (docs, billing, dashboard) | 16px (landing features/pricing) | 20px (landing demo) | -- |
| Container max-width | 1200px (landing) | 1400px (docs) | -- | -- |
| Heading scale (primary) | 2.5rem (landing) | 2rem (landing secondary) | 1.75rem (docs) | 1.6rem (billing) |
| Tablet breakpoint | 768px (landing) | 900px (docs) | -- | -- |
| CSS variables | Defined per-page | Not shared | -- | -- |
| Card border color | `rgba(255,255,255,0.05)` | `rgba(255,255,255,0.08)` | -- | -- |

---

## Interaction Audit

### Hover States

All buttons have transitions defined (0.15s or 0.2s). Hover states exist on:

- Nav links (color change via transition)
- CTA buttons (background/opacity change)
- Theme/gradient/format chips (border/background change)
- Copy buttons in docs
- Pricing card buttons

**Verdict**: Hover states are well-implemented where they exist. No issues detected.

### Focus States

**CRITICAL FAILURE**: Most interactive elements have no visible focus indicator.

**Elements WITH visible focus (8 total)**:

- Nav links: Very thin auto outline in dark color (barely visible on dark background)
- "Generate" button: Browser default outline
- "More options" button: Browser default outline
- Color input close buttons: Browser default outline
- Footer links: Browser default outline

**Elements WITHOUT visible focus (~30+ elements)**:

- "Sign In" nav button
- "Get API Key" CTA
- "View Docs" CTA
- Text input (tweet URL)
- All theme buttons (4)
- All gradient buttons (10)
- All format buttons (2)
- All scale buttons (3)
- Frame buttons (2)
- Select dropdown
- All checkboxes (8)
- "Download PNG" link
- "Copy API call" button
- All pricing buttons (3)

### Transitions

Transitions are well-applied where they exist:

| Element Type | Transition | Duration |
|-------------|-----------|----------|
| Links | `color` | 0.15s |
| Buttons | `all` or `background` | 0.2s |
| Chips | `all ease` | 0.15s |
| Input focus | `border-color, box-shadow` | 0.2s |
| Accordion | `max-height ease` | 0.3s |

**No animation issues detected** -- durations are appropriate, no janky transitions observed.

---

## Fixes Applied

None. All findings documented for review.

---

## Priority Remediation Plan

| # | Recommendation | Screens Affected | Effort | Impact | Worth Doing? | How To Fix |
|---|---------------|-----------------|--------|--------|-------------|-----------|
| 1 | Fix dashboard CSP -- externalize inline script to `dashboard.js` | Dashboard | Hours | Critical | Yes | Move the `<script>` contents from `dashboard.mjs` inline HTML to a new `dashboard.js` file. Serve it like `landing.js`/`docs.js` with `Cache-Control: public, max-age=86400`. Update CSP to allow it (it is already `'self'`). |
| 2 | Fix signup CSP -- same inline script issue | Signup | Hours | Critical | Yes | Move the inline `<script>` from `billing.mjs` signup template to an external JS file. |
| 3 | Add visible focus indicators to all interactive elements | Landing, Docs | Hours | Critical | Yes | Add CSS rule: `button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`. Use `:focus-visible` (not `:focus`) to avoid showing outline on mouse clicks. |
| 4 | Extract shared CSS into a common base | All pages | Days | High | Yes | Create a shared CSS template string (or external CSS file) with base variables, body reset, button styles, card styles, monospace font stack. Import into each page's inline CSS. |
| 5 | Standardize monospace font stack | All pages | Hours | High | Yes | Pick one stack: `'Monaco', 'Menlo', 'Consolas', 'SF Mono', 'Fira Code', monospace`. Apply everywhere. |
| 6 | Standardize card border-radius | Landing | Hours | Medium | Yes | Change landing feature/price cards from 16px to 12px to match docs/billing/dashboard. Or change all to 16px -- pick one value. |
| 7 | Standardize container max-width | Docs | Hours | Medium | Yes | Change docs from 1400px to 1200px (or vice versa). The landing's 1200px is the more common convention. |
| 8 | Add horizontal scroll hint to mobile tables | Docs | Hours | Medium | Yes | Add a subtle gradient shadow on the right edge of table containers to indicate horizontal scrollability. |
| 9 | Fix code block overflow on mobile | Landing | Hours | Medium | Yes | Add `word-break: break-all` or `overflow-x: auto` to the `.code-block` on landing page. |
| 10 | Add nav/header to billing pages | Signup, Success, Cancel | Hours | Medium | Probably | Add a minimal header with logo link to billing template pages for navigation context. |
| 11 | Add "Copied!" feedback to docs copy buttons | Docs | Hours | Medium | Probably | In `docs.js` copy handler, temporarily change button text to "Copied!" for 2 seconds. |
| 12 | Make docs sidebar sticky | Docs | Hours | Medium | Probably | Add `position: sticky; top: 60px; max-height: calc(100vh - 60px); overflow-y: auto;` to sidebar. |
| 13 | Standardize border color opacity | Landing | Hours | Low | Probably | Change landing feature/price card borders from 0.05 to 0.08 to match `--border` everywhere else. |
| 14 | Unify near-duplicate font sizes | All pages | Hours | Low | Only if time | Consolidate 0.9rem/0.95rem/0.9375rem into one size. Same for 0.85rem/0.875rem. |
| 15 | Add `cursor: pointer` to checkbox labels | Landing | Hours | Low | Only if time | Add `cursor: pointer` to the label elements wrapping checkboxes. |
| 16 | Improve input contrast on signup | Signup | Hours | Low | Only if time | Slightly lighten input backgrounds or add a visible border. |

---

## Design System Recommendations

1. **Create a shared CSS template**: A single template string or external `.css` file with base variables, reset, typography scale, and component classes (`.btn`, `.card`, `.btn-sm`). Currently each page reinvents these independently.

2. **Standardize tokens**: Pick one canonical value for each: monospace stack, card radius, container width, heading sizes. Document in a design system reference.

3. **Add `:focus-visible` styles globally**: This is both a design system gap and an accessibility requirement. A single CSS rule applied to all pages resolves ~30 missing focus indicators.

4. **Consolidate breakpoints**: Use 768px and 480px (landing's values) for docs too, or pick one set and apply it consistently.

5. **Estimated effort**: 1-2 days to establish a proper shared system. The largest task is extracting inline CSS into a shared module.

---

## Report Artifacts

| Artifact | Path |
|----------|------|
| This report | `audit-reports/UI_DESIGN_QUALITY_REPORT_01_2026-03-04.md` |
| Screenshots | `audit-reports/screenshots/` |

---

*End of report.*
