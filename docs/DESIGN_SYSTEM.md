# tweet-shots Design System

## 1. Overview

This document describes the **current state** of the visual design system as implemented across the tweet-shots codebase. It is descriptive, not prescriptive — it records what exists in the six HTML pages (landing, docs, signup, dashboard, billing success, billing cancel) as of this writing.

All pages use inline CSS with no shared stylesheet. CSS variables are defined per-page in each `<style>` block. The overall aesthetic is a dark-themed API product UI built on a slate color palette with blue accents.

---

## 2. Color Palette

### Base Variables (shared across all pages)

| Variable       | Value                    | Role                    |
|----------------|--------------------------|-------------------------|
| `--bg`         | `#0f172a`                | Page background         |
| `--surface`    | `#1e293b`                | Card/panel background   |
| `--text`       | `#f1f5f9`                | Primary text            |
| `--text-muted` | `#94a3b8`                | Secondary/muted text    |
| `--accent`     | `#3b82f6`                | Primary blue accent     |
| `--border`     | `rgba(255,255,255,0.08)` | Standard border color   |
| `--success`    | `#22c55e`                | Success state (docs, dashboard only) |
| `--danger`     | `#ef4444`                | Error/danger state (dashboard only)  |

### Brand & Accent

| Color     | Hex       | Usage                              |
|-----------|-----------|-------------------------------------|
| Blue      | `#3b82f6` | Primary accent, links, CTAs, focus rings |
| Purple    | `#6366f1` | Brand headings, gradient accents    |

### Backgrounds

| Color       | Hex       | Usage                |
|-------------|-----------|----------------------|
| Page        | `#0f172a` | `<body>` background  |
| Surface     | `#1e293b` | Cards, panels, modals |

### Text

| Color    | Hex       | Usage                          |
|----------|-----------|--------------------------------|
| Primary  | `#f1f5f9` | Headings, body text            |
| Muted    | `#94a3b8` | Descriptions, secondary labels |
| Subtle   | `#64748b` | Tertiary text, timestamps      |

### Status

| Color   | Hex       | Usage                     |
|---------|-----------|---------------------------|
| Success | `#22c55e` | Success states, positive indicators |
| Danger  | `#ef4444` | Errors, destructive actions         |
| Warning | `#f59e0b` | Warning states (primary)            |
| Warning | `#eab308` | Warning states (variant)            |

### Code Syntax Highlighting

| Color     | Hex       | Role       |
|-----------|-----------|------------|
| Background| `#0d1117` | Code block background |
| Text      | `#e6edf3` | Default code text     |
| Strings   | `#a5d6ff` | String literals       |
| Keywords  | `#ff7b72` | Language keywords     |
| Comments  | `#6a737d` | Code comments         |

### HTTP Method Badges

| Method | Color     | Hex       |
|--------|-----------|-----------|
| GET    | Green     | `#4ade80` |
| POST   | Blue      | `#60a5fa` |
| DELETE  | Red       | `#f87171` |

---

## 3. Typography

### Font Families

**Body text (all pages):**
```
-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
```

**Monospace (varies by page):**

| Page      | Stack                                          |
|-----------|-------------------------------------------------|
| Landing   | `'Monaco', 'Menlo', monospace`                  |
| Docs      | `'Monaco', 'Menlo', 'Consolas', monospace`      |
| Dashboard | `'SF Mono', 'Fira Code', monospace`             |
| Billing   | `monospace`                                     |

Four different monospace stacks are in use. This is a known inconsistency.

### Font Size Scale

| Token          | Size       | Usage                                      |
|----------------|------------|--------------------------------------------|
| Display        | `2.5rem`   | Landing hero heading                       |
| Display small  | `2rem`     | Dashboard heading, docs pricing heading    |
| Display alt    | `1.6rem`   | Billing page heading                       |
| Section        | `2.5rem`   | Landing section headings (h2)              |
| Section alt    | `1.75rem`  | Docs section headings (h2)                 |
| Card title     | `1.5rem`   | Landing pricing card title                 |
| Card title sm  | `1.25rem`  | Landing feature card title                 |
| Card title xs  | `1.125rem` | Docs pricing card title                    |
| Body           | `1rem`     | Standard body text                         |
| Body alt       | `0.9375rem`| Docs paragraph text                        |
| Small          | `0.875rem` | Secondary text, descriptions               |
| Small alt      | `0.8125rem`| Compact labels                             |
| Tiny           | `0.75rem`  | Badges, fine print                         |
| Tiny alt       | `0.6875rem`| Smallest labels                            |

### Font Weights

| Weight | Name      | Usage                              |
|--------|-----------|------------------------------------|
| 400    | Regular   | Body text, light descriptions      |
| 500    | Medium    | Navigation links, mid-emphasis     |
| 600    | Semibold  | Buttons, card titles               |
| 700    | Bold      | Brand text, strong headings        |
| 800    | Extrabold | Hero headings                      |

### Line Heights

| Value | Usage                          |
|-------|--------------------------------|
| 1.6   | Body text (all pages)          |
| 1.7   | Docs paragraphs, code blocks   |
| 1.8   | Landing page code examples     |

---

## 4. Spacing System

The implicit base unit is **4px**. Values cluster around multiples of 4 and 8.

### Common Spacing Values

| px   | rem     | Typical usage                              |
|------|---------|--------------------------------------------|
| 4    | 0.25    | Tight inline spacing                       |
| 8    | 0.5     | Small gaps (icon-to-text, badge padding)   |
| 10   | 0.625   | Control gaps, small gutters                |
| 12   | 0.75    | Compact component padding                  |
| 16   | 1       | Medium gaps, standard internal padding     |
| 20   | 1.25    | Container horizontal padding (`0 20px`)    |
| 24   | 1.5     | Card padding (docs), large gaps            |
| 30   | 1.875   | Grid gaps, card padding (landing)          |
| 32   | 2       | Section internal spacing                   |
| 40   | 2.5     | Card padding (landing/billing), large gaps |
| 80   | 5       | Section vertical padding (landing: `80px 0`) |

### Button Padding

| Variant   | Padding         |
|-----------|-----------------|
| Standard  | `10px 24px`     |
| Small     | `7px 14px`      |
| Large     | `14px 24px`     |

### Max-Width Containers

| Context    | Max-width |
|------------|-----------|
| Landing    | `1200px`  |
| Docs       | `1400px`  |
| Dashboard  | `720px`   |
| Billing    | `480px`   |
| Code block | `800px`   |

---

## 5. Component Patterns

### Buttons

**Primary button:**
- Background: `var(--accent)` (`#3b82f6`)
- Text: `#ffffff`
- Font weight: 600
- Border radius: `8px`
- Padding: `10px 24px` (standard), `14px 24px` (large)
- Transition: `0.2s`
- Hover: lighter background (typically `#2563eb` or opacity shift)
- No border

**Small/chip button:**
- Padding: `7px 14px`
- Font size: `0.875rem`
- Border radius: `6px`

**Ghost/outline button:**
- Background: transparent
- Border: `1px solid var(--border)`
- Text: `var(--text-muted)`
- Hover: background shifts to `var(--surface)` or subtle highlight

### Cards

**Standard card (docs, billing):**
- Background: `var(--surface)` (`#1e293b`)
- Border: `1px solid var(--border)`
- Border radius: `12px`
- Padding: `24px`

**Feature/pricing card (landing):**
- Background: `var(--surface)`
- Border: `1px solid var(--border)`
- Border radius: `16px`
- Padding: `30px` to `40px`

**Demo card (landing):**
- Border radius: `20px`

### Inputs

**Text input / select:**
- Background: `var(--bg)` or darker surface
- Border: `1px solid var(--border)`
- Border radius: `6px` to `8px`
- Padding: `8px 12px` to `10px 14px`
- Text: `var(--text)`
- Focus ring: `box-shadow: 0 0 0 3px rgba(59,130,246,0.12)`
- Focus border: `var(--accent)`

### Badges

**HTTP method badges:**
- Font size: `0.75rem`
- Font weight: 700
- Padding: `2px 8px`
- Border radius: `3px` to `4px`
- Background: method color at reduced opacity
- Text: method color at full value

**Status badges (tier labels, plan indicators):**
- Font size: `0.75rem` to `0.8125rem`
- Font weight: 600
- Padding: `4px 8px` to `4px 12px`
- Border radius: `4px` to `6px`
- Background: status color at reduced opacity

### Code Blocks

- Background: `#0d1117`
- Border: `1px solid var(--border)`
- Border radius: `8px`
- Padding: `16px` to `20px`
- Font family: page-specific monospace stack (see Typography)
- Font size: `0.8125rem` to `0.875rem`
- Line height: `1.7` to `1.8`
- Overflow: `auto` with horizontal scroll

---

## 6. Responsive Breakpoints

| Breakpoint | Target            | Key changes                                        |
|------------|-------------------|----------------------------------------------------|
| `480px`    | Small mobile      | Landing: minor text/spacing adjustments             |
| `768px`    | Tablet            | Landing: demo switches to column layout, pricing cards stack vertically |
| `900px`    | Docs sidebar      | Docs: sidebar collapses, mobile nav appears         |

All breakpoints use `max-width` media queries. No `min-width` or range queries are used.

---

## 7. Transitions & Animation

| Duration | Easing     | Usage                                  |
|----------|------------|----------------------------------------|
| `0.15s`  | default    | Links, small controls, hover states    |
| `0.2s`   | default    | Buttons, CTAs, interactive elements    |
| `0.3s`   | `ease`     | Accordion expand/collapse              |
| `0.5s`   | `ease`     | Usage progress bar fill                |

### Box Shadows

| Shadow                                     | Usage                    |
|--------------------------------------------|--------------------------|
| `0 0 0 3px rgba(59,130,246,0.12)`          | Input/button focus ring  |
| `0 20px 40px -12px rgba(0,0,0,0.4)`       | Image preview elevation  |
| `0 2px 12px rgba(0,0,0,0.3)`              | Google sign-in button hover |

Shadow usage is minimal. Most elevation is communicated through background color contrast rather than shadows.

---

## 8. Known Deviations

These are values that exist in the codebase but diverge from the dominant patterns documented above.

### Border opacity inconsistency
The `--border` variable is defined as `rgba(255,255,255,0.08)` in most pages, but `landing.html` uses raw `rgba()` values in some places with `0.05` opacity instead of the `0.08` standard. The variable is not consistently referenced — some rules use the variable, others hardcode the rgba value.

### Monospace font stacks
Four different monospace font stacks are used across pages. No single canonical stack exists. The dashboard uses `'SF Mono', 'Fira Code'` (developer-oriented), docs uses `'Monaco', 'Menlo', 'Consolas'`, landing uses `'Monaco', 'Menlo'`, and billing uses bare `monospace`.

### Warning color variants
Two yellow/amber values are used for warnings: `#f59e0b` and `#eab308`. These are close but not identical. Neither is defined as a CSS variable in all pages.

### Heading size overlap
Landing uses `2.5rem` for both the hero heading and section h2 headings, meaning there is no visual hierarchy between them at the size level (weight and context differentiate them). Other pages use distinct sizes for their heading levels.

### Card border radius
Three distinct radius values are used for cards: `12px` (docs, billing, dashboard), `16px` (landing feature/pricing cards), and `20px` (landing demo card). There is no single canonical card radius.

### Success/danger variable scope
`--success` and `--danger` are only defined on pages that use them (docs, dashboard), not globally. Pages without these variables would get `undefined` if a component tried to reference them.

### Section padding
Landing page uses `80px 0` for section vertical padding. No other page uses this value — other pages have no concept of scrollable content sections and instead use a single centered layout.

### Display heading sizes
Four different "largest heading" sizes exist: `2.5rem` (landing), `2rem` (dashboard, docs pricing), `1.75rem` (docs sections), and `1.6rem` (billing). Each page chose its own scale independently.
